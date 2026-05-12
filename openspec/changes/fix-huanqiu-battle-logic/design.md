## Context

当前 `IN_BATTLE` 状态机分支（`taskManager.js:294`）将寰球救援战斗与精英战斗等统一处理，存在两个问题：

1. **无法区分战斗类型**：进入 `IN_BATTLE` 后没有验证是否为寰球救援战斗，可能导致脚本在非目标战斗中浪费时间和资源。
2. **技能选择弹窗阻塞退出**：`_exitUnwantedBattle` 流程中，若战斗界面出现技能选择弹窗（`scene_skill_select.png`），所有点击操作被弹窗拦截，导致暂停按钮、退出按钮无法响应。

模板资源 `scene_huanqiu_battle.png` 和 `scene_skill_select.png` 已存在于 `autoxjs/templates/scene/battle/` 目录，但未在 `imageRecognition.js` 的 `SCENE_RULES` 中注册。

## Goals / Non-Goals

**Goals:**
- 在 `IN_BATTLE` 状态中区分寰球救援战斗与其他战斗
- 非寰球救援战斗时自动退出，退出流程中正确处理技能选择弹窗
- 将 `scene_huanqiu_battle` 和 `scene_skill_select` 纳入场景识别体系

**Non-Goals:**
- 不重构整个状态机架构
- 不修改 `BATTLE_COMPLETE_TURN` 结算逻辑
- 不处理精英战斗（`scene_jingying_return`）的自动化逻辑
- 不新增状态机状态（在现有 `IN_BATTLE` 内部处理分支）

## Decisions

### D1: 在 `IN_BATTLE` 状态内部添加战斗类型判断，而非新增状态

**选择**：在 `IN_BATTLE` 的 `sceneType === "IN_BATTLE"` 分支内，首次进入时通过 `scene_huanqiu_battle` 模板匹配判断是否为寰球战斗，设置标记变量。

**替代方案**：新增 `HUANQIU_BATTLE` / `OTHER_BATTLE` 状态 → 拒绝，因为会增加状态机复杂度，且退出逻辑复用 `IN_BATTLE` 的超时保护更自然。

**理由**：战斗类型判断是 `IN_BATTLE` 内部的决策分支，不需要独立的状态转换逻辑。用标记变量（`this.isHuanqiuBattle`）即可区分，状态机状态表不变。

### D2: `scene_skill_select` 不注册为独立场景，在 `battleActions` / `_exitUnwantedBattle` 内部用 `matchTemplate` 检测

**选择**：`scene_skill_select` 不加入 `SCENE_RULES`，而是在 `battleActions` 和 `_exitUnwantedBattle` 中直接调用 `matchTemplate` 检测技能选择弹窗，检测到就点击屏幕中间选择技能。

**替代方案1**：在 `SCENE_RULES` 中新增 `SKILL_SELECT` 场景类型 → 拒绝，因为技能选择弹窗是战斗中的子界面，不是独立场景。注册为独立场景会导致 `detectScene` 返回 `SKILL_SELECT`，状态机需要额外处理 `sceneType === "SKILL_SELECT"` 分支，增加不必要的标识符和复杂度。

**替代方案2**：在 `battleActions` 中用 OCR 文字检测 → 当前方案，已有专用模板 `scene_skill_select.png`，模板匹配比 OCR 更快更准。

**理由**：技能选择弹窗是 `IN_BATTLE` 的子状态，用 if-else 在 `battleActions` 内部处理最简单直接。`matchTemplate` 返回结果后直接点击即可，不需要引入新的场景类型或状态切换。

### D3: `scene_huanqiu_battle` 不注册为独立场景，仅在 `IN_BATTLE` 分支内做模板匹配

**选择**：`scene_huanqiu_battle` 不加入 `SCENE_RULES`，而是在 `IN_BATTLE` 状态首次进入时调用 `matchTemplate` 主动检测。

**替代方案**：将 `scene_huanqiu_battle` 注册为独立场景 `HUANQIU_BATTLE` → 拒绝，因为寰球战斗界面本身就是 `IN_BATTLE` 的一种，场景识别应保持一致返回 `IN_BATTLE`。

**理由**：`scene_in_battle` 是通用的"战斗中"识别模板，`scene_huanqiu_battle` 是更具体的子类型标识。两层识别（先识别为战斗中，再判断是哪种战斗）比并行两个场景类型更清晰。

### D4: 退出非目标战斗的流程：先处理技能选择，再逐步退出

**选择**：`_exitUnwantedBattle` 流程调整为：
1. 截图检测 `scene_skill_select`（`matchTemplate`）→ 若命中则点击屏幕中间选择技能
2. 关闭可能存在的弹窗（点击屏幕中央）
3. 点击右上角暂停按钮
4. 截图检测退出/关闭按钮（模板匹配 `click_close`）→ 点击退出
5. 截图检测 `scene_huanqiu_return` → 点击返回

每步之间截图确认当前界面状态，而非固定等待时间。

**理由**：技能选择弹窗会拦截所有点击，必须先解除才能继续退出操作。基于截图状态判断比固定 sleep 更可靠。

## Risks / Trade-offs

- **[模板匹配误判]** `scene_huanqiu_battle` 或 `scene_skill_select` 匹配阈值不当可能导致误识别 → 使用 0.75 阈值（与现有规则一致），并在日志中记录匹配分数便于调试
- **[退出流程卡死]** 若技能选择弹窗反复出现，退出流程可能陷入循环 → 在 `_exitUnwantedBattle` 现有的 `maxRetries` 机制内处理，技能选择处理计入重试次数
- **[状态标记残留]** `isHuanqiuBattle` 标记在异常退出时可能未重置 → 在 `battleStartTime` 重置时同步重置该标记（`IN_BATTLE` 退出、结算、超时等处）
