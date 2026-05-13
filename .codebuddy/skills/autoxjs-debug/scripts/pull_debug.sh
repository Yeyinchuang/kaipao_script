#!/bin/bash
set -e
echo "========================================"
echo "  AutoXJS Debug - 拉取调试截图"
echo "  MuMu 模拟器 -> 本地电脑"
echo "========================================"
echo

# === 可配置参数（可按需修改） ===
REMOTE_DIR="${DEBUG_REMOTE_DIR:-/sdcard/autoxjs_debug}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_DIR="${DEBUG_LOCAL_DIR:-$SCRIPT_DIR/../debug_shots}"
# ===================================

# 创建本地目录
mkdir -p "$LOCAL_DIR"

# 转为绝对路径
ABS_LOCAL_DIR="$(cd "$LOCAL_DIR" && pwd)"

echo "[1/2] 从设备拉取截图..."
echo "     远程: $REMOTE_DIR"
echo "     本地: $ABS_LOCAL_DIR"
echo

adb pull "$REMOTE_DIR" "$ABS_LOCAL_DIR/"

if [ $? -eq 0 ]; then
    echo
    FILE_COUNT=$(find "$ABS_LOCAL_DIR" -name "*.png" 2>/dev/null | wc -l)
    echo "[2/2] 截图已拉取到: $ABS_LOCAL_DIR/"
    echo "     共 $FILE_COUNT 张截图"
    echo
    
    # 尝试打开文件夹（macOS / Linux）
    if command -v open &>/dev/null; then
        open "$ABS_LOCAL_DIR"
    elif command -v xdg-open &>/dev/null; then
        xdg-open "$ABS_LOCAL_DIR"
    else
        echo "请手动打开: $ABS_LOCAL_DIR"
    fi
else
    echo
    echo "✗ 拉取失败！请检查："
    echo
    echo "  1. ADB 是否可用？"
    echo "     adb devices"
    echo
    echo "  2. MuMu ADB 端口是否正确连接？"
    echo "     MuMu 12:  adb connect 127.0.0.1:7555"
    echo "     MuMu 9:   adb connect 127.0.0.1:16384"
    echo
    echo "  3. 如果不用 ADB，可以手动从模拟器拷贝："
    echo "     文件管理器 -> Internal Storage -> autoxjs_debug"
fi

echo
