# MuMu 模拟器 ADB 配置指南

## 版本与端口对照表

| MuMu 版本 | ADB 端口 | 连接命令 |
|-----------|---------|---------|
| **MuMu 12** (推荐) | `7555` | `adb connect 127.0.0.1:7555` |
| MuMu 9 | `16384` | `adb connect 127.0.0.1:16384` |
| MuMe Player (国际版) | `7555` | `adb connect 127.0.0.1:7555` |

## 快速配置步骤

### 1. 确认 ADB 已安装

```bash
adb version
```

如果提示找不到，需要安装 Android Platform Tools：
- Windows: 解压 platform-tools 到任意目录并加入 PATH
- Mac: `brew install android-platform-tools`
- Linux: `sudo apt install android-tools-adb`

### 2. 启动 MuMu 模拟器

确保模拟器已经启动并且进入了系统桌面。

### 3. 连接设备

```bash
# MuMu 12（最常用）
adb connect 127.0.0.1:7555

# 验证连接
adb devices
# 应输出类似：
# List of devices attached
# 127.0.0.1:7555    device
```

### 4. 验证截图权限（AutoXJS 需要）

```bash
# 测试能否截屏
adb shell screencap /sdcard/test_screen.png
adb pull /sdcard/test_screen.png /tmp/
# 查看 /tmp/test_screen.png 是否有内容
```

### 5. 常见问题排查

**问题**: `connect refused` 或 `cannot connect to 127.0.0.1:7555`

原因及解决：
- 模拟器未启动 → 先启动 MuMu
- 端口不对 → 检查版本，MuMu 9 用 16384
- 多开实例 → 第二个实例端口通常是 7556, 7557...

**问题**: `unauthorized`

```bash
# 在模拟器弹出的授权对话框中点"允许"
# 或重试:
adb disconnect 127.0.0.1:7555
adb connect 127.0.0.1:7555
```

**问题**: `device offline`

```bash
# 重启 ADB 服务
adb kill-server
adb start-server
adb connect 127.0.0.1:7555
```

**问题**: AutoXJS 无障碍服务无法启用

在模拟器中操作：
1. 设置 → 关于手机 → 连续点击"版本号"7次进入开发者模式
2. 设置 → 开发者选项 → 开启"USB调试"
3. AutoXJS → 权限 → 开启无障碍服务

## 其他模拟器的 ADB 端口参考

| 模拟器 | 默认端口 |
|-------|---------|
| 雷电模拟器 | `5555` (`adb connect 127.0.0.1:5555`) |
| 逍遥模拟器 | `21503` |
| 夜神模拟器 | `62001` |
| 逍遥安卓9 | `21503` |
| BlueStacks | 需要在设置中开启ADB，通常为 `5555` |

## 一键脚本（Windows）

保存为 `connect_mumu.bat`：

```bat
@echo off
echo 连接 MuMu 模拟器...
adb connect 127.0.0.1:7555
echo.
adb devices
pause
```
