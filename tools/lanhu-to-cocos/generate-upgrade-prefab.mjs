#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "../..");
const prefabDir = path.join(projectRoot, "assets/resources/prefabs/lanhu");
const prefabPath = path.join(prefabDir, "UIUpgradePanel.prefab");
const imagePath = path.join(projectRoot, "assets/resources/textures/lanhu/upgrade/reference.png");
const imageMetaPath = `${imagePath}.meta`;
const upgradePanelScriptType = "97f38+V1WZK/oIx6ZJ4eCRR";

function main() {
    if (!fs.existsSync(imagePath)) {
        throw new Error(`Missing image: ${imagePath}`);
    }

    fs.mkdirSync(prefabDir, { recursive: true });
    ensureImageMeta();
    fs.writeFileSync(prefabPath, `${JSON.stringify(createPrefab(), null, 2)}\n`, "utf8");
    console.log(`Generated ${path.relative(projectRoot, prefabPath)}`);
}

function ensureImageMeta() {
    const imageUuid = readOrCreateUuid(imageMetaPath, "4ebf29cb-7c9b-44ea-8b0c-ff8b52a3d420");
    const meta = {
        ver: "1.0.27",
        importer: "image",
        imported: true,
        uuid: imageUuid,
        files: [".png", ".json"],
        subMetas: {
            "6c48a": {
                importer: "texture",
                uuid: `${imageUuid}@6c48a`,
                displayName: "reference",
                id: "6c48a",
                name: "texture",
                ver: "1.0.22",
                imported: true,
                files: [".json"],
                subMetas: {},
                userData: {
                    wrapModeS: "clamp-to-edge",
                    wrapModeT: "clamp-to-edge",
                    minfilter: "linear",
                    magfilter: "linear",
                    mipfilter: "none",
                    premultiplyAlpha: false,
                    anisotropy: 0,
                    isUuid: true,
                    imageUuidOrDatabaseUri: imageUuid,
                },
            },
            "f9941": {
                ver: "1.0.9",
                importer: "sprite-frame",
                uuid: `${imageUuid}@f9941`,
                imported: true,
                files: [".json"],
                subMetas: {},
                userData: {
                    wrapModeS: "clamp-to-edge",
                    wrapModeT: "clamp-to-edge",
                    minfilter: "linear",
                    magfilter: "linear",
                    mipfilter: "none",
                    premultiplyAlpha: false,
                    anisotropy: 0,
                    trimType: "auto",
                    trimThreshold: 1,
                    rotated: false,
                    offsetX: 0,
                    offsetY: 0,
                    trimX: 0,
                    trimY: 0,
                    width: 828,
                    height: 1792,
                    rawWidth: 828,
                    rawHeight: 1792,
                    borderTop: 0,
                    borderBottom: 0,
                    borderLeft: 0,
                    borderRight: 0,
                    isUuid: true,
                    imageUuidOrDatabaseUri: `${imageUuid}@6c48a`,
                    atlasUuid: "",
                    packable: true,
                },
                displayName: "reference",
                id: "f9941",
                name: "spriteFrame",
            },
        },
        userData: {
            type: "sprite-frame",
            redirect: `${imageUuid}@f9941`,
            hasAlpha: false,
        },
    };

    fs.writeFileSync(imageMetaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

function readOrCreateUuid(metaPath, fallback) {
    if (!fs.existsSync(metaPath)) {
        return fallback;
    }

    try {
        return JSON.parse(fs.readFileSync(metaPath, "utf8")).uuid || fallback;
    } catch {
        return fallback;
    }
}

function createPrefab() {
    const imageUuid = JSON.parse(fs.readFileSync(imageMetaPath, "utf8")).uuid;
    const spriteFrameUuid = `${imageUuid}@f9941`;

    return [
        {
            __type__: "cc.Prefab",
            _name: "",
            _objFlags: 0,
            _native: "",
            data: { __id__: 1 },
            optimizationPolicy: 0,
            asyncLoadAssets: false,
        },
        createNode("UIUpgradePanel", null, [2, 5, 8], [11, 12], 0, 0, 0, 33554432),
        createNode("LanhuReferenceImg", 1, [], [3, 4], 0, 0, 0, 33554432),
        createTransform(2, 640, 1385),
        createSprite(2, spriteFrameUuid),
        createNode("CloseBtn", 1, [], [6, 7], 185, -67, 0, 33554432),
        createTransform(5, 72, 72),
        createButton(5),
        createNode("FeedBtn", 1, [], [9, 10], 0, -232, 0, 33554432),
        createTransform(8, 260, 76),
        createButton(8),
        createTransform(1, 640, 1136),
        createUpgradePanelScript(1),
        createPrefabInfo(1, 0),
        createPrefabInfo(2, 0),
        createPrefabInfo(5, 0),
        createPrefabInfo(8, 0),
    ];
}

function createNode(name, parentId, childIds, componentIds, x, y, z, layer) {
    return {
        __type__: "cc.Node",
        _name: name,
        _objFlags: 0,
        _parent: parentId === null ? null : { __id__: parentId },
        _children: childIds.map((id) => ({ __id__: id })),
        _active: true,
        _components: componentIds.map((id) => ({ __id__: id })),
        _prefab: { __id__: name === "UIUpgradePanel" ? 13 : name === "LanhuReferenceImg" ? 14 : name === "CloseBtn" ? 15 : 16 },
        _lpos: { __type__: "cc.Vec3", x, y, z },
        _lrot: { __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 },
        _lscale: { __type__: "cc.Vec3", x: 1, y: 1, z: 1 },
        _layer: layer,
        _euler: { __type__: "cc.Vec3", x: 0, y: 0, z: 0 },
        _id: "",
    };
}

function createUpgradePanelScript(nodeId) {
    return {
        __type__: upgradePanelScriptType,
        _name: "",
        _objFlags: 0,
        node: { __id__: nodeId },
        _enabled: true,
        lanhuReferenceImg: { __id__: 4 },
        closeBtn: { __id__: 7 },
        feedBtn: { __id__: 10 },
        _id: "",
    };
}

function createTransform(nodeId, width, height) {
    return {
        __type__: "cc.UITransform",
        _name: "",
        _objFlags: 0,
        node: { __id__: nodeId },
        _enabled: true,
        _contentSize: { __type__: "cc.Size", width, height },
        _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 },
        _id: "",
    };
}

function createSprite(nodeId, spriteFrameUuid) {
    return {
        __type__: "cc.Sprite",
        _name: "",
        _objFlags: 0,
        node: { __id__: nodeId },
        _enabled: true,
        _srcBlendFactor: 2,
        _dstBlendFactor: 4,
        _color: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 },
        _sharedMaterial: null,
        _spriteFrame: { __uuid__: spriteFrameUuid, __expectedType__: "cc.SpriteFrame" },
        _type: 0,
        _fillType: 0,
        _sizeMode: 0,
        _fillCenter: { __type__: "cc.Vec2", x: 0, y: 0 },
        _fillStart: 0,
        _fillRange: 0,
        _isTrimmedMode: true,
        _useGrayscale: false,
        _atlas: null,
        _id: "",
    };
}

function createButton(nodeId) {
    return {
        __type__: "cc.Button",
        _name: "",
        _objFlags: 0,
        node: { __id__: nodeId },
        _enabled: true,
        clickEvents: [],
        _interactable: true,
        _transition: 0,
        _normalColor: { __type__: "cc.Color", r: 214, g: 214, b: 214, a: 255 },
        _hoverColor: { __type__: "cc.Color", r: 211, g: 211, b: 211, a: 255 },
        _pressColor: { __type__: "cc.Color", r: 255, g: 255, b: 255, a: 255 },
        _disabledColor: { __type__: "cc.Color", r: 124, g: 124, b: 124, a: 255 },
        _normalSprite: null,
        _hoverSprite: null,
        _pressedSprite: null,
        _disabledSprite: null,
        _duration: 0.1,
        _zoomScale: 1.2,
        _target: { __id__: nodeId },
        _id: "",
    };
}

function createPrefabInfo(rootId, assetId) {
    return {
        __type__: "cc.PrefabInfo",
        root: { __id__: rootId },
        asset: { __id__: assetId },
        fileId: crypto.randomBytes(16).toString("base64").replace(/[=+/]/g, "").slice(0, 22),
    };
}

main();
