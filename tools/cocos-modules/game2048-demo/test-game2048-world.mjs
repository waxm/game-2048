#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

/** 项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "../../..");

/** 2048 领域源码目录。 */
const sourceRoot = path.join(projectRoot, "assets/app/game/game2048");

/** 本轮 TypeScript 转换使用的临时目录。 */
const outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), "game2048-world-test-"));

/** 把领域 TypeScript 转换成 Node 可加载的临时 ESM。 */
function compileDomainSource(fileName) {
  const sourcePath = path.join(sourceRoot, fileName);
  const source = fs.readFileSync(sourcePath, "utf8");
  const result = ts.transpileModule(source, {
    fileName: sourcePath,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      useDefineForClassFields: false,
    },
    reportDiagnostics: true,
  });
  const errors = (result.diagnostics ?? []).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length > 0) {
    throw new Error(
      errors
        .map((diagnostic) =>
          ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
        )
        .join("\n"),
    );
  }

  const output = result.outputText.replace(
    /from\s+["']\.\/Game2048Model["']/g,
    'from "./Game2048Model.mjs"',
  );
  fs.writeFileSync(
    path.join(outputRoot, fileName.replace(/\.ts$/, ".mjs")),
    output,
    "utf8",
  );
}

compileDomainSource("Game2048Model.ts");
compileDomainSource("Game2048World.ts");

const {
  Game2048World,
  compare2048Heads,
  merge2048Values,
  sum2048Values,
} = await import(
  pathToFileURL(path.join(outputRoot, "Game2048World.mjs")).href
);
const { Game2048EffectKind, Game2048RunState } = await import(
  pathToFileURL(path.join(outputRoot, "Game2048Model.mjs")).href
);

/** 待顺序执行的领域用例。 */
const testCases = [];

/** 注册一个具名领域用例。 */
function test(name, callback) {
  testCases.push({ name, callback });
}

/** 返回世界内部的玩家对象，仅用于白盒规则验证。 */
function playerOf(world) {
  return world._actors.find((actor) => actor.id === "player");
}

/** 返回世界内部第一个 AI 对象，仅用于白盒规则验证。 */
function firstBotOf(world) {
  return world._actors.find((actor) => actor.kind === "bot");
}

/** 把两个角色放到同一位置并重建短轨迹。 */
function overlapActors(left, right) {
  left.position = { x: 0, y: 0 };
  right.position = { x: 0, y: 0 };
  left.direction = { x: 0, y: 1 };
  right.direction = { x: 0, y: -1 };
  left.targetDirection = { ...left.direction };
  right.targetDirection = { ...right.direction };
  left.trail = [{ x: 0, y: 0 }, { x: 0, y: -20 }];
  right.trail = [{ x: 0, y: 0 }, { x: 0, y: 20 }];
  left.trailAnchor = { x: 0, y: 0 };
  right.trailAnchor = { x: 0, y: 0 };
}

/**
 * 用直线历史轨迹布置一个角色的队首和身体。
 *
 * 该辅助函数只用于白盒碰撞用例，确保数字顺序和空间槽位一一对应。
 */
function arrangeStraightBody(world, actor, segments, position, direction) {
  actor.active = true;
  actor.position = { ...position };
  actor.direction = { ...direction };
  actor.targetDirection = { ...direction };
  actor.segments = [...segments];
  actor.trailAnchor = { ...position };
  actor.trail = [];
  const historyLength =
    (segments.length + 12) * world.config.trailSpacing + 160;
  const sampleCount = Math.ceil(
    historyLength / world.config.trailSampleSpacing,
  );
  for (let index = 0; index <= sampleCount; index += 1) {
    actor.trail.push({
      x:
        position.x -
        direction.x * index * world.config.trailSampleSpacing,
      y:
        position.y -
        direction.y * index * world.config.trailSampleSpacing,
    });
  }
  actor.tailFollowers = segments.slice(1).map((_, followerIndex) => {
    const pathDistance =
      (followerIndex + 1) * world.config.trailSpacing;
    return {
      position: {
        x: position.x - direction.x * pathDistance,
        y: position.y - direction.y * pathDistance,
      },
      velocity: { x: 0, y: 0 },
      pathDistance,
    };
  });
}

test("相同数字可以连续进位，不同数字保持从大到小", () => {
  assert.deepEqual(merge2048Values([2, 2]), [4]);
  assert.deepEqual(merge2048Values([2, 2, 4]), [8]);
  assert.deepEqual(merge2048Values([2, 8, 4]), [8, 4, 2]);
  assert.deepEqual(merge2048Values([2, 2, 2, 2, 8]), [16]);
});

test("队首比较和数字总值计算保持独立", () => {
  assert.equal(compare2048Heads([8, 2], [4, 4]), 4);
  assert.equal(compare2048Heads([4, 2], [4]), 0);
  assert.equal(sum2048Values([16, 4, 2]), 22);
});

test("相同种子生成相同的初始地图和 AI", () => {
  const firstWorld = new Game2048World();
  const secondWorld = new Game2048World();
  firstWorld.reset(9527);
  secondWorld.reset(9527);
  assert.deepEqual(firstWorld.getSnapshot(), secondWorld.getSnapshot());
});

test("初始 AI 与玩家保持足够距离，首屏留出操控时间", () => {
  for (let seed = 1; seed <= 24; seed += 1) {
    const world = new Game2048World();
    world.reset(seed);
    const player = playerOf(world);
    for (const bot of world._actors.filter((actor) => actor.kind === "bot")) {
      assert.ok(
        Math.hypot(
          bot.position.x - player.position.x,
          bot.position.y - player.position.y,
        ) >=
          world.config.arenaRadius * 0.62,
      );
    }
  }
});

test("任意地图数字都会被直接吃掉并进入排序合并队列", () => {
  const world = new Game2048World({ botCount: 0, propTargetCount: 0 });
  world.reset(1);
  const player = playerOf(world);
  world._props.push({
    id: 1001,
    value: 8,
    position: { ...player.position },
    phase: 0,
  });
  world.update(0.001);
  assert.deepEqual(player.segments, [8, 2]);
  assert.equal(world._props.length, 0);

  world._props.push({
    id: 1002,
    value: 2,
    position: { ...player.position },
    phase: 0,
  });
  world.update(0.001);
  assert.deepEqual(player.segments, [8, 4]);

  world._props.push({
    id: 1003,
    value: 4,
    position: { ...player.position },
    phase: 0,
  });
  world.update(0.001);
  assert.deepEqual(player.segments, [16]);
  assert.equal(
    world.getSnapshot().actors.find((actor) => actor.id === "player")
      .segmentPositions.length,
    1,
  );
});

test("新吞噬的数字从碰撞位置接入尾巴而不是瞬移到固定槽位", () => {
  const world = new Game2048World({ botCount: 0, propTargetCount: 0 });
  world.reset(11);
  const player = playerOf(world);
  const pickupPosition = { ...player.position };
  world._props.push({
    id: 1101,
    value: 8,
    position: pickupPosition,
    phase: 0,
  });

  world.update(0.001);
  const snapshotPlayer = world
    .getSnapshot()
    .actors.find((actor) => actor.id === "player");
  const [headPosition, tailPosition] = snapshotPlayer.segmentPositions;
  assert.equal(snapshotPlayer.segmentPositions.length, 2);
  assert.ok(
    Math.hypot(
      tailPosition.x - pickupPosition.x,
      tailPosition.y - pickupPosition.y,
    ) < 1,
  );
  assert.ok(
    Math.hypot(
      tailPosition.x - headPosition.x,
      tailPosition.y - headPosition.y,
    ) <
      world.config.trailSpacing * 0.2,
  );
});

test("尾部数字会逐渐拉开并沿队首的旧路线完成转弯", () => {
  const world = new Game2048World({
    botCount: 0,
    propTargetCount: 0,
    playerSpeed: 160,
  });
  world.reset(12);
  const player = playerOf(world);
  world._props.push({
    id: 1201,
    value: 8,
    position: { ...player.position },
    phase: 0,
  });
  world.update(0.001);

  for (let index = 0; index < 45; index += 1) {
    world.update(1 / 60);
  }
  const settledFollower = player.tailFollowers[0];
  assert.ok(
    Math.abs(settledFollower.pathDistance - world.config.trailSpacing) < 0.5,
  );

  world.setPlayerDirection({ x: 1, y: 0 });
  for (let index = 0; index < 9; index += 1) {
    world.update(1 / 60);
  }
  const [headPosition, tailPosition] = world
    .getSnapshot()
    .actors.find((actor) => actor.id === "player").segmentPositions;
  const gap = Math.hypot(
    headPosition.x - tailPosition.x,
    headPosition.y - tailPosition.y,
  );
  assert.ok(
    gap > world.config.trailSpacing * 0.72,
    `尾部间距过小：${gap}`,
  );
  assert.ok(
    gap < world.config.trailSpacing * 1.4,
    `尾部间距过大：${gap}`,
  );
  assert.ok(tailPosition.x < headPosition.x);
  assert.ok(tailPosition.y < headPosition.y);
});

test("尾巴跟随在常见帧率下保持近似一致", () => {
  /** 以指定帧间隔运行相同的直行和转向路径。 */
  function runScenario(frameTime) {
    const world = new Game2048World({
      botCount: 0,
      propTargetCount: 0,
      playerSpeed: 170,
    });
    world.reset(13);
    const player = playerOf(world);
    world._props.push({
      id: 1301,
      value: 8,
      position: { ...player.position },
      phase: 0,
    });
    world.update(0.001);

    let elapsed = 0;
    while (elapsed < 1.2 - 0.0001) {
      if (elapsed >= 0.6) {
        world.setPlayerDirection({ x: 1, y: 0 });
      }
      const step = Math.min(frameTime, 1.2 - elapsed);
      world.update(step);
      elapsed += step;
    }
    return world
      .getSnapshot()
      .actors.find((actor) => actor.id === "player").segmentPositions;
  }

  const sixtyFpsPositions = runScenario(1 / 60);
  const thirtyFpsPositions = runScenario(1 / 30);
  for (let index = 0; index < sixtyFpsPositions.length; index += 1) {
    const positionDifference = Math.hypot(
      sixtyFpsPositions[index].x - thirtyFpsPositions[index].x,
      sixtyFpsPositions[index].y - thirtyFpsPositions[index].y,
    );
    assert.ok(
      positionDifference < 5,
      `第 ${index} 节在不同帧率下偏差过大：${positionDifference}`,
    );
  }
});

test("双方头部碰撞时大队首吞噬小队首并从胜方头部重排", () => {
  const world = new Game2048World({
    botCount: 1,
    propTargetCount: 0,
    playerSpeed: 0,
    botSpeed: 0,
    playerSpawnProtectionDuration: 0,
  });
  world.reset(2);
  const player = playerOf(world);
  const bot = firstBotOf(world);
  arrangeStraightBody(
    world,
    player,
    [64, 16, 4],
    { x: 0, y: 0 },
    { x: 0, y: 1 },
  );
  arrangeStraightBody(
    world,
    bot,
    [8, 2],
    { x: 0, y: 0 },
    { x: 0, y: -1 },
  );

  world.update(0.001);
  const snapshot = world.getSnapshot();
  const snapshotPlayer = snapshot.actors.find(
    (actor) => actor.id === "player",
  );
  const defeatEffect = snapshot.effects.find(
    (effect) => effect.kind === Game2048EffectKind.Defeat,
  );
  assert.equal(bot.active, false);
  assert.deepEqual(snapshotPlayer.segments, [64, 16, 8, 4, 2]);
  assert.equal(world.state, Game2048RunState.Playing);
  assert.ok(defeatEffect);
  assert.ok(Math.abs(defeatEffect.position.x) < 0.001);
  assert.ok(Math.abs(defeatEffect.position.y) < 0.001);
  for (
    let segmentIndex = 1;
    segmentIndex < snapshotPlayer.segmentPositions.length;
    segmentIndex += 1
  ) {
    const position = snapshotPlayer.segmentPositions[segmentIndex];
    assert.ok(Math.abs(position.x) < 0.001);
    assert.ok(
      Math.abs(
        position.y + segmentIndex * world.config.trailSpacing,
      ) < 0.001,
    );
  }
});

test("Bot 头撞到玩家身体时比较双方头部并由玩家吞噬 Bot", () => {
  const world = new Game2048World({
    botCount: 1,
    propTargetCount: 0,
    playerSpeed: 0,
    botSpeed: 0,
    playerSpawnProtectionDuration: 0,
  });
  world.reset(21);
  const player = playerOf(world);
  const bot = firstBotOf(world);
  arrangeStraightBody(
    world,
    player,
    [64, 16, 4],
    { x: 0, y: 0 },
    { x: 0, y: 1 },
  );
  arrangeStraightBody(
    world,
    bot,
    [8, 2],
    { x: 0, y: -world.config.trailSpacing * 2 },
    { x: 1, y: 0 },
  );

  world.update(0.001);
  const snapshot = world.getSnapshot();
  const snapshotPlayer = snapshot.actors.find(
    (actor) => actor.id === "player",
  );
  const defeatEffect = snapshot.effects.find(
    (effect) => effect.kind === Game2048EffectKind.Defeat,
  );
  assert.equal(player.active, true);
  assert.equal(bot.active, false);
  assert.deepEqual(snapshotPlayer.segments, [64, 16, 8, 4, 2]);
  assert.ok(defeatEffect);
  assert.ok(Math.abs(defeatEffect.position.x) < 0.001);
  assert.ok(
    Math.abs(
      defeatEffect.position.y + world.config.trailSpacing * 2,
    ) < 0.001,
  );
});

test("玩家头撞到 Bot 尾部时比较双方头部并吞噬 Bot", () => {
  const world = new Game2048World({
    botCount: 1,
    propTargetCount: 0,
    playerSpeed: 0,
    botSpeed: 0,
    playerSpawnProtectionDuration: 0,
  });
  world.reset(22);
  const player = playerOf(world);
  const bot = firstBotOf(world);
  arrangeStraightBody(
    world,
    player,
    [64],
    { x: 0, y: 0 },
    { x: 0, y: 1 },
  );
  arrangeStraightBody(
    world,
    bot,
    [8, 4, 2],
    { x: 0, y: world.config.trailSpacing * 2 },
    { x: 0, y: 1 },
  );

  world.update(0.001);
  const snapshot = world.getSnapshot();
  const snapshotPlayer = snapshot.actors.find(
    (actor) => actor.id === "player",
  );
  const defeatEffect = snapshot.effects.find(
    (effect) => effect.kind === Game2048EffectKind.Defeat,
  );
  assert.equal(player.active, true);
  assert.equal(bot.active, false);
  assert.deepEqual(snapshotPlayer.segments, [64, 8, 4, 2]);
  assert.ok(defeatEffect);
  assert.ok(Math.abs(defeatEffect.position.x) < 0.001);
  assert.ok(Math.abs(defeatEffect.position.y) < 0.001);
});

test("双方只有身体重叠时不触发角色碰撞结算", () => {
  const world = new Game2048World({
    botCount: 1,
    propTargetCount: 0,
    playerSpeed: 0,
    botSpeed: 0,
    playerSpawnProtectionDuration: 0,
  });
  world.reset(23);
  const player = playerOf(world);
  const bot = firstBotOf(world);
  arrangeStraightBody(
    world,
    player,
    [64, 16],
    { x: 0, y: world.config.trailSpacing },
    { x: 0, y: 1 },
  );
  arrangeStraightBody(
    world,
    bot,
    [32, 8],
    { x: world.config.trailSpacing, y: 0 },
    { x: 1, y: 0 },
  );

  world.update(0.001);
  const snapshot = world.getSnapshot();
  assert.equal(player.active, true);
  assert.equal(bot.active, true);
  assert.deepEqual(player.segments, [64, 16]);
  assert.deepEqual(bot.segments, [32, 8]);
  assert.equal(
    snapshot.effects.some(
      (effect) => effect.kind === Game2048EffectKind.Defeat,
    ),
    false,
  );
});

test("短身体吞噬长 Bot 后会补足轨迹并无重叠地重排全部数字", () => {
  const world = new Game2048World({
    botCount: 1,
    propTargetCount: 0,
    playerSpeed: 0,
    botSpeed: 0,
    playerSpawnProtectionDuration: 0,
  });
  world.reset(24);
  const player = playerOf(world);
  const bot = firstBotOf(world);
  const botSegments = Array.from(
    { length: 21 },
    (_, index) => 2 ** (21 - index),
  );
  arrangeStraightBody(
    world,
    player,
    [2 ** 22],
    { x: 0, y: 0 },
    { x: 0, y: 1 },
  );
  arrangeStraightBody(
    world,
    bot,
    botSegments,
    { x: 0, y: 0 },
    { x: 0, y: -1 },
  );

  world.update(0.001);
  const snapshotPlayer = world
    .getSnapshot()
    .actors.find((actor) => actor.id === "player");
  const positionKeys = snapshotPlayer.segmentPositions.map(
    (position) => `${position.x.toFixed(3)},${position.y.toFixed(3)}`,
  );
  assert.equal(bot.active, false);
  assert.equal(snapshotPlayer.segments.length, 22);
  assert.equal(new Set(positionKeys).size, 22);
  for (
    let segmentIndex = 1;
    segmentIndex < snapshotPlayer.segmentPositions.length;
    segmentIndex += 1
  ) {
    const position = snapshotPlayer.segmentPositions[segmentIndex];
    assert.ok(Math.abs(position.x) < 0.001);
    assert.ok(
      Math.abs(
        position.y + segmentIndex * world.config.trailSpacing,
      ) < 0.001,
    );
  }
});

test("玩家与相同队首的 AI 相撞时由玩家合并对方", () => {
  const world = new Game2048World({ botCount: 1, propTargetCount: 0 });
  world.reset(3);
  const player = playerOf(world);
  const bot = firstBotOf(world);
  world._playerProtectionRemaining = 0;
  player.segments = [4];
  bot.segments = [4];
  overlapActors(player, bot);
  world.update(0.001);
  assert.equal(bot.active, false);
  assert.deepEqual(player.segments, [8]);
});

test("玩家被更大队首吞噬后进入失败状态", () => {
  const world = new Game2048World({ botCount: 1, propTargetCount: 0 });
  world.reset(4);
  const player = playerOf(world);
  const bot = firstBotOf(world);
  world._playerProtectionRemaining = 0;
  player.segments = [2];
  bot.segments = [8];
  overlapActors(player, bot);
  world.update(0.001);
  assert.equal(player.active, false);
  assert.equal(world.state, Game2048RunState.GameOver);
});

test("出生保护期间玩家不会被角色碰撞立即淘汰", () => {
  const world = new Game2048World({
    botCount: 1,
    propTargetCount: 0,
    playerSpawnProtectionDuration: 4,
  });
  world.reset(6);
  const player = playerOf(world);
  const bot = firstBotOf(world);
  player.segments = [2];
  bot.segments = [8];
  overlapActors(player, bot);
  world.update(0.1);
  assert.equal(player.active, true);
  assert.equal(world.state, Game2048RunState.Playing);
  assert.ok(world.getSnapshot().playerProtectionRemaining > 3.8);
});

test("角色触边后保持在圆内并获得向内回推", () => {
  const world = new Game2048World({
    arenaRadius: 160,
    boundaryInset: 30,
    playerSpeed: 120,
    botCount: 0,
    propTargetCount: 0,
  });
  world.reset(5);
  const player = playerOf(world);
  player.position = { x: 129, y: 0 };
  player.direction = { x: 1, y: 0 };
  player.targetDirection = { x: 1, y: 0 };
  player.trail = [{ x: 129, y: 0 }, { x: 110, y: 0 }];
  world.update(0.1);
  const distance = Math.hypot(player.position.x, player.position.y);
  assert.ok(distance <= 130.0001);
  assert.ok(player.direction.x < 0);
  assert.ok(player.boundaryEffect > 0.8);
});

let passedCount = 0;
try {
  for (const testCase of testCases) {
    await testCase.callback();
    passedCount += 1;
    console.log(`通过：${testCase.name}`);
  }
  console.log(`2048 玩法领域验证完成：${passedCount}/${testCases.length}。`);
} finally {
  fs.rmSync(outputRoot, { recursive: true, force: true });
}
