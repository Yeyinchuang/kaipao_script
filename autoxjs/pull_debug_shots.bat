@echo off
chcp 65001 >nul
echo ========================================
echo   拉取调试截图到本地
echo ========================================
echo.

set LOCAL_DIR=%~dp0debug_shots
set REMOTE_DIR=/sdcard/autoxjs_debug

:: 创建本地目录
if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"

echo 从设备拉取截图...
echo   远程: %REMOTE_DIR%
echo   本地: %LOCAL_DIR%
echo.

adb pull "%REMOTE_DIR%" "%LOCAL_DIR%"

if %ERRORLEVEL% equ 0 (
    echo.
    echo ✓ 截图已拉取到: %LOCAL_DIR%
    explorer "%LOCAL_DIR%"
) else (
    echo.
    echo ✗ 拉取失败！请检查：
    echo   1. adb 是否可用（执行 adb devices 测试）
    echo   2. 设备是否连接
    echo.
    echo 如果不用ADB，可以手动从模拟器文件管理器拷贝:
    echo   模拟器路径: %REMOTE_DIR%
)

pause
