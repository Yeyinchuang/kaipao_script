@echo off
chcp 65001 >nul
echo ========================================
echo   AutoXJS Debug - 拉取调试截图
echo   MuMu 模拟器 → 本地电脑
echo ========================================
echo.

:: === 可配置参数（可按需修改）===
set "REMOTE_DIR=/sdcard/autoxjs_debug"
set "LOCAL_DIR=%~dp0..\debug_shots"
:: =================================

:: 创建本地目录
if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"

:: 转为绝对路径用于显示
pushd "%LOCAL_DIR%"
set "ABS_LOCAL_DIR=%cd%"
popd

echo [1/2] 从设备拉取截图...
echo      远程: %REMOTE_DIR%
echo      本地: %ABS_LOCAL_DIR%
echo.

adb pull "%REMOTE_DIR%" "%ABS_LOCAL_DIR%"

if %ERRORLEVEL% equ 0 (
    echo.
    echo [2/2] 截图已拉取到: %ABS_LOCAL_DIR%
    
    :: 统计文件数
    for /f %%a in ('dir /b "%ABS_LOCAL_DIR%\*.png" 2^>nul ^| find /c /v ""') do set FILE_COUNT=%%a
    echo       共 %FILE_COUNT% 张截图
    
    start "" "%ABS_LOCAL_DIR%"
) else (
    echo.
    echo ✗ 拉取失败！请检查：
    echo.
    echo   1. ADB 是否可用？
    echo      adb devices
    echo.
    echo   2. MuMu ADB 端口是否正确连接？
    echo      MuMu 12:  adb connect 127.0.0.1:7555
    echo      MuMu 9:   adb connect 127.0.0.1:16384
    echo.
    echo   3. 如果不用 ADB，可以手动从模拟器拷贝:
    echo      文件管理器 → Internal Storage → autoxjs_debug
)

echo.
pause
