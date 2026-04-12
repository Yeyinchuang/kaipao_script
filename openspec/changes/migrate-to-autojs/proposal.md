# 迁移到 AutoX.js 框架

## 变更描述
将项目从 Android 原生无障碍服务架构迁移到 AutoX.js 自动化框架，用 JavaScript 脚本替代 Kotlin 代码，简化开发和部署流程。

## 目标
- 使用 AutoX.js 的 `images` 模块替代 OpenCV + Tesseract OCR 实现图像识别
- 使用 AutoX.js 的 `auto` 模块替代 AccessibilityService 实现点击/滑动操作
- 使用 AutoX.js 的截图 API 替代未实现的 Android 截图功能
- 用 JavaScript 重写核心状态机逻辑（TaskManager）
- 保留卡密验证、配置管理等业务逻辑
- 保留 templates/ 目录下的模板图片资源

## 范围
- 新建 AutoX.js 脚本项目结构（main.js 入口 + 模块化 JS 文件）
- 重写图像识别模块（imageRecognition.js）
- 重写任务管理/状态机（taskManager.js）
- 重写配置管理（configManager.js）
- 重写卡密验证（cardKeyManager.js）
- 迁移 templates/ 模板资源
- 原有 Kotlin Android 项目保留但不再维护

## 非目标
- 不修改原有 Android 项目的代码
- 不改变游戏自动化的业务流程（状态机流转逻辑不变）
- 不添加新的游戏功能
