// 文章源稿加解密：仓库里只存密文（content.enc/），构建时解密到 src/content/
// - lock   ：本地开发用，把 src/content 的明文 md 加密成 content.enc/*.enc（用于入库）
// - unlock ：CI 构建（prebuild）用，把 content.enc/*.enc 解密回 src/content
// - 密钥从环境变量 CONTENT_KEY 读取，不出现在任何仓库文件里
// - 格式：ENC1:<b64(iv)>:<b64(salt)>:<b64(ciphertext+tag)>，AES-256-GCM + PBKDF2(120000, SHA-256)
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname, relative, sep } from 'node:path';
import { pbkdf2Sync, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ROOT = decodeURIComponent(new URL('../', import.meta.url).pathname);
const SRC = join(ROOT, 'src', 'content');
const ENC = join(ROOT, 'content.enc');
const KEY = process.env.CONTENT_KEY;
const ITER = 120000;

function deriveKey(salt) {
  return pbkdf2Sync(KEY, salt, ITER, 32, 'sha256');
}
function encryptText(text) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(salt), iv);
  const data = Buffer.concat([cipher.update(text, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return `ENC1:${salt.toString('base64')}:${iv.toString('base64')}:${data.toString('base64')}`;
}
function decryptText(blob) {
  const [ver, s, i, d] = blob.trim().split(':');
  if (ver !== 'ENC1') throw new Error('未知密文格式 ' + ver);
  const raw = Buffer.from(d, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(Buffer.from(s, 'base64')), Buffer.from(i, 'base64'));
  decipher.setAuthTag(raw.subarray(raw.length - 16)); // Node 端必须显式提供 GCM tag
  const plain = Buffer.concat([decipher.update(raw.subarray(0, raw.length - 16)), decipher.final()]);
  return plain.toString('utf8');
}
function walk(dir, ext, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

const mode = process.argv[2];
if (!KEY) {
  if (mode === 'unlock' && existsSync(join(SRC, 'blog'))) {
    console.log('[content-crypt] CONTENT_KEY 未设置且本地已有明文源稿，跳过解密（本地预览模式）');
    process.exit(0);
  }
  console.error('[content-crypt] 需要 CONTENT_KEY 环境变量');
  process.exit(1);
}

if (mode === 'lock') {
  const files = walk(SRC, '.md');
  if (!files.length) { console.error('[content-crypt] src/content 下没有 md'); process.exit(1); }
  rmSync(ENC, { recursive: true, force: true });
  for (const f of files) {
    const rel = relative(SRC, f).split(sep).join('/');
    const dest = join(ENC, rel + '.enc');
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, encryptText(readFileSync(f, 'utf8')) + '\n');
    console.log('  lock', rel, '->', relative(ROOT, dest));
  }
  console.log(`[content-crypt] 已加密 ${files.length} 个源稿 -> content.enc/`);
} else if (mode === 'unlock') {
  const files = walk(ENC, '.enc');
  if (!files.length) { console.error('[content-crypt] content.enc 下没有密文'); process.exit(1); }
  for (const f of files) {
    const rel = relative(ENC, f).split(sep).join('/').replace(/\.enc$/, '');
    const dest = join(SRC, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, decryptText(readFileSync(f, 'utf8')));
    console.log('  unlock', relative(ROOT, f), '->', relative(ROOT, dest));
  }
  console.log(`[content-crypt] 已解密 ${files.length} 个源稿 -> src/content/`);
} else {
  console.error('用法: node scripts/content-crypt.mjs lock|unlock');
  process.exit(1);
}
