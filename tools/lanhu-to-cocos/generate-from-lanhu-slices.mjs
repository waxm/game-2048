#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

const PROJECT_SIZE = { width: 640, height: 1136 };
const UI_LAYER = 33554432;
const DEFAULT_MCP_URL = "https://backyard.6.cn/lanhu-mcp/mcp?role=developer&name=liangjian";
const DEFAULT_SDK_DIR = "/Users/huafang/Agent/local-deepseek-agent/node_modules/@modelcontextprotocol/sdk";

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const projectRoot = path.resolve(args.project || process.cwd());

    if (!args.url || !args.design || !args.panel) {
        fail("Usage: node tools/lanhu-to-cocos/generate-from-lanhu-slices.mjs --url <lanhu-url> --design <design-name> --panel UIExamplePanel [--project /path/to/project] [--dialog-only] [--fill-text] [--rename-dialog] [--visit-friends-dialog]");
    }

    assertCocosProject(projectRoot);

    const panelName = toPascalCase(args.panel);
    const slug = toSlug(panelName.replace(/^UI/, "").replace(/Panel$/, ""));
    const result = await callLanhuTool("lanhu_get_design_slices", {
        url: args.url,
        design_name: args.design,
        include_metadata: true,
    });
    const data = result.structuredContent || JSON.parse(result.content?.[0]?.text || "{}");
    const slices = Array.isArray(data.slices) ? data.slices : [];

    if (slices.length === 0) {
        fail(`No slices returned for design: ${args.design}`);
    }

    const spec = normalizeSlices(data, panelName, slug, {
        dialogOnly: args.dialogOnly,
        fillText: args.fillText,
        renameDialog: args.renameDialog,
        visitFriendsDialog: args.visitFriendsDialog,
    });
    if (args.dialogOnly || args.renameDialog || args.visitFriendsDialog) {
        fs.rmSync(path.join(projectRoot, "assets/resources/lanhu", slug, "slices"), { recursive: true, force: true });
    }
    await generateImageAssets(spec, projectRoot);
    await downloadSlices(spec, projectRoot);

    const prefabPath = path.join(projectRoot, "assets/resources/prefabs/lanhu", `${panelName}.prefab`);
    fs.mkdirSync(path.dirname(prefabPath), { recursive: true });
    fs.writeFileSync(prefabPath, `${JSON.stringify(createPrefab(panelName, spec.nodes), null, 2)}\n`, "utf8");

    if (args.visitFriendsDialog) {
        const itemSpec = createVisitFriendItemSpec(data, "UIVisitFriendItem", "visit-friend-item", spec.rawCanvas, spec.scale, spec.contentHeight, { visitFriendItem: true });
        fs.rmSync(path.join(projectRoot, "assets/resources/lanhu", itemSpec.slug, "slices"), { recursive: true, force: true });
        await generateImageAssets(itemSpec, projectRoot);
        await downloadSlices(itemSpec, projectRoot);
        const itemPrefabPath = path.join(projectRoot, "assets/resources/prefabs/lanhu", `${itemSpec.panelName}.prefab`);
        fs.mkdirSync(path.dirname(itemPrefabPath), { recursive: true });
        fs.writeFileSync(itemPrefabPath, `${JSON.stringify(createPrefab(itemSpec.panelName, itemSpec.nodes), null, 2)}\n`, "utf8");
        const itemSpecPath = path.join(projectRoot, "tools/lanhu-to-cocos/generated", `${itemSpec.panelName}.slices.json`);
        fs.mkdirSync(path.dirname(itemSpecPath), { recursive: true });
        fs.writeFileSync(itemSpecPath, `${JSON.stringify(itemSpec, null, 2)}\n`, "utf8");
        console.log(`Generated ${path.relative(projectRoot, itemPrefabPath)}`);
        console.log(`Generated ${path.relative(projectRoot, itemSpecPath)}`);
    }

    const specPath = path.join(projectRoot, "tools/lanhu-to-cocos/generated", `${panelName}.slices.json`);
    fs.mkdirSync(path.dirname(specPath), { recursive: true });
    fs.writeFileSync(specPath, `${JSON.stringify(spec, null, 2)}\n`, "utf8");

    console.log(`Design: ${data.design_name || args.design}`);
    console.log(`Slices: ${spec.nodes.length}`);
    console.log(`Generated ${path.relative(projectRoot, prefabPath)}`);
    console.log(`Generated ${path.relative(projectRoot, specPath)}`);
}

function parseArgs(argv) {
    const result = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === "--url") result.url = argv[++i];
        else if (arg === "--design") result.design = argv[++i];
        else if (arg === "--panel") result.panel = argv[++i];
        else if (arg === "--project") result.project = argv[++i];
        else if (arg === "--dialog-only") result.dialogOnly = true;
        else if (arg === "--fill-text") result.fillText = true;
        else if (arg === "--rename-dialog") result.renameDialog = true;
        else if (arg === "--visit-friends-dialog") result.visitFriendsDialog = true;
    }
    return result;
}

function assertCocosProject(projectRoot) {
    if (!fs.existsSync(path.join(projectRoot, "assets")) || !fs.existsSync(path.join(projectRoot, "package.json"))) {
        fail(`Not a Cocos Creator project: ${projectRoot}`);
    }
}

async function callLanhuTool(name, args) {
    const sdkDir = process.env.LANHU_MCP_SDK_DIR || DEFAULT_SDK_DIR;
    const mcpUrl = process.env.LANHU_MCP_URL || DEFAULT_MCP_URL;
    const clientModule = await import(pathToFileURL(path.join(sdkDir, "dist/esm/client/index.js")).href);
    const transportModule = await import(pathToFileURL(path.join(sdkDir, "dist/esm/client/streamableHttp.js")).href);
    const client = new clientModule.Client({ name: "lanhu-cocos-slices-tool", version: "0.1.0" });

    try {
        await client.connect(new transportModule.StreamableHTTPClientTransport(new URL(mcpUrl)));
        return await client.callTool({ name, arguments: args });
    } finally {
        await client.close().catch(() => {});
    }
}

function normalizeSlices(data, panelName, slug, options = {}) {
    const rawCanvas = inferRawCanvas(data);
    const scale = PROJECT_SIZE.width / rawCanvas.width;
    const contentHeight = rawCanvas.height * scale;
    const seenNames = new Map();
    if (options.renameDialog) {
        return createRenameDialogSpec(data, panelName, slug, rawCanvas, scale, contentHeight, options);
    }
    if (options.visitFriendsDialog) {
        return createVisitFriendsDialogSpec(data, panelName, slug, rawCanvas, scale, contentHeight, options);
    }
    let nodes = data.slices
        .filter((slice) => slice.download_url && slice.position && slice.size)
        .filter((slice) => !options.dialogOnly || getRenameDialogRole(slice))
        .map((slice, index) => {
            const size = parseSize(slice.size);
            const role = getRenameDialogRole(slice);
            const name = role || uniqueName(toPascalCase(slice.name || `Slice${index + 1}`), seenNames);
            const width = round(size.width * scale);
            const height = round(size.height * scale);
            const x = round((slice.position.x + size.width / 2) * scale - PROJECT_SIZE.width / 2);
            const y = round(contentHeight / 2 - (slice.position.y + size.height / 2) * scale);
            const fileName = `${toSlug(name)}.png`;
            return {
                id: slice.id,
                name,
                type: "image",
                sourceName: slice.name,
                layerPath: slice.layer_path || "",
                downloadUrl: slice.scale_urls?.["2x"] || slice.download_url,
                assetPath: `assets/resources/lanhu/${slug}/slices/${fileName}`,
                x,
                y,
                width,
                height,
                button: role === "CloseBtn" || role === "CancelBtn" || role === "ConfirmBtn",
                sourcePosition: slice.position,
                sourceSize: size,
                opacity: slice.metadata?.opacity ?? 1,
                ...classifyImageBinding(name, slice.name, slice.layer_path || "", { button: role === "CloseBtn" || role === "CancelBtn" || role === "ConfirmBtn" }),
            };
        });

    if (options.fillText) {
        nodes = nodes.concat(createRenameConfirmTextNodes(scale, contentHeight));
    }

    return {
        panelName,
        slug,
        designName: data.design_name,
        canvasSize: data.canvas_size,
        rawCanvas,
        projectSize: PROJECT_SIZE,
        scale,
        contentHeight: round(contentHeight),
        options,
        nodes,
    };
}

function getRenameDialogRole(slice) {
    const name = slice.name || "";
    const layerPath = slice.layer_path || "";
    const size = slice.size ? parseSize(slice.size) : { width: 0, height: 0 };
    if (name === "Rectangle 57769" && size.width === 548 && size.height === 74) return "HeaderBg";
    if (name === "Rectangle 57769" && size.width === 224 && size.height === 80) return "CancelBtn";
    if (name === "Rectangle 57768") return "DialogBg";
    if (name === "Rectangle 57771") return "ConfirmBtn";
    if (layerPath.includes("关闭") || name === "label_4") return "CloseBtn";
    return "";
}

function createRenameDialogSpec(data, panelName, slug, rawCanvas, scale, contentHeight, options) {
    const slicesByRole = new Map();
    for (const slice of data.slices || []) {
        const role = getRenameDialogRole(slice);
        if (role) slicesByRole.set(role, slice);
    }

    const nodes = [
        createGeneratedImageNode("DialogBg", slug, 134, 780, 560, 532, scale, contentHeight, {
            fill: { r: 255, g: 255, b: 255, a: 255 },
            radius: 32,
        }),
        createSliceNode("HeaderBg", slicesByRole.get("HeaderBg"), slug, scale, contentHeight, false),
        createSliceNode("CloseBtn", slicesByRole.get("CloseBtn"), slug, scale, contentHeight, true),
        createGeneratedImageNode("InputBg", slug, 204, 924, 420, 80, scale, contentHeight, {
            fill: { r: 231, g: 247, b: 247, a: 255 },
            border: { r: 40, g: 152, b: 140, a: 255, width: 1 },
            radius: 12,
        }),
        createTextNode("TitleLabel", "宠物改名", 350, 807, 128, 32, 32, { r: 31, g: 124, b: 129, a: 255 }, scale, contentHeight),
        createTextNode("NameInputLabel", "熊猫啾咪", 236, 948, 112, 32, 28, { r: 0, g: 0, b: 0, a: 255 }, scale, contentHeight, { horizontalAlign: 0 }),
        createTextNode("HintLabel", "仅支持中文/英文/数字", 207, 1024, 414, 32, 24, { r: 102, g: 102, b: 102, a: 255 }, scale, contentHeight),
        createSliceNode("RenameCardBtn", slicesByRole.get("CancelBtn"), slug, scale, contentHeight, true),
        createSliceNode("JadeBtn", slicesByRole.get("ConfirmBtn"), slug, scale, contentHeight, true),
        createButtonTextNode("RenameCardLabel", "改名卡", 96, 45, 32, { r: 40, g: 152, b: 140, a: 255 }, scale, "RenameCardBtn"),
        createButtonTextNode("JadeLabel", "50灵玉", 103, 45, 32, { r: 255, g: 255, b: 255, a: 255 }, scale, "JadeBtn"),
        createTextNode("RenameCardOwnedLabel", "持有：0", 243, 1224, 87, 32, 24, { r: 102, g: 102, b: 102, a: 255 }, scale, contentHeight),
        createTextNode("JadeOwnedLabel", "持有：900", 484, 1224, 116, 32, 24, { r: 102, g: 102, b: 102, a: 255 }, scale, contentHeight),
    ].filter(Boolean);

    return {
        panelName,
        slug,
        designName: data.design_name,
        canvasSize: data.canvas_size,
        rawCanvas,
        projectSize: PROJECT_SIZE,
        scale,
        contentHeight: round(contentHeight),
        options,
        nodes,
    };
}

function createVisitFriendsDialogSpec(data, panelName, slug, rawCanvas, scale, contentHeight, options) {
    const slices = data.slices || [];
    const panelBg = findSlice(slices, (slice) => slice.name === "Group 1312332050");
    const tabMark = findSlice(slices, (slice) => slice.name === "Group 1312332049");
    const redDot = findSlice(slices, (slice) => slice.name === "Ellipse 1428");
    const searchBtn = findSlice(slices, (slice) => slice.name === "Rectangle 36");
    const closeBtn = findSlice(slices, (slice) => slice.name === "关闭");
    const visitBtns = slices.filter((slice) => slice.name === "按钮 1" && slice.size === "163x68").slice(0, 4);
    const lastVisitBtn = findSlice(slices, (slice) => slice.name === "按钮 1" && slice.size === "163x59");
    const anonymousCheck = findSlice(slices, (slice) => slice.name === "Group 1312331886");
    const anonymousIcon = findSlice(slices, (slice) => slice.name === "Frame");

    const nodes = [
        createSliceNode("PanelBg", panelBg, slug, scale, contentHeight, false),
        createSliceNode("TabActiveMark", tabMark, slug, scale, contentHeight, false),
        createSliceNode("VisitorRedDot", redDot, slug, scale, contentHeight, false),
        createSliceNode("CloseBtn", closeBtn, slug, scale, contentHeight, true),
        createGeneratedImageNode("SearchInputBg", slug, 74, 849, 680, 72, scale, contentHeight, {
            fill: { r: 231, g: 247, b: 247, a: 255 },
            radius: 36,
        }),
        createSliceNode("SearchBtn", searchBtn, slug, scale, contentHeight, true),
        createTextNode("FriendTabLabel", "好友", 198, 770, 64, 32, 32, { r: 255, g: 255, b: 255, a: 255 }, scale, contentHeight),
        createTextNode("MasterTabLabel", "大神", 382, 770, 64, 32, 32, { r: 31, g: 127, b: 129, a: 255 }, scale, contentHeight),
        createTextNode("VisitorTabLabel", "访客", 566, 770, 64, 32, 32, { r: 31, g: 127, b: 129, a: 255 }, scale, contentHeight),
        createTextNode("SearchPlaceholder", "输入房间号", 106, 873, 140, 24, 28, { r: 0, g: 0, b: 0, a: 102 }, scale, contentHeight, { horizontalAlign: 0 }),
        createButtonTextNode("SearchLabel", "搜索", 56, 24, 28, { r: 255, g: 255, b: 255, a: 255 }, scale, "SearchBtn"),
        createContainerNode("FriendScrollView", 50, 969, 728, 596, scale, contentHeight, { type: "scroll-view", content: "Content" }),
        createContainerNode("View", 0, 0, 728, 596, scale, contentHeight, { parent: "FriendScrollView", type: "mask", local: true }),
        createContainerNode("Content", 0, 0, 728, 800, scale, contentHeight, { parent: "View", type: "layout", local: true, cellWidth: round(728 * scale), cellHeight: round(100 * scale), spacingY: round(60 * scale) }),
        createSliceNode("AnonymousCheck", anonymousCheck, slug, scale, contentHeight, false),
        createSliceNode("AnonymousIcon", anonymousIcon, slug, scale, contentHeight, false),
        createTextNode("AnonymousLabel", "匿名访问", 370, 1726, 96, 28, 24, { r: 119, g: 99, b: 34, a: 255 }, scale, contentHeight),
    ].filter(Boolean);

    return {
        panelName,
        slug,
        designName: data.design_name,
        canvasSize: data.canvas_size,
        rawCanvas,
        projectSize: PROJECT_SIZE,
        scale,
        contentHeight: round(contentHeight),
        options,
        nodes,
    };
}

function createVisitFriendItemSpec(data, panelName, slug, rawCanvas, scale, contentHeight, options) {
    const visitBtn = findSlice(data.slices || [], (slice) => slice.name === "按钮 1" && slice.size === "163x68");
    const nodes = [
        createRemoteImageNode("Avatar", "https://lanhu-oss-2537-2.lanhuapp.com/FigmaDDSSlicePNG6bc8b4b58b8b5272364f6d11c5b835ca.png", slug, 0, 0, 100, 100, 1, 100),
        createTextNode("NameLabel", "用户昵称", 123, 14, 112, 28, 28, { r: 34, g: 34, b: 34, a: 255 }, 1, 100, { horizontalAlign: 0 }),
        createTextNode("ReputationLabel", "12.7万", 123, 61, 80, 28, 28, { r: 153, g: 133, b: 0, a: 255 }, 1, 100, { horizontalAlign: 0 }),
        createSliceNode("VisitBtn", visitBtn, slug, scale, contentHeight, true),
        createButtonTextNode("VisitLabel", "串门", 56, 32, 28, { r: 255, g: 255, b: 255, a: 255 }, 1, "VisitBtn"),
    ].filter(Boolean);

    const avatarNode = nodes.find((node) => node.name === "Avatar");
    if (avatarNode) {
        avatarNode.x = -314;
        avatarNode.y = 0;
        avatarNode.width = 100;
        avatarNode.height = 100;
    }
    const nameNode = nodes.find((node) => node.name === "NameLabel");
    if (nameNode) {
        nameNode.x = -185;
        nameNode.y = 22;
        nameNode.width = 112;
        nameNode.height = 28;
    }
    const reputationNode = nodes.find((node) => node.name === "ReputationLabel");
    if (reputationNode) {
        reputationNode.x = -205;
        reputationNode.y = -25;
        reputationNode.width = 80;
        reputationNode.height = 28;
    }
    const visitBtnNode = nodes.find((node) => node.name === "VisitBtn");
    if (visitBtnNode) {
        visitBtnNode.x = 615 - 50 + 163 / 2 - 728 / 2;
        visitBtnNode.y = 100 / 2 - (16 + 68 / 2);
        visitBtnNode.width = 163;
        visitBtnNode.height = 68;
    }
    return {
        panelName,
        slug,
        designName: data.design_name,
        canvasSize: { width: 728, height: 100 },
        rawCanvas,
        projectSize: PROJECT_SIZE,
        scale,
        contentHeight: round(contentHeight),
        options,
        nodes,
    };
}

function createContainerNode(name, left, top, width, height, scale, contentHeight, extra = {}) {
    const local = extra.local;
    return {
        name,
        type: extra.type || "container",
        parent: extra.parent,
        content: extra.content,
        x: local ? round(left) : round((left + width / 2) * scale - PROJECT_SIZE.width / 2),
        y: local ? round(top) : round(contentHeight / 2 - (top + height / 2) * scale),
        width: local ? round(width * scale) : round(width * scale),
        height: local ? round(height * scale) : round(height * scale),
        cellWidth: extra.cellWidth,
        cellHeight: extra.cellHeight,
        spacingY: extra.spacingY,
    };
}

function createRemoteImageNode(name, downloadUrl, slug, left, top, width, height, scale, contentHeight) {
    return {
        name,
        type: "image",
        downloadUrl,
        assetPath: `assets/resources/lanhu/${slug}/slices/${toSlug(name)}.png`,
        x: round((left + width / 2) * scale - PROJECT_SIZE.width / 2),
        y: round(contentHeight / 2 - (top + height / 2) * scale),
        width: round(width * scale),
        height: round(height * scale),
        sourcePosition: { x: left, y: top },
        sourceSize: { width, height },
        opacity: 1,
        ...classifyImageBinding(name, "", "", {}),
    };
}

function findSlice(slices, predicate) {
    return slices.find(predicate) || null;
}

function createSliceNode(name, slice, slug, scale, contentHeight, button) {
    if (!slice) return null;
    const size = parseSize(slice.size);
    return {
        id: slice.id,
        name,
        type: "image",
        sourceName: slice.name,
        layerPath: slice.layer_path || "",
        downloadUrl: slice.scale_urls?.["2x"] || slice.download_url,
        assetPath: `assets/resources/lanhu/${slug}/slices/${toSlug(name)}.png`,
        x: round((slice.position.x + size.width / 2) * scale - PROJECT_SIZE.width / 2),
        y: round(contentHeight / 2 - (slice.position.y + size.height / 2) * scale),
        width: round(size.width * scale),
        height: round(size.height * scale),
        button,
        sourcePosition: slice.position,
        sourceSize: size,
        opacity: slice.metadata?.opacity ?? 1,
        ...classifyImageBinding(name, slice.name, slice.layer_path || "", { button }),
    };
}

function createGeneratedImageNode(name, slug, left, top, width, height, scale, contentHeight, shape) {
    return {
        name,
        type: "generated-image",
        assetPath: `assets/resources/lanhu/${slug}/slices/${toSlug(name)}.png`,
        x: round((left + width / 2) * scale - PROJECT_SIZE.width / 2),
        y: round(contentHeight / 2 - (top + height / 2) * scale),
        width: round(width * scale),
        height: round(height * scale),
        sourcePosition: { x: left, y: top },
        sourceSize: { width, height },
        shape,
        binding: false,
        bindingReason: "generated-static-shape",
    };
}

function classifyImageBinding(name, sourceName = "", layerPath = "", options = {}) {
    const value = `${name} ${sourceName} ${layerPath}`.toLowerCase();
    if (typeof options.binding === "boolean") {
        return { binding: options.binding, bindingReason: options.bindingReason || "manual-override" };
    }
    if (/close|关闭/.test(value)) {
        return { binding: false, bindingReason: "fixed-close-icon" };
    }
    if (options.button || /btn|button|按钮/.test(value)) {
        return { binding: false, bindingReason: "fixed-button-background" };
    }
    if (/avatar|portrait|headicon|head_icon|头像|用户头像|宠物头像|角色头像/.test(value)) {
        return { binding: true, bindingReason: "runtime-avatar-or-role-image" };
    }
    if (/item|prop|reward|currency|coin|jade|icon|道具|奖励|货币|金币|灵玉|品质|状态|稀有|等级/.test(value)) {
        return { binding: true, bindingReason: "runtime-item-or-status-icon" };
    }
    if (/bg|background|panel|dialog|input|mask|header|tab|mark|rectangle|wrapper|底|背景|面板|弹窗|输入框|标题|选中/.test(value)) {
        return { binding: false, bindingReason: "fixed-ui-background" };
    }
    return { binding: false, bindingReason: "static-image-default" };
}

function createRenameConfirmTextNodes(scale, contentHeight) {
    return [
        createTextNode("MessageLabel", "消耗1张改名卡/50灵玉，修改昵称为：", 207, 947, 414, 48, 28, { r: 0, g: 0, b: 0, a: 255 }, scale, contentHeight),
        createTextNode("NameLabel", "宠物昵称", 207, 995, 414, 48, 28, { r: 40, g: 152, b: 140, a: 255 }, scale, contentHeight),
        createButtonTextNode("CancelLabel", "取消", 64, 45, 32, { r: 40, g: 152, b: 140, a: 255 }, scale, "CancelBtn"),
        createButtonTextNode("ConfirmLabel", "确认", 64, 45, 32, { r: 255, g: 255, b: 255, a: 255 }, scale, "ConfirmBtn"),
    ];
}

function createButtonTextNode(name, text, width, height, fontSize, color, scale, parent) {
    const isRuntimeButtonValue = /[0-9]/.test(String(text)) || /灵玉|金币|钻石|消耗|持有|Lv\.|万/.test(String(text));
    return {
        name,
        type: "text",
        parent,
        text,
        binding: isRuntimeButtonValue,
        bindingReason: isRuntimeButtonValue ? "button-runtime-value" : "button-label-fixed",
        x: 0,
        y: 0,
        width: round(width * scale),
        height: round(height * scale),
        fontSize: Math.round(fontSize * scale),
        lineHeight: Math.round(fontSize * scale * 1.2),
        color,
    };
}

function createTextNode(name, text, left, top, width, height, fontSize, color, scale, contentHeight, extra = {}) {
    const bindingMeta = classifyTextBinding(name, text, extra);
    return {
        name,
        type: "text",
        text,
        x: round((left + width / 2) * scale - PROJECT_SIZE.width / 2),
        y: round(contentHeight / 2 - (top + height / 2) * scale),
        width: round(width * scale),
        height: round(height * scale),
        fontSize: Math.round(fontSize * scale),
        lineHeight: Math.round(fontSize * scale * 1.2),
        color,
        binding: bindingMeta.binding,
        bindingReason: bindingMeta.reason,
        ...extra,
    };
}

function classifyTextBinding(name, text, extra = {}) {
    if (typeof extra.binding === "boolean") {
        return { binding: extra.binding, reason: extra.bindingReason || "manual-override" };
    }

    if (extra.parent) {
        return { binding: false, reason: "child-label-inherits-parent" };
    }

    const value = String(text);
    const lowerName = String(name).toLowerCase();
    const fixedTexts = new Set(["好友", "大神", "访客", "搜索", "取消", "确认", "串门", "匿名访问", "宠物改名", "仅支持中文/英文/数字"]);
    if (fixedTexts.has(value)) {
        return { binding: false, reason: "fixed-ui-copy" };
    }

    if (/placeholder|input/.test(lowerName) || value.includes("输入")) {
        return { binding: true, reason: "input-or-placeholder" };
    }
    if (/name|nick|title/.test(lowerName) || value.includes("昵称") || value.includes("宠物昵称")) {
        return { binding: true, reason: "runtime-name" };
    }
    if (/count|num|amount|price|owned|reputation|level|progress|time|timer|label\\d+/.test(lowerName)) {
        return { binding: true, reason: "runtime-value-field" };
    }
    if (/[0-9]/.test(value) || /持有|灵玉|声望|等级|Lv\\.|天|时|分|秒|万/.test(value)) {
        return { binding: true, reason: "numeric-or-resource-value" };
    }

    return { binding: false, reason: "static-copy-default" };
}

function inferRawCanvas(data) {
    let width = 0;
    let height = 0;
    for (const slice of data.slices || []) {
        if (!slice.position || !slice.size) continue;
        const size = parseSize(slice.size);
        width = Math.max(width, slice.position.x + size.width);
        height = Math.max(height, slice.position.y + size.height);
    }
    return {
        width: width || Math.round((data.canvas_size?.width || 207) * 4),
        height: height || Math.round((data.canvas_size?.height || 448) * 4),
    };
}

async function downloadSlices(spec, projectRoot) {
    for (const node of spec.nodes.filter((item) => item.type === "image")) {
        const targetPath = path.join(projectRoot, node.assetPath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        const response = await fetch(node.downloadUrl, {
            headers: {
                "accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
                "referer": "https://lanhuapp.com/",
                "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            },
        });
        if (!response.ok) {
            fail(`Failed to download ${node.downloadUrl}: ${response.status} ${response.statusText}`);
        }
        fs.writeFileSync(targetPath, Buffer.from(await response.arrayBuffer()));
        ensureImageMeta(targetPath, readPngSize(targetPath));
    }
}

async function generateImageAssets(spec, projectRoot) {
    for (const node of spec.nodes.filter((item) => item.type === "generated-image")) {
        const targetPath = path.join(projectRoot, node.assetPath);
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.writeFileSync(targetPath, createRoundedRectPng(node.sourceSize.width, node.sourceSize.height, node.shape));
        ensureImageMeta(targetPath, node.sourceSize);
    }
}

function createPrefab(panelName, nodes) {
    const objects = [{ __type__: "cc.Prefab", _name: "", _objFlags: 0, _native: "", data: { __id__: 1 }, optimizationPolicy: 0, asyncLoadAssets: false }];
    const root = createNode(panelName, null, [], [], 0, 0, 0);
    objects.push(root);
    root._components.push({ __id__: objects.length });
    objects.push(createTransform(1, PROJECT_SIZE.width, PROJECT_SIZE.height));

    const nodeIds = new Map();
    for (const node of nodes) {
        const nodeId = objects.length;
        nodeIds.set(node.name, nodeId);
        objects.push(createNode(node.name, 1, [], [], node.x, node.y, 0));

        const componentRefs = [];
        const transformId = objects.length;
        componentRefs.push({ __id__: transformId });
        objects.push(createTransform(nodeId, node.width, node.height));

        if (node.type === "image" || node.type === "generated-image") {
            const spriteId = objects.length;
            componentRefs.push({ __id__: spriteId });
            objects.push(createSprite(nodeId, readSpriteFrameUuid(node.assetPath), node.opacity));
            if (node.button) {
                const buttonId = objects.length;
                componentRefs.push({ __id__: buttonId });
                objects.push(createButton(nodeId));
            }
        } else if (node.type === "text") {
            const labelId = objects.length;
            componentRefs.push({ __id__: labelId });
            objects.push(createLabel(nodeId, node));
        } else if (node.type === "scroll-view") {
            const scrollViewId = objects.length;
            componentRefs.push({ __id__: scrollViewId });
            objects.push(createScrollView(nodeId, node));
        } else if (node.type === "mask") {
            const maskId = objects.length;
            componentRefs.push({ __id__: maskId });
            objects.push(createMask(nodeId));
        } else if (node.type === "layout") {
            const layoutId = objects.length;
            componentRefs.push({ __id__: layoutId });
            objects.push(createLayout(nodeId, node));
        }

        objects[nodeId]._components = componentRefs;
    }

    for (const node of nodes) {
        const nodeId = nodeIds.get(node.name);
        const parentId = node.parent ? nodeIds.get(node.parent) : 1;
        if (!nodeId || !parentId) {
            continue;
        }
        objects[nodeId]._parent = { __id__: parentId };
        objects[parentId]._children.push({ __id__: nodeId });
    }

    for (const node of nodes) {
        if (node.type !== "scroll-view" || !node.content) {
            continue;
        }
        const nodeId = nodeIds.get(node.name);
        const scrollView = objects[objects[nodeId]._components.find((ref) => objects[ref.__id__].__type__ === "cc.ScrollView").__id__];
        const contentRef = { __id__: nodeIds.get(node.content) };
        scrollView.content = contentRef;
        scrollView._N$content = contentRef;
    }

    attachPrefabInfos(objects);
    return objects;
}

function readSpriteFrameUuid(assetPath) {
    const metaPath = path.join(process.cwd(), `${assetPath}.meta`);
    const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    return meta.subMetas?.f9941?.uuid || `${meta.uuid}@f9941`;
}

function createNode(name, parentId, childRefs, componentRefs, x, y, z) {
    return {
        __type__: "cc.Node",
        _name: name,
        _objFlags: 0,
        _parent: parentId === null ? null : { __id__: parentId },
        _children: childRefs,
        _active: true,
        _components: componentRefs,
        _prefab: null,
        _lpos: { __type__: "cc.Vec3", x, y, z },
        _lrot: { __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 },
        _lscale: { __type__: "cc.Vec3", x: 1, y: 1, z: 1 },
        _layer: UI_LAYER,
        _euler: { __type__: "cc.Vec3", x: 0, y: 0, z: 0 },
        _id: "",
    };
}

function createTransform(nodeId, width, height) {
    return { __type__: "cc.UITransform", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, _contentSize: { __type__: "cc.Size", width, height }, _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 }, _id: "" };
}

function createSprite(nodeId, spriteFrameUuid, opacity = 1) {
    return { __type__: "cc.Sprite", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: Math.round(255 * opacity) }, _sharedMaterial: null, _spriteFrame: { __uuid__: spriteFrameUuid, __expectedType__: "cc.SpriteFrame" }, _type: 0, _fillType: 0, _sizeMode: 0, _fillCenter: { __type__: "cc.Vec2", x: 0, y: 0 }, _fillStart: 0, _fillRange: 0, _isTrimmedMode: true, _useGrayscale: false, _atlas: null, _id: "" };
}

function createButton(nodeId) {
    return { __type__: "cc.Button", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, transition: 3, _normalColor: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 }, _hoverColor: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 }, _pressedColor: { __type__: "cc.Color", r: 211, g: 211, b: 211, a: 255 }, _disabledColor: { __type__: "cc.Color", r: 124, g: 124, b: 124, a: 255 }, duration: 0.1, zoomScale: 0.9, _target: { __id__: nodeId }, _clickEvents: [], _interactable: true, _id: "" };
}

function createLabel(nodeId, node) {
    return { __type__: "cc.Label", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, _materials: [], _visFlags: 0, _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: { __type__: "cc.Color", ...node.color }, _string: node.text, _horizontalAlign: node.horizontalAlign ?? 1, _verticalAlign: 1, _actualFontSize: node.fontSize, _fontSize: node.fontSize, _fontFamily: "Arial", _lineHeight: node.lineHeight, _overflow: 0, _enableWrapText: true, _font: null, _isSystemFontUsed: true, _spacingX: 0, _isItalic: false, _isBold: false, _isUnderline: false, _underlineHeight: 2, _cacheMode: 0, _id: "" };
}

function createScrollView(nodeId, node) {
    return { __type__: "cc.ScrollView", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, content: null, horizontal: false, vertical: true, inertia: true, brake: 0.75, elastic: true, bounceDuration: 0.23, scrollEvents: [], cancelInnerEvents: true, _N$content: null, _N$horizontalScrollBar: null, _N$verticalScrollBar: null, _N$scrollBarAutoHideEnabled: true, _N$scrollBarAutoHideTime: 1, _id: "", ...node.scrollOptions };
}

function createMask(nodeId) {
    return { __type__: "cc.Mask", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, _type: 0, _segements: 64, _spriteFrame: null, _alphaThreshold: 1, _inverted: false, _id: "" };
}

function createLayout(nodeId, node) {
    return { __type__: "cc.Layout", _name: "", _objFlags: 0, node: { __id__: nodeId }, _enabled: true, _resize: 0, _layoutSize: { __type__: "cc.Size", width: node.width, height: node.height }, _type: 2, _cellSize: { __type__: "cc.Size", width: node.cellWidth || node.width, height: node.cellHeight || 100 }, _startAxis: 0, _paddingLeft: 0, _paddingRight: 0, _paddingTop: 0, _paddingBottom: 0, _spacingX: 0, _spacingY: node.spacingY || 0, _verticalDirection: 1, _horizontalDirection: 0, _affectedByScale: false, _id: "" };
}

function attachPrefabInfos(objects) {
    const nodeIds = objects.map((object, index) => object.__type__ === "cc.Node" ? index : -1).filter((index) => index >= 0);
    for (const nodeId of nodeIds) {
        const prefabInfoId = objects.length;
        objects[nodeId]._prefab = { __id__: prefabInfoId };
        objects.push(createPrefabInfo(nodeId, 0));
    }
}

function createPrefabInfo(rootId, assetId) {
    return { __type__: "cc.PrefabInfo", root: { __id__: rootId }, asset: { __id__: assetId }, fileId: crypto.randomBytes(16).toString("base64").replace(/[=+/]/g, "").slice(0, 22) };
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
            "6c48a": { importer: "texture", uuid: `${imageUuid}@6c48a`, displayName: path.basename(imagePath, ".png"), id: "6c48a", name: "texture", ver: "1.0.22", imported: true, files: [".json"], subMetas: {}, userData: { wrapModeS: "clamp-to-edge", wrapModeT: "clamp-to-edge", minfilter: "linear", magfilter: "linear", mipfilter: "none", premultiplyAlpha: false, anisotropy: 0, isUuid: true, imageUuidOrDatabaseUri: imageUuid } },
            "f9941": { ver: "1.0.9", importer: "sprite-frame", uuid: `${imageUuid}@f9941`, imported: true, files: [".json"], subMetas: {}, userData: { wrapModeS: "clamp-to-edge", wrapModeT: "clamp-to-edge", minfilter: "linear", magfilter: "linear", mipfilter: "none", premultiplyAlpha: false, anisotropy: 0, trimType: "auto", trimThreshold: 1, rotated: false, offsetX: 0, offsetY: 0, trimX: 0, trimY: 0, width: imageSize.width, height: imageSize.height, rawWidth: imageSize.width, rawHeight: imageSize.height, borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0, isUuid: true, imageUuidOrDatabaseUri: `${imageUuid}@6c48a`, atlasUuid: "", packable: true }, displayName: path.basename(imagePath, ".png"), id: "f9941", name: "spriteFrame" },
        },
        userData: { type: "sprite-frame", redirect: `${imageUuid}@f9941`, hasAlpha: true },
    };
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

function createRoundedRectPng(width, height, shape) {
    const fill = shape.fill || { r: 255, g: 255, b: 255, a: 255 };
    const border = shape.border || null;
    const radius = Math.max(0, shape.radius || 0);
    const borderWidth = border?.width || 0;
    const rowLength = width * 4 + 1;
    const raw = Buffer.alloc(rowLength * height);

    for (let y = 0; y < height; y += 1) {
        raw[y * rowLength] = 0;
        for (let x = 0; x < width; x += 1) {
            const offset = y * rowLength + 1 + x * 4;
            const insideOuter = isInsideRoundedRect(x, y, width, height, radius);
            const insideInner = borderWidth > 0
                ? isInsideRoundedRect(x - borderWidth, y - borderWidth, width - borderWidth * 2, height - borderWidth * 2, Math.max(0, radius - borderWidth))
                : true;
            const color = insideOuter && border && !insideInner ? border : fill;
            raw[offset] = color.r;
            raw[offset + 1] = color.g;
            raw[offset + 2] = color.b;
            raw[offset + 3] = insideOuter ? color.a : 0;
        }
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        createPngChunk("IHDR", Buffer.concat([uint32(width), uint32(height), Buffer.from([8, 6, 0, 0, 0])])),
        createPngChunk("IDAT", zlib.deflateSync(raw)),
        createPngChunk("IEND", Buffer.alloc(0)),
    ]);
}

function isInsideRoundedRect(x, y, width, height, radius) {
    if (width <= 0 || height <= 0 || x < 0 || y < 0 || x >= width || y >= height) return false;
    if (radius <= 0) return true;
    const left = radius;
    const right = width - radius - 1;
    const top = radius;
    const bottom = height - radius - 1;
    const cx = x < left ? left : x > right ? right : x;
    const cy = y < top ? top : y > bottom ? bottom : y;
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= radius * radius;
}

function createPngChunk(type, data) {
    const typeBuffer = Buffer.from(type, "ascii");
    const crc = crc32(Buffer.concat([typeBuffer, data]));
    return Buffer.concat([uint32(data.length), typeBuffer, data, uint32(crc)]);
}

function uint32(value) {
    const buffer = Buffer.alloc(4);
    buffer.writeUInt32BE(value >>> 0, 0);
    return buffer;
}

function crc32(buffer) {
    let crc = 0xffffffff;
    for (const byte of buffer) {
        crc ^= byte;
        for (let i = 0; i < 8; i += 1) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function parseSize(value) {
    const [width, height] = String(value).split("x").map(Number);
    return { width, height };
}

function readPngSize(filePath) {
    const buffer = fs.readFileSync(filePath);
    if (buffer.toString("ascii", 1, 4) !== "PNG") return { width: 100, height: 100 };
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function uniqueName(name, seenNames) {
    const count = (seenNames.get(name) || 0) + 1;
    seenNames.set(name, count);
    return count === 1 ? name : `${name}${count}`;
}

function toPascalCase(value) {
    const words = String(value).trim().match(/[A-Za-z0-9]+|[\u4e00-\u9fa5]+/g) || ["Lanhu"];
    return words.map((word) => (/^[\u4e00-\u9fa5]+$/.test(word) ? "Lanhu" : word[0].toUpperCase() + word.slice(1))).join("");
}

function toSlug(value) {
    return String(value).replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lanhu-panel";
}

function round(value) {
    return Math.round(value * 100) / 100;
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

main().catch((error) => fail(error.stack || error.message));
