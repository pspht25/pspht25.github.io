// py-ide · 本地存储封装
// IndexedDB：工作目录句柄记忆；localStorage：未保存内容的暂存。
// 所有操作静默降级：存储不可用（如防跟踪浏览器限制）时退化为纯内存模式，不抛错。
const DB_NAME = 'py-ide-db';
const STORE = 'kv';
export const LS_PREFIX = 'py-ide-';

function idbCall(mode, fn) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        resolve(v);
      }
    };
    try {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => {
        try {
          open.result.createObjectStore(STORE);
        } catch (e) {}
      };
      open.onerror = () => finish(null);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const tx = db.transaction(STORE, mode);
          const rq = fn(tx.objectStore(STORE));
          rq.onsuccess = () => {
            finish(rq.result);
            db.close();
          };
          rq.onerror = () => {
            finish(null);
            db.close();
          };
        } catch (e) {
          finish(null);
        }
      };
    } catch (e) {
      finish(null);
    }
  });
}

export const idbGet = (k) => idbCall('readonly', (s) => s.get(k));
export const idbSet = (k, v) => idbCall('readwrite', (s) => s.put(v, k));
export const idbDel = (k) => idbCall('readwrite', (s) => s.delete(k));

export function idbWipe() {
  return new Promise((resolve) => {
    try {
      const rq = indexedDB.deleteDatabase(DB_NAME);
      rq.onsuccess = () => resolve(true);
      rq.onerror = () => resolve(false);
      rq.onblocked = () => resolve(false);
    } catch (e) {
      resolve(false);
    }
  });
}

// 列出本工具写入的全部 localStorage key（含 LS_PREFIX 前缀）
export function lsKeys() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(LS_PREFIX) === 0) out.push(k);
    }
  } catch (e) {}
  return out;
}

export const lsGet = (k) => {
  try {
    return localStorage.getItem(LS_PREFIX + k);
  } catch (e) {
    return null;
  }
};
export const lsSet = (k, v) => {
  try {
    localStorage.setItem(LS_PREFIX + k, v);
    return true;
  } catch (e) {
    return false;
  }
};
export const lsDel = (k) => {
  try {
    localStorage.removeItem(LS_PREFIX + k);
  } catch (e) {}
};
export function lsWipe() {
  lsKeys().forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch (e) {}
  });
}

// 未保存暂存的 key 约定：py-ide-buf:<相对路径>
export const bufKey = (path) => 'buf:' + path;
export const BUF_LS_PREFIX = LS_PREFIX + 'buf:';
