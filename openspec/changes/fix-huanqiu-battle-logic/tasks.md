## 1. 寰球战斗识别逻辑

- [ ] 1.1 在 `TaskManager` 构造函数中初始化 `this.isHuanqiuBattle = false` 标记变量
- [ ] 1.2 修改 `IN_BATTLE` 状态的 `sceneType === "IN_BATTLE"` 分支：首次进入时（`battleStartTime === 0`）通过 `matchTemplate` 检测 `scene_huanqiu_battle`，设置 `isHuanqiuBattle` 标记
- [ ] 1.3 当 `isHuanqiuBattle === false` 时，调用 `_exitUnwantedBattle` 并切换到 `TEAM_HALL` 状态
- [ ] 1.4 当 `isHuanqiuBattle === true` 时，继续执行现有 `battleActions` 逻辑

## 2. 技能选择弹窗处理（battleActions 内部 matchTemplate）

- [ ] 2.1 修改 `battleActions` 中的技能选择检测：将现有的 OCR 文字检测逻辑替换为 `matchTemplate("scene/battle/scene_skill_select")`，检测到则点击屏幕中间选择技能并 return
- [ ] 2.2 验证 `scene_skill_select.png` 模板文件存在于 `autoxjs/templates/scene/battle/` 目录

## 3. 退出非目标战斗流程优化

- [ ] 3.1 修改 `_exitUnwantedBattle`：在每次重试循环开始时，先截图用 `matchTemplate` 检测 `scene_skill_select`，若命中则点击屏幕中间选择技能，等待界面变化
- [ ] 3.2 退出步骤顺序调整为：处理技能选择弹窗 → 关闭弹窗 → 点击暂停 → 模板匹配退出按钮 → 点击返回
- [ ] 3.3 每步基于截图确认界面状态，减少固定 `sleep` 等待

## 4. 标记变量生命周期管理

- [ ] 4.1 在 `battleStartTime` 重置的所有位置（结算、超时退出、10 分钟超时）同步重置 `isHuanqiuBattle = false`
- [ ] 4.2 确认所有 `IN_BATTLE` 状态退出路径都正确重置了标记变量

## 5. 验证与日志

- [ ] 5.1 在关键决策点添加日志：战斗类型判断结果（是否寰球战斗）、技能选择弹窗检测结果、退出流程各步骤状态
- [ ] 5.2 运行 `openspec validate fix-huanqiu-battle-logic` 验证变更完整性
