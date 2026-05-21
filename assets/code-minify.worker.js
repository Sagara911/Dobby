// code-minify worker — keeps terser (and any heavy regex passes) off the main thread.
// Handles JS / CSS / HTML, including inline <script> blocks inside HTML.
// Loaded as a module worker:  new Worker(url, { type: 'module' })

let terserMod = null;

async function loadTerser(post) {
  if (terserMod) return;
  post({ type: 'progress', msg: '加载 terser (首次联网)...' });
  terserMod = await import('https://esm.sh/terser@5.36.0');
}

function minifyCss(src, opts) {
  let out = src;
  if (opts.removeComments) out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  if (opts.collapseSpace) {
    out = out.replace(/\s+/g, ' ');
    out = out.replace(/\s*([{}:;,>+~])\s*/g, '$1');
    out = out.replace(/;}/g, '}');
  }
  if (opts.shortenHex) {
    out = out.replace(/#([0-9a-f])\1([0-9a-f])\2([0-9a-f])\3\b/gi, '#$1$2$3');
  }
  return out.trim();
}

async function minifyJs(src, opts) {
  await loadTerser(self.postMessage.bind(self));
  const result = await terserMod.minify(src, {
    compress: opts.compress ? { passes: 2, drop_console: false } : false,
    mangle: !!opts.mangle,
    format: { comments: false }
  });
  if (result.error) throw new Error('Terser: ' + result.error.message);
  return result.code;
}

async function minifyHtml(src, opts, post) {
  let out = src;
  const placeholders = [];
  const preserve = (str) => { placeholders.push(str); return `__PRESERVED_${placeholders.length - 1}__`; };

  // 1. fully preserve <pre> / <textarea>
  out = out.replace(/<(pre|textarea)\b[^>]*>[\s\S]*?<\/\1>/gi, preserve);

  // 2. inline <style>
  {
    const blocks = [...out.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)];
    for (const m of blocks) {
      const body = m[1];
      const newBody = opts.minifyInline ? minifyCss(body, { removeComments: true, collapseSpace: true, shortenHex: true }) : body;
      const tag = m[0].replace(body, newBody);
      out = out.replace(m[0], preserve(tag));
    }
  }

  // 3. inline <script>
  if (opts.minifyInline) {
    await loadTerser(post);
    const scripts = [...out.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    for (const m of scripts) {
      const fullMatch = m[0], attrs = m[1], body = m[2];
      if (!body.trim() || /\bsrc\s*=/.test(attrs)) {
        out = out.replace(fullMatch, preserve(fullMatch));
        continue;
      }
      const typeMatch = attrs.match(/\btype\s*=\s*['"]?([^'"\s>]+)/i);
      const stype = typeMatch ? typeMatch[1].toLowerCase() : '';
      const isJs = !stype || /javascript|module|^text\/javascript$|^application\/javascript$/.test(stype);
      if (!isJs) {
        out = out.replace(fullMatch, preserve(fullMatch));
        continue;
      }
      let minBody;
      try {
        const result = await terserMod.minify(body, {
          compress: { passes: 2, drop_console: false },
          mangle: true,
          format: { comments: false }
        });
        if (result.error) throw result.error;
        minBody = result.code;
      } catch (err) {
        post({ type: 'warn', msg: `inline <script> 压缩失败,保留原样: ${err.message}` });
        minBody = body;
      }
      out = out.replace(fullMatch, preserve(`<script${attrs}>${minBody}<\/script>`));
    }
  } else {
    out = out.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, preserve);
  }

  if (opts.removeComments) {
    out = out.replace(/<!--(?!\[if)[\s\S]*?-->/g, '');
  }
  if (opts.collapseSpace) {
    out = out.replace(/>\s+</g, '><');
    out = out.replace(/\s{2,}/g, ' ');
  }
  out = out.replace(/__PRESERVED_(\d+)__/g, (_, i) => placeholders[+i]);
  return out.trim();
}

self.addEventListener('message', async (e) => {
  const { id, lang, src, options } = e.data;
  const post = (msg) => self.postMessage({ id, ...msg });
  try {
    let code;
    if (lang === 'css') code = minifyCss(src, options);
    else if (lang === 'js')  code = await minifyJs(src, options);
    else if (lang === 'html') code = await minifyHtml(src, options, post);
    else throw new Error('Unknown lang: ' + lang);
    self.postMessage({ id, type: 'done', code });
  } catch (err) {
    self.postMessage({ id, type: 'error', error: err.message || String(err) });
  }
});
