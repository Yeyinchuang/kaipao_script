## ADDED Requirements

### Requirement: 寰球救援战斗识别
系统在进入 `IN_BATTLE` 状态时，MUST 通过模板匹配 `scene_huanqiu_battle` 判断当前战斗是否为寰球救援战斗，并将结果存储到 `isHuanqiuBattle` 标记变量中。

#### Scenario: 识别为寰球救援战斗
- **WHEN** 状态机进入 `IN_BATTLE` 状态且 `scene_huanqiu_battle` 模板匹配成功
- **THEN** 系统 SHALL 设置 `isHuanqiuBattle = true`，并执行正常战斗操作（`battleActions`）

#### Scenario: 识别为非寰球救援战斗
- **WHEN** 状态机进入 `IN_BATTLE` 状态且 `scene_huanqiu_battle` 模板匹配失败
- **THEN** 系统 SHALL 设置 `isHuanqiuBattle = false`，并执行退出非目标战斗流程（`_exitUnwantedBattle`）

### Requirement: 战斗标记变量生命周期管理
`isHuanqiuBattle` 标记变量 MUST 在 `battleStartTime` 重置时同步重置，确保不会在后续战斗中残留上一次的判断结果。

#### Scenario: 战斗结束时重置标记
- **WHEN** 战斗结束（进入 `BATTLE_COMPLETE_TURN` 状态）或战斗超时
- **THEN** 系统 SHALL 将 `isHuanqiuBattle` 重置为 `false`

#### Scenario: 战斗超时退出时重置标记
- **WHEN** `IN_BATTLE` 状态超过 10 分钟触发超时退出
- **THEN** 系统 SHALL 将 `isHuanqiuBattle` 重置为 `false`

### Requirement: 非寰球救援战斗自动退出
当 `IN_BATTLE` 状态检测到非寰球救援战斗时，MUST 调用 `_exitUnwantedBattle` 退出并切换回 `TEAM_HALL` 状态。

#### Scenario: 非寰球战斗自动退出
- **WHEN** `isHuanqiuBattle === false` 且当前处于 `IN_BATTLE` 状态
- **THEN** 系统 SHALL 调用 `_exitUnwantedBattle` 退出战斗，随后切换到 `TEAM_HALL` 状态
