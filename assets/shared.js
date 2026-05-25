// shared utilities for H5 Dobby
// inject the top navigation bar and expose helpers on window.Toolkit

(function () {
  // ============================================================
  //   i18n — Dobby's bilingual support (zh default, en optional)
  //
  //   Language selection order:
  //     1. localStorage['toolkit-lang']
  //     2. navigator.language — starts with 'zh' → 'zh', else → 'en'
  //   Default Chinese strings are inline in shared.js / HTML, so the
  //   site works perfectly even before the strings dict loads. Strings
  //   for the active language are looked up via T(key, vars, fallback);
  //   the fallback is the Chinese literal that would have been there
  //   without i18n. The dict (assets/i18n-strings.js) is loaded async
  //   on boot and a re-render is triggered when it lands.
  // ============================================================
  const LANG_KEY = 'toolkit-lang';
  const SUPPORTED_LANGS = ['zh', 'en'];

  function detectInitialLang() {
    try {
      const stored = localStorage.getItem(LANG_KEY);
      if (SUPPORTED_LANGS.includes(stored)) return stored;
    } catch (_) {}
    const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (nav.startsWith('zh')) return 'zh';
    return 'en';
  }

  let currentLang = detectInitialLang();
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';

  function _interp(str, vars) {
    if (!vars) return str;
    for (const k in vars) str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]);
    return str;
  }

  // T(key, varsOrFallback, fallback)
  //   T('home.title') — pure lookup, returns key if missing
  //   T('home.title', 'fallback') — lookup, fallback if missing
  //   T('toast.foo', { name: 'x' }, 'fallback') — interpolate vars, fallback if missing
  function T(key, varsOrFallback, fallback) {
    let vars = null;
    if (typeof varsOrFallback === 'string') { fallback = varsOrFallback; }
    else { vars = varsOrFallback; }
    const dict = (window.I18N_STRINGS && window.I18N_STRINGS[currentLang]) || null;
    const fbDict = (window.I18N_STRINGS && window.I18N_STRINGS.zh) || null;
    // Use loose equality so `null` (which the `dict && dict[key]` short-circuit
    // produces when dict is itself null) is treated like undefined and falls
    // through to the fallback path. Without this, T() returned literal null
    // before i18n-strings.js had loaded, which template-literal-interpolated
    // as the string "null" in tool card descriptions.
    let str = dict ? dict[key] : undefined;
    if (str == null && fbDict) str = fbDict[key];
    if (str == null) {
      if (fallback !== undefined) return _interp(fallback, vars);
      return key;
    }
    return _interp(str, vars);
  }

  function applyTranslations(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      const v = T(key);
      if (v !== key) el.textContent = v;
    });
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.dataset.i18nHtml;
      const v = T(key);
      if (v !== key) el.innerHTML = v;
    });
    root.querySelectorAll('[data-i18n-attr]').forEach(el => {
      el.dataset.i18nAttr.split(';').forEach(pair => {
        const idx = pair.indexOf(':');
        if (idx < 0) return;
        const attr = pair.slice(0, idx).trim();
        const key = pair.slice(idx + 1).trim();
        const v = T(key);
        if (v !== key) el.setAttribute(attr, v);
      });
    });
  }

  function setLang(lang) {
    if (!SUPPORTED_LANGS.includes(lang) || lang === currentLang) return;
    currentLang = lang;
    try { localStorage.setItem(LANG_KEY, lang); } catch (_) {}
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    applyTranslations();
    // Trigger a full re-render of dynamic UI bits (topbar, sidebar, etc.)
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }));
  }

  function getLang() { return currentLang; }

  // Load the strings dict asynchronously. Sites work with Chinese defaults
  // before this lands; once it loads, applyTranslations swaps to the
  // active language.
  function loadStringsDict() {
    if (window.I18N_STRINGS) { applyTranslations(); return; }
    const inSubdir = window.location.pathname.includes('/tools/');
    const prefix = inSubdir ? '../' : '';
    const s = document.createElement('script');
    s.src = prefix + 'assets/i18n-strings.js';
    s.onload = () => { applyTranslations(); };
    s.onerror = () => { console.warn('[i18n] failed to load strings dict'); };
    document.head.appendChild(s);
  }
  loadStringsDict();

  const TOOLS = [
    { id: 'home',           cat: 'home',  name: '首页',           en: 'Home',            icon: '🏠', href: 'index.html' },
    // 图像处理
    { id: 'image-optimizer',cat: 'image', name: '图片压缩',       en: 'Image Optimizer', icon: '📦', href: 'tools/image-optimizer.html',desc: '批量 PNG/JPG 压缩、缩放、转格式' },
    { id: 'png-crusher',    cat: 'image', name: 'PNG 深压',       en: 'PNG Crusher',     icon: '💎', href: 'tools/png-crusher.html',    desc: '深度 PNG 压缩 (palette 编码, -60~85%)' },
    { id: 'image-editor',   cat: 'image', name: '图片编辑',       en: 'Image Editor',    icon: '🖼️', href: 'tools/image-editor.html',   desc: '单图编辑:裁剪 / 旋转 / 加文字 / 像素化 / 滤镜' },
    { id: 'color-tools',    cat: 'image', name: '调色工具',       en: 'Color Tools',     icon: '🎨', href: 'tools/color-tools.html',    desc: '抠图 / 取色 / 主色提取 / 减色' },
    { id: 'ai-cutout',      cat: 'image', name: 'AI 抠图',        en: 'AI Cutout',       icon: '🤖', href: 'tools/ai-cutout.html',      desc: 'AI 抠图 (MODNet / RMBG),复杂背景' },
    { id: 'watermark-remove',cat:'image', name: '去水印',         en: 'Watermark Remove',icon: '🩹', href: 'tools/watermark-remove.html', desc: '画刷 / 矩形选水印区,扩散插值或 AI 模型填充' },
    { id: 'composer',       cat: 'image', name: '拼图合成',       en: 'Composer',        icon: '🧩', href: 'tools/composer.html',       desc: '多图拼接 / 叠加 / 加水印' },
    { id: 'image-diff',     cat: 'image', name: '图像对比',       en: 'Image Diff',      icon: '🔬', href: 'tools/image-diff.html',     desc: 'A/B 对比 + 滑动 + 热图 + PSNR/SSIM,压缩前后必备' },
    { id: 'svg-tools',      cat: 'image', name: 'SVG 工具',       en: 'SVG Tools',       icon: '📐', href: 'tools/svg-tools.html',      desc: 'SVGO 优化 + 转 PNG (1x/2x/3x/4x),批量处理,实时预览' },
    // 动画 / 精灵图
    { id: 'sprite-packer',  cat: 'anim',  name: '精灵图合成',     en: 'Sprite Packer',   icon: '🎬', href: 'tools/sprite-packer.html',  desc: '序列帧 / 视频 / GIF → 精灵图 + JSON' },
    { id: 'atlas-splitter', cat: 'anim',  name: '精灵图拆帧',     en: 'Atlas Splitter',  icon: '✂️', href: 'tools/atlas-splitter.html', desc: '精灵图 + JSON → 拆回序列帧 + 动画预览' },
    { id: 'gif-tools',      cat: 'anim',  name: 'GIF 工具',       en: 'GIF Tools',       icon: '🎞️', href: 'tools/gif-tools.html',      desc: '制作 (序列帧→GIF/APNG) + 编辑 (缩放/裁剪/调速/反向/减帧/优化/滤镜)' },
    { id: 'lottie-tools',   cat: 'anim',  name: 'Lottie 工具',    en: 'Lottie Tools',    icon: '🎭', href: 'tools/lottie-tools.html',   desc: 'Lottie JSON 预览 + 精度优化 (体积 -50%~-80%) + 转 APNG/GIF' },
    // 音视频
    { id: 'video-toolkit',  cat: 'av',    name: '视频处理',       en: 'Video Toolkit',   icon: '🎬', href: 'tools/video-toolkit.html',  desc: '视频裁剪 / 抽帧 / 转 GIF / 转 WebM' },
    { id: 'audio-compress', cat: 'av',    name: '音频压缩',       en: 'Audio Compressor',icon: '🔊', href: 'tools/audio-compress.html', desc: '降采样 / 单声道 / 裁剪 / fade / WAV/Opus 输出' },
    // 代码 / 打包
    { id: 'html-inliner',   cat: 'code',  name: '单文件打包',     en: 'HTML Inliner',    icon: '📄', href: 'tools/html-inliner.html',   desc: '把外部 JS/CSS/图片内联为单 HTML' },
    { id: 'code-minify',    cat: 'code',  name: '代码压缩',       en: 'Code Minify',     icon: '🗜️', href: 'tools/code-minify.html',    desc: 'JS / CSS / HTML 压缩,JS 用 terser' },
    { id: 'base64',         cat: 'code',  name: 'Base64',         en: 'Base64',          icon: '🔤', href: 'tools/base64.html',         desc: '文件 ↔ base64/dataURL 互转' },
    { id: 'zip-packer',     cat: 'code',  name: 'ZIP 打包',       en: 'ZIP Packer',      icon: '📦', href: 'tools/zip-packer.html',     desc: '多文件 / 文件夹 → ZIP,deflate level 0-9 可调' },
    { id: 'qr-gen',         cat: 'code',  name: 'QR 码',          en: 'QR Generator',    icon: '📱', href: 'tools/qr-gen.html',         desc: 'URL / WiFi / 名片 / 短信 → QR 码,可嵌 logo' },
    { id: 'font-subset',    cat: 'code',  name: '字体子集化',     en: 'Font Subsetter',  icon: '🔠', href: 'tools/font-subset.html',    desc: '中文字体 50MB → 几 KB,playable 包体救星' },
    { id: 'batch-rename',   cat: 'code',  name: '批量重命名',     en: 'Batch Rename',    icon: '🏷️', href: 'tools/batch-rename.html',   desc: '模板 + 查找替换 + 序号补零,实时预览冲突高亮,导出 ZIP' },
    // 分析 / 诊断
    { id: 'bundle-analyzer',cat: 'audit', name: '包体分析',       en: 'Bundle Analyzer', icon: '📊', href: 'tools/bundle-analyzer.html', desc: '扫描项目目录,显示类别分布 + 大文件清单' },
    { id: 'channel-check',  cat: 'audit', name: '渠道检查',       en: 'Channel Check',   icon: '✅', href: 'tools/channel-check.html', desc: 'Facebook / Google / TikTok 等渠道规范校验' },
    { id: 'slim-coach',     cat: 'audit', name: '瘦身助手',       en: 'Slim Coach',      icon: '🩺', href: 'tools/slim-coach.html', desc: '扫描项目,给出针对每类资源的具体瘦身建议' },
    { id: 'playable-slim',  cat: 'audit', name: 'Playable 瘦身',   en: 'Playable Slim',   icon: '🩻', href: 'tools/playable-slim.html', desc: '拆大体积 HTML 内联素材 → 单独压 → 重组,Playable 减肥神器' }
  ];

  // Per-tool inline usage guide (auto-injected to sidebar).
  const INSTRUCTIONS = {
    'sprite-packer': [
      '拖入序列帧(多选 PNG) / 视频 / GIF 文件',
      '在左侧调整布局、裁剪、统一帧尺寸等参数',
      '点"导出 PNG + JSON"一次拿到精灵图和 TexturePacker 元数据'
    ],
    'atlas-splitter': [
      '拖入精灵图 + JSON;或只拖 PNG 进入手动网格模式',
      '动画自动播放,可点单帧选中',
      '导出为帧 ZIP / 单帧 PNG / 一键转 GIF·APNG'
    ],
    'image-optimizer': [
      '拖入多张图片(PNG/JPG/WebP)',
      '选输出格式、质量、缩放、色彩位深',
      '点"开始处理",多张图用 ZIP 一次性下载'
    ],
    'png-crusher': [
      '拖入 PNG(可多张)',
      '选预设(平衡/激进/极限)或自定义色数 + dither',
      '点"开始压缩",≥2 张图请用底部"下载全部 (ZIP)"避免 Chrome 多文件提示'
    ],
    'gif-tools': [
      '【🎬 制作】拖入序列帧 → 设 FPS / 循环次数 → 选 GIF 或 APNG → 点"生成"',
      '【✏️ 编辑】拖入已有 GIF → 选操作(一键压缩 / 缩放 / 裁剪 / 调速 / 反向 / 删帧 / 优化 / 滤镜)→ 应用',
      '"一键压缩"提供轻/中/重 3 个预设组合缩放+减色+抽帧;"制作"完成可"把输出送到编辑标签"做链式操作'
    ],
    'image-editor': [
      '拖入单张图片',
      '选操作:缩放 / 裁剪 / 旋转 / 加文字 / 像素化 / 滤镜',
      '点"应用"→ 下载;或"把输出作为新输入"叠加下一个操作'
    ],
    'color-tools': [
      '拖入图片',
      '选工具:抠图(纯色背景) / 取色器 / 主色提取 / 减色',
      '取色 / 抠图模式下点击原图采样;应用后导出图片或调色板'
    ],
    'ai-cutout': [
      '拖入 1 张或多张图(支持文件夹),模型会自动下载并批量推理',
      '默认 MODNet(25MB,适合人像);复杂场景可切到 RMBG-1.4(85MB)',
      '点队列里任意图查看对比;多张时用"下载全部 (ZIP)"一次性导出'
    ],
    'watermark-remove': [
      '拖入图片,用 🖌️ 画刷 或 ▭ 矩形选中水印区域(红色覆盖区)',
      '选算法:扩散插值(快,适合纯色/渐变背景)或 AI 模型(慢,适合复杂背景)',
      '点"应用去水印"等待完成,下载 PNG'
    ],
    'video-toolkit': [
      '拖入视频(MP4 / WebM / MOV),选操作:trim / crop / 调速 / 反向 / 抽帧 / 转 GIF / 色键抠像',
      '或者反过来拖一组序列帧(PNG/JPG/WebP),会自动切到「帧合成视频」动作,设 FPS / 输出尺寸,导出 MP4',
      '输出格式默认 MP4 (H.264,Chrome/Edge 113+),不支持时回退 WebM',
      '色键抠像建议输出 PNG ZIP 或 APNG(真透明)'
    ],
    'composer': [
      '拖入多张图片(可在素材列表上下调整顺序或删除)',
      '选布局:横向 / 纵向 / 网格 / 叠加,设间距、背景色',
      '可选加文字水印,点"合成"后下载'
    ],
    'html-inliner': [
      '点"选择项目文件夹"(仅 Chrome 86+ / Edge 86+)',
      '从下拉选入口 HTML,勾选要内联的资源类型',
      '点"开始打包",下载完全自包含的单 HTML 文件'
    ],
    'base64': [
      '编码模式:拖入任意文件,选 dataURL / 纯 base64 / hex 预览',
      '解码模式:粘贴 base64 / dataURL 字符串,自动识别 MIME 类型',
      '点"复制到剪贴板"或下载 .txt'
    ],
    'zip-packer': [
      '拖入文件或文件夹(任意类型),会列在右侧',
      '调"压缩级别"滑块,默认 9 (最强 deflate);追求速度可调低',
      '点"开始打包",看节省率,下载 .zip'
    ],
    'playable-slim': [
      '【拆出资源】拖入大体积 HTML → 自动扫所有 dataURL → 列表显示每个素材的类型/大小',
      '点"导出 ZIP" → 拿到含 manifest.json + 原 HTML + 各素材文件的压缩包',
      '用其他工具(image-optimizer / video-toolkit 等)压缩 ZIP 里的素材,保持文件名不变',
      '【重组】切到"重组 HTML" 标签,拖入压缩后的 ZIP → 工具按 manifest 把素材替换回原位置 → 输出瘦身 HTML'
    ],
    'qr-gen': [
      '输入文本 / URL,或点 URL / WiFi / 名片 / 短信 预设填模板',
      '调前景背景色、纠错等级、尺寸;可选拖入 logo 嵌中心(用 ECC=H)',
      '点"生成"后下载 PNG 或 SVG'
    ],
    'font-subset': [
      '拖入 TTF / OTF 字体文件',
      '填要保留的字符(可点"中文 500 常用字"等预设快速填充)',
      '点"开始子集化",对比体积变化,下载 TTF + CSS @font-face 代码'
    ],
    'batch-rename': [
      '拖入文件或文件夹(可多选,支持 ZIP 自动解压)',
      '模板里写新名,例如 walk_{i:04}{ext}; 可叠加查找替换、大小写、扩展名规则',
      '右侧表格实时预览原名→新名,重名会红色高亮; 没冲突就能点"导出 ZIP"'
    ],
    'image-diff': [
      '拖入 A (原图) 与 B (压缩 / 编辑后),格式自动识别',
      '4 种显示: 滑动对比 / 并列 / 差异热图 / 仅差异图',
      '指标卡: 体积变化 · 变化像素 % · 平均/最大 Δ · PSNR · SSIM'
    ],
    'svg-tools': [
      '拖入 .svg 文件 (可多选)',
      '模式选 "优化" → SVGO 多 pass + 精度调整,导出更小的 .svg',
      '模式选 "转 PNG" → 选 1× / 2× / 3× / 4× 或自定义最大边,批量栅格化导出 PNG'
    ],
    'lottie-tools': [
      '拖入 Lottie JSON 文件 (After Effects + Bodymovin 导出)',
      '右上预览自动播放 · "优化" 降低浮点精度+去元数据,体积通常砍 -50%~-80%',
      '可导出优化的 JSON,或栅格化为 APNG / GIF 给不支持 Lottie 的平台用'
    ],
    'audio-compress': [
      '拖入音频文件,会自动解码并显示波形',
      '调采样率、声道数、时间裁剪、淡入淡出',
      '选输出格式(WAV 16/8-bit 或 WebM/Opus),点"开始处理"后下载'
    ],
    'bundle-analyzer': [
      '点"选择项目文件夹"扫描整个目录',
      '左侧调过滤 / 排序,看大文件分布和类别占比',
      '可导出 CSV 报告,定位包体杀手'
    ],
    'channel-check': [
      '拖入 playable 单文件 HTML',
      '选目标渠道 (Facebook / Google / TikTok / Mintegral 等)',
      '查看通过 / 警告 / 失败的检查项,逐项修复'
    ],
    'code-minify': [
      '左侧选语言 (CSS / JS / HTML)',
      '粘贴代码,或点"加载文件"导入',
      '点"压缩",看压缩率,复制或下载结果'
    ],
    'slim-coach': [
      '选择 / 拖入项目文件夹,自动扫描',
      '看顶部"瘦身潜力"估算,以及下方按类别的具体建议',
      '点每条建议的"去 XX 工具"按钮跳转处理'
    ]
  };

  function injectTopbar(activeId) {
    const inSubdir = window.location.pathname.includes('/tools/');
    const prefix = inSubdir ? '../' : '';
    // wrapper that holds optional back-button pill + main topbar pill, side by side
    const wrap = document.createElement('div');
    wrap.className = 'topbar-wrap';
    const bar = document.createElement('div');
    bar.className = 'topbar';

    // Find the current tool's category (if any) for nav highlighting
    const currentTool = TOOLS.find(t => t.id === activeId);
    const currentCat = currentTool?.cat;

    // 5 top-level categories. Each has its own i18n key (cat.<id> for the
    // dropdown's primary label, cat.<id>.en for the secondary EN label that
    // shows on each dropdown item).
    const cats = [
      { id: 'image', key: 'cat.image', defaultName: '图像处理',     icon: '🖼️' },
      { id: 'anim',  key: 'cat.anim',  defaultName: '动画 / 精灵图', icon: '🎬' },
      { id: 'av',    key: 'cat.av',    defaultName: '音视频',       icon: '🔊' },
      { id: 'code',  key: 'cat.code',  defaultName: '代码 / 打包',   icon: '🗜️' },
      { id: 'audit', key: 'cat.audit', defaultName: '分析 / 诊断',   icon: '📊' }
    ];

    // For each tool, pick its display name based on language:
    //  zh → t.name (the original Chinese name)
    //  en → t.en (the existing English column in the TOOLS table)
    const toolName = (t) => (getLang() === 'en' && t.en) ? t.en : t.name;

    bar.innerHTML = `
      <a href="${prefix}index.html" class="brand" data-i18n-attr="title:topbar.brand.title" title="Dobby is free!">
        <span class="logo">🧦</span>
        <span>Dobby</span>
      </a>
      <nav>
        ${cats.map(c => {
          const tools = TOOLS.filter(t => t.cat === c.id);
          const isActive = currentCat === c.id;
          const catName = T(c.key, c.defaultName);
          return `
            <div class="nav-group ${isActive ? 'active' : ''}">
              <a href="${prefix}index.html#cat-${c.id}" class="nav-cat" title="${catName}">
                <span class="cat-icon">${c.icon}</span><span class="nav-cat-name" data-i18n="${c.key}">${c.defaultName}</span>
                <span class="caret">▾</span>
              </a>
              <div class="nav-dropdown">
                ${tools.map(t => `
                  <a href="${prefix}${t.href}" class="${t.id === activeId ? 'active' : ''}">
                    <span>${t.icon}</span>
                    <span class="dd-name">${toolName(t)}</span>
                    <span class="dd-en">${t.en}</span>
                  </a>
                `).join('')}
              </div>
            </div>
          `;
        }).join('')}
      </nav>
      <button type="button" class="topbar-icon-btn lang-toggle" id="__langToggle__" data-i18n-attr="title:topbar.lang.toggle;aria-label:topbar.lang.toggle" title="切换语言 / Switch language">${getLang() === 'en' ? '中' : 'EN'}</button>
      <button type="button" class="topbar-icon-btn theme-toggle" id="__themeToggle__" data-i18n-attr="title:topbar.theme.toggle;aria-label:topbar.theme.toggle" title="${T('topbar.theme.toggle', '切换亮/深主题')}" aria-label="${T('topbar.theme.toggle', '切换亮/深主题')}">🌓</button>
      <button type="button" class="topbar-pill-btn" id="__feedbackBtn__" data-i18n-attr="title:topbar.feedback.title" title="${T('topbar.feedback.title', '反馈 / 联系作者')}"><span class="emoji">💬</span><span data-i18n="topbar.feedback">${T('topbar.feedback', '反馈')}</span></button>
    `;
    wrap.appendChild(bar);
    document.body.insertBefore(wrap, document.body.firstChild);
    // mouse-following glow (sets --mx / --my CSS variables)
    bar.addEventListener('mousemove', (e) => {
      const r = bar.getBoundingClientRect();
      bar.style.setProperty('--mx', (e.clientX - r.left) + 'px');
      bar.style.setProperty('--my', (e.clientY - r.top) + 'px');
    });

    // also auto-inject ambient blob background if not present
    if (!document.querySelector('.ambient-flow')) {
      const ambient = document.createElement('div');
      ambient.className = 'ambient-flow';
      ambient.setAttribute('aria-hidden', 'true');
      ambient.innerHTML = `
        <div class="ambient-stream"></div>
        <div class="ambient-blob ambient-blob--a"></div>
        <div class="ambient-blob ambient-blob--b"></div>
        <div class="ambient-blob ambient-blob--c"></div>
        <div class="ambient-blob ambient-blob--d"></div>
        <div class="ambient-blob ambient-blob--e"></div>
      `;
      document.body.insertBefore(ambient, document.body.firstChild);
    }

    // for tool pages: rewrite sidebar h1 + inject instructions + add back-to-home in topbar.
    const tool = TOOLS.find(t => t.id === activeId);
    if (tool && tool.id !== 'home') {
      const h1 = document.querySelector('.sidebar h1');
      if (h1) {
        // i18n: tool name picks zh or en per current language; English column
        // already exists in TOOLS so no extra dict entry needed. In en mode
        // the sub label is the same string, so drop it to avoid duplication.
        const isEn = getLang() === 'en';
        const displayName = (isEn && tool.en) ? tool.en : tool.name;
        const subHtml = isEn ? '' : `<span class="h1-sub">${tool.en}</span>`;
        h1.innerHTML = `${tool.icon} ${displayName} ${subHtml}`;
      }
      // add a standalone "← 全部工具" pill as a sibling of the topbar (tool pages only)
      if (!wrap.querySelector('.topbar-back')) {
        const back = document.createElement('a');
        back.className = 'topbar-back';
        back.href = prefix + 'index.html';
        back.innerHTML = `<span class="arr">←</span><span data-i18n="topbar.backAll">${T('topbar.backAll', '全部工具')}</span>`;
        wrap.insertBefore(back, bar);
      }
      const steps = INSTRUCTIONS[tool.id];
      if (steps && steps.length) injectInstructions(steps, {}, tool.id);
      // mark this tool as recently used
      Prefs.touchRecent(tool.id);
    }
    installErrorBoundary();
    watchForColorInputs();
    setupPWA(prefix);
    startThemeCycle();
    maybeShowBackPill();
    maybeShowNewsToast(prefix);
    setupHomeScrollMemory();
    setupFeedbackChip();
    setupThemeToggle();
    setupLangToggle();
  }

  // ============================================================
  //   Language toggle (中 ↔ EN) — small icon button next to theme
  //   toggle. Click flips the language, persists in localStorage,
  //   walks the DOM applying translations, and triggers a 'langchange'
  //   event so the topbar re-renders cat / tool names that aren't
  //   simple data-i18n targets.
  // ============================================================
  function setupLangToggle() {
    const btn = document.getElementById('__langToggle__');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = getLang() === 'en' ? 'zh' : 'en';
      setLang(next);
      btn.textContent = next === 'en' ? '中' : 'EN';
    });
  }

  // Re-render the topbar when language changes — the dropdown tool names
  // and active class need to be recomputed.
  document.addEventListener('langchange', () => {
    const wrap = document.querySelector('.topbar-wrap');
    if (!wrap) return;
    const active = wrap.querySelector('.nav-dropdown a.active');
    let activeId = 'home';
    if (active) {
      const tool = TOOLS.find(t => active.href.endsWith(t.href));
      if (tool) activeId = tool.id;
    }
    wrap.remove();
    injectTopbar(activeId);
  });

  // ============================================================
  //   Light / dark theme toggle
  //   - Default = dark (with the rAF color cycle active)
  //   - Light = static palette via :root[data-theme="light"] in CSS
  //   - Choice persists across sessions in localStorage
  //   - startThemeCycle() bails out when light is active so the
  //     static palette isn't overwritten frame-by-frame
  // ============================================================
  const THEME_PREF_KEY = 'toolkit-theme';
  function getThemePref() {
    try { return localStorage.getItem(THEME_PREF_KEY) || 'dark'; } catch (_) { return 'dark'; }
  }
  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    try { localStorage.setItem(THEME_PREF_KEY, theme); } catch (_) {}
    // refresh the toggle's icon if present
    const btn = document.getElementById('__themeToggle__');
    if (btn) btn.textContent = theme === 'light' ? '🌙' : '☀️';
  }
  function setupThemeToggle() {
    // Apply the stored preference on every page load (the inline-script in
    // each page hasn't done this yet — first paint will be dark, then this
    // flips it if needed; harmless for a once-per-session switch).
    applyTheme(getThemePref());
    const btn = document.getElementById('__themeToggle__');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const next = getThemePref() === 'light' ? 'dark' : 'light';
      applyTheme(next);
    });
  }

  // ============================================================
  //   Topbar feedback button — small 💬 icon button inside the
  //   topbar capsule. Click toggles a popover anchored below the
  //   button with the email + 测试阶段 note. Closes on outside-
  //   click or × button.
  // ============================================================
  function setupFeedbackChip() {
    const btn = document.getElementById('__feedbackBtn__');
    if (!btn) return;
    let panel = null;
    let outsideHandler = null;
    function close() {
      if (!panel) return;
      panel.remove(); panel = null;
      if (outsideHandler) { document.removeEventListener('click', outsideHandler); outsideHandler = null; }
    }
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (panel) { close(); return; }
      panel = document.createElement('div');
      panel.className = 'feedback-popover';
      panel.innerHTML = `
        <div class="fp-head">
          <span>${T('feedback.head', '🧦 Dobby 还在学本事')}</span>
          <button type="button" class="fp-close" aria-label="${T('topbar.feedback.close', '关闭')}">×</button>
        </div>
        <div class="fp-body">${T('feedback.body', '你发现 Dobby 做错了或者想学新本事? 邮件告诉 Dobby:')}</div>
        <a class="fp-email" href="mailto:huobingli0924@gmail.com">huobingli0924@gmail.com</a>
      `;
      document.body.appendChild(panel);
      // Anchor below the button, right-aligned to it.
      const r = btn.getBoundingClientRect();
      panel.style.top   = (r.bottom + 10) + 'px';
      panel.style.right = (window.innerWidth - r.right) + 'px';
      panel.querySelector('.fp-close').addEventListener('click', (e) => {
        e.stopPropagation();
        close();
      });
      outsideHandler = (ev) => {
        if (panel && !panel.contains(ev.target) && ev.target !== btn) close();
      };
      // Bind on the next tick so the click that opened doesn't immediately close.
      setTimeout(() => document.addEventListener('click', outsideHandler), 0);
    });
  }

  // Remember the home page's scroll position across the home → tool → home
  // round trip. Without this, clicking the topbar logo from a tool page
  // bounces the user all the way back up to the hero, losing the section
  // they were browsing when they entered the tool.
  function setupHomeScrollMemory() {
    const isHome = location.pathname.endsWith('/') || /(^|\/)index\.html$/i.test(location.pathname);
    if (!isHome) return;
    const KEY = 'toolkit-home-scroll';
    // Restore on load — but only when there's no anchor hash (e.g.
    // index.html#cat-image), so the topbar's category links keep their
    // explicit "jump to this section" behavior.
    if (!location.hash) {
      let saved = null;
      try { saved = sessionStorage.getItem(KEY); } catch (_) {}
      const y = saved !== null ? parseInt(saved, 10) : 0;
      if (y > 0) {
        // Defer until layout settles. requestAnimationFrame + a second
        // scrollTo in case the browser's own bfcache restoration ran first
        // and we now agree with it (no-op) or override (we win).
        requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'auto' }));
      }
    }
    const save = () => {
      try { sessionStorage.setItem(KEY, String(Math.round(window.scrollY))); } catch (_) {}
    };
    // pagehide fires whether the page is being torn down (regular nav away)
    // or being put into bfcache. Either way we want the latest scroll saved.
    window.addEventListener('pagehide', save);
    // Safari iOS sometimes skips pagehide on app switch — visibilitychange
    // catches that case.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') save();
    });
  }

  // ============================================================
  //   "What's new" toast — fetch news.json, show entries newer
  //   than the last version the user acknowledged. Toast lives
  //   in the bottom-right with a 刷新 button + dismiss button.
  // ============================================================
  const NEWS_SEEN_KEY = 'toolkit-news-seen';
  async function maybeShowNewsToast(prefix) {
    // skip on home page (the index already lists news; double-toasting is noisy)
    if (location.pathname.endsWith('/') || /index\.html$/i.test(location.pathname)) return;
    let news;
    try {
      // Cache-bust so SW/browser caches never hide a fresh entry.
      const r = await fetch(prefix + 'news.json?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      news = await r.json();
    } catch (_) { return; }
    if (!news || !Array.isArray(news.entries) || !news.entries.length) return;
    const seen = localStorage.getItem(NEWS_SEEN_KEY) || '';
    const fresh = [];
    for (const e of news.entries) {
      if (e.version === seen) break;  // entries are newest-first; stop at first seen
      fresh.push(e);
    }
    if (!fresh.length) return;
    renderNewsToast(fresh);
  }

  function renderNewsToast(entries) {
    document.getElementById('__newsToast__')?.remove();
    const t = document.createElement('div');
    t.id = '__newsToast__';
    t.className = 'news-toast';
    const head = entries[0];
    const moreCount = entries.length - 1;
    const itemsHtml = (head.items || []).map(i => `<li>${escapeHtml(i)}</li>`).join('');
    const moreHtml = moreCount > 0
      ? `<div class="news-toast-more">还有 ${moreCount} 条历史更新…</div>` : '';
    t.innerHTML = `
      <div class="news-toast-head">
        <span class="news-toast-tag">${T('newsToast.tag', '🧦 Dobby 学了新本事')}</span>
        <span class="news-toast-title">${escapeHtml(head.title || head.version)}</span>
        <button type="button" class="news-toast-x" title="${T('newsToast.close', '知道了')}">×</button>
      </div>
      <ul class="news-toast-items">${itemsHtml}</ul>
      ${moreHtml}
      <div class="news-toast-actions">
        <button type="button" class="news-toast-refresh">${T('newsToast.refresh', '🔄 刷新页面')}</button>
        <button type="button" class="news-toast-dismiss">${T('newsToast.dismiss', '稍后')}</button>
      </div>
    `;
    document.body.appendChild(t);
    const markSeen = () => {
      // mark the latest version as seen, so all current "fresh" entries get cleared
      try { localStorage.setItem(NEWS_SEEN_KEY, entries[0].version); } catch (_) {}
    };
    t.querySelector('.news-toast-x').addEventListener('click', () => {
      markSeen();
      t.classList.add('news-toast-out');
      setTimeout(() => t.remove(), 250);
    });
    t.querySelector('.news-toast-dismiss').addEventListener('click', () => {
      markSeen();
      t.classList.add('news-toast-out');
      setTimeout(() => t.remove(), 250);
    });
    t.querySelector('.news-toast-refresh').addEventListener('click', async () => {
      markSeen();
      // Clear SW cache so the reload picks up the absolute latest, not stale.
      try {
        const regs = await navigator.serviceWorker?.getRegistrations() || [];
        for (const r of regs) r.active?.postMessage('reset-cache');
      } catch (_) {}
      // Hard reload bypassing browser cache for shared.js / html.
      location.reload();
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  // If sessionStorage records a handoff source, show a small "⏪ 回到 X" pill
  // in the bottom-left so the user can hop back if they picked the wrong target.
  function maybeShowBackPill() {
    let info;
    try { info = JSON.parse(sessionStorage.getItem('toolkit-handoff-from') || 'null'); } catch (_) {}
    if (!info || !info.url) return;
    // don't show if we ARE the source (e.g. user navigated back manually)
    if (info.url === location.href) return;
    // idempotent: this is called both from injectTopbar at load and again
    // from setupHandoff after a delivery commits, so guard against duplicates.
    if (document.querySelector('.handoff-back-pill')) return;
    const pill = document.createElement('a');
    pill.className = 'handoff-back-pill';
    pill.href = info.url;
    pill.innerHTML = `<span class="arr">⏪</span><span>${T('handoff.backPill', { tool: info.toolName }, 'Dobby 带你回 ' + info.toolName)}</span><button class="dismiss" type="button" title="${T('handoff.backPill.dismiss', '不再显示')}">×</button>`;
    pill.addEventListener('click', (e) => {
      if (e.target.classList.contains('dismiss')) {
        e.preventDefault();
        try { sessionStorage.removeItem('toolkit-handoff-from'); } catch (_) {}
        pill.remove();
        return;
      }
      // navigating away — clear the marker so next page doesn't re-show it
      try { sessionStorage.removeItem('toolkit-handoff-from'); } catch (_) {}
    });
    document.body.appendChild(pill);
  }

  // ============================================================
  //   Auto theme cycling + cursor loaded from assets/cursor.*
  //   (no user settings — pure visual sugar)
  // ============================================================

  // four palettes the page tweens between, forever.
  // numbers are RGB. timing: each entry stays "dominant" for THEME_SECS_PER_STEP seconds,
  // total cycle = N * THEME_SECS_PER_STEP.
  const THEME_CYCLE = [
    { bg: [0, 0, 0],     jade: [49, 245, 156], text: [248, 248, 251], soft: [194, 199, 214], champagne: [242, 223, 184] },
    { bg: [6, 16, 30],   jade: [74, 176, 255], text: [234, 242, 255], soft: [184, 200, 224], champagne: [255, 217, 122] },
    { bg: [26, 12, 20],  jade: [255, 91, 140], text: [255, 238, 245], soft: [236, 196, 214], champagne: [255, 208, 224] },
    { bg: [10, 26, 18],  jade: [80, 220, 130], text: [232, 252, 240], soft: [192, 220, 200], champagne: [220, 240, 180] }
  ];
  const THEME_SECS_PER_STEP = 14;

  function startThemeCycle() {
    const lerp = (x, y, t) => Math.round(x + (y - x) * t);
    const rt = document.documentElement.style;
    function tick(now) {
      // Skip when the user has opted into the static light theme — otherwise
      // the rAF would overwrite the [data-theme="light"] palette every frame.
      if (document.documentElement.getAttribute('data-theme') === 'light') {
        // Clear any inline overrides we previously wrote, then re-queue
        // ourselves so we resume cycling if the user flips back to dark.
        ['--jade','--jade-rgb','--jade-soft','--jade-glow','--accent',
         '--accent-soft','--success','--bg','--text','--text-soft',
         '--champagne'].forEach(k => rt.removeProperty(k));
        requestAnimationFrame(tick);
        return;
      }
      const tt = (now / 1000 / THEME_SECS_PER_STEP) % THEME_CYCLE.length;
      const i = Math.floor(tt);
      const f = tt - i;
      const ff = f * f * (3 - 2 * f); // smoothstep
      const a = THEME_CYCLE[i];
      const b = THEME_CYCLE[(i + 1) % THEME_CYCLE.length];
      const jr = lerp(a.jade[0], b.jade[0], ff);
      const jg = lerp(a.jade[1], b.jade[1], ff);
      const jb = lerp(a.jade[2], b.jade[2], ff);
      const jc = `${jr}, ${jg}, ${jb}`;
      rt.setProperty('--jade', `rgb(${jc})`);
      rt.setProperty('--jade-rgb', jc);
      rt.setProperty('--jade-soft', `rgba(${jc}, 0.12)`);
      rt.setProperty('--jade-glow', `rgba(${jc}, 0.35)`);
      rt.setProperty('--accent', `rgb(${jc})`);
      rt.setProperty('--accent-soft', `rgba(${jc}, 0.12)`);
      rt.setProperty('--success', `rgb(${jc})`);
      const rgbProp = (key) => {
        const r = lerp(a[key][0], b[key][0], ff);
        const g = lerp(a[key][1], b[key][1], ff);
        const bl = lerp(a[key][2], b[key][2], ff);
        return `rgb(${r}, ${g}, ${bl})`;
      };
      rt.setProperty('--bg', rgbProp('bg'));
      rt.setProperty('--text', rgbProp('text'));
      rt.setProperty('--text-soft', rgbProp('soft'));
      rt.setProperty('--champagne', rgbProp('champagne'));
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  // The auto-cycling color theme. Legacy state (cursor file probes, old
  // 'toolkit-cursor' localStorage key, stale data-theme attribute, the
  // unused 'toolkit-theme' wipe that was clobbering the new theme toggle
  // every page load) was removed — the KILLSWITCH in each HTML handles
  // one-shot legacy cleanup, and setupThemeToggle owns the live theme
  // preference now.

  // ---------- PWA: inject manifest link + register service worker ----------
  function setupPWA(prefix) {
    // 1. inject manifest link
    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = prefix + 'manifest.json';
      document.head.appendChild(link);
    }
    // 2. theme-color
    if (!document.querySelector('meta[name="theme-color"]')) {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = '#31f59c';
      document.head.appendChild(meta);
    }
    // 3. apple-touch-icon for iOS
    if (!document.querySelector('link[rel="apple-touch-icon"]')) {
      const link = document.createElement('link');
      link.rel = 'apple-touch-icon';
      link.href = prefix + 'assets/icon.svg';
      document.head.appendChild(link);
    }
    // 4. register service worker (silently fails on file:// or non-HTTPS non-localhost)
    if ('serviceWorker' in navigator) {
      const swUrl = prefix + 'sw.js';
      navigator.serviceWorker.register(swUrl, { scope: prefix })
        .catch(err => {
          // expected to fail on file:// and on http without localhost — silent
          if (location.protocol !== 'file:') console.warn('[pwa] SW registration failed:', err.message);
        });
    }
  }

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);

  // Inject a collapsible "how to use" block at the top of the sidebar.
  // Call in tool pages after Toolkit.injectTopbar(). Pass an array of steps (strings or HTML).
  function injectInstructions(steps, opts = {}, toolId) {
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    // Remove any pre-existing instructions block (idempotent on langchange
    // re-render — without this every language switch would prepend another
    // block above the previous one).
    sidebar.querySelectorAll('.instructions').forEach(el => el.remove());
    const h1 = sidebar.querySelector('h1');
    const box = document.createElement('details');
    box.className = 'instructions';
    box.open = opts.collapsed ? false : true;
    // Each step gets its own data-i18n key (`instructions.<toolId>.<index>`)
    // with the Chinese literal as fallback. applyTranslations swaps to the
    // English text after the dict loads.
    const stepsHtml = steps.map((s, i) => {
      const key = toolId ? `instructions.${toolId}.${i}` : null;
      const text = key ? T(key, s) : s;
      return key ? `<li data-i18n="${key}">${text}</li>` : `<li>${text}</li>`;
    }).join('');
    box.innerHTML = `
      <summary data-i18n="sidebar.howTo">${T('sidebar.howTo', '📖 Dobby 怎么干这活')}</summary>
      <ol>
        ${stepsHtml}
      </ol>
      ${opts.note ? `<div class="instructions-note">${opts.note}</div>` : ''}
    `;
    if (h1 && h1.nextSibling) {
      sidebar.insertBefore(box, h1.nextSibling);
    } else if (h1) {
      sidebar.appendChild(box);
    } else {
      sidebar.insertBefore(box, sidebar.firstChild);
    }
  }

  // ---------- log ----------
  function makeLogger(logEl) {
    return {
      line(msg, cls = '') {
        const div = document.createElement('div');
        div.className = 'log-line ' + cls;
        div.textContent = msg;
        logEl.appendChild(div);
        logEl.scrollTop = logEl.scrollHeight;
      },
      ok(msg)   { this.line('✓ ' + msg, 'ok'); },
      err(msg)  { this.line('✗ ' + msg, 'err'); },
      warn(msg) { this.line('⚠ ' + msg, 'warn'); },
      dim(msg)  { this.line(msg, 'dim'); },
      clear()   { logEl.innerHTML = ''; }
    };
  }

  // ---------- progress ----------
  function makeProgress(progressEl) {
    const bar = progressEl.querySelector('.progress-bar');
    return {
      set(pct) {
        if (pct < 0) { progressEl.classList.remove('show'); return; }
        progressEl.classList.add('show');
        bar.style.width = (Math.min(1, Math.max(0, pct)) * 100).toFixed(1) + '%';
      },
      hide() { progressEl.classList.remove('show'); }
    };
  }

  // ---------- drag & drop (with folder support via webkitGetAsEntry) ----------
  function attachDropZone(dropEl, fileInput, onFiles) {
    dropEl.addEventListener('click', () => fileInput.click());
    dropEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropEl.classList.add('dragging');
    });
    dropEl.addEventListener('dragleave', () => dropEl.classList.remove('dragging'));
    dropEl.addEventListener('drop', async (e) => {
      e.preventDefault();
      dropEl.classList.remove('dragging');
      const items = e.dataTransfer.items;
      // try webkit entry API for folder support
      if (items && items.length && items[0].webkitGetAsEntry) {
        const files = [];
        const entries = [];
        for (const it of items) {
          const ent = it.webkitGetAsEntry && it.webkitGetAsEntry();
          if (ent) entries.push(ent);
        }
        if (entries.some(en => en && en.isDirectory)) {
          for (const ent of entries) await readEntry(ent, files);
          onFiles(await maybeExpandZips(files));
          return;
        }
      }
      onFiles(await maybeExpandZips(Array.from(e.dataTransfer.files)));
    });
    fileInput.addEventListener('change', async (e) => {
      onFiles(await maybeExpandZips(Array.from(e.target.files)));
    });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  }

  // If any dropped file is a .zip, unpack it inline so the tool's
  // handleFiles() sees the contents as if the user had dropped them directly.
  // Falls back to the original file if unzip fails (corrupt, password-locked, etc).
  async function maybeExpandZips(files) {
    const zips = files.filter(f => f && (f.type === 'application/zip' || /\.zip$/i.test(f.name)));
    if (!zips.length) return files;
    const out = [];
    for (const f of files) {
      if (zips.includes(f)) {
        try {
          const expanded = await unzipBlob(f);
          if (expanded && expanded.length) {
            out.push(...expanded);
            toast(T('toast.zipExtracted', { name: f.name, n: expanded.length }, `🧦 Dobby 帮你拆开了 ZIP "${f.name}" · ${expanded.length} 个文件`), 'ok', 3500);
            continue;
          }
        } catch (err) {
          console.warn('unzip failed for', f.name, err);
        }
        out.push(f);  // keep original if unzip failed or empty
      } else {
        out.push(f);
      }
    }
    return out;
  }

  // recursively read a FileSystemEntry (file or directory) into a flat files[] list
  async function readEntry(entry, files) {
    if (entry.isFile) {
      await new Promise((resolve) => entry.file(f => { files.push(f); resolve(); }, () => resolve()));
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const entries = await new Promise(r => {
        const all = [];
        function batch() {
          reader.readEntries(es => {
            if (!es.length) r(all);
            else { all.push(...es); batch(); }
          }, () => r(all));
        }
        batch();
      });
      for (const sub of entries) await readEntry(sub, files);
    }
  }

  // ---------- natural sort ----------
  function naturalSort(files) {
    return files.slice().sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  }

  // ---------- download ----------
  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadText(text, filename, mime = 'text/plain') {
    download(new Blob([text], { type: mime }), filename);
  }

  function downloadJson(obj, filename) {
    downloadText(JSON.stringify(obj, null, 2), filename, 'application/json');
  }

  // ---------- canvas helpers ----------
  function newCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function canvasToBlob(canvas, type = 'image/png', quality) {
    return new Promise(r => canvas.toBlob(r, type, quality));
  }

  // ---------- prefs: persistent settings via localStorage ----------
  // Usage:
  //   Prefs.bindForm('tool-id', ['fieldId1', 'fieldId2', ...])  -- two-way sync
  //   Prefs.get('tool-id.key', defaultValue) / Prefs.set(...)
  const PREFS_KEY = 'toolkit:prefs';
  function readPrefs() {
    try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); }
    catch { return {}; }
  }
  function writePrefs(obj) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(obj)); } catch {}
  }
  const Prefs = {
    get(key, defVal) {
      const all = readPrefs();
      return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), all) ?? defVal;
    },
    set(key, value) {
      const all = readPrefs();
      const parts = key.split('.');
      let cur = all;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!cur[parts[i]] || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
        cur = cur[parts[i]];
      }
      cur[parts[parts.length - 1]] = value;
      writePrefs(all);
    },
    // sync a list of input/select/textarea ids with localStorage under `toolId`
    bindForm(toolId, ids) {
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const saved = Prefs.get(`tools.${toolId}.${id}`);
        if (saved !== undefined) {
          if (el.type === 'checkbox') el.checked = saved;
          else el.value = saved;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        const handler = () => {
          const v = el.type === 'checkbox' ? el.checked : el.value;
          Prefs.set(`tools.${toolId}.${id}`, v);
        };
        el.addEventListener('change', handler);
        if (el.tagName === 'INPUT' && el.type !== 'checkbox') el.addEventListener('input', handler);
      }
    },
    // mark a tool as recently used (for landing page "recent" section)
    touchRecent(toolId) {
      if (!toolId || toolId === 'home') return;
      const recent = Prefs.get('recent', []) || [];
      const next = [toolId, ...recent.filter(x => x !== toolId)].slice(0, 6);
      Prefs.set('recent', next);
    }
  };

  // ---------- toast (non-blocking notifications) ----------
  function toast(msg, kind = 'info', duration = 3500) {
    let host = document.getElementById('__toast_host__');
    if (!host) {
      host = document.createElement('div');
      host.id = '__toast_host__';
      host.style.cssText = 'position:fixed; bottom:24px; right:24px; z-index:99999; display:flex; flex-direction:column; gap:8px; max-width:360px;';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    const colors = {
      info:    'background:rgba(20,20,26,0.92); border:1px solid rgba(var(--jade-rgb), 0.4); color:var(--text);',
      ok:      'background:rgba(20,20,26,0.92); border:1px solid var(--jade); color:var(--jade);',
      warn:    'background:rgba(20,20,26,0.92); border:1px solid var(--warning); color:var(--warning);',
      err:     'background:rgba(20,20,26,0.92); border:1px solid var(--danger); color:var(--danger);'
    };
    el.style.cssText = `padding:10px 14px; border-radius:8px; font-size:12px; line-height:1.45; backdrop-filter:blur(12px); box-shadow:0 10px 30px rgba(0,0,0,0.4); opacity:0; transform:translateY(8px); transition:opacity 0.2s, transform 0.2s; ${colors[kind] || colors.info}`;
    el.textContent = msg;
    host.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'translateY(0)'; });
    setTimeout(() => {
      el.style.opacity = '0'; el.style.transform = 'translateY(8px)';
      setTimeout(() => el.remove(), 240);
    }, duration);
  }

  // ---------- global error boundary ----------
  function installErrorBoundary() {
    window.addEventListener('error', (e) => {
      console.error('[uncaught]', e.error || e.message);
      toast(T('toast.unhandledError', { msg: e.error?.message || e.message }, 'Bad Dobby! 这步搞砸了: ' + (e.error?.message || e.message)), 'err', 6000);
    });
    window.addEventListener('unhandledrejection', (e) => {
      console.error('[unhandled rejection]', e.reason);
      toast(T('toast.promiseError', { msg: e.reason?.message || String(e.reason) }, 'Bad Dobby! Promise 出错了: ' + (e.reason?.message || String(e.reason))), 'err', 6000);
    });
  }

  // ---------- compare slider component (before/after) ----------
  // makeCompareSlider(host, leftEl, rightEl, {leftLabel, rightLabel})
  // leftEl/rightEl: HTMLCanvasElement or HTMLImageElement of equal size
  function makeCompareSlider(host, leftEl, rightEl, opts = {}) {
    host.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'compare-slider';
    // Determine display size from the right element (or left)
    const baseEl = rightEl || leftEl;
    const w = baseEl.width || baseEl.naturalWidth || 400;
    const h = baseEl.height || baseEl.naturalHeight || 300;
    wrap.style.width = Math.min(w, 800) + 'px';
    const frame = document.createElement('div');
    frame.className = 'frame';
    frame.style.aspectRatio = `${w} / ${h}`;
    // bottom = right (after); top = left (before, clipped)
    const rightClone = rightEl.cloneNode();
    if (rightEl instanceof HTMLCanvasElement) {
      rightClone.width = rightEl.width; rightClone.height = rightEl.height;
      rightClone.getContext('2d').drawImage(rightEl, 0, 0);
    } else { rightClone.src = rightEl.src; }
    rightClone.className = 'bottom';
    frame.appendChild(rightClone);
    const leftClone = leftEl.cloneNode();
    if (leftEl instanceof HTMLCanvasElement) {
      leftClone.width = leftEl.width; leftClone.height = leftEl.height;
      leftClone.getContext('2d').drawImage(leftEl, 0, 0);
    } else { leftClone.src = leftEl.src; }
    leftClone.className = 'top';
    frame.appendChild(leftClone);
    if (opts.leftLabel)  { const l = document.createElement('div'); l.className = 'label left';  l.textContent = opts.leftLabel;  frame.appendChild(l); }
    if (opts.rightLabel) { const l = document.createElement('div'); l.className = 'label right'; l.textContent = opts.rightLabel; frame.appendChild(l); }
    const handle = document.createElement('div');
    handle.className = 'handle';
    frame.appendChild(handle);
    wrap.appendChild(frame);
    host.appendChild(wrap);

    function setPos(pct) {
      pct = Math.max(0, Math.min(100, pct));
      leftClone.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
      handle.style.left = pct + '%';
    }
    setPos(50);

    let dragging = false;
    function onMove(e) {
      const r = frame.getBoundingClientRect();
      const x = (e.touches ? e.touches[0].clientX : e.clientX) - r.left;
      setPos(x / r.width * 100);
    }
    handle.addEventListener('mousedown', (e) => { dragging = true; e.preventDefault(); });
    frame.addEventListener('mousedown', (e) => { dragging = true; onMove(e); });
    document.addEventListener('mousemove', (e) => dragging && onMove(e));
    document.addEventListener('mouseup', () => { dragging = false; });
    frame.addEventListener('touchstart', (e) => { dragging = true; onMove(e); }, { passive: true });
    frame.addEventListener('touchmove', (e) => dragging && onMove(e), { passive: true });
    frame.addEventListener('touchend', () => { dragging = false; });
    return { setPos };
  }

  // ---------- handoff routing table ----------
  // accepts: which MIME types this tool accepts as input
  const HANDOFF_ACCEPTS = {
    'sprite-packer':   ['image/png','image/jpeg','image/gif','image/webp','video/*','application/zip'],
    'atlas-splitter':  ['image/png'],  // needs JSON too but handoff only carries one file
    'image-optimizer': ['image/png','image/jpeg','image/webp','image/gif','application/zip'],
    'png-crusher':     ['image/png','image/jpeg','image/webp','image/gif','application/zip'],
    'gif-tools':       ['image/png','image/jpeg','image/webp','image/gif','application/zip'],
    'lottie-tools':    ['application/json'],
    'image-editor':    ['image/png','image/jpeg','image/webp','image/gif'],
    'color-tools':     ['image/png','image/jpeg','image/webp','image/gif','application/zip'],
    'ai-cutout':       ['image/png','image/jpeg','image/webp','image/gif','application/zip'],
    'watermark-remove':['image/png','image/jpeg','image/webp','image/gif'],
    'video-toolkit':   ['video/*','image/png','image/jpeg','image/webp','application/zip'],
    'composer':        ['image/png','image/jpeg','image/webp','image/gif','application/zip'],
    'image-diff':      ['image/png','image/jpeg','image/webp','image/gif'],
    'svg-tools':       ['image/svg+xml'],
    'html-inliner':    [],  // requires directory picker, can't handoff
    'base64':          ['*/*'],  // accepts anything
    'zip-packer':      ['*/*'],  // accepts anything
    'qr-gen':          [],
    'font-subset':     ['font/ttf','font/otf','application/octet-stream'],
    'batch-rename':    ['*/*'],
    'audio-compress':  ['audio/*'],
    'bundle-analyzer': [],
    'channel-check':   ['text/html'],
    'code-minify':     ['text/css','application/javascript','text/html'],
    'slim-coach':      [],
    'playable-slim':   ['text/html', 'application/zip']
  };

  // Tools to suggest as next step given output MIME type
  function findTargetsFor(mime) {
    const matches = [];
    for (const [toolId, accepts] of Object.entries(HANDOFF_ACCEPTS)) {
      for (const acc of accepts) {
        if (acc === '*/*') { matches.push(toolId); break; }
        if (acc.endsWith('/*')) {
          if (mime.startsWith(acc.slice(0, -1))) { matches.push(toolId); break; }
        } else if (acc === mime) {
          matches.push(toolId);
          break;
        }
      }
    }
    return matches;
  }

  // Setup handoff for a tool page:
  //   - injects a "📤 发送到..." dropdown into the sidebar
  //   - the dropdown shows only compatible target tools (based on outputType)
  //   - returns a controller { setBlob(blob, fileName, mimeOverride) } to update output
  //   - also auto-consumes incoming handoff: if sessionStorage has data targeting this tool,
  //     it dispatches a 'drop' event on #dropZone (or calls opts.onIncoming).
  // Returns the controller SYNCHRONOUSLY (so callers can write
  //   const handoff = Toolkit.setupHandoff(...)
  // without awaiting). Incoming handoff consumption is fire-and-forget.
  function setupHandoff(toolId, opts = {}) {
    // 1. consume incoming handoff in the background — does not block return.
    // Flow: peek IDB (don't delete); if pending, show 3s countdown toast on
    // this (target) page. 撤回 → history.back() + delete IDB. Timer fire →
    // read+delete IDB, set sessionStorage source marker (so the back pill
    // appears AFTER delivery, not during the countdown), then dispatch.
    (async () => {
      const peeked = await peekHandoff(toolId);
      if (!peeked) return;
      showIncomingHandoffToast(peeked, async (cancelled) => {
        if (cancelled) {
          try { await idbDelete(HANDOFF_KEY); } catch {}
          // navigate back to source: history.back() is the natural undo of the
          // forward navigation sendTo did. Fall back to sourceUrl if history
          // is empty (e.g., target opened in a fresh tab).
          if (history.length > 1) history.back();
          else if (peeked.sourceUrl) location.replace(peeked.sourceUrl);
          return;
        }
        const incoming = await consumeHandoff(toolId);
        if (!incoming) return;
        try {
          sessionStorage.setItem('toolkit-handoff-from', JSON.stringify({
            toolId: peeked.sourceToolId,
            toolName: peeked.sourceToolName || '上一个工具',
            url: peeked.sourceUrl,
            ts: Date.now(),
          }));
        } catch (_) {}
        maybeShowBackPill();
        let toDeliver = [incoming];
        if (/\.zip$/i.test(incoming.name) || incoming.type === 'application/zip') {
          try {
            const extracted = await unzipBlob(incoming);
            if (extracted.length) {
              toDeliver = extracted;
              toast(T('toast.handoffZip', { n: extracted.length }, `🧦 Dobby 顺手拆了 ZIP · ${extracted.length} 个文件`), 'ok', 4500);
            }
          } catch (e) {
            toast('ZIP 解压失败,尝试整体处理: ' + e.message, 'warn', 4500);
          }
        } else {
          toast(T('toast.handoffReceived', { name: incoming.name }, `🧦 Dobby 把 ${incoming.name} 带过来了`), 'ok', 4500);
        }
        const handler = opts.onIncoming || ((filesOrFile) => {
          // Look for the well-known #dropZone first; if a tool uses a custom id,
          // fall back to any element with the .drop-zone class so files at least
          // reach SOMETHING rather than disappearing silently.
          const dz = document.getElementById('dropZone') || document.querySelector('.drop-zone');
          if (!dz) {
            toast(`收到 ${Array.isArray(filesOrFile) ? filesOrFile.length + ' 个' : ''}文件,但找不到拖入区`, 'warn', 5000);
            return;
          }
          const dt = new DataTransfer();
          const arr = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
          arr.forEach(f => dt.items.add(f));
          dz.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        });
        handler(toDeliver);
      });
    })();

    // 2. inject the dropdown UI (skip for tools that don't produce sendable output)
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar || !opts.outputType) return null;

    const wrap = document.createElement('div');
    wrap.className = 'handoff-wrap';
    wrap.innerHTML = `
      <button class="handoff-btn secondary" id="__handoffBtn__" data-i18n="handoff.btn" disabled>${T('handoff.btn', '📤 让 Dobby 送到下一个工具 ▾')}</button>
      <div class="handoff-menu" id="__handoffMenu__"></div>
    `;
    sidebar.appendChild(wrap);

    let currentBlob = null;
    let currentName = null;
    let currentMime = opts.outputType;

    const btn = wrap.querySelector('#__handoffBtn__');
    const menu = wrap.querySelector('#__handoffMenu__');

    function refresh() {
      menu.innerHTML = '';
      const mime = currentMime || opts.outputType;
      const targets = findTargetsFor(mime).filter(id => id !== toolId);
      if (!targets.length) { btn.disabled = true; return; }
      btn.disabled = !currentBlob;
      for (const tid of targets) {
        const tool = TOOLS.find(t => t.id === tid);
        if (!tool) continue;
        const item = document.createElement('a');
        item.className = 'handoff-item';
        item.href = '#';
        item.innerHTML = `<span class="icon">${tool.icon}</span><span class="name">${tool.name}</span><span class="en">${tool.en}</span>`;
        item.addEventListener('click', async (e) => {
          e.preventDefault();
          if (!currentBlob) return;
          menu.classList.remove('open');
          try {
            await sendTo(tid, currentBlob, currentName || ('output.' + mimeExtFor(currentMime)));
          } catch (e) {
            // toast already shown inside sendTo on failure
          }
        });
        menu.appendChild(item);
      }
    }

    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      menu.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) menu.classList.remove('open');
    });

    refresh();

    return {
      setBlob(blob, fileName, mimeOverride) {
        currentBlob = blob;
        currentName = fileName;
        if (mimeOverride) currentMime = mimeOverride;
        refresh();
      },
      clear() {
        currentBlob = null;
        currentName = null;
        refresh();
      }
    };
  }

  function mimeExtFor(mime) {
    const map = {
      'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
      'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm',
      'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/webm': 'webm',
      'font/ttf': 'ttf', 'application/json': 'json', 'text/html': 'html',
      'text/css': 'css', 'application/javascript': 'js'
    };
    return map[mime] || 'bin';
  }

  // ---------- color widget: HSV picker popup + screen EyeDropper ----------
  // Click swatch  → opens HSV color picker (saturation/value square + hue bar + hex/RGB inputs)
  // Click 🎨 btn → opens screen-level EyeDropper API (Chrome 95+)
  // Auto-attached to any hex-color text input. Idempotent.
  function attachEyeDropper(input) {
    if (input.__eyedropperAttached) return;
    if (input.tagName !== 'INPUT') return;
    if (input.type !== 'text' && input.type !== 'color') return;
    input.__eyedropperAttached = true;

    const wrap = document.createElement('div');
    wrap.className = 'eyedropper-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    // clickable swatch → opens HSV picker
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'eyedropper-swatch';
    swatch.title = '点击打开色盘';
    const updateSwatch = () => {
      const v = (input.value || '').trim();
      swatch.style.background = v || 'transparent';
    };
    updateSwatch();
    input.addEventListener('input', updateSwatch);
    input.addEventListener('change', updateSwatch);
    swatch.addEventListener('click', (e) => {
      e.preventDefault();
      openColorPicker(input, swatch);
    });
    wrap.appendChild(swatch);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'eyedropper-btn';
    btn.title = '吸色管(取屏幕任意像素,Chrome 95+)';
    btn.innerHTML = '🎨';
    btn.addEventListener('click', async () => {
      if (!('EyeDropper' in window)) {
        toast(T('toast.eyedropper.unsupported', 'Bad Dobby! 这个浏览器不让 Dobby 吸色,请用 Chrome 95+ / Edge 95+'), 'warn', 4500);
        return;
      }
      try {
        const ed = new EyeDropper();
        const r = await ed.open();
        input.value = r.sRGBHex;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        updateSwatch();
        toast(T('toast.eyedropper.got', { color: r.sRGBHex }, `🧦 Dobby 吸到了 ${r.sRGBHex}`), 'ok', 2500);
      } catch (e) {
        // user cancelled / Esc — silent
      }
    });
    wrap.appendChild(btn);
  }

  // ---------- HSV color picker popup ----------
  let activePicker = null;
  function closeColorPicker() {
    if (!activePicker) return;
    activePicker.dispose();
    activePicker = null;
  }
  function hsvToRgb(h, s, v) {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    v = Math.max(0, Math.min(1, v));
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
    }
    h = (h * 60 + 360) % 360;
    const s = max === 0 ? 0 : d / max;
    return [h, s, max];
  }
  function parseHexColor(str) {
    const m = String(str || '').trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
    if (!m) return null;
    let hex = m[1];
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  function rgbToHex(r, g, b) {
    const h = n => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return ('#' + h(r) + h(g) + h(b)).toUpperCase();
  }
  function openColorPicker(input, anchor) {
    closeColorPicker();
    const pop = document.createElement('div');
    pop.className = 'color-picker-pop';
    pop.innerHTML = `
      <div class="cp-sv"><div class="cp-sv-marker"></div></div>
      <div class="cp-hue"><div class="cp-hue-marker"></div></div>
      <div class="cp-row">
        <span class="cp-preview"></span>
        <input class="cp-hex" type="text" maxlength="7" spellcheck="false" />
      </div>
      <div class="cp-rgb">
        <label>R<input type="number" min="0" max="255" data-c="r" /></label>
        <label>G<input type="number" min="0" max="255" data-c="g" /></label>
        <label>B<input type="number" min="0" max="255" data-c="b" /></label>
      </div>
    `;
    document.body.appendChild(pop);

    // position below anchor, clamp to viewport
    const ar = anchor.getBoundingClientRect();
    const popW = 220, popH = pop.offsetHeight || 260;
    let left = ar.left;
    let top = ar.bottom + 6;
    if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
    if (top + popH > window.innerHeight - 8) top = ar.top - popH - 6;
    pop.style.left = Math.max(8, left) + 'px';
    pop.style.top = Math.max(8, top) + 'px';

    const sv = pop.querySelector('.cp-sv');
    const svMarker = pop.querySelector('.cp-sv-marker');
    const hue = pop.querySelector('.cp-hue');
    const hueMarker = pop.querySelector('.cp-hue-marker');
    const preview = pop.querySelector('.cp-preview');
    const hexInput = pop.querySelector('.cp-hex');
    const rInput = pop.querySelector('input[data-c="r"]');
    const gInput = pop.querySelector('input[data-c="g"]');
    const bInput = pop.querySelector('input[data-c="b"]');

    let h = 0, s = 1, v = 1;
    const initRgb = parseHexColor(input.value) || [255, 0, 0];
    [h, s, v] = rgbToHsv(...initRgb);

    function render(writeBack = true) {
      sv.style.background =
        `linear-gradient(to top, #000, transparent),` +
        `linear-gradient(to right, #fff, transparent),` +
        `hsl(${h}, 100%, 50%)`;
      const svRect = sv.getBoundingClientRect();
      svMarker.style.left = (s * svRect.width) + 'px';
      svMarker.style.top = ((1 - v) * svRect.height) + 'px';
      hueMarker.style.left = (h / 360 * hue.getBoundingClientRect().width) + 'px';
      const [r, g, b] = hsvToRgb(h, s, v);
      const hex = rgbToHex(r, g, b);
      preview.style.background = hex;
      if (document.activeElement !== hexInput) hexInput.value = hex;
      if (document.activeElement !== rInput) rInput.value = r;
      if (document.activeElement !== gInput) gInput.value = g;
      if (document.activeElement !== bInput) bInput.value = b;
      if (writeBack) {
        input.value = hex;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    render(false);

    function makeDrag(el, onMove) {
      const handler = (e) => {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const move = (ev) => {
          const cx = (ev.touches ? ev.touches[0].clientX : ev.clientX) - r.left;
          const cy = (ev.touches ? ev.touches[0].clientY : ev.clientY) - r.top;
          onMove(Math.max(0, Math.min(r.width, cx)) / r.width, Math.max(0, Math.min(r.height, cy)) / r.height);
        };
        move(e);
        const up = () => {
          document.removeEventListener('mousemove', move);
          document.removeEventListener('mouseup', up);
          document.removeEventListener('touchmove', move);
          document.removeEventListener('touchend', up);
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        document.addEventListener('touchmove', move, { passive: false });
        document.addEventListener('touchend', up);
      };
      el.addEventListener('mousedown', handler);
      el.addEventListener('touchstart', handler, { passive: false });
    }
    makeDrag(sv, (x, y) => { s = x; v = 1 - y; render(); });
    makeDrag(hue, (x) => { h = x * 360; render(); });

    hexInput.addEventListener('input', () => {
      const rgb = parseHexColor(hexInput.value);
      if (!rgb) return;
      const [nh, ns, nv] = rgbToHsv(...rgb);
      // keep current h if input has only altered saturation/value (avoid hue jitter on grayscale)
      if (!(rgb[0] === rgb[1] && rgb[1] === rgb[2])) h = nh;
      s = ns; v = nv;
      render();
    });
    const onRgb = () => {
      const r = +rInput.value || 0, g = +gInput.value || 0, b = +bInput.value || 0;
      const [nh, ns, nv] = rgbToHsv(r, g, b);
      if (!(r === g && g === b)) h = nh;
      s = ns; v = nv;
      render();
    };
    rInput.addEventListener('input', onRgb);
    gInput.addEventListener('input', onRgb);
    bInput.addEventListener('input', onRgb);

    function onOutside(e) {
      if (pop.contains(e.target) || anchor.contains(e.target)) return;
      closeColorPicker();
    }
    function onKey(e) { if (e.key === 'Escape') closeColorPicker(); }
    setTimeout(() => {
      document.addEventListener('mousedown', onOutside, true);
      document.addEventListener('keydown', onKey);
    }, 0);

    activePicker = {
      pop,
      dispose: () => {
        document.removeEventListener('mousedown', onOutside, true);
        document.removeEventListener('keydown', onKey);
        pop.remove();
      }
    };
  }
  function isLikelyColorInput(input) {
    if (input.__eyedropperAttached) return false;
    if (input.tagName !== 'INPUT' || input.type !== 'text') return false;
    const id = (input.id || '') + ' ' + (input.name || '') + ' ' + (input.placeholder || '');
    if (/color|colour|颜色|背景色|前景|描边色/i.test(id)) return true;
    const v = (input.value || '').trim();
    if (/^#[0-9a-f]{3,8}$/i.test(v)) return true;
    if (/^rgba?\s*\(/i.test(v)) return true;
    return false;
  }
  function autoAttachEyeDroppers(root) {
    (root || document).querySelectorAll('input[type=text]').forEach(inp => {
      if (isLikelyColorInput(inp)) attachEyeDropper(inp);
    });
  }
  function watchForColorInputs() {
    autoAttachEyeDroppers();
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        for (const n of m.addedNodes) {
          if (n.nodeType === 1) autoAttachEyeDroppers(n);
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ---------- minimal ZIP reader (STORE + deflate) ----------
  // Used by handoff to auto-expand a ZIP into multiple Files for the target tool.
  async function unzipBlob(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    const files = [];
    let p = 0;
    const dec = new TextDecoder('utf-8');
    while (p < buf.length - 4) {
      const sig = buf[p] | (buf[p+1] << 8) | (buf[p+2] << 16) | (buf[p+3] << 24);
      if (sig !== 0x04034b50) break;  // stop at central directory
      const method = buf[p+8] | (buf[p+9] << 8);
      const compSize = (buf[p+18] | (buf[p+19]<<8) | (buf[p+20]<<16) | (buf[p+21]<<24)) >>> 0;
      const nameLen = buf[p+26] | (buf[p+27] << 8);
      const extraLen = buf[p+28] | (buf[p+29] << 8);
      const nameStart = p + 30;
      const name = dec.decode(buf.slice(nameStart, nameStart + nameLen));
      const dataStart = nameStart + nameLen + extraLen;
      const data = buf.slice(dataStart, dataStart + compSize);
      let raw;
      if (method === 0) {
        raw = data;
      } else if (method === 8) {
        const cs = new DecompressionStream('deflate-raw');
        const w = cs.writable.getWriter();
        w.write(data); w.close();
        raw = new Uint8Array(await new Response(cs.readable).arrayBuffer());
      } else {
        throw new Error('unsupported zip method: ' + method);
      }
      const extMatch = name.match(/\.[^./]+$/);
      const ext = extMatch ? extMatch[0].toLowerCase() : '';
      const mime = ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.json':'application/json','.txt':'text/plain'})[ext] || 'application/octet-stream';
      files.push(new File([raw], name, { type: mime }));
      p = dataStart + compSize;
    }
    return files;
  }

  // ---------- cross-tool handoff (via IndexedDB — handles large blobs that sessionStorage can't) ----------
  const HANDOFF_KEY = 'toolkit:handoff';
  const IDB_DB = 'toolkit';
  const IDB_STORE = 'handoff';

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function idbPut(key, value) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async function idbGet(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }
  async function idbDelete(key) {
    const db = await idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  // Pure relative path: build it based on whether we're already in /tools/ subfolder.
  function toolUrl(toolId) {
    const inSubdir = window.location.pathname.includes('/tools/');
    const prefix = inSubdir ? './' : './tools/';
    return prefix + toolId + '.html';
  }

  async function sendTo(toolId, blob, fileName) {
    const srcTool = TOOLS.find(t => location.pathname.endsWith(t.href.replace(/^.*\//, '')));
    try {
      await idbPut(HANDOFF_KEY, {
        toolId,
        fileName: fileName || 'handoff',
        blob,  // IndexedDB can store Blob directly — no dataURL encoding!
        ts: Date.now(),
        // Source info travels with the blob so the target page's countdown
        // toast can render "from X" copy and 撤回 knows where to navigate back.
        sourceUrl: location.href,
        sourceToolId: srcTool?.id || null,
        sourceToolName: srcTool ? `${srcTool.icon} ${srcTool.name}` : '上一个工具',
      });
    } catch (e) {
      toast('IndexedDB 写入失败: ' + e.message, 'err', 6000);
      throw e;
    }
    // Navigate to the target immediately. The 3s undo window is shown on
    // the target page (so the user sees the destination tool right away
    // instead of staring at the source for 3 seconds). The sessionStorage
    // back-pill marker is also deferred to the target's delivery moment.
    location.href = toolUrl(toolId);
  }

  // shows a bottom-center toast with a 3-second progress bar on the TARGET
  // page after navigation. Calls onDone(true) if 撤回 clicked, onDone(false)
  // when the countdown completes and the handoff should commit.
  let __pendingHandoffTimer = null;
  function showIncomingHandoffToast(peeked, onDone) {
    const sourceLabel = peeked.sourceToolName || '上一个工具';
    const DURATION = 3000;
    // remove any prior toast AND cancel its pending timer — otherwise a
    // rapid second pending handoff would race with this one.
    document.getElementById('__handoffUndoToast__')?.remove();
    if (__pendingHandoffTimer) { clearTimeout(__pendingHandoffTimer); __pendingHandoffTimer = null; }
    const t = document.createElement('div');
    t.id = '__handoffUndoToast__';
    t.className = 'handoff-undo-toast';
    t.innerHTML = `
      <div class="hut-row">
        <span class="hut-msg">📥 即将从 <strong>${sourceLabel}</strong> 接收</span>
        <button type="button" class="hut-cancel">撤回</button>
      </div>
      <div class="hut-bar"><div class="hut-bar-fill"></div></div>
    `;
    document.body.appendChild(t);
    const fill = t.querySelector('.hut-bar-fill');
    requestAnimationFrame(() => {
      fill.style.transition = `width ${DURATION}ms linear`;
      fill.style.width = '0%';
    });
    t.querySelector('.hut-cancel').addEventListener('click', () => {
      if (__pendingHandoffTimer) { clearTimeout(__pendingHandoffTimer); __pendingHandoffTimer = null; }
      t.classList.add('hut-cancelled');
      setTimeout(() => t.remove(), 250);
      onDone(true);
    });
    __pendingHandoffTimer = setTimeout(() => {
      __pendingHandoffTimer = null;
      t.remove();
      onDone(false);
    }, DURATION);
  }

  // How long an IDB-stashed handoff stays consumable. Anything older is treated as
  // abandoned (tab closed mid-undo, navigation interrupted, etc.) and dropped on read
  // so the next visit doesn't auto-consume hours-old data.
  const HANDOFF_TTL_MS = 5 * 60 * 1000;

  // Read a pending handoff for this tool WITHOUT removing it. Returns null if
  // missing, stale (auto-cleaned), or targeted at a different tool.
  async function peekHandoff(toolId) {
    let data;
    try { data = await idbGet(HANDOFF_KEY); } catch { return null; }
    if (!data) return null;
    if (typeof data.ts === 'number' && Date.now() - data.ts > HANDOFF_TTL_MS) {
      try { await idbDelete(HANDOFF_KEY); } catch {}
      return null;
    }
    if (data.toolId !== toolId) return null;
    return data;
  }

  // Read+delete a pending handoff for this tool. Returns a File or null.
  async function consumeHandoff(toolId) {
    const data = await peekHandoff(toolId);
    if (!data) return null;
    try { await idbDelete(HANDOFF_KEY); } catch {}
    const blob = data.blob;
    if (!blob) return null;
    return new File([blob], data.fileName, { type: blob.type || 'application/octet-stream' });
  }

  // ---------- paste image from clipboard (Ctrl+V) ----------
  // Returns a Promise<File|null>. Listens once for paste event.
  function attachPasteImage(onImageFile) {
    document.addEventListener('paste', (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.type.startsWith('image/')) {
          const blob = it.getAsFile();
          if (blob) onImageFile(blob);
          return;
        }
      }
    });
  }

  // ---------- demo data: synthetic images / audio for users without sample files ----------
  function demoSpritesheet(frameCount = 8, frameSize = 80) {
    const cols = Math.ceil(Math.sqrt(frameCount));
    const rows = Math.ceil(frameCount / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * frameSize; cv.height = rows * frameSize;
    const ctx = cv.getContext('2d');
    for (let i = 0; i < frameCount; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const x = c * frameSize, y = r * frameSize;
      ctx.fillStyle = `hsl(${i * (360/frameCount)}, 70%, 55%)`;
      ctx.beginPath();
      ctx.arc(x + frameSize/2, y + frameSize/2, frameSize * 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = `bold ${frameSize * 0.3}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x + frameSize/2, y + frameSize/2);
    }
    return new Promise(r => cv.toBlob(r, 'image/png'));
  }

  async function demoFrames(count = 8, size = 80) {
    const blobs = [];
    for (let i = 0; i < count; i++) {
      const cv = document.createElement('canvas');
      cv.width = size; cv.height = size;
      const ctx = cv.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = `hsl(${i * (360/count)}, 70%, 55%)`;
      ctx.beginPath();
      ctx.arc(size/2, size/2, size * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${size * 0.3}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), size/2, size/2);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      blobs.push(new File([blob], `demo_frame_${String(i).padStart(3, '0')}.png`, { type: 'image/png' }));
    }
    return blobs;
  }

  async function demoPhotoLike() {
    const cv = document.createElement('canvas');
    cv.width = 480; cv.height = 320;
    const ctx = cv.getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 480, 320);
    grad.addColorStop(0, '#2c3e50'); grad.addColorStop(1, '#3498db');
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 480, 320);
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `hsla(${Math.random()*360}, 70%, 65%, ${Math.random()*0.5+0.3})`;
      ctx.beginPath();
      ctx.arc(Math.random()*480, Math.random()*320, Math.random()*40+10, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 38px sans-serif';
    ctx.fillText('Demo Image', 130, 175);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
    return new File([blob], 'demo.png', { type: 'image/png' });
  }

  // ---------- ESM dynamic import with timeout + nice error ----------
  async function importWithTimeout(url, label = url, timeoutMs = 15000) {
    return Promise.race([
      import(/* @vite-ignore */ url).catch(err => {
        toast(`${label} 加载失败: ${err.message}\n可能是 CDN 暂时不可用,稍后重试`, 'err', 8000);
        throw err;
      }),
      new Promise((_, reject) => setTimeout(() => {
        toast(`${label} 加载超时 (>${timeoutMs/1000}s),检查网络或换 CDN`, 'err', 8000);
        reject(new Error(`${label} 加载超时`));
      }, timeoutMs))
    ]);
  }

  // ---------- format size ----------
  function fmtBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  // ---------- minimal ZIP writer (STORE only — fine for PNGs which are already compressed) ----------
  // files: [{ name: string, data: Uint8Array }]
  function makeZip(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const centralEntries = [];
    let offset = 0;
    const now = new Date();
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);

    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const crc = crc32(f.data);
      const size = f.data.length;

      // local file header
      const lh = new Uint8Array(30 + nameBytes.length);
      const dv = new DataView(lh.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0, true);
      dv.setUint16(8, 0, true);  // method = store
      dv.setUint16(10, dosTime, true);
      dv.setUint16(12, dosDate, true);
      dv.setUint32(14, crc, true);
      dv.setUint32(18, size, true);
      dv.setUint32(22, size, true);
      dv.setUint16(26, nameBytes.length, true);
      dv.setUint16(28, 0, true);
      lh.set(nameBytes, 30);
      chunks.push(lh, f.data);

      // central directory entry
      const cd = new Uint8Array(46 + nameBytes.length);
      const cdv = new DataView(cd.buffer);
      cdv.setUint32(0, 0x02014b50, true);
      cdv.setUint16(4, 20, true);
      cdv.setUint16(6, 20, true);
      cdv.setUint16(8, 0, true);
      cdv.setUint16(10, 0, true);
      cdv.setUint16(12, dosTime, true);
      cdv.setUint16(14, dosDate, true);
      cdv.setUint32(16, crc, true);
      cdv.setUint32(20, size, true);
      cdv.setUint32(24, size, true);
      cdv.setUint16(28, nameBytes.length, true);
      cdv.setUint32(42, offset, true);
      cd.set(nameBytes, 46);
      centralEntries.push(cd);

      offset += lh.length + f.data.length;
    }

    const cdStart = offset;
    let cdSize = 0;
    for (const c of centralEntries) { chunks.push(c); cdSize += c.length; }

    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, cdStart, true);
    chunks.push(eocd);

    return new Blob(chunks, { type: 'application/zip' });
  }

  function crc32(data) {
    let table = crc32._t;
    if (!table) {
      table = crc32._t = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c;
      }
    }
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ table[(crc ^ data[i]) & 0xFF];
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  window.Toolkit = {
    TOOLS,
    injectTopbar,
    $,
    injectInstructions,
    makeLogger,
    makeProgress,
    attachDropZone,
    naturalSort,
    download,
    downloadText,
    downloadJson,
    newCanvas,
    canvasToBlob,
    fmtBytes,
    makeZip,
    Prefs,
    toast,
    installErrorBoundary,
    importWithTimeout,
    makeCompareSlider,
    sendTo,
    consumeHandoff,
    peekHandoff,
    setupHandoff,
    findTargetsFor,
    unzipBlob,
    attachEyeDropper,
    autoAttachEyeDroppers,
    attachPasteImage,
    demoSpritesheet,
    demoFrames,
    demoPhotoLike,
    // i18n
    T,
    setLang,
    getLang,
    applyTranslations
  };
})();
