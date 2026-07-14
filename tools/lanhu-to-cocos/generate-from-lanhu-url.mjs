#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_PROJECT_SIZE = { width: 640, height: 1136 };
const DEFAULT_MCP_URL = "https://backyard.6.cn/lanhu-mcp/mcp?role=developer&name=liangjian";
const DEFAULT_SDK_DIR = "/Users/huafang/Agent/local-deepseek-agent/node_modules/@modelcontextprotocol/sdk";

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const projectRoot = path.resolve(args.project || process.cwd());
    const lanhuUrl = args.url;

    if (!lanhuUrl && !args.coverUrl) {
        fail("Usage: node tools/lanhu-to-cocos/generate-from-lanhu-url.mjs --url <lanhu-url> [--panel UIName] [--project /path/to/CocosProject] [--cover-url <png-url>]");
    }

    assertCocosProject(projectRoot);

    const design = args.coverUrl
        ? { name: args.design || args.panel || "LanhuPanel", width: 0, height: 0, url: args.coverUrl }
        : await resolveDesign(lanhuUrl, args.design);
    const panelName = toPascalCase(args.panel || `UI${design.name}Panel`);
    const slug = toSlug(panelName.replace(/^UI/, "").replace(/Panel$/, "") || design.name);
    const imageDir = path.join(projectRoot, "assets/resources/lanhu", slug);
    const imagePath = path.join(imageDir, "reference.png");

    fs.mkdirSync(imageDir, { recursive: true });
    await downloadFile(design.url, imagePath);

    const scriptPath = path.join(projectRoot, "assets/app/ui/panels", `${panelName}.ts`);
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, renderPanelScript({ panelName, slug }), "utf8");

    const imageSize = readPngSize(imagePath);
    ensureImageMeta(imagePath, imageSize);

    const scriptType = findScriptType(projectRoot, panelName);
    const prefabDir = path.join(projectRoot, "assets/resources/prefabs/lanhu");
    const prefabPath = path.join(prefabDir, `${panelName}.prefab`);
    fs.mkdirSync(prefabDir, { recursive: true });
    fs.writeFileSync(prefabPath, `${JSON.stringify(createPrefab({ panelName, imagePath, imageSize, scriptType }), null, 2)}\n`, "utf8");

    console.log(`Design: ${design.name} (${design.width} x ${design.height})`);
    console.log(`Generated ${path.relative(projectRoot, scriptPath)}`);
    console.log(`Generated ${path.relative(projectRoot, imagePath)}`);
    console.log(`Generated ${path.relative(projectRoot, prefabPath)}`);
    if (!scriptType) {
        console.log("Note: prefab has no custom script component yet. Open the project in Cocos Creator once, wait for TS import, then run this command again.");
    }
}

function parseArgs(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--url") result.url = argv[++i];
        else if (arg === "--panel") result.panel = argv[++i];
        else if (arg === "--project") result.project = argv[++i];
        else if (arg === "--design") result.design = argv[++i];
        else if (arg === "--cover-url") result.coverUrl = argv[++i];
        else if (!result.url) result.url = arg;
    }
    return result;
}

function assertCocosProject(projectRoot) {
    if (!fs.existsSync(path.join(projectRoot, "assets")) || !fs.existsSync(path.join(projectRoot, "package.json"))) {
        fail(`Not a Cocos Creator project: ${projectRoot}`);
    }
}

async function resolveDesign(url, designName) {
    const result = await callLanhuTool("lanhu_get_designs", { url });
    const designs = result.structuredContent?.designs || JSON.parse(result.content?.[0]?.text || "{}").designs || [];
    const imageId = getLanhuUrlParam(url, "image_id");
    const design = designs.find((item) => item.id === imageId)
        || designs.find((item) => item.name === designName)
        || designs.find((item) => String(item.index) === String(designName))
        || designs[0];

    if (!design) {
        fail("Lanhu returned no design images.");
    }

    return design;
}

function getLanhuUrlParam(url, key) {
    const parsedUrl = new URL(url);
    const directValue = parsedUrl.searchParams.get(key);
    if (directValue) {
        return directValue;
    }

    const hashQuery = parsedUrl.hash.includes("?") ? parsedUrl.hash.slice(parsedUrl.hash.indexOf("?") + 1) : "";
    return new URLSearchParams(hashQuery).get(key);
}

async function callLanhuTool(name, args) {
    const sdkDir = process.env.LANHU_MCP_SDK_DIR || DEFAULT_SDK_DIR;
    const mcpUrl = process.env.LANHU_MCP_URL || DEFAULT_MCP_URL;
    const clientModule = await import(pathToFileURL(path.join(sdkDir, "dist/esm/client/index.js")).href);
    const transportModule = await import(pathToFileURL(path.join(sdkDir, "dist/esm/client/streamableHttp.js")).href);
    const client = new clientModule.Client({ name: "lanhu-cocos-prefab-tool", version: "0.1.0" });

    try {
        await client.connect(new transportModule.StreamableHTTPClientTransport(new URL(mcpUrl)));
        return await client.callTool({ name, arguments: args });
    } catch (error) {
        throw new Error(`Lanhu MCP call failed (${name}). Check LANHU_MCP_URL or retry later. ${error.message}`);
    } finally {
        await client.close().catch(() => {});
    }
}

async function downloadFile(url, targetPath) {
    const response = await fetch(url, {
        headers: {
            "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            "referer": "https://lanhuapp.com/",
            "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
    });
    if (!response.ok) {
        fail(`Failed to download ${url}: ${response.status} ${response.statusText}`);
    }
    fs.writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
}

function renderPanelScript({ panelName, slug }) {
    return `import { _decorator, Button, Node, Sprite, SpriteFrame, UITransform, Vec3, resources } from "cc";
import { UIBase } from "../../core/ui/UIBase";

const { ccclass, property } = _decorator;

@ccclass("${panelName}")
export class ${panelName} extends UIBase {
    @property({ type: Sprite })
    public lanhuReferenceImg: Sprite | null = null;

    @property({ type: Button })
    public closeBtn: Button | null = null;

    @property({ type: Button })
    public actionBtn: Button | null = null;

    private _viewBuilt = false;
    private _eventsBound = false;

    protected onLoad(): void {
        this.buildView();
        this.bindEvents();
        this.loadLanhuReference();
    }

    protected onOpen(params?: unknown): void {
        super.onOpen(params);
        this.buildView();
        this.bindEvents();
        this.loadLanhuReference();
    }

    protected onClose(): void {
        this.unbindEvents();
        super.onClose();
    }

    private buildView(): void {
        if (this._viewBuilt) return;
        this._viewBuilt = true;
        this.node.name = "${panelName}";
        this.ensureTransform(this.node, 640, 1136);

        const referenceNode = this.createChild("LanhuReferenceImg", 0, 0, 640, 1385);
        this.lanhuReferenceImg = referenceNode.addComponent(Sprite);
        this.closeBtn = this.createButtonHitArea("CloseBtn", 185, -67, 72, 72);
        this.actionBtn = this.createButtonHitArea("ActionBtn", 0, -232, 260, 76);
    }

    private bindEvents(): void {
        if (this._eventsBound) return;
        this._eventsBound = true;
        this.closeBtn?.node.on(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.actionBtn?.node.on(Button.EventType.CLICK, this.onActionBtnClick, this);
    }

    private unbindEvents(): void {
        if (!this._eventsBound) return;
        this._eventsBound = false;
        this.closeBtn?.node.off(Button.EventType.CLICK, this.onCloseBtnClick, this);
        this.actionBtn?.node.off(Button.EventType.CLICK, this.onActionBtnClick, this);
    }

    private loadLanhuReference(): void {
        if (!this.lanhuReferenceImg || this.lanhuReferenceImg.spriteFrame) return;
        resources.load("lanhu/${slug}/reference/spriteFrame", SpriteFrame, (error, spriteFrame) => {
            if (error || !spriteFrame || !this.lanhuReferenceImg) return;
            this.lanhuReferenceImg.spriteFrame = spriteFrame;
        });
    }

    private createButtonHitArea(name: string, x: number, y: number, width: number, height: number): Button {
        const node = this.createChild(name, x, y, width, height);
        return node.addComponent(Button);
    }

    private createChild(name: string, x: number, y: number, width: number, height: number): Node {
        const node = new Node(name);
        node.setPosition(new Vec3(x, y, 0));
        this.ensureTransform(node, width, height);
        this.node.addChild(node);
        return node;
    }

    private ensureTransform(node: Node, width: number, height: number): UITransform {
        const transform = node.getComponent(UITransform) ?? node.addComponent(UITransform);
        transform.setContentSize(width, height);
        return transform;
    }

    private onCloseBtnClick(): void {
        // TODO: 绑定关闭逻辑。
    }

    private onActionBtnClick(): void {
        // TODO: 绑定主按钮逻辑。
    }
}
`;
}

function createPrefab({ panelName, imagePath, imageSize, scriptType }) {
    const imageUuid = JSON.parse(fs.readFileSync(`${imagePath}.meta`, "utf8")).uuid;
    const rootComponents = scriptType ? [11, 12] : [11];
    const items = [
        { __type__: "cc.Prefab", _name: "", _objFlags: 0, _native: "", data: { __id__: 1 }, optimizationPolicy: 0, asyncLoadAssets: false },
        createNode(panelName, null, [2, 5, 8], rootComponents, 0, 0, 0),
        createNode("LanhuReferenceImg", 1, [], [3, 4], 0, 0, 0),
        createTransform(2, DEFAULT_PROJECT_SIZE.width, Math.round(DEFAULT_PROJECT_SIZE.width * imageSize.height / imageSize.width)),
        createSprite(2, `${imageUuid}@f9941`),
        createNode("CloseBtn", 1, [], [6, 7], 185, -67, 0),
        createTransform(5, 72, 72),
        createButton(5),
        createNode("ActionBtn", 1, [], [9, 10], 0, -232, 0),
        createTransform(8, 260, 76),
        createButton(8),
        createTransform(1, DEFAULT_PROJECT_SIZE.width, DEFAULT_PROJECT_SIZE.height),
    ];
    if (scriptType) items.push(createPanelScript(scriptType, 1));
    attachPrefabInfos(items);
    return items;
}

function createNode(name, parentId, childIds, componentIds, x, y, z) {
    return {
        __type__: "cc.Node",
        _name: name,
        _objFlags: 0,
        _parent: parentId === null ? null : { __id__: parentId },
        _children: childIds.map((id) => ({ __id__: id })),
        _active: true,
        _components: componentIds.map((id) => ({ __id__: id })),
        _prefab: null,
        _lpos: { __type__: "cc.Vec3", x, y, z },
        _lrot: { __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 },
        _lscale: { __type__: "cc.Vec3", x: 1, y: 1, z: 1 },
        _layer: 33554432,
        _euler: { __type__: "cc.Vec3", x: 0, y: 0, z: 0 },
        _id: "",
    };
}

function createTransform(nodeId, width, height) {
    return { __type__: "cc.UITransform", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, _contentSize: { __type__: "cc.Size", width, height }, _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 }, _id: "" };
}

function createSprite(nodeId, spriteFrameUuid) {
    return { __type__: "cc.Sprite", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 }, _sharedMaterial: null, _spriteFrame: { __uuid__: spriteFrameUuid, __expectedType__: "cc.SpriteFrame" }, _type: 0, _fillType: 0, _sizeMode: 0, _fillCenter: { __type__: "cc.Vec2", x: 0, y: 0 }, _fillStart: 0, _fillRange: 0, _isTrimmedMode: true, _useGrayscale: false, _atlas: null, _id: "" };
}

function createButton(nodeId) {
    return { __type__: "cc.Button", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, clickEvents: [], _interactable: true, _transition: 0, _normalColor: { __type__: "cc.Color", r: 214, g: 214, b: 214, a: 255 }, _hoverColor: { __type__: "cc.Color", r: 211, g: 211, b: 211, a: 255 }, _pressColor: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 }, _disabledColor: { __type__: "cc.Color", r: 124, g: 124, b: 124, a: 255 }, _normalSprite: null, _hoverSprite: null, _pressedSprite: null, _disabledSprite: null, _duration: 0.1, _zoomScale: 1.2, _target: { __id__: nodeId }, _id: "" };
}

function createPanelScript(scriptType, nodeId) {
    return { __type__: scriptType, _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, lanhuReferenceImg: { __id__: 4 }, closeBtn: { __id__: 7 }, actionBtn: { __id__: 10 }, _id: "" };
}

function createPrefabInfo(rootId, assetId) {
    return { __type__: "cc.PrefabInfo", root: { __id__: rootId }, asset: { __id__: assetId }, fileId: crypto.randomBytes(16).toString("base64").replace(/[=+/]/g, "").slice(0, 22) };
}

function attachPrefabInfos(objects) {
    const nodeIds = objects
        .map((object, index) => object.__type__ === "cc.Node" ? index : -1)
        .filter((index) => index >= 0);

    for (const nodeId of nodeIds) {
        const prefabInfoId = objects.length;
        objects[nodeId]._prefab = { __id__: prefabInfoId };
        objects.push(createPrefabInfo(nodeId, 0));
    }
}

function ensureImageMeta(imagePath, imageSize) {
    const metaPath = `${imagePath}.meta`;
    const imageUuid = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")).uuid : crypto.randomUUID();
    const meta = {
        ver: "1.0.27",
        importer: "image",
        imported: true,
        uuid: imageUuid,
        files: [".png", ".json"],
        subMetas: {
            "6c48a": { importer: "texture", uuid: `${imageUuid}@6c48a`, displayName: "reference", id: "6c48a", name: "texture", ver: "1.0.22", imported: true, files: [".json"], subMetas: {}, userData: { wrapModeS: "clamp-to-edge", wrapModeT: "clamp-to-edge", minfilter: "linear", magfilter: "linear", mipfilter: "none", premultiplyAlpha: false, anisotropy: 0, isUuid: true, imageUuidOrDatabaseUri: imageUuid } },
            "f9941": { ver: "1.0.9", importer: "sprite-frame", uuid: `${imageUuid}@f9941`, imported: true, files: [".json"], subMetas: {}, userData: { wrapModeS: "clamp-to-edge", wrapModeT: "clamp-to-edge", minfilter: "linear", magfilter: "linear", mipfilter: "none", premultiplyAlpha: false, anisotropy: 0, trimType: "auto", trimThreshold: 1, rotated: false, offsetX: 0, offsetY: 0, trimX: 0, trimY: 0, width: imageSize.width, height: imageSize.height, rawWidth: imageSize.width, rawHeight: imageSize.height, borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0, isUuid: true, imageUuidOrDatabaseUri: `${imageUuid}@6c48a`, atlasUuid: "", packable: true }, displayName: "reference", id: "f9941", name: "spriteFrame" },
        },
        userData: { type: "sprite-frame", redirect: `${imageUuid}@f9941`, hasAlpha: false },
    };
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

function findScriptType(projectRoot, panelName) {
    const chunkRoot = path.join(projectRoot, "temp/programming/packer-driver/targets/editor/chunks");
    if (!fs.existsSync(chunkRoot)) return "";
    const files = walk(chunkRoot).filter((file) => file.endsWith(".js"));
    for (const file of files) {
        const text = fs.readFileSync(file, "utf8");
        const match = text.match(new RegExp(`_RF\\.push\\(\\{\\}, "([^"]+)", "${panelName}"`));
        if (match) return match[1];
    }
    return "";
}

function walk(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const fullPath = path.join(dir, entry.name);
        return entry.isDirectory() ? walk(fullPath) : [fullPath];
    });
}

function readPngSize(filePath) {
    const buffer = fs.readFileSync(filePath);
    if (buffer.toString("ascii", 1, 4) !== "PNG") fail(`Not a PNG file: ${filePath}`);
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function toPascalCase(value) {
    const text = String(value).trim().replace(/^UI/i, "").replace(/Panel$/i, "");
    const words = text.match(/[A-Za-z0-9]+|[\u4e00-\u9fa5]+/g) || ["Lanhu"];
    const mapped = words.map((word) => (/^[\u4e00-\u9fa5]+$/.test(word) ? "Lanhu" : word[0].toUpperCase() + word.slice(1)));
    return `UI${mapped.join("")}Panel`;
}

function toSlug(value) {
    const ascii = String(value).replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    return ascii || "lanhu-panel";
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

main().catch((error) => fail(error.stack || error.message));
