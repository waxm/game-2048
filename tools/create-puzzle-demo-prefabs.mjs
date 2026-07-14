#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname, "..");
const prefabDir = path.join(projectRoot, "assets/resources/prefabs/game");
const uiLayer = 33554432;
const panelScriptType = "e6b99/MOTpC9rOJra+XZpqg";
// 此 ID 来自 Creator 对 PuzzlePiece.ts UUID 的压缩结果，Prefab 反序列化依赖它查找脚本类。
const pieceScriptType = "ef85cMk1SROQrGG015486DV";
const piecePrefabUuid = "9bf31917-81ef-4bb0-ae0f-7f938f0d3573";
const panelPrefabUuid = "79764185-c340-4a5f-ab8a-ab073eae8f2d";

/** 生成第 1 关需要的两个 Prefab。 */
function main() {
    fs.mkdirSync(prefabDir, { recursive: true });
    writePrefab("PuzzlePiece", createPiecePrefab(), piecePrefabUuid);
    writePrefab("UIGamePanel", createPanelPrefab(), panelPrefabUuid);
    console.log("Generated PuzzlePiece.prefab and UIGamePanel.prefab");
}

/** 创建单块拼图 Prefab。 */
function createPiecePrefab() {
    const objects = [createPrefabAsset("PuzzlePiece")];
    const rootId = addNode(objects, "PuzzlePiece", null, 0, 0, 190, 190);
    const imageSpriteId = addSprite(objects, rootId);
    const numberNodeId = addNode(objects, "NumberLabel", rootId, 0, 0, 120, 50);
    const numberLabelId = addLabel(
        objects,
        numberNodeId,
        "1",
        32,
        color(255, 255, 255),
    );
    const scriptId = addObject(objects, {
        __type__: pieceScriptType,
        _name: "",
        _objFlags: 0,
        node: ref(rootId),
        _enabled: true,
        imageSprite: ref(imageSpriteId),
        numberLabel: ref(numberLabelId),
        _id: "",
    });
    objects[rootId]._components.push(ref(scriptId));
    attachPrefabInfos(objects);
    return objects;
}

/** 创建游戏主面板 Prefab。 */
function createPanelPrefab() {
    const objects = [createPrefabAsset("UIGamePanel")];
    const rootId = addNode(objects, "UIGamePanel", null, 0, 0, 640, 1136);
    const titleNodeId = addNode(objects, "TitleLabel", rootId, 0, 500, 300, 60);
    const titleLabelId = addLabel(
        objects,
        titleNodeId,
        "关卡 1",
        42,
        color(255, 255, 255),
    );
    const progressNodeId = addNode(
        objects,
        "ProgressLabel",
        rootId,
        0,
        450,
        320,
        45,
    );
    const progressLabelId = addLabel(
        objects,
        progressNodeId,
        "已完成 0 / 4",
        26,
        color(190, 220, 255),
    );
    const feedbackNodeId = addNode(
        objects,
        "FeedbackLabel",
        rootId,
        0,
        -520,
        560,
        45,
    );
    const feedbackLabelId = addLabel(
        objects,
        feedbackNodeId,
        "拖动四块图片，拼回完整原图",
        24,
        color(255, 225, 120),
    );
    const puzzleContainerId = addNode(
        objects,
        "PuzzleContainer",
        rootId,
        0,
        0,
        640,
        1136,
    );

    const slotPositions = [
        [-97, 270],
        [97, 270],
        [-97, 72],
        [97, 72],
    ];
    const slotNodeIds = slotPositions.map(([x, y], index) => {
        const slotId = addNode(
            objects,
            `Slot_${index}`,
            puzzleContainerId,
            x,
            y,
            190,
            190,
        );
        addLabel(
            objects,
            slotId,
            `目标 ${index + 1}`,
            22,
            color(115, 125, 140),
        );
        return slotId;
    });

    const restart = addButtonWithLabel(
        objects,
        rootId,
        "RestartButton",
        "重玩",
        245,
        500,
    );
    const back = addButtonWithLabel(
        objects,
        rootId,
        "BackButton",
        "返回",
        -245,
        500,
    );
    const scriptId = addObject(objects, {
        __type__: panelScriptType,
        _name: "",
        _objFlags: 0,
        node: ref(rootId),
        _enabled: true,
        titleLabel: ref(titleLabelId),
        progressLabel: ref(progressLabelId),
        feedbackLabel: ref(feedbackLabelId),
        puzzleContainer: ref(puzzleContainerId),
        slotNodes: slotNodeIds.map(ref),
        piecePrefab: {
            __uuid__: piecePrefabUuid,
            __expectedType__: "cc.Prefab",
        },
        restartButton: ref(restart.buttonId),
        backButton: ref(back.buttonId),
        _id: "",
    });
    objects[rootId]._components.push(ref(scriptId));
    attachPrefabInfos(objects);
    return objects;
}

/** 添加带文字子节点的按钮。 */
function addButtonWithLabel(objects, parentId, name, text, x, y) {
    const nodeId = addNode(objects, name, parentId, x, y, 120, 64);
    const buttonId = addButton(objects, nodeId);
    const labelNodeId = addNode(objects, "Label", nodeId, 0, 0, 100, 50);
    addLabel(objects, labelNodeId, text, 28, color(120, 190, 255));
    return { nodeId, buttonId };
}

/** 添加节点及其 UITransform。 */
function addNode(objects, name, parentId, x, y, width, height) {
    const nodeId = addObject(objects, {
        __type__: "cc.Node",
        _name: name,
        _objFlags: 0,
        _parent: parentId === null ? null : ref(parentId),
        _children: [],
        _active: true,
        _components: [],
        _prefab: null,
        _lpos: vec3(x, y, 0),
        _lrot: { __type__: "cc.Quat", x: 0, y: 0, z: 0, w: 1 },
        _lscale: vec3(1, 1, 1),
        _layer: uiLayer,
        _euler: vec3(0, 0, 0),
        _id: "",
    });
    if (parentId !== null) {
        objects[parentId]._children.push(ref(nodeId));
    }
    const transformId = addObject(objects, {
        __type__: "cc.UITransform",
        _name: "",
        _objFlags: 0,
        node: ref(nodeId),
        _enabled: true,
        _contentSize: { __type__: "cc.Size", width, height },
        _anchorPoint: { __type__: "cc.Vec2", x: 0.5, y: 0.5 },
        _id: "",
    });
    objects[nodeId]._components.push(ref(transformId));
    return nodeId;
}

/** 添加 Label 组件。 */
function addLabel(objects, nodeId, text, fontSize, labelColor) {
    const componentId = addObject(objects, {
        __type__: "cc.Label",
        _name: "",
        _objFlags: 0,
        node: ref(nodeId),
        _enabled: true,
        _color: labelColor,
        _string: text,
        _horizontalAlign: 1,
        _verticalAlign: 1,
        _actualFontSize: fontSize,
        _fontSize: fontSize,
        _fontFamily: "Arial",
        _lineHeight: fontSize + 8,
        _overflow: 0,
        _enableWrapText: true,
        _font: null,
        _isSystemFontUsed: true,
        _id: "",
    });
    objects[nodeId]._components.push(ref(componentId));
    return componentId;
}

/** 添加没有初始图片的 Sprite，运行时由 PuzzlePiece.setData 设置切图。 */
function addSprite(objects, nodeId) {
    const componentId = addObject(objects, {
        __type__: "cc.Sprite",
        _name: "",
        _objFlags: 0,
        node: ref(nodeId),
        _enabled: true,
        _color: color(255, 255, 255),
        _spriteFrame: null,
        _type: 0,
        _sizeMode: 0,
        _isTrimmedMode: false,
        _id: "",
    });
    objects[nodeId]._components.push(ref(componentId));
    return componentId;
}

/** 添加缩放反馈按钮。 */
function addButton(objects, nodeId) {
    const componentId = addObject(objects, {
        __type__: "cc.Button",
        _name: "",
        _objFlags: 0,
        node: ref(nodeId),
        _enabled: true,
        transition: 3,
        duration: 0.1,
        zoomScale: 0.9,
        _target: ref(nodeId),
        _clickEvents: [],
        _interactable: true,
        _id: "",
    });
    objects[nodeId]._components.push(ref(componentId));
    return componentId;
}

/** 为每个节点补齐 Creator PrefabInfo。 */
function attachPrefabInfos(objects) {
    const nodeIds = objects
        .map((item, index) => (item.__type__ === "cc.Node" ? index : -1))
        .filter((index) => index >= 0);
    for (const nodeId of nodeIds) {
        const infoId = addObject(objects, {
            __type__: "cc.PrefabInfo",
            root: ref(nodeId),
            asset: ref(0),
            fileId: crypto
                .randomBytes(16)
                .toString("base64")
                .replace(/[=+/]/g, "")
                .slice(0, 22),
        });
        objects[nodeId]._prefab = ref(infoId);
    }
}

/** 写入 Prefab 和对应 meta。 */
function writePrefab(name, objects, uuid) {
    const prefabPath = path.join(prefabDir, `${name}.prefab`);
    fs.writeFileSync(
        prefabPath,
        `${JSON.stringify(objects, null, 2)}\n`,
        "utf8",
    );
    fs.writeFileSync(
        `${prefabPath}.meta`,
        `${JSON.stringify(
            {
                ver: "1.1.50",
                importer: "prefab",
                imported: true,
                uuid,
                files: [".json"],
                subMetas: {},
                userData: { syncNodeName: name },
            },
            null,
            2,
        )}\n`,
        "utf8",
    );
}

/** 创建 Prefab 资源头。 */
function createPrefabAsset(name) {
    return {
        __type__: "cc.Prefab",
        _name: name,
        _objFlags: 0,
        _native: "",
        data: ref(1),
        optimizationPolicy: 0,
        asyncLoadAssets: false,
        persistent: false,
    };
}

/** 向序列化对象表追加对象并返回索引。 */
function addObject(objects, object) {
    objects.push(object);
    return objects.length - 1;
}

/** 创建对象表引用。 */
function ref(id) {
    return { __id__: id };
}

/** 创建三维向量。 */
function vec3(x, y, z) {
    return { __type__: "cc.Vec3", x, y, z };
}

/** 创建颜色。 */
function color(r, g, b, a = 255) {
    return { __type__: "cc.Color", r, g, b, a };
}

main();
