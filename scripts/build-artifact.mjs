/**
 * 把 dist/index.html 转成可以在 Claude 里打开的 Artifact 页面。
 * 用法：npm run build && node scripts/build-artifact.mjs <输出目录>
 *
 * Artifact 页面的规则：不写 <!doctype>/<html>/<head>/<body>（发布时自动加），<title> 放在最前面；
 * 页面不弹 alert/confirm/prompt，所以这里加一个小垫片：
 *   - alert → 页面底部的提示条
 *   - confirm → 直接确认（删除某天、采用旧方案前 App 都会自动存档，可在「方案」里找回）
 *   - prompt → 使用默认值
 * 随页面发布 route-cache.json（预算好的真实路线），因为 Artifact 里不能访问外部路线服务。
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('usage: node scripts/build-artifact.mjs <outDir>');
mkdirSync(out, { recursive: true });

const html = readFileSync('dist/index.html', 'utf8');
const head = html.slice(html.indexOf('<head>') + 6, html.indexOf('</head>'));
const body = html.slice(html.indexOf('<body>') + 6, html.lastIndexOf('</body>'));
const title = /<title>[\s\S]*?<\/title>/.exec(head)[0];
const rest = head
  .replace(title, '')
  .replace(/<meta charset[^>]*>/i, '')
  .replace(/<meta name="viewport"[^>]*>/i, '');

const shim = `<script>
(function () {
  function toast(msg) {
    var el = document.createElement('div');
    el.setAttribute('role', 'status');
    el.textContent = String(msg);
    el.style.cssText = 'position:fixed;left:16px;right:16px;bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:2000;' +
      'padding:10px 14px;border-radius:10px;background:var(--ink,#14262b);color:var(--paper,#eef2ef);font:14px/1.5 system-ui,sans-serif;' +
      'box-shadow:0 4px 16px rgba(0,0,0,.25)';
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 4500);
  }
  window.alert = toast;
  window.confirm = function () { return true; };
  window.prompt = function (_msg, def) { return def == null ? '' : String(def); };
})();
</script>`;

// 发布工具不接受字面的 U+FFFD（替换字符）；它只出现在库代码的 JS 字符串里，换成等价的转义写法
const page = `${title}\n${shim}\n${rest.trim()}\n${body.trim()}\n`.replaceAll('\uFFFD', '\\uFFFD');
writeFileSync(join(out, 'index.html'), page);
copyFileSync('public/route-cache.json', join(out, 'route-cache.json'));
console.log('artifact written to', out);
