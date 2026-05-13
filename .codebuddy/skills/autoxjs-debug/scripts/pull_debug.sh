#!/bin/bash
set -e
echo "========================================"
echo "  AutoXJS Debug - 拉取调试截图"
echo "  MuMu 共享文件夹 -> 项目目录"
echo "========================================"
echo

# === 可配置参数（可按需修改） ===
# MuMu 共享文件夹路径（Windows 路径，通过 WSL/Cygwin 转换）
SHARED_DIR="${DEBUG_SHARED_DIR:-C:\Users\23357\Documents\MuMu共享文件夹\autoxjs_debug}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOCAL_DIR="${DEBUG_LOCAL_DIR:-$SCRIPT_DIR/../debug_shots}"
# ===================================

# 创建本地目录
mkdir -p "$LOCAL_DIR"

# 转为绝对路径
ABS_LOCAL_DIR="$(cd "$LOCAL_DIR" && pwd)"

echo "[1/2] 从共享文件夹复制截图..."
echo "     来源: $SHARED_DIR"
echo "     目标: $ABS_LOCAL_DIR"
echo

# 检查共享文件夹是否存在
if [ ! -d "$SHARED_DIR" ]; then
    echo "✗ 共享文件夹不存在: $SHARED_DIR"
    echo "   请确认 MuMu 模拟器共享文件夹设置正确"
    exit 1
fi

# 复制所有 png 文件
COPIED_COUNT=0
for f in "$SHARED_DIR"/*.png; do
    if [ -f "$f" ]; then
        cp -f "$f" "$ABS_LOCAL_DIR/"
        ((COPIED_COUNT++))
    fi
done

if [ $COPIED_COUNT -gt 0 ]; then
    echo
    echo "[2/2] 截图已复制到: $ABS_LOCAL_DIR/"
    echo "     共 $COPIED_COUNT 张截图"
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
    echo "ℹ 共享文件夹中没有 .png 文件"
    echo "   请确保 AutoXJS 脚本已正确配置截图保存路径"
fi

echo
