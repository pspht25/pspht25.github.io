// numpy 子集：排序/去重/拼接/linalg/随机（LCG 可复现，序列与 numpy 不同）
import { NdArray, numel, stridesOf, num2, iterateLines } from './core';

// ---- 排序 ----

export function sortArr(a: NdArray, axis?: any, kw?: any): NdArray {
  let ax: any = axis;
  if (ax && typeof ax === 'object' && ax.axis !== undefined) { kw = ax; ax = undefined; }
  if (ax === undefined || ax === null) ax = kw && kw.axis !== undefined ? kw.axis : -1;
  if (a.shape.length === 1) {
    const out = a.data.map(v => num2(v)).sort((x, y) => x - y);
    return new NdArray(out, a.shape.slice(), a.dtype);
  }
  if (a.shape.length === 2) {
    const nd = 2;
    const k = (typeof ax === 'number' ? ax : -1) < 0 ? nd + (typeof ax === 'number' ? ax : -1) : ax;
    const st = stridesOf(a.shape);
    const out = a.data.slice();
    if (k === 1) {
      const [r, c] = a.shape;
      for (let i = 0; i < r; i++) {
        const row = out.slice(i * c, (i + 1) * c).map(v => num2(v)).sort((x, y) => x - y);
        for (let j = 0; j < c; j++) out[i * c + j] = row[j];
      }
      return new NdArray(out, a.shape.slice(), a.dtype);
    }
    if (k === 0) {
      const [r, c] = a.shape;
      for (let j = 0; j < c; j++) {
        const col: number[] = [];
        for (let i = 0; i < r; i++) col.push(num2(a.data[i * c + j]));
        col.sort((x, y) => x - y);
        for (let i = 0; i < r; i++) out[i * c + j] = col[i];
      }
      return new NdArray(out, a.shape.slice(), a.dtype);
    }
    throw new Error('ValueError: sort 当前仅支持 2D 数组 axis=0/1');
  }
  // 其他维度：整体展平排序（限制说明）
  const out = a.data.map(v => num2(v)).sort((x, y) => x - y);
  return new NdArray(out, a.shape.slice(), a.dtype);
}

export function argsortArr(a: NdArray, axis?: any, kw?: any): NdArray {
  let ax: any = axis;
  if (ax && typeof ax === 'object' && ax.axis !== undefined) { kw = ax; ax = undefined; }
  if (ax === undefined || ax === null) ax = kw && kw.axis !== undefined ? kw.axis : -1;
  if (a.shape.length === 1) {
    const ids = a.data.map((v, i) => [num2(v), i] as [number, number]).sort((x, y) => x[0] - y[0]).map(p => p[1]);
    return new NdArray(ids, [ids.length], 'int64');
  }
  if (a.shape.length === 2) {
    const [r, c] = a.shape;
    const st = stridesOf(a.shape);
    const kRaw = typeof ax === 'number' ? ax : -1;
    const k = kRaw < 0 ? 2 + kRaw : kRaw;
    const out: number[] = new Array(r * c);
    if (k === 1) {
      for (let i = 0; i < r; i++) {
        const pairs: [number, number][] = [];
        for (let j = 0; j < c; j++) pairs.push([num2(a.data[i * c + j]), j]);
        pairs.sort((x, y) => x[0] - y[0]);
        for (let j = 0; j < c; j++) out[i * c + j] = pairs[j][1];
      }
      return new NdArray(out, a.shape.slice(), 'int64');
    }
    if (k === 0) {
      for (let j = 0; j < c; j++) {
        const pairs: [number, number][] = [];
        for (let i = 0; i < r; i++) pairs.push([num2(a.data[i * c + j]), i]);
        pairs.sort((x, y) => x[0] - y[0]);
        for (let i = 0; i < r; i++) out[i * c + j] = pairs[i][1];
      }
      return new NdArray(out, a.shape.slice(), 'int64');
    }
    throw new Error('ValueError: argsort 当前仅支持 2D 数组 axis=0/1');
  }
  const ids = a.data.map((v, i) => [num2(v), i] as [number, number]).sort((x, y) => x[0] - y[0]).map(p => p[1]);
  return new NdArray(ids, a.shape.slice(), 'int64');
}

export function unique(a: NdArray): NdArray {
  if (a.shape.length !== 1) {
    // numpy 会展平去重
    const flat = a.data.map(v => num2(v));
    const s = Array.from(new Set(flat)).sort((x, y) => x - y);
    return new NdArray(s, [s.length], a.dtype);
  }
  const s = Array.from(new Set(a.data.map(v => num2(v)))).sort((x, y) => x - y);
  const dt = a.dtype === 'bool' ? 'bool' : a.dtype;
  return new NdArray(s, [s.length], dt);
}

// ---- 拼接 ----

export function concatenate(arrs: any[], axis?: any, kw?: any): NdArray {
  const list: NdArray[] = arrs.map(x => {
    if (x && x.__ndarray) return x as NdArray;
    throw new Error('ValueError: concatenate 仅支持 numpy 数组');
  });
  if (!list.length) throw new Error('ValueError: concatenate 需要至少一个数组');
  let ax: any = axis;
  if (ax && typeof ax === 'object' && ax.axis !== undefined) { kw = ax; ax = undefined; }
  if (ax === undefined || ax === null) ax = kw && kw.axis !== undefined ? kw.axis : 0;
  const A = list[0];
  const nd = A.shape.length;
  const k = (typeof ax === 'number' ? ax : 0) < 0 ? nd + ax : (typeof ax === 'number' ? ax : 0);
  // 形状一致性检查（除拼接轴）
  for (const x of list) {
    if (x.shape.length !== nd) throw new Error('ValueError: 所有数组维度必须相同');
    for (let d = 0; d < nd; d++) if (d !== k && x.shape[d] !== A.shape[d]) throw new Error('ValueError: 除拼接轴外形状必须一致');
  }
  if (nd === 1) {
    const out: any[] = [];
    for (const x of list) out.push(...x.data.map(v => num2(v)));
    return new NdArray(out, [out.length], A.dtype);
  }
  if (k === 0) {
    const rows = list.reduce((s, x) => s + x.shape[0], 0);
    const cols = A.shape[1];
    const out: any[] = [];
    for (const x of list) out.push(...x.data.map(v => num2(v)));
    return new NdArray(out, [rows, cols], A.dtype);
  }
  if (k === 1 && nd === 2) {
    const rows = A.shape[0];
    const cols = list.reduce((s, x) => s + x.shape[1], 0);
    const out: any[] = new Array(rows * cols);
    let coff = 0;
    for (const x of list) {
      const [, xc] = x.shape;
      for (let i = 0; i < rows; i++) for (let j = 0; j < xc; j++) out[i * cols + coff + j] = num2(x.data[i * xc + j]);
      coff += xc;
    }
    return new NdArray(out, [rows, cols], A.dtype);
  }
  throw new Error('ValueError: concatenate 当前仅支持 1D/2D 数组');
}

export function vstack(arrs: any[]): NdArray {
  const list: NdArray[] = arrs.map(x => {
    if (x && x.__ndarray) return x as NdArray;
    throw new Error('ValueError: vstack 仅支持 numpy 数组');
  });
  const A = list[0];
  if (A.shape.length === 1) {
    // 1D → 视为 (1, n) 行堆叠
    const rows = list.length;
    const n = A.shape[0];
    const out: any[] = [];
    for (const x of list) out.push(...x.data.map(v => num2(v)));
    return new NdArray(out, [rows, n], A.dtype);
  }
  return concatenate(list, 0);
}

export function hstack(arrs: any[]): NdArray {
  const list: NdArray[] = arrs.map(x => {
    if (x && x.__ndarray) return x as NdArray;
    throw new Error('ValueError: hstack 仅支持 numpy 数组');
  });
  const A = list[0];
  if (A.shape.length === 1) {
    const out: any[] = [];
    for (const x of list) out.push(...x.data.map(v => num2(v)));
    return new NdArray(out, [out.length], A.dtype);
  }
  return concatenate(list, 1);
}

// ---- linalg ----

export function norm(a: NdArray, kw?: any): number {
  if (a.shape.length > 2) throw new Error('ValueError: norm 当前仅支持 1D/2D 数组');
  if (a.shape.length === 2 && kw && kw.axis !== undefined) {
    throw new Error('ValueError: norm 的 axis 参数暂不支持');
  }
  let s = 0;
  for (const v of a.data) { const x = num2(v); s += x * x; }
  return Math.sqrt(s);
}

export function det(a: NdArray): number {
  if (a.shape.length !== 2 || a.shape[0] !== a.shape[1]) throw new Error('ValueError: det 需要方阵');
  const n = a.shape[0];
  const M = a.data.map(v => num2(v));
  let d = 1;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r * n + col]) > Math.abs(M[piv * n + col])) piv = r;
    if (Math.abs(M[piv * n + col]) < 1e-300) return 0;
    if (piv !== col) {
      for (let c = 0; c < n; c++) { const t = M[col * n + c]; M[col * n + c] = M[piv * n + c]; M[piv * n + c] = t; }
      d = -d;
    }
    d *= M[col * n + col];
    for (let r = col + 1; r < n; r++) {
      const f = M[r * n + col] / M[col * n + col];
      for (let c = col; c < n; c++) M[r * n + c] -= f * M[col * n + c];
    }
  }
  // 整数阵结果修整（numpy 对 int 输入返回精确整数）
  const r = Math.round(d);
  if (Math.abs(d - r) < 1e-9 * Math.max(1, Math.abs(r))) d = r;
  return d;
}

export function inv(a: NdArray): NdArray {
  if (a.shape.length !== 2 || a.shape[0] !== a.shape[1]) throw new Error('ValueError: inv 需要方阵');
  const n = a.shape[0];
  const M: number[][] = [];
  for (let i = 0; i < n; i++) {
    const row: number[] = [];
    for (let j = 0; j < n; j++) row.push(num2(a.data[i * n + j]));
    for (let j = 0; j < n; j++) row.push(i === j ? 1 : 0);
    M.push(row);
  }
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-12) throw new Error('LinAlgError: Singular matrix');
    if (piv !== col) { const t = M[col]; M[col] = M[piv]; M[piv] = t; }
    const p = M[col][col];
    for (let c = 0; c < 2 * n; c++) M[col][c] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = 0; c < 2 * n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out.push(M[i][j + n]);
  return new NdArray(out, [n, n], 'float64');
}

// ---- random（LCG，seed 可复现；序列与 numpy 不同——限制说明）----

export function makeRandom() {
  let s = (Math.random() * 0x7fffffff) | 0;
  const next = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x80000000;
  };
  const shaper = (dims: any[]): number[] => {
    if (!dims.length) return [];
    if (dims.length === 1 && Array.isArray(dims[0])) return dims[0].map(x => Math.trunc(num2(x)));
    return dims.map(x => Math.trunc(num2(x)));
  };
  const rand = (...dims: any[]) => {
    const sh = shaper(dims);
    const n = sh.reduce((x, y) => x * y, 1) || 1;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(next());
    return new NdArray(out, sh.length ? sh : [1], 'float64');
  };
  // Box-Muller 标准正态
  const gauss = () => {
    const u1 = Math.max(next(), 1e-12);
    const u2 = next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };
  const randn = (...dims: any[]) => {
    const sh = shaper(dims);
    const n = sh.reduce((x, y) => x * y, 1) || 1;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(gauss());
    return new NdArray(out, sh.length ? sh : [1], 'float64');
  };
  const randint = (lo: any, hi?: any, size?: any) => {
    let a = 0, b = 0;
    if (hi === undefined) { b = Math.trunc(num2(lo)); } else { a = Math.trunc(num2(lo)); b = Math.trunc(num2(hi)); }
    if (b <= a) throw new Error('ValueError: randint 下界必须小于上界');
    let sh: number[];
    if (size === undefined) sh = [];
    else if (typeof size === 'number') sh = [size];
    else sh = size.map((x: any) => Math.trunc(num2(x)));
    const n = sh.reduce((x, y) => x * y, 1) || 1;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(a + Math.floor(next() * (b - a)));
    if (!sh.length) return out[0];
    return new NdArray(out, sh, 'int64');
  };
  const normal = (loc?: any, scale?: any, size?: any) => {
    const mu = loc === undefined ? 0 : num2(loc);
    const sd = scale === undefined ? 1 : num2(scale);
    let sh: number[];
    if (size === undefined) sh = [];
    else if (typeof size === 'number') sh = [size];
    else sh = size.map((x: any) => Math.trunc(num2(x)));
    const n = sh.reduce((x, y) => x * y, 1) || 1;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(mu + sd * gauss());
    if (!sh.length) return out[0];
    return new NdArray(out, sh, 'float64');
  };
  const uniform = (lo?: any, hi?: any, size?: any) => {
    const a = lo === undefined ? 0 : num2(lo);
    const b = hi === undefined ? 1 : num2(hi);
    let sh: number[];
    if (size === undefined) sh = [];
    else if (typeof size === 'number') sh = [size];
    else sh = size.map((x: any) => Math.trunc(num2(x)));
    const n = sh.reduce((x, y) => x * y, 1) || 1;
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(a + (b - a) * next());
    if (!sh.length) return out[0];
    return new NdArray(out, sh, 'float64');
  };
  const choice = (a: any, size?: any, kw?: any) => {
    let pool: any[];
    if (a && a.__ndarray) pool = (a as NdArray).data.slice();
    else if (Array.isArray(a)) pool = a.slice();
    else {
      // 整数 n → arange(n)
      const n = Math.trunc(num2(a));
      pool = [];
      for (let i = 0; i < n; i++) pool.push(i);
    }
    let count = 1;
    let sh: number[] = [];
    if (size !== undefined) {
      if (typeof size === 'number') { sh = [size]; count = size; }
      else { sh = size.map((x: any) => Math.trunc(num2(x))); count = sh.reduce((x, y) => x * y, 1); }
    }
    const replace = !(kw && kw.replace === false);
    const out: any[] = [];
    if (replace) {
      for (let i = 0; i < count; i++) out.push(pool[Math.floor(next() * pool.length)]);
    } else {
      if (count > pool.length) throw new Error('ValueError: 无法从大小为 ' + pool.length + ' 的数组中无放回取出 ' + count + ' 个元素');
      const idxs = pool.map((_, i) => i);
      // 部分洗牌
      for (let i = 0; i < count; i++) {
        const j = i + Math.floor(next() * (pool.length - i));
        const t = idxs[i]; idxs[i] = idxs[j]; idxs[j] = t;
        out.push(pool[idxs[i]]);
      }
    }
    const vals = out.map(v => num2(v));
    if (!sh.length) return vals[0];
    const allInt = vals.every(v => Number.isInteger(v));
    return new NdArray(vals, sh, allInt ? 'int64' : 'float64');
  };
  const seed = (x?: any) => {
    if (x === undefined) s = (Math.random() * 0x7fffffff) | 0;
    else s = Math.trunc(num2(x)) & 0x7fffffff;
    return null;
  };
  return { seed, rand, randn, randint, normal, uniform, choice };
}
