@echo off
chcp 65001 >nul
echo ========================================
echo   AutoXJS Debug - 拉取调试截图
echo   MuMu 共享文件夹 -> 项目目录
echo ========================================
echo.

:: === 可配置参数（可按需修改）===
:: MuMu 共享文件夹路径（AutoXJS 截图直接保存到这里）
set "SHARED_DIR=C:\Users\23357\Documents\MuMu共享文件夹\autoxjs_debug"
set "LOCAL_DIR=%~dp0..\debug_shots"
:: =================================

:: 创建本地目录
if not exist "%LOCAL_DIR%" mkdir "%LOCAL_DIR%"

:: 转为绝对路径用于显示
pushd "%LOCAL_DIR%"
set "ABS_LOCAL_DIR=%cd%"
popd

echo [1/2] 从共享文件夹复制截图...
echo      来源: %SHARED_DIR%
echo      目标: %ABS_LOCAL_DIR%
echo.

:: 检查共享文件夹是否存在
if not exist "%SHARED_DIR%" (
    echo.
    echo ✗ 共享文件夹不存在: %SHARED_DIR%
    echo   请确认 MuMu 模拟器共享文件夹设置正确
    goto :end
)

:: 复制所有 png 文件
set "COPIED_COUNT=0"
for %%f in ("%SHARED_DIR%\*.png") do (
    copy /Y "%%f" "%ABS_LOCAL_DIR%\" >nul
    set /a COPIED_COUNT+=1
)

if %COPIED_COUNT% gtr 0 (
    echo.
    echo [2/2] 截图已复制到: %ABS_LOCAL_DIR%
    echo       共 %COPIED_COUNT% 张截图
    
    start "" "%ABS_LOCAL_DIR%"
) else (
    echo.
    echo ℹ 共享文件夹中没有 .png 文件
    echo    请确保 AutoXJS 脚本已正确配置截图保存路径
)

:end
echo.
pause
