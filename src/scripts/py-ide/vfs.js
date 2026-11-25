// py-ide · 文件系统层：File System Access API 封装
// 仅本地读写（浏览器 ↔ 本地磁盘），无任何网络请求。
import { idbSet, idbGet, idbDel } from './storage.js';

export const hasFSA = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

const MAX_DEPTH = 4;
const MAX_ENTRIES = 400;
const MAX_BYTES = 1024 * 1024; // 1 MB，超出不进编辑器

const SKIP_DIRS = new Set([
  '.git', 'node_modules', '__pycache__', '.venv', 'venv', '.astro', 'dist', 'build',
  '.idea', '.vscode', '.next', 'site-packages', '.pytest_cache', '.mypy_cache',
]);
const SKIP_FILE =
  /\.(pyc|pyo|class|o|so|dll|exe|bin|dat|db|sqlite|zip|gz|tar|7z|rar|pdf|png|jpe?g|gif|webp|ico|mp3|mp4|wav|ogg|woff2?|ttf|eot|otf|pkl|npy|npz|parquet|DS_Store)$/i;
export const TEXT_EXT =
  /\.(py|txt|md|markdown|json|csv|tsv|js|mjs|cjs|ts|html|css|xml|yaml|yml|toml|ini|cfg|conf|sh|bat|log)$/i;
export const PY_EXT = /\.py$/i;

// 弹出系统目录选择器；用户取消/失败返回 null（不抛错）
export async function pickDirectory() {
  if (!hasFSA) return null;
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    return null;
  }
}

// 读写权限确认；requestPermission 必须由用户手势触发（按钮点击链路内调用）
export async function ensurePerm(handle) {
  if (!handle) return false;
  try {
    let st = await handle.queryPermission({ mode: 'readwrite' });
    if (st === 'granted') return true;
    st = await handle.requestPermission({ mode: 'readwrite' });
    return st === 'granted';
  } catch (e) {
    return false;
  }
}

// 递归建树：node = { name, path, kind, handle, children }
// 目录在前、字母序；跳过隐藏目录/依赖目录/二进制；深度与总数受限
export async function buildTree(dirHandle) {
  const root = { name: dirHandle.name || '工作目录', path: '', kind: 'dir', handle: dirHandle, children: [] };
  let count = 0;
  async function walk(dir, prefix, depth, bucket) {
    if (depth > MAX_DEPTH || count >= MAX_ENTRIES) return;
    const entries = [];
    try {
      for await (const ent of dir.values()) {
        entries.push(ent);
        if (entries.length >= 200) break; // 单目录扫描上限
      }
    } catch (e) {
      return;
    }
    entries.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1
    );
    for (const ent of entries) {
      if (count >= MAX_ENTRIES) return;
      if (ent.kind === 'directory') {
        if (SKIP_DIRS.has(ent.name) || ent.name.startsWith('.')) continue;
        const node = { name: ent.name, path: prefix + ent.name + '/', kind: 'dir', handle: ent, children: [] };
        bucket.push(node);
        count++;
        await walk(ent, node.path, depth + 1, node.children);
      } else {
        if (ent.name.startsWith('.') || SKIP_FILE.test(ent.name)) continue;
        bucket.push({ name: ent.name, path: prefix + ent.name, kind: 'file', handle: ent, children: null });
        count++;
      }
    }
  }
  await walk(dirHandle, '', 1, root.children);
  return root;
}

export async function readTextFile(fileHandle) {
  try {
    const file = await fileHandle.getFile();
    if (file.size > MAX_BYTES) return { ok: false, err: '「' + file.name + '」超过 1 MB，不进编辑器（避免卡顿）' };
    return { ok: true, text: await file.text() };
  } catch (e) {
    return { ok: false, err: '读取失败：' + (e && e.message ? e.message : e) };
  }
}

export async function saveTextFile(fileHandle, text) {
  try {
    const w = await fileHandle.createWritable();
    await w.write(text);
    await w.close();
    return { ok: true };
  } catch (e) {
    return { ok: false, err: '写入失败：' + (e && e.message ? e.message : e) };
  }
}

export function splitPath(rel) {
  const parts = String(rel).split('/').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  if (parts.some((p) => p === '.' || p === '..')) return null;
  return parts;
}

// 相对路径逐级下钻（可自动创建子目录）；返回 { dir, name, rel } 或 null
export async function mkpath(dirRoot, rel, create) {
  const parts = splitPath(rel);
  if (!parts) return null;
  let dir = dirRoot;
  try {
    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create: !!create });
    }
    return { dir, name: parts[parts.length - 1], rel: parts.join('/') };
  } catch (e) {
    return null;
  }
}

// ---- 目录连接记忆（IndexedDB；失败静默） ----
export async function rememberDir(handle, name) {
  await idbSet('dir', handle);
  await idbSet('dirname', name);
}
export async function recallDir() {
  const h = await idbGet('dir');
  if (!h) return null;
  const nm = await idbGet('dirname');
  return { handle: h, name: nm || (h && h.name) || '上次目录' };
}
export async function forgetDir() {
  await idbDel('dir');
  await idbDel('dirname');
}
