#!/usr/bin/env node

import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { compileAppFilesForTest } from "../../testing/compile-core-for-test.mjs";

/** 项目根目录。 */
const projectRoot = path.resolve(import.meta.dirname, "../../..");

/** Cocos 测试模拟模块。 */
const cocosMockPath = path.join(
  projectRoot,
  "tools/testing/cocos-core-mock.mjs",
);

/** 转换本地资料与设置真实依赖的应用源码。 */
const compiledApp = compileAppFilesForTest(projectRoot, cocosMockPath, [
  "core/utils/Logger.ts",
  "core/data/StorageManager.ts",
  "core/event/EventCenter.ts",
  "core/timer/TimerManager.ts",
  "core/resource/ResManager.ts",
  "core/audio/AudioManager.ts",
  "game/game2048/Game2048HomeKey.ts",
  "game/game2048/Game2048AvatarCatalog.ts",
  "game/game2048/Game2048ProfileManager.ts",
  "game/game2048/Game2048SettingsManager.ts",
]);

/** 动态载入与业务代码共用的 Cocos 模拟器和业务模块。 */
const cocos = await import(pathToFileURL(cocosMockPath).href);
const [
  { StorageManager },
  { EventCenter },
  { AudioManager },
  { Logger, LogLevel },
  homeKeyModule,
  avatarCatalogModule,
  profileModule,
  settingsModule,
] = await Promise.all([
  compiledApp.importModule("core/data/StorageManager.ts"),
  compiledApp.importModule("core/event/EventCenter.ts"),
  compiledApp.importModule("core/audio/AudioManager.ts"),
  compiledApp.importModule("core/utils/Logger.ts"),
  compiledApp.importModule("game/game2048/Game2048HomeKey.ts"),
  compiledApp.importModule("game/game2048/Game2048AvatarCatalog.ts"),
  compiledApp.importModule("game/game2048/Game2048ProfileManager.ts"),
  compiledApp.importModule("game/game2048/Game2048SettingsManager.ts"),
]);

const { GAME2048_HOME_EVENT, GAME2048_HOME_STORAGE_KEY } = homeKeyModule;
const { GAME2048_AVATAR_CATALOG } = avatarCatalogModule;
const { Game2048ProfileManager, GAME2048_PROFILE_NAME_MAX_LENGTH } =
  profileModule;
const { Game2048SettingsManager } = settingsModule;

/** 待顺序执行的业务用例。 */
const testCases = [];

/** 注册一个具名业务用例。 */
function test(name, callback) {
  testCases.push({ name, callback });
}

/** 每个用例前恢复存档、事件和服务状态。 */
function resetTestState() {
  cocos.__mock.reset();
  Logger.setLevel(LogLevel.None);
  StorageManager.init("game-2048.home-system-test");
  EventCenter.clear();
  AudioManager.reset();
  Game2048SettingsManager.reset();
  Game2048ProfileManager.reset();
}

test("首次启动创建默认设置并同步两个音频通道", () => {
  assert.deepEqual(Game2048SettingsManager.initialize(), {
    version: 1,
    soundEnabled: true,
    vibrationEnabled: true,
  });
  assert.equal(AudioManager._musicVolume, 1);
  assert.equal(AudioManager._effectVolume, 1);
  assert.deepEqual(
    StorageManager.get(GAME2048_HOME_STORAGE_KEY.Settings, null),
    Game2048SettingsManager.getSettings(),
  );
});

test("损坏设置回退默认值，声音切换会持久化并派发快照", () => {
  StorageManager.set(GAME2048_HOME_STORAGE_KEY.Settings, {
    version: 99,
    soundEnabled: "yes",
    vibrationEnabled: null,
  });
  const changes = [];
  EventCenter.on(
    GAME2048_HOME_EVENT.SettingsChanged,
    (settings) => changes.push(settings),
    changes,
  );

  Game2048SettingsManager.initialize();
  const changed = Game2048SettingsManager.setSoundEnabled(false);
  assert.equal(changed.soundEnabled, false);
  assert.equal(AudioManager._musicVolume, 0);
  assert.equal(AudioManager._effectVolume, 0);
  assert.deepEqual(changes, [changed]);
  assert.deepEqual(
    StorageManager.get(GAME2048_HOME_STORAGE_KEY.Settings, null),
    changed,
  );
});

test("震动关闭时安全降级，重新开启会保存状态", () => {
  Game2048SettingsManager.initialize();
  const disabled = Game2048SettingsManager.setVibrationEnabled(false);
  assert.equal(disabled.vibrationEnabled, false);
  assert.equal(Game2048SettingsManager.vibrate(), false);

  const enabled = Game2048SettingsManager.setVibrationEnabled(true);
  assert.equal(enabled.vibrationEnabled, true);
  assert.deepEqual(
    StorageManager.get(GAME2048_HOME_STORAGE_KEY.Settings, null),
    enabled,
  );
});

test("首次启动创建默认玩家资料并返回独立快照", () => {
  const profile = Game2048ProfileManager.initialize();
  assert.deepEqual(profile, {
    version: 1,
    name: "霜蓝玩家",
    avatarId: GAME2048_AVATAR_CATALOG[0].id,
  });
  profile.name = "外部篡改";
  assert.equal(Game2048ProfileManager.getProfile().name, "霜蓝玩家");
});

test("名称按 Unicode 字符安全截断，空名称和非法头像被拒绝", () => {
  Game2048ProfileManager.initialize();
  const longName = `  ${"冰".repeat(GAME2048_PROFILE_NAME_MAX_LENGTH + 3)}  `;
  const profile = Game2048ProfileManager.setName(longName);
  assert.equal(
    Array.from(profile.name).length,
    GAME2048_PROFILE_NAME_MAX_LENGTH,
  );
  assert.throws(
    () => Game2048ProfileManager.setName("   "),
    /玩家名称不能为空/,
  );
  assert.throws(
    () => Game2048ProfileManager.selectAvatar("missing-avatar"),
    /头像编号不存在/,
  );
});

test("头像选择会持久化并通知大厅，损坏资料回退默认值", () => {
  Game2048ProfileManager.initialize();
  const changes = [];
  EventCenter.on(
    GAME2048_HOME_EVENT.ProfileChanged,
    (profile) => changes.push(profile),
    changes,
  );
  const selected = GAME2048_AVATAR_CATALOG[3];
  const changed = Game2048ProfileManager.selectAvatar(selected.id);
  assert.deepEqual(changes, [changed]);
  assert.deepEqual(
    StorageManager.get(GAME2048_HOME_STORAGE_KEY.Profile, null),
    changed,
  );

  StorageManager.set(GAME2048_HOME_STORAGE_KEY.Profile, {
    version: 1,
    name: "   ",
    avatarId: "removed-avatar",
  });
  Game2048ProfileManager.reset();
  assert.deepEqual(Game2048ProfileManager.initialize(), {
    version: 1,
    name: "霜蓝玩家",
    avatarId: GAME2048_AVATAR_CATALOG[0].id,
  });
});

try {
  for (const testCase of testCases) {
    resetTestState();
    await testCase.callback();
    console.log(`✓ ${testCase.name}`);
  }
  console.log(`2048 大厅资料与设置测试通过：${testCases.length} 项。`);
} finally {
  compiledApp.cleanup();
}
