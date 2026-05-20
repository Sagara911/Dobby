@echo off
chcp 65001 >nul
title Playable Toolkit

echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║          🧰  Playable Toolkit — H5 工具集            ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  正在启动本地服务器...
echo.

REM 检查 Node.js 是否安装
where node >nul 2>nul
if errorlevel 1 (
    echo  ✗ 没有检测到 Node.js
    echo.
    echo    请先安装 Node.js: https://nodejs.org/zh-cn/
    echo    安装后重新双击本脚本即可
    echo.
    pause
    exit /b 1
)

REM 选个端口(优先 8765,被占用则尝试 8766/8767)
set PORT=8765
netstat -ano | findstr ":%PORT% " >nul && set PORT=8766
netstat -ano | findstr ":%PORT% " >nul && set PORT=8767
netstat -ano | findstr ":%PORT% " >nul && set PORT=8768

echo  ✓ 端口: %PORT%
echo  ✓ 地址: http://localhost:%PORT%/
echo.
echo  浏览器即将自动打开。如果没有自动打开,手动访问上面的地址。
echo.
echo  ─────────────────────────────────────────────────────────
echo   关闭这个窗口就停止服务器
echo   首次访问后浏览器右上角会出现 ⊕ 安装按钮,可安装到桌面
echo  ─────────────────────────────────────────────────────────
echo.

REM 延迟 1.5 秒后打开浏览器,确保 server 已起来
start "" /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:%PORT%/"

REM 启动 http-server (用 npx,首次会自动下载)
npx --yes http-server "%~dp0" -p %PORT% -c-1 --silent

pause
