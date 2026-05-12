## ADDED Requirements

### Requirement: 技能选择弹窗检测与处理
系统在 `battleActions` 和 `_exitUnwantedBattle` 中 MUST 通过 `matchTemplate` 检测 `scene_skill_select` 模板，识别技能选择弹窗并点击屏幕中间选择技能。不需要将 `SKILL_SELECT` 注册为独立场景类型。

#### Scenario: 战斗中出现技能选择弹窗
- **WHEN** `battleActions` 执行时，`matchTemplate` 检测到 `scene_skill_select` 模板匹配成功
- **THEN** 系统 SHALL 点击屏幕中间区域选择技能，然后 `return` 结束本轮操作

#### Scenario: 战斗中无技能选择弹窗
- **WHEN** `battleActions` 执行时，`matchTemplate` 未检测到 `scene_skill_select`
- **THEN** 系统 SHALL 正常执行冒泡点击等战斗操作

### Requirement: 退出流程中优先处理技能选择弹窗
`_exitUnwantedBattle` 在每次重试循环开始时，MUST 先通过 `matchTemplate` 检测 `scene_skill_select`。若检测到，SHALL 点击屏幕中间选择技能，解除 UI 阻塞后再继续退出操作。

#### Scenario: 退出时遇到技能选择弹窗
- **WHEN** `_exitUnwantedBattle` 执行过程中截图检测到 `scene_skill_select`
- **THEN** 系统 SHALL 点击屏幕中间区域选择技能，等待界面变化后再继续退出流程

#### Scenario: 退出时无技能选择弹窗
- **WHEN** `_exitUnwantedBattle` 执行过程中截图未检测到 `scene_skill_select`
- **THEN** 系统 SHALL 直接执行后续退出步骤（关闭弹窗 → 暂停 → 退出 → 返回）

### Requirement: 退出流程按序点击模板
`_exitUnwantedBattle` MUST 按以下顺序逐步退出非目标战斗：
1. 检测并处理技能选择弹窗（如有）
2. 关闭可能存在的弹窗
3. 点击右上角暂停按钮触发暂停菜单
4. 模板匹配并点击退出/关闭按钮
5. 点击 `scene_huanqiu_return` 模板返回

每步 MUST 基于截图确认当前界面状态，而非依赖固定等待时间。
