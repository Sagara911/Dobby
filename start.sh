#!/bin/bash
# Dobby — mac / Linux launcher

cd "$(dirname "$0")"

echo ""
echo " ╔══════════════════════════════════════════════════════╗"
echo " ║         🧦  Dobby — H5 工具集             ║"
echo " ╚══════════════════════════════════════════════════════╝"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo " ✗ 没检测到 Node.js"
  echo "   请先安装: https://nodejs.org/zh-cn/"
  exit 1
fi

PORT=8765
while lsof -i :$PORT >/dev/null 2>&1; do
  PORT=$((PORT + 1))
done

echo " ✓ 端口: $PORT"
echo " ✓ 地址: http://localhost:$PORT/"
echo ""
echo " 浏览器将自动打开。关闭这个窗口停止服务器。"
echo " 首次访问后浏览器地址栏右上角会出现 ⊕ 安装按钮。"
echo ""

# 后台 sleep 2 后打开浏览器
( sleep 2 && (open "http://localhost:$PORT/" 2>/dev/null || xdg-open "http://localhost:$PORT/" 2>/dev/null) ) &

npx --yes http-server "." -p $PORT -c-1 --silent
