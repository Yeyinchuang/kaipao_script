# 修复悬浮窗游戏内不可见 + 截图锁定AutoXJS窗口问题

## 问题描述

脚本运行在 MuMu 模拟器的微信小程序（向僵尸开炮）中，存在两个互相关联的问题：

### 问题1：悬浮窗在游戏（微信小程序）内不可见
- 使用 `floaty.window()` 创建的悬浮窗，在桌面能看到，切到微信小程序后消失
- 曾尝试 `floaty.rawWindow()`，有时报错，有时还是不可见
- 已在手机设置中开启"显示在其他应用上层"权限，但无效

### 问题2：截图始终截到AutoXJS编辑器而非游戏
- `requestScreenCapture(false)` 在 AutoXJS 编辑器前台调用时，截图服务锁定 AutoXJS 窗口
- 切到游戏后，`images.captureScreen()` 仍返回 AutoXJS 编辑器画面
- 导致 OCR 永远识别到 "EAutoX"、"modules"、"project.json" 等编辑器内容
- 曾尝试 `recents()` + `click()` 切前台，在华为设备/MuMu上不可靠

## 分析：两个问题可能是同一个根因

**假设**：AutoXJS 在 MuMu 模拟器上的权限不足，导致：
1. 截图服务只能截取自身进程的窗口（`MediaProjection` 权限受限）
2. 悬浮窗无法绘制在其他应用上层（`SYSTEM_ALERT_WINDOW` 权限受限）

这解释了为什么：
- 截图始终截到 AutoXJS 自身 → `MediaProjection` 可能只录到自身 surface
- 悬浮窗在游戏内不可见 → `SYSTEM_ALERT_WINDOW` 可能未真正生效

## 排查方案

### 步骤1：权限验证（确认是权限还是代码问题）
- [ ] 检查 AutoXJS 是否真正获得了 `SYSTEM_ALERT_WINDOW` 权限
  - 代码方式：`floaty.checkPermission()` 或 `floaty.requestPermission()`
  - 手动方式：设置 → 应用 → AutoXJS → 权限 → 确认"悬浮窗/显示在其他应用上层"已开启
- [ ] 检查 AutoXJS 是否真正获得了 `MediaProjection` 权限
  - `requestScreenCapture(false)` 用 `false` 参数跳过确认框，可能权限未真正授予
  - 尝试 `requestScreenCapture(true)` 弹出系统确认框手动授权
- [ ] 检查 MuMu 模拟器的特殊权限设置
  - MuMu 可能对"屏幕录制"和"悬浮窗"有额外限制
  - 检查 MuMu 设置中心 → 性能/高级 → 是否有权限相关开关

### 步骤2：截图问题排查
- [ ] **方案A**：延迟截图 — 在 `requestScreenCapture` 后等 2-3 秒再截图，验证截图服务是否需要初始化时间
- [ ] **方案B**：切换前台后再截图 — 先 `app.launch("com.tencent.mm")` 切到微信，确认 `currentPackage()` 是微信后再 `requestScreenCapture`
- [ ] **方案C**：使用 `requestScreenCapture(true)` 弹系统确认框，手动授权后再截图
- [ ] **方案D**：每次截图前调用 `images.releaseScreenCapture()` + `requestScreenCapture()` 重新初始化（性能差但可验证）
- [ ] **方案E**：用 `adb shell dumpsys media_projection` 检查 MediaProjection 授权状态

### 步骤3：悬浮窗问题排查
- [ ] **方案A**：`floaty.rawWindow()` + 手动调用 `floaty.requestPermission()` 确保权限
- [ ] **方案B**：设置 `window.setTouchable(true)` + `window.setSize()` 确保窗口尺寸正确
- [ ] **方案C**：用 Toast 替代悬浮窗做状态展示（Toast 是系统级通知，不会被覆盖）
- [ ] **方案D**：用 `engines.all()` + `events.on("exit")` 确认脚本确实在运行
- [ ] **方案E**：在 MuMu 上测试其他 AutoXJS 悬浮窗脚本，确认是本项目问题还是模拟器通用问题

### 步骤4：综合验证
- [ ] 如果权限都确认了，截图仍然截到 AutoXJS → 考虑是 AutoXJS 版本 bug 或 MuMu 兼容性问题
- [ ] 如果 `rawWindow` 权限确认了仍然不可见 → 考虑微信小程序渲染层特殊（SurfaceView/XWeb）
- [ ] 最终兜底方案：**用户手动切到游戏后，通过 AutoXJS 通知栏按钮或音量键触发截图和任务启动**

## 非目标
- 不解决 image recycled 死循环问题（那是另一个独立问题）
- 不重写状态机逻辑
- 不修改场景识别规则

## 影响范围
- `autoxjs/main.js` — 启动流程、截图初始化、悬浮窗
- `autoxjs/modules/imageRecognition.js` — captureScreen 方法
