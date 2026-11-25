// numpy 子集核心：NdArray 与创建函数（纯 JS，语义对齐 Python numpy 教学常用子集）
// 拆分原则：本文件不依赖其他 numpy 子模块，供 ops/reduce/indexing/format/funcs 引用

export type Dtype = 'int64' | 'float64' | 'bool';

export const numel = (shape: number[]): number => shape.reduce((a, b) => a * b, 1);

export const stridesOf = (shape: number[]): number[] => {
  const st: number[] = [];
  let acc = 1;
  for (let i = shape.length - 1; i >= 0; i--) { st[i] = acc; acc *= shape[i]; }
  return st;
};

export const isNd = (x: any): boolean => !!(x && x.__ndarray === true);

// bool 参与算术时转 0/1（numpy 语义：True+True=2）
export const num2 = (v: any): number => (typeof v === 'boolean' ? (v ? 1 : 0) : v);

// dtype 提升：有 float → float64；有 bool → int64（算术）；默认 int64
export const promote = (a: Dtype, b: Dtype): Dtype =>
  a === 'float64' || b === 'float64' ? 'float64' : 'int64';

// 用户传入 dtype 参数归一（支持字符串与 Python 内建 int/float/bool 函数对象）
export const dtOf = (d: any): Dtype | null => {
  if (d === undefined || d === null) return null;
  if (typeof d === 'function' && d.__pytype) {
    const t = d.__pytype;
    return t === 'float' ? 'float64' : t === 'bool' ? 'bool' : 'int64';
  }
  if (typeof d === 'string') return d.includes('float') ? 'float64' : d.includes('bool') ? 'bool' : 'int64';
  const s = String(d);
  if (/float/.test(s)) return 'float64';
  if (/bool/.test(s)) return 'bool';
  return 'int64';
};

// 方法 kwarg 中取 axis（位置参数优先）
export const pickAxis = (a: any, kw: any): any => {
  if (a !== undefined && a !== null) return a;
  if (kw && kw.axis !== undefined) return kw.axis;
  return null;
};

// 形状归一：int → [n]；数组/tuple → 拷贝
export const normShape = (s: any): number[] => {
  if (typeof s === 'number' && Number.isInteger(s)) return [s];
  if (Array.isArray(s) && s.every(x => typeof x === 'number')) return s.slice();
  throw new Error('TypeError: shape 应为整数或整数元组');
};

// 枚举除 ax 轴外的所有轴线（排序/累加用）：cb(base, stride)
export const iterateLines = (a: NdArray, ax: number, cb: (base: number, stride: number) => void) => {
  const st = stridesOf(a.shape);
  const nd = a.shape.length;
  const other: number[] = [];
  for (let d = 0; d < nd; d++) if (d !== ax) other.push(d);
  const idx = new Array(other.length).fill(0);
  const total = other.reduce((s, d) => s * a.shape[d], 1);
  for (let k = 0; k < total; k++) {
    let base = 0;
    for (let i = 0; i < other.length; i++) base += idx[i] * st[other[i]];
    cb(base, st[ax]);
    for (let i = other.length - 1; i >= 0; i--) { if (++idx[i] < a.shape[other[i]]) break; idx[i] = 0; }
  }
};

// 通用轴变换（transpose/T）
export function transpose(a: NdArray): NdArray {
  const nd = a.shape.length;
  if (nd === 1) return new NdArray(a.data.slice(), a.shape.slice(), a.dtype);
  const newShape = a.shape.slice().reverse();
  const aSt = stridesOf(a.shape);
  const mapSt: number[] = [];
  for (let d = 0; d < nd; d++) mapSt[d] = aSt[nd - 1 - d];
  const total = a.data.length;
  const out: any[] = new Array(total);
  const idx = new Array(nd).fill(0);
  for (let k = 0; k < total; k++) {
    let off = 0;
    for (let d = 0; d < nd; d++) off += idx[d] * mapSt[d];
    out[k] = a.data[off];
    for (let d = nd - 1; d >= 0; d--) { if (++idx[d] < newShape[d]) break; idx[d] = 0; }
  }
  return new NdArray(out, newShape, a.dtype);
}

// 展开为嵌套 JS 数组（tolist）
export function toNested(a: NdArray): any {
  if (a.shape.length === 1) return a.data.slice();
  const rowLen = numel(a.shape.slice(1));
  const out: any[] = [];
  for (let i = 0; i < a.shape[0]; i++) {
    out.push(toNested(new NdArray(a.data.slice(i * rowLen, (i + 1) * rowLen), a.shape.slice(1), a.dtype)));
  }
  return out;
}

export class NdArray {
  __ndarray = true;
  data: any[];
  _shape: number[];
  dtype: Dtype;
  constructor(data: any[], shape: number[], dtype: Dtype) {
    this._shape = shape;
    this.data = data;
    this.dtype = dtype;
  }
  // shape 返回带 __pytuple 标记的数组（print 显示 py 元组格式）
  get shape(): number[] {
    const s = this._shape.slice();
    (s as any).__pytuple = true;
    return s;
  }
  get ndim() { return this.shape.length; }
  get size() { return this.data.length; }
  get T() { return transpose(this); }

  reshape(...args: any[]) {
    let sh: number[] = args.length === 1 && Array.isArray(args[0]) ? args[0].slice() : args.slice();
    const neg = sh.indexOf(-1);
    if (neg >= 0) {
      const rest = sh.filter(x => x !== -1).reduce((a, b) => a * b, 1);
      sh[neg] = rest === 0 ? 0 : this.data.length / rest;
    }
    if (numel(sh) !== this.data.length) {
      throw new Error('ValueError: cannot reshape array of size ' + this.data.length + ' into shape (' + sh.join(',') + ')');
    }
    return new NdArray(this.data.slice(), sh, this.dtype);
  }
  ravel() { return new NdArray(this.data.slice(), [this.data.length], this.dtype); }
  flatten() { return this.ravel(); }
  transpose() { return transpose(this); }
  tolist() { return toNested(this); }
  copy() { return new NdArray(this.data.slice(), this.shape.slice(), this.dtype); }
  astype(t: any) {
    const dt = dtOf(t) || 'int64';
    const d = this.data.map(v => (dt === 'int64' ? Math.trunc(num2(v)) : dt === 'bool' ? !!num2(v) : num2(v)));
    return new NdArray(d, this.shape.slice(), dt);
  }
  item(i?: any) {
    if (i === undefined || i === null) {
      if (this.data.length !== 1) throw new Error('ValueError: can only convert an array of size 1 to a Python scalar');
      return this.data[0];
    }
    let k = typeof i === 'number' ? i : num2(i);
    if (!Number.isInteger(k)) throw new Error('TypeError: item() 参数应为整数');
    if (k < 0) k += this.data.length;
    if (k < 0 || k >= this.data.length) throw new Error('IndexError: index ' + (typeof i === 'number' ? i : k) + ' is out of bounds');
    return this.data[k];
  }
  fill(v: any) { const x = num2(v); for (let i = 0; i < this.data.length; i++) this.data[i] = this.dtype === 'int64' ? Math.trunc(x) : x; return null; }
}

// ---- 创建函数 ----

// 推断嵌套数组形状（不规则返回 null）
function inferShape(o: any): number[] | null {
  if (!Array.isArray(o)) return null;
  if (!o.length) return [0];
  const sh = [o.length];
  let cur = o;
  while (Array.isArray(cur[0])) {
    if (!cur.every((x: any) => Array.isArray(x) && x.length === cur[0].length)) return null;
    sh.push(cur[0].length);
    cur = cur[0];
  }
  return sh;
}

function collectFlat(o: any, out: any[]) {
  if (Array.isArray(o)) { for (const v of o) collectFlat(v, out); return; }
  out.push(o);
}

export function asarray(obj: any, kw?: any): NdArray {
  if (isNd(obj)) return obj.copy();
  const shape = inferShape(obj);
  if (shape === null) throw new Error('ValueError: 仅支持由（嵌套）列表创建数组');
  const flat: any[] = [];
  collectFlat(obj, flat);
  const allBool = flat.every(v => typeof v === 'boolean');
  const allNum = flat.every(v => typeof v === 'number' || typeof v === 'boolean');
  if (!allNum) throw new Error('ValueError: 数组元素只能是数字或布尔值');
  let dt: Dtype = allBool ? 'bool' : allInt(flat) ? 'int64' : 'float64';
  const user = dtOf(kw && kw.dtype);
  if (user) {
    dt = user;
    if (dt === 'int64') for (let i = 0; i < flat.length; i++) flat[i] = Math.trunc(num2(flat[i]));
    else if (dt === 'float64') for (let i = 0; i < flat.length; i++) flat[i] = num2(flat[i]);
    else for (let i = 0; i < flat.length; i++) flat[i] = !!num2(flat[i]);
  }
  return new NdArray(flat, shape, dt);
}
export const array = asarray;

function allInt(flat: any[]): boolean {
  return flat.every(v => typeof v === 'boolean' || Number.isInteger(v));
}

export function zeros(shape: any, kw?: any): NdArray {
  const sh = normShape(shape);
  const dt = dtOf(kw && kw.dtype) || 'float64'; // numpy 默认 float64
  const n = numel(sh);
  const d: any[] = new Array(n).fill(dt === 'bool' ? false : 0);
  return new NdArray(d, sh, dt);
}

export function ones(shape: any, kw?: any): NdArray {
  const sh = normShape(shape);
  const dt = dtOf(kw && kw.dtype) || 'float64';
  const n = numel(sh);
  const d: any[] = new Array(n).fill(dt === 'bool' ? true : dt === 'int64' ? 1 : 1);
  return new NdArray(d, sh, dt);
}

export function full(shape: any, v: any, kw?: any): NdArray {
  const sh = normShape(shape);
  const x = num2(v);
  const dt = dtOf(kw && kw.dtype) || (typeof v === 'boolean' ? 'bool' : Number.isInteger(x) ? 'int64' : 'float64');
  const d: any[] = new Array(numel(sh)).fill(dt === 'bool' ? !!x : dt === 'int64' ? Math.trunc(x) : x);
  return new NdArray(d, sh, dt);
}

export function eye(n: any, m?: any, kw?: any): NdArray {
  if (m && typeof m === 'object' && !Array.isArray(m) && !isNd(m) && (m.k !== undefined || m.M !== undefined)) { kw = m; m = undefined; }
  const rows = typeof n === 'number' ? n : normShape(n)[0];
  const cols = m === undefined ? rows : (typeof m === 'number' ? m : normShape(m)[0]);
  const k = kw && kw.k !== undefined ? kw.k : 0;
  const d: any[] = new Array(rows * cols).fill(0);
  for (let i = 0; i < rows; i++) { const j = i + k; if (j >= 0 && j < cols) d[i * cols + j] = 1; }
  return new NdArray(d, [rows, cols], 'float64');
}
export const identity = (n: any, kw?: any) => eye(n, undefined, kw);

export function arange(a?: any, b?: any, s?: any, kw?: any): NdArray {
  let start = 0, stop = a, step = 1;
  if (b !== undefined) { start = a; stop = b; }
  if (s !== undefined) step = s;
  if (step === 0) throw new Error('ValueError: arange 步长不能为 0');
  const out: any[] = [];
  const isFloat = !Number.isInteger(start) || !Number.isInteger(stop) || !Number.isInteger(step);
  if (step > 0) for (let v = start; v < stop; v += step) out.push(v);
  else for (let v = start; v > stop; v += step) out.push(v);
  return new NdArray(out, [out.length], isFloat ? 'float64' : 'int64');
}

export function linspace(start: any, stop: any, num?: any, kw?: any): NdArray {
  let n = num !== undefined ? num : (kw && kw.num !== undefined ? kw.num : 50);
  if (!Number.isInteger(n) || n < 0) throw new Error('ValueError: linspace num 应为非负整数');
  const s = num2(start), e = num2(stop);
  if (n === 0) return new NdArray([], [0], 'float64');
  if (n === 1) return new NdArray([s], [1], 'float64');
  const step = (e - s) / (n - 1);
  const out: any[] = [];
  for (let i = 0; i < n; i++) out.push(s + i * step);
  out[n - 1] = e; // 端点精确
  return new NdArray(out, [n], 'float64');
}

export function diag(v: any, kw?: any): NdArray {
  const A = asarray(v);
  if (A.shape.length === 1) {
    const n = A.shape[0];
    const d: any[] = new Array(n * n).fill(0);
    for (let i = 0; i < n; i++) d[i * n + i] = num2(A.data[i]);
    return new NdArray(d, [n, n], A.dtype);
  }
  if (A.shape.length === 2 && A.shape[0] === A.shape[1]) {
    const n = A.shape[0];
    const d: any[] = [];
    for (let i = 0; i < n; i++) d.push(A.data[i * n + i]);
    return new NdArray(d, [n], A.dtype);
  }
  throw new Error('ValueError: diag 仅支持一维或二维方阵');
}
