// 构建后整站加密：把 dist 里所有 HTML 用 SITE_PASS 做 AES-256-GCM 加密，
// 访客打开看到密码门，输对密码后浏览器本地解密渲染。
// - SITE_PASS 未设置时跳过加密（本地预览不受影响）
// - 输对一次记住 7 天（localStorage），解锁后页面右下角有「退出」按钮可清除记忆
// - 密码不出现在任何产物里，抓到的只有密文
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { pbkdf2Sync, createCipheriv, randomBytes } from 'node:crypto';

const DIST = new URL('../dist', import.meta.url).pathname;
const PASS = process.env.SITE_PASS;
const ITER = 120000;
const REMEMBER_DAYS = 7;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (extname(name) === '.html') out.push(p);
  }
  return out;
}

function encryptHtml(html, pass) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = pbkdf2Sync(pass, salt, ITER, 32, 'sha256');
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(html, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag(); // WebCrypto 解密时从密文末尾读取 16B tag
  return {
    d: Buffer.concat([enc, tag]).toString('base64'),
    s: salt.toString('base64'),
    i: iv.toString('base64'),
  };
}

const lockShell = (payload) => `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>心屿 · 私人小岛</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    font-family: ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #f6f7fb; color: #1f2937;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #101418; color: #e5e7eb; }
    .card { background: #1a2027 !important; border-color: #2a323c !important; }
    .hint { color: #6b7280 !important; }
    input { background: #10161c !important; border-color: #2a323c !important; color: #e5e7eb !important; }
  }
  .card {
    width: min(340px, 88vw); padding: 36px 30px; text-align: center;
    background: #fff; border: 1px solid #e5e7eb; border-radius: 16px;
    box-shadow: 0 10px 30px rgba(0,0,0,.08);
  }
  .emoji { font-size: 34px; }
  h1 { font-size: 17px; margin: 12px 0 4px; letter-spacing: .05em; }
  .hint { font-size: 12.5px; color: #9ca3af; margin: 0 0 22px; }
  input {
    width: 100%; padding: 11px 14px; font-size: 14px; border-radius: 10px;
    border: 1px solid #d1d5db; background: #fff; color: inherit; outline: none;
  }
  input:focus { border-color: #4f8cff; }
  button {
    margin-top: 14px; width: 100%; padding: 11px 0; font-size: 14px; font-weight: 600;
    color: #fff; background: #4f8cff; border: 0; border-radius: 10px; cursor: pointer;
  }
  button:hover { background: #3d7bf0; }
  .err { display: none; margin-top: 12px; font-size: 12.5px; color: #e5484d; }
  .island { margin-top: 26px; font-size: 11px; color: #b0b7c3; letter-spacing: .2em; }
</style>
</head>
<body>
<div class="card">
  <div class="emoji">🏝️</div>
  <h1>心屿 · 私人小岛</h1>
  <p class="hint">这是一座私人小岛，请输入通行密码</p>
  <input id="pass" type="password" placeholder="通行密码" autocomplete="current-password">
  <button id="go">上岛</button>
  <p class="err" id="err">密码不对，再试一次</p>
  <div class="island">XIN YU</div>
</div>
<script type="application/json" id="lock-payload">${JSON.stringify(payload)}</script>
<script>
(function () {
  var P = JSON.parse(document.getElementById('lock-payload').textContent);
  var KEY = 'xinyu_pass';
  var DAYS = ${REMEMBER_DAYS};
  var b64d = function (b) { var s = atob(b); var u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; };
  function derive(pass, salt) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveBits'])
      .then(function (km) { return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: ${ITER} }, km, 256); });
  }
  function decrypt(pass) {
    var salt = b64d(P.s), iv = b64d(P.i);
    return derive(pass, salt).then(function (bits) {
      return crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['decrypt']);
    }).then(function (k) { return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, k, b64d(P.d)); })
      .then(function (plain) { return new TextDecoder().decode(plain); });
  }
  function render(html) {
    document.open(); document.write(html); document.close();
    var btn = document.createElement('button');
    btn.textContent = '🔒 退出';
    btn.setAttribute('aria-label', '退出登录');
    btn.style.cssText = 'position:fixed;right:18px;bottom:16px;z-index:9999;padding:7px 14px;font-size:12.5px;color:#6b7280;background:rgba(255,255,255,.85);border:1px solid rgba(0,0,0,.12);border-radius:999px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.12);font-family:inherit';
    btn.onclick = function () { localStorage.removeItem(KEY); location.reload(); };
    document.body.appendChild(btn);
  }
  function unlock(pass) {
    return decrypt(pass).then(function (html) {
      try { localStorage.setItem(KEY, JSON.stringify({ p: pass, exp: Date.now() + DAYS * 86400000 })); } catch (e) {}
      render(html);
    });
  }
  function readSaved() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && v.p && v.exp > Date.now()) return v.p; if (v) localStorage.removeItem(KEY); } catch (e) {}
    return null;
  }
  var input = document.getElementById('pass');
  var err = document.getElementById('err');
  function tryPass(p) { unlock(p).catch(function () { err.style.display = 'block'; input.value = ''; input.focus(); }); }
  document.getElementById('go').onclick = function () { if (input.value) tryPass(input.value); };
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && input.value) tryPass(input.value); });
  var saved = readSaved();
  if (saved) {
    decrypt(saved).then(render).catch(function () { localStorage.removeItem(KEY); input.focus(); });
  } else {
    input.focus();
  }
})();
</script>
</body>
</html>
`;

if (!PASS) {
  console.log('[encrypt-site] SITE_PASS 未设置，跳过加密（本地预览模式）');
  process.exit(0);
}
if (PASS.length < 6) {
  console.error('[encrypt-site] SITE_PASS 至少 6 位');
  process.exit(1);
}

const files = walk(DIST);
let n = 0;
for (const file of files) {
  const html = readFileSync(file, 'utf8');
  writeFileSync(file, lockShell(encryptHtml(html, PASS)), 'utf8');
  n++;
}
console.log(`[encrypt-site] 已加密 ${n} 个页面（记住 ${REMEMBER_DAYS} 天，AES-256-GCM，PBKDF2 ${ITER} 次）`);
