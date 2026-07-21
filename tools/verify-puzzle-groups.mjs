#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

/** 当前项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "..");

/** 动态载入不依赖 Cocos 运行时的 TypeScript 纯逻辑模块。 */
async function loadPureModule(relativePath) {
  const sourcePath = path.join(projectRoot, relativePath);
  const source = fs.readFileSync(sourcePath, "utf8");
  const transpiled = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
    },
    reportDiagnostics: true,
  });
  const errors = (transpiled.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  assert.equal(errors.length, 0, `${relativePath} 转换失败。`);
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(
    transpiled.outputText,
  ).toString("base64")}`;
  return import(moduleUrl);
}

const { PuzzleGroupManager } = await loadPureModule(
  "assets/app/game/model/PuzzleGroup.ts",
);
const { PuzzleGroupContour } = await loadPureModule(
  "assets/app/game/logic/PuzzleGroupContour.ts",
);

/** 计算简化轮廓中的网格周长，确认内部公共边已经被消除。 */
function getContourPerimeter(loops) {
  return loops.reduce((total, loop) => {
    return (
      total +
      loop.points.reduce((loopTotal, point, index) => {
        const next = loop.points[(index + 1) % loop.points.length];
        return (
          loopTotal +
          Math.abs(next.column - point.column) +
          Math.abs(next.row - point.row)
        );
      }, 0)
    );
  }, 0);
}

/** 校验指定格子形状的闭合环数量、周长和最小顶点数量。 */
function expectContour(name, columns, cellIndices, loopCount, perimeter) {
  const loops = PuzzleGroupContour.trace(new Set(cellIndices), columns);
  assert.equal(loops.length, loopCount, `${name} 的闭合环数量不正确。`);
  assert.equal(
    getContourPerimeter(loops),
    perimeter,
    `${name} 的外露边周长不正确。`,
  );
  loops.forEach((loop) => {
    assert.ok(loop.points.length >= 4, `${name} 存在无效闭合环。`);
    assert.notDeepEqual(
      loop.points[0],
      loop.points[loop.points.length - 1],
      `${name} 不应保留重复闭合终点。`,
    );
  });
}

// 单块、矩形和凹多格组合都只能保留真正的外边界。
expectContour("单块", 3, [0], 1, 4);
expectContour("横向两块", 3, [0, 1], 1, 6);
expectContour("L 形三块", 3, [0, 1, 3], 1, 8);
expectContour("T 形五块", 3, [0, 1, 2, 4, 7], 1, 12);

// 中空组合需要同时生成外轮廓和孔洞轮廓，二者都不能丢失。
expectContour("3×3 中空环", 3, [0, 1, 2, 3, 5, 6, 7, 8], 2, 16);

// 两段边界在一个顶点接触时必须分别闭合，不能从接触点串到错误路径。
expectContour("点接触回形组合", 4, [0, 1, 4, 6, 8, 9, 10], 2, 16);

// 10×10 满组合应在消除 180 条公共边后只剩四段矩形轮廓。
const fullTenByTen = Array.from({ length: 100 }, (_value, index) => index);
const fullLoops = PuzzleGroupContour.trace(new Set(fullTenByTen), 10);
assert.equal(fullLoops.length, 1, "10×10 满组合应只有一个外轮廓。");
assert.equal(fullLoops[0].points.length, 4, "10×10 满组合应简化为四个顶点。");
assert.equal(getContourPerimeter(fullLoops), 40, "10×10 满组合周长不正确。");

// 组合管理器首次建立单块组时，不应误报连接扩展。
const manager = new PuzzleGroupManager();
const initialResult = manager.rebuild([0, 1, 2, 3, 4, 5], []);
assert.equal(initialResult.groups.length, 6, "初始单块组合数量不正确。");
assert.equal(initialResult.expandedGroups.length, 0, "初始单块不应触发合并。");
assert.equal(initialResult.largestConnectedGroup, null, "初始状态不应有连接组。");

// 一条连接链只能生成一个真实组合对象，所有成员反向索引必须指向同一对象。
const firstMerge = manager.rebuild(
  [0, 1, 2, 3, 4, 5],
  [
    { firstPieceId: 0, secondPieceId: 1 },
    { firstPieceId: 1, secondPieceId: 2 },
    { firstPieceId: 3, secondPieceId: 4 },
  ],
);
assert.equal(firstMerge.groups.length, 3, "首次合并后的组合数量不正确。");
assert.equal(firstMerge.expandedGroups.length, 2, "首次合并应产生两个扩展组合。");
const group012 = manager.getGroupByPieceId(0);
assert.ok(group012, "无法取得 0 所属组合。");
assert.equal(group012, manager.getGroupByPieceId(1), "0、1 没有共享同一组合对象。");
assert.equal(group012, manager.getGroupByPieceId(2), "0、2 没有共享同一组合对象。");
assert.deepEqual([...group012.pieceIds], [0, 1, 2], "组合成员不正确。");

// 连接关系完全不变时复用原组合，避免无意义地刷新轮廓和视图状态。
manager.rebuild(
  [0, 1, 2, 3, 4, 5],
  [
    { firstPieceId: 0, secondPieceId: 1 },
    { firstPieceId: 1, secondPieceId: 2 },
    { firstPieceId: 3, secondPieceId: 4 },
  ],
);
assert.equal(
  group012,
  manager.getGroupByPieceId(0),
  "未变化组合没有复用原对象。",
);

// 两个旧组合通过一条新边合并后，五个成员必须原子归入同一新组合。
const secondMerge = manager.rebuild(
  [0, 1, 2, 3, 4, 5],
  [
    { firstPieceId: 0, secondPieceId: 1 },
    { firstPieceId: 1, secondPieceId: 2 },
    { firstPieceId: 2, secondPieceId: 3 },
    { firstPieceId: 3, secondPieceId: 4 },
  ],
);
assert.equal(secondMerge.expandedGroups.length, 1, "二次合并只应扩展一个组合。");
assert.deepEqual(
  [...secondMerge.expandedGroups[0].pieceIds],
  [0, 1, 2, 3, 4],
  "二次合并成员不正确。",
);
assert.equal(secondMerge.largestConnectedGroup?.size, 5, "最大组合数量不正确。");

// 目标组合被移动链打散后，管理器必须创建新的连通分量并替换全部反向索引。
const groupBeforeSplit = manager.getGroupByPieceId(0);
const splitResult = manager.rebuild(
  [0, 1, 2, 3, 4, 5],
  [
    { firstPieceId: 0, secondPieceId: 1 },
    { firstPieceId: 3, secondPieceId: 4 },
  ],
);
assert.equal(splitResult.groups.length, 4, "旧组合拆分后的组合数量不正确。");
assert.equal(splitResult.expandedGroups.length, 0, "组合拆分不应误报连接扩展。");
assert.deepEqual(
  [...manager.getGroupByPieceId(0).pieceIds],
  [0, 1],
  "拆分后的第一段成员不正确。",
);
assert.deepEqual(
  [...manager.getGroupByPieceId(3).pieceIds],
  [3, 4],
  "拆分后的第二段成员不正确。",
);
assert.notEqual(
  manager.getGroupByPieceId(0),
  groupBeforeSplit,
  "组合拆分后错误复用了旧组合对象。",
);
assert.equal(
  splitResult.largestConnectedGroup?.id,
  0,
  "同样大小的拆分组合应稳定选择编号较小者。",
);

// 非法连接必须在正式索引替换前抛错，原组合状态保持完整。
const stableGroup = manager.getGroupByPieceId(0);
assert.throws(
  () =>
    manager.rebuild([0, 1, 2, 3, 4, 5], [
      { firstPieceId: 0, secondPieceId: 99 },
    ]),
  /拼图组合连接无效/,
  "未知拼图连接没有被拒绝。",
);
assert.equal(
  manager.getGroupByPieceId(0),
  stableGroup,
  "非法重建改变了原组合状态。",
);

console.log("拼图组合模型与外轮廓验证通过：6 类轮廓、6 类组合状态。");
