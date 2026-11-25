// numpy 子集：元素级运算（广播 binop、ufunc、matmul、where）
import { NdArray, Dtype, numel, stridesOf, isNd, num2, promote } from './core';

// 广播形状计算，返回 [outShape, aMap, bMap]（下标映射到原数组偏移；stride 0 表示广播）
export function bcast(shA: number[], shB: number[]): [number[], number[], number[]] {
  const nd = Math.max(shA.length, shB.length);
  const pad = (s: number[]) => new Array(nd - s.length).fill(1).concat(s);
  const A = pad(shA), B = pad(shB);
  const out: number[] = [];
  for (let d = 0; d < nd; d++) {
    if (A[d] === B[d] || B[d] === 1) out.push(A[d]);
    else if (A[d] === 1) out.push(B[d]);
    else throw new Error('ValueError: operands could not be broadcast together with shapes (' + shA.join(',') + ') (' + shB.join(',') + ')');
  }
  // 广播维（形状 1 而输出 >1）stride 置 0
  const sa = stridesOf(A), sb = stridesOf(B);
  for (let d = 0; d < nd; d++) {
    if (A[d] === 1 && out[d] !== 1) sa[d] = 0;
    if (B[d] === 1 && out[d] !== 1) sb[d] = 0;
  }
  return [out, sa, sb];
}

// 标量与标量 → 标量；含数组 → 广播
export function binop(op: string, a: any, b: any): any {
  const bothScalar = !isNd(a) && !isNd(b);
  if (bothScalar) {
    const x = num2(a), y = num2(b);
    return scalarOp(op, x, y);
  }
  let arr: NdArray;
  if (isNd(a) && isNd(b)) arr = binopArr(op, a, b);
  else if (isNd(a)) {
    const y = num2(b);
    arr = new NdArray(a.data.map(v => scalarOp(op, num2(v), y)), a.shape.slice(), pickDtype(op, a.dtype, typeof b === 'boolean' ? 'bool' : Number.isInteger(b) ? 'int64' : 'float64'));
  } else {
    const x = num2(a);
    const bb = b as NdArray;
    arr = new NdArray(bb.data.map(v => scalarOp(op, x, num2(v))), bb.shape.slice(), pickDtype(op, typeof a === 'boolean' ? 'bool' : Number.isInteger(a) ? 'int64' : 'float64', bb.dtype));
  }
  // 除法/真除永远 float64
  if (op === '/') return castTo(arr, 'float64');
  return arr;
}

function pickDtype(op: string, da: Dtype, db: Dtype): Dtype {
  if (op === '//' || op === '%' || op === '**') {
    if (da === 'float64' || db === 'float64') return 'float64';
    if (op === '**' && (da === 'bool' || db === 'bool')) return 'int64';
    if (op === '**' && db === 'int64') return db === 'int64' && da === 'int64' ? 'int64' : 'float64';
    return promote(da, db);
  }
  return promote(da, db);
}

function castTo(a: NdArray, dt: Dtype): NdArray {
  if (a.dtype === dt) return a;
  const d = a.data.map(v => (dt === 'int64' ? Math.trunc(num2(v)) : dt === 'bool' ? !!num2(v) : num2(v)));
  return new NdArray(d, a.shape.slice(), dt);
}

// 标量标量运算（numpy 语义）
export function scalarOp(op: string, x: number, y: number): number {
  switch (op) {
    case '+': return x + y;
    case '-': return x - y;
    case '*': return x * y;
    case '/': return y === 0 ? (x === 0 ? NaN : (x > 0 ? Infinity : -Infinity)) : x / y;
    case '//': return y === 0 ? NaN : Math.floor(x / y);
    case '%': return y === 0 ? NaN : ((x % y) + y) % y; // Python 模：结果符号随除数
    case '**': {
      // 负底数整数指数（py 语义）与 0 负指数
      if (x === 0 && y < 0) return x === 0 ? Infinity : NaN;
      const r = Math.pow(x, y);
      if (Number.isInteger(x) && Number.isInteger(y) && y >= 0 && Math.abs(r) < 1e15) return Math.round(r);
      return r;
    }
    default: throw new Error('ValueError: 未支持的运算符 ' + op);
  }
}

// 数组数组广播
function binopArr(op: string, a: NdArray, b: NdArray): NdArray {
  const [outSh, sa, sb] = bcast(a.shape, b.shape);
  const total = numel(outSh);
  const out: any[] = new Array(total);
  const nd = outSh.length;
  const idx = new Array(nd).fill(0);
  const da = promote(a.dtype, b.dtype);
  for (let k = 0; k < total; k++) {
    let oa = 0, ob = 0;
    for (let d = 0; d < nd; d++) { oa += idx[d] * sa[d]; ob += idx[d] * sb[d]; }
    out[k] = scalarOp(op, num2(a.data[oa]), num2(b.data[ob]));
    for (let d = nd - 1; d >= 0; d--) { if (++idx[d] < outSh[d]) break; idx[d] = 0; }
  }
  return new NdArray(out, outSh, da);
}

// ufunc：一元映射，保形状；dtype 规则由调用方决定
export function mapA(a: NdArray, f: (v: number) => number, dt: Dtype): NdArray {
  return new NdArray(a.data.map(v => f(num2(v))), a.shape.slice(), dt);
}

// 数学 ufunc（sqrt/exp/log/sin 等一律 float64）
export function mathUfunc(name: string, a: any): NdArray {
  const A = a as NdArray;
  const f = UF[name];
  if (!f) throw new Error('AttributeError: numpy 暂不支持 ' + name);
  const g: (v: number) => number = (v) => {
    const r = f(v);
    if (typeof r !== 'number' || isNaN(r)) return NaN;
    return r;
  };
  if (name === 'log' || name === 'log2' || name === 'log10' || name === 'sqrt') {
    // numpy：负数输入产生 nan 并告警，这里静默 nan
    return mapA(A, v => (v < 0 ? NaN : g(v)), 'float64');
  }
  return mapA(A, g, 'float64');
}

const UF: Record<string, (v: number) => number> = {
  sqrt: Math.sqrt, exp: Math.exp, log: Math.log, log2: Math.log2, log10: Math.log10,
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc,
  negative: v => -v, sign: v => Math.sign(v),
  reciprocal: v => (v === 0 ? Infinity : 1 / v),
};

// abs/floor/ceil 保 dtype（int64 输入 abs 仍 int64）
export function absLike(name: string, a: any): NdArray {
  const A = a as NdArray;
  const dt = A.dtype === 'bool' ? 'int64' : A.dtype;
  if (name === 'abs') return mapA(A, v => Math.abs(v), dt);
  if (name === 'floor') return mapA(A, v => Math.floor(v), dt);
  if (name === 'ceil') return mapA(A, v => Math.ceil(v), dt);
  if (name === 'round') return mapA(A, v => roundHalfEven(v), dt);
  throw new Error('AttributeError: numpy 暂不支持 ' + name);
}

// Python/numpy 银行家舍入
export function roundHalfEven(v: number, digits?: number): number {
  const p = digits === undefined ? 0 : digits;
  const m = Math.pow(10, p);
  const x = v * m;
  const f = Math.floor(Math.abs(x));
  const diff = Math.abs(x) - f;
  let r: number;
  if (diff > 0.5) r = f + 1;
  else if (diff < 0.5) r = f;
  else r = f % 2 === 0 ? f : f + 1;
  return Math.sign(x) * r / m;
}

// 双输入 ufunc：maximum/minimum/power（广播）
export function binUfunc(name: string, a: any, b: any): NdArray {
  const r = binop(name === 'power' ? '**' : name === 'maximum' ? 'mx' : name === 'minimum' ? 'mn' : op0(name), a, b);
  if (name === 'maximum' || name === 'minimum') {
    // maximum/minimum 对 bool 输出 int
    const out = r as NdArray;
    return new NdArray(out.data, out.shape, out.dtype === 'bool' ? 'int64' : out.dtype);
  }
  return r as NdArray;
}
function op0(name: string): string {
  if (name === 'power') return '**';
  throw new Error('AttributeError: numpy 暂不支持 ' + name);
}
// maximum/minimum 需要走广播但不是算术 op —— 单独实现
export function maxmin(name: 'maximum' | 'minimum', a: any, b: any): NdArray {
  const pick = (x: number, y: number) => (name === 'maximum' ? Math.max(x, y) : Math.min(x, y));
  if (!isNd(a) && !isNd(b)) {
    const r = pick(num2(a), num2(b));
    return new NdArray([r], [1], Number.isInteger(r) ? 'int64' : 'float64');
  }
  const A = isNd(a) ? (a as NdArray) : new NdArray([num2(a)], [1], 'float64');
  const B = isNd(b) ? (b as NdArray) : new NdArray([num2(b)], [1], 'float64');
  const [outSh, sa, sb] = bcast(A.shape, B.shape);
  const total = numel(outSh);
  const out: any[] = new Array(total);
  const nd = outSh.length;
  const idx = new Array(nd).fill(0);
  for (let k = 0; k < total; k++) {
    let oa = 0, ob = 0;
    for (let d = 0; d < nd; d++) { oa += idx[d] * sa[d]; ob += idx[d] * sb[d]; }
    out[k] = pick(num2(A.data[oa]), num2(B.data[ob]));
    for (let d = nd - 1; d >= 0; d--) { if (++idx[d] < outSh[d]) break; idx[d] = 0; }
  }
  const allInt = out.every(v => Number.isInteger(v));
  return new NdArray(out, outSh, allInt ? 'int64' : 'float64');
}

// clip：np.clip(a, lo, hi)
export function clip(a: any, lo: any, hi?: any): NdArray {
  const A = a as NdArray;
  const l = lo === undefined || lo === null ? -Infinity : num2(lo);
  const h = hi === undefined || hi === null ? Infinity : num2(hi);
  const dt = A.dtype === 'bool' ? 'int64' : A.dtype;
  return new NdArray(A.data.map(v => { const x = num2(v); return Math.min(Math.max(x, l), h); }), A.shape.slice(), dt);
}

// @ 矩阵乘
export function matmul(a: any, b: any): any {
  const A = a as NdArray, B = b as NdArray;
  if (!isNd(A) || !isNd(B)) throw new Error('TypeError: @ 仅支持 numpy 数组');
  const da = A.shape.length, db = B.shape.length;
  if (da === 1 && db === 1) {
    if (A.shape[0] !== B.shape[0]) throw new Error('ValueError: shapes (' + A.shape + ') (' + B.shape + ') not aligned');
    let s = 0;
    for (let i = 0; i < A.shape[0]; i++) s += num2(A.data[i]) * num2(B.data[i]);
    return s;
  }
  if (da === 2 && db === 2) {
    const [m, k] = A.shape, [k2, n] = B.shape;
    if (k !== k2) throw new Error('ValueError: shapes (' + A.shape.join(',') + ') and (' + B.shape.join(',') + ') not aligned: ' + k + ' (dim 1) != ' + k2 + ' (dim 0)');
    const dt = promote(A.dtype, B.dtype);
    const out: any[] = new Array(m * n).fill(0);
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < n; j++) {
        let s = 0;
        for (let t = 0; t < k; t++) s += num2(A.data[i * k + t]) * num2(B.data[t * n + j]);
        out[i * n + j] = dt === 'int64' ? Math.round(s) : s;
      }
    }
    return new NdArray(out, [m, n], dt);
  }
  if (da === 2 && db === 1) {
    const [m, k] = A.shape;
    if (k !== B.shape[0]) throw new Error('ValueError: shapes (' + A.shape.join(',') + ') and (' + B.shape.join(',') + ') not aligned');
    const dt = promote(A.dtype, B.dtype);
    const out: any[] = [];
    for (let i = 0; i < m; i++) {
      let s = 0;
      for (let t = 0; t < k; t++) s += num2(A.data[i * k + t]) * num2(B.data[t]);
      out.push(dt === 'int64' ? Math.round(s) : s);
    }
    return new NdArray(out, [m], dt);
  }
  if (da === 1 && db === 2) {
    const [k, n] = B.shape;
    if (A.shape[0] !== k) throw new Error('ValueError: shapes (' + A.shape.join(',') + ') and (' + B.shape.join(',') + ') not aligned');
    const dt = promote(A.dtype, B.dtype);
    const out: any[] = [];
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let t = 0; t < k; t++) s += num2(A.data[t]) * num2(B.data[t * n + j]);
      out.push(dt === 'int64' ? Math.round(s) : s);
    }
    return new NdArray(out, [n], dt);
  }
  throw new Error('ValueError: matmul 当前仅支持 1D/2D 向量与矩阵组合');
}

// np.where(cond, x, y)：三路广播
export function where(c: any, x?: any, y?: any): any {
  if (x === undefined && y === undefined) {
    // 单参数：返回非零下标元组（简化为仅 1D 支持）
    const A = c as NdArray;
    if (A.shape.length !== 1) throw new Error('ValueError: where 单参数形式当前仅支持一维数组');
    return A.data.map((v, i) => (num2(v) !== 0 ? i : -1)).filter(i => i >= 0);
  }
  const C = c as NdArray;
  if (!isNd(C)) throw new Error('ValueError: where 条件应为数组');
  // 转成统一 ndarray 再三路广播：cond 转 int，x/y 广播进同形状
  const cond = new NdArray(C.data.map(v => num2(v) !== 0), C.shape.slice(), 'bool');
  const X = isNd(x) ? x : new NdArray([num2(x)], [1], typeof x === 'boolean' ? 'bool' : 'int64');
  const Y = isNd(y) ? y : new NdArray([num2(y)], [1], typeof y === 'boolean' ? 'bool' : 'int64');
  // 三路广播：cond 与 X 广播得 sh1，再与 Y 广播得 shF
  const sh1 = bcast(cond.shape, X.shape)[0];
  const shF = bcast(sh1, Y.shape)[0];
  const [, sc] = bcast(cond.shape, shF);
  const [, sx] = bcast(X.shape, shF);
  const [, sy] = bcast(Y.shape, shF);
  const total = numel(shF);
  const out: any[] = new Array(total);
  const nd = shF.length;
  const idx = new Array(nd).fill(0);
  for (let k = 0; k < total; k++) {
    let oc = 0, ox = 0, oy = 0;
    for (let d = 0; d < nd; d++) { oc += idx[d] * sc[d]; ox += idx[d] * sx[d]; oy += idx[d] * sy[d]; }
    out[k] = cond.data[oc] ? num2(X.data[ox]) : num2(Y.data[oy]);
    for (let d = nd - 1; d >= 0; d--) { if (++idx[d] < shF[d]) break; idx[d] = 0; }
  }
  const allBool = (X.dtype === 'bool' && Y.dtype === 'bool');
  const allInt = out.every(v => Number.isInteger(v));
  return new NdArray(out, shF, allBool ? 'bool' : allInt ? 'int64' : 'float64');
}

// 比较运算（元素级 → bool 数组；标量对标量走 JS 原生由钩子外部判断）
export function cmpOp(op: string, a: any, b: any): any {
  if (!isNd(a) && !isNd(b)) {
    const x = num2(a), y = num2(b);
    switch (op) {
      case '<': return x < y;
      case '>': return x > y;
      case '<=': return x <= y;
      case '>=': return x >= y;
      case '==': return x === y;
      case '!=': return x !== y;
    }
  }
  const A = isNd(a) ? (a as NdArray) : new NdArray([num2(a)], [1], typeof a === 'boolean' ? 'bool' : Number.isInteger(a) ? 'int64' : 'float64');
  const B = isNd(b) ? (b as NdArray) : new NdArray([num2(b)], [1], typeof b === 'boolean' ? 'bool' : Number.isInteger(b) ? 'int64' : 'float64');
  const [outSh, sa, sb] = bcast(A.shape, B.shape);
  const total = numel(outSh);
  const out: boolean[] = new Array(total);
  const nd = outSh.length;
  const idx = new Array(nd).fill(0);
  for (let k = 0; k < total; k++) {
    let oa = 0, ob = 0;
    for (let d = 0; d < nd; d++) { oa += idx[d] * sa[d]; ob += idx[d] * sb[d]; }
    const x = num2(A.data[oa]), y = num2(B.data[ob]);
    switch (op) {
      case '<': out[k] = x < y; break;
      case '>': out[k] = x > y; break;
      case '<=': out[k] = x <= y; break;
      case '>=': out[k] = x >= y; break;
      case '==': out[k] = x === y; break;
      case '!=': out[k] = x !== y; break;
      default: throw new Error('ValueError: 未支持比较符 ' + op);
    }
    for (let d = nd - 1; d >= 0; d--) { if (++idx[d] < outSh[d]) break; idx[d] = 0; }
  }
  return new NdArray(out, outSh, 'bool');
}

// 取反（-arr）
export function negArr(a: NdArray): NdArray {
  const dt = a.dtype === 'bool' ? 'int64' : a.dtype;
  return new NdArray(a.data.map(v => -num2(v)), a.shape.slice(), dt);
}
