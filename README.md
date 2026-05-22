# 🧦 Dobby

H5 Playable 制作工具集 — 22 款图像 / 动画 / 音视频 / 代码工具,**全部在浏览器本地运行,文件不上传**。

---

## 🚀 怎么用(给接收方)

### 第一次用(1 分钟搞定)

**Windows**: 双击 `启动工具站.bat`
**Mac / Linux**: 终端跑 `bash start.sh`

脚本会自动:
1. 检查 Node.js(没装会提示去 https://nodejs.org/ 装一下)
2. 启动本地 server
3. 用浏览器打开 `http://localhost:8765/`

### 装成桌面应用(强烈推荐)

打开页面后,浏览器**地址栏右上角**会出现一个 **⊕ 安装** 图标:

- **Chrome / Edge 桌面**: 点 ⊕ → 安装
- **手机 Chrome / Safari**: 菜单 → 添加到主屏幕

安装后图标会出现在桌面 / 启动栏,**双击直接打开就用**,跟原生 app 一样,完全离线可用,以后不再需要跑 .bat 脚本。

---

## 📦 工具一览(共 22 款)

### 🖼️ 图像处理
- **图片压缩 (Image Optimizer)** — 批量 PNG/JPG 压缩、缩放、转格式
- **PNG 深压 (PNG Crusher)** — palette + K-means + dither,通常 -60~85%
- **图片编辑 (Image Editor)** — 裁剪 / 旋转 / 加文字 / 像素化 / 滤镜 / HSL 通道
- **调色工具 (Color Tools)** — 抠图 / 取色 / 主色提取 / 减色 / 颜色替换
- **AI 抠图 (AI Cutout)** — MODNet / RMBG,复杂背景
- **去水印 (Watermark Remove)** — 画刷选区 + 扩散插值 / AI inpainting
- **拼图合成 (Composer)** — 多图拼接 / 叠加 / 水印

### 🎬 动画 / 精灵图
- **精灵图合成 (Sprite Packer)** — 序列帧 / 视频 / GIF → 精灵图 + JSON
- **精灵图拆帧 (Atlas Splitter)** — 反向拆帧 + 动画预览 + 一键转 GIF
- **GIF 制作 (GIF Maker)** — 序列帧 → GIF / APNG
- **GIF 编辑 (GIF Editor)** — 缩放 / 调速 / 反向 / 减帧 / 滤镜 / 水印

### 🔊 音视频
- **视频处理 (Video Toolkit)** — trim / crop / 调速 / 抽帧 / 转 GIF / 色键抠像 / MP4 (H.264) 输出
- **音频压缩 (Audio Compressor)** — 降采样 / 单声道 / 裁剪 / 淡入淡出

### 🗜️ 代码 / 打包
- **单文件打包 (HTML Inliner)** — 外部 JS/CSS/图片 → 单 HTML(playable 交付必备)
- **代码压缩 (Code Minify)** — JS / CSS / HTML 压缩
- **Base64** — 文件 ↔ base64 / dataURL
- **QR 码 (QR Generator)** — URL / WiFi / 名片 → QR 码,可嵌 logo
- **字体子集化 (Font Subsetter)** — 中文字体 50MB → 几 KB

### 📊 分析 / 诊断
- **包体分析 (Bundle Analyzer)** — 扫描项目目录 + 大文件清单
- **渠道检查 (Channel Check)** — Facebook / Google / TikTok / Mintegral 规范校验
- **瘦身助手 (Slim Coach)** — 扫描项目给出针对性瘦身建议

---

## 🌐 想给更多人用?部署到公网

只要把这个文件夹推到 GitHub + 启用 Pages,5 分钟拿到 HTTPS URL,谁打开都能用 + 一键安装。

```bash
# 在 toolkit 目录里
git init
git add .
git commit -m "init"
gh repo create my-toolkit --public --source=. --push  # 需要 gh CLI
# 然后在 GitHub 网页:Settings → Pages → Source 选 main branch root
```

也可以拖到 [Vercel](https://vercel.com/) 或 [Netlify](https://app.netlify.com/) 自动部署,更快。

---

## ⚙️ 技术细节

- 纯静态站点,**零依赖、零构建**
- 主要靠浏览器原生 API:Canvas / WebCodecs / WebAudio / FileSystemAccess / ImageDecoder
- 少数高级工具用 ESM dynamic import 从 CDN 加载(transformers.js / opentype.js / terser / mp4-muxer 等),首次联网后浏览器缓存
- PWA + Service Worker 离线缓存所有工具页
- 数据流:**本地 → 本地**,文件不上传

---

**问题反馈**: 直接告诉作者你卡在哪里,带上浏览器版本和报错截图。
