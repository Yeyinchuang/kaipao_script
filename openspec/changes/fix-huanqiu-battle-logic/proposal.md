## Why

当前 `IN_BATTLE` 状态将所有战斗类型（寰球救援、精英战斗等）统一处理，无法区分目标战斗与非目标战斗。当脚本意外进入非寰球救援战斗时，`_exitUnwantedBattle` 流程未正确处理技能选择弹窗（`scene_skill_select.png`），导致退出操作被阻塞、点击无响应。此外，缺少对 `scene_huanqiu_battle.png` 的识别，无法判断当前是否为寰球救援战斗。

## What Changes

- 新增 `scene_huanqiu_battle` 模板到场景识别规则表（`SCENE_RULES`），用于识别寰球救援战斗
- 在 `battleActions` 和 `_exitUnwantedBattle` 中通过 `matchTemplate` 直接检测 `scene_skill_select`，点击屏幕中间选择技能，无需注册为独立场景类型
- 修改 `IN_BATTLE` 状态处理逻辑：进入时先通过 `scene_huanqiu_battle` 判断是否为寰球救援战斗，若不是则执行退出流程
- 修改 `_exitUnwantedBattle` 流程：在退出前优先检测并处理 `scene_skill_select` 弹窗（`matchTemplate` 检测 + 点击屏幕中间选择技能），确保后续点击操作可正常响应
- 退出非目标战斗的流程调整为：检测技能选择弹窗 → 点击中间选择技能 → 关闭弹窗 → 点击暂停 → 点击退出(`click_close`) → 点击返回(`scene_huanqiu_return`)

## Capabilities

### New Capabilities
- `huanqiu-battle-identification`: 寰球救援战斗的识别与验证能力，通过 `scene_huanqiu_battle` 模板区分寰球救援战斗与其他战斗
- `skill-select-handling`: 战斗中技能选择弹窗的检测与处理能力，在技能选择界面点击屏幕中间选择技能，解除 UI 阻塞

### Modified Capabilities

（无现有 specs 需要修改）

## Impact

- **核心代码**: `autoxjs/modules/taskManager.js` — `IN_BATTLE` 状态分支、`_exitUnwantedBattle`、`battleActions`
- **场景识别**: `autoxjs/modules/imageRecognition.js` — `SCENE_RULES` 规则表新增寰球战斗模板匹配规则（技能选择弹窗不注册为独立场景，在代码内部用 `matchTemplate` 处理）
- **模板资源**: `autoxjs/templates/scene/battle/scene_huanqiu_battle.png`、`scene_skill_select.png` 已存在，无需新增
- **状态机流程**: `IN_BATTLE` 状态的处理逻辑将更精确，非目标战斗会被正确识别并退出，技能选择弹窗不再阻塞操作
