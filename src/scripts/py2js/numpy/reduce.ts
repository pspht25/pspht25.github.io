// numpy 子集：聚合归约（sum/mean/std/var/max/min/argmax/argmin/cumsum/prod/all/any）
import { NdArray, Dtype, numel, stridesOf, num2, iterateLines } from './core';

type RedFn = (vals: number[]) => number;

const REDS: Record<string, RedFn> = {
  sum: vs => vs.reduce((a, b) => a + b, 0),
  prod: vs => vs.reduce((a, b) => a * b, 1),
  mean: vs => vs.reduce((a, b) => a + b, 0) / vs.length,
  max: vs => { let m = -Infinity; for (const v of vs) if (v > m) m = v; return vs.length ? m : NaN; },
  min: vs => { let m = Infinity; for (const v of vs) if (v < m) m = v; return vs.length ? m : NaN; },
};

// 方差/标准差（ddof 支持 0/1）
function variance(vals: number[], ddof: number): number {
  const n = vals.length;
  if (n === 0) return NaN;
  const m = vals.reduce((a, b) => a + b, 0) / n;
  const s = vals.reduce((a, b) => a + (b - m) * (b - m), 0);
  const d = n - ddof;
  return d <= 0 ? NaN : s / d;
}

// 核心聚合：axis=null → 标量；axis=k → 沿轴归约；keepdims 可选
export function agg(name: string, a: NdArray, axis: any, kw: any): any {
  const keepdims = !!(kw && kw.keepdims);
  const ddof = kw && kw.ddof !== undefined ? kw.ddof : 0;
  const isBool = a.dtype === 'bool';
  const dt: Dtype = isBool ? 'int64' : a.dtype;
  const valsOf = (vals: number[]) => vals.map(v => (typeof v === 'boolean' ? (v ? 1 : 0) : v));

  // all/any 特判（bool 语义）
  if (name === 'all' || name === 'any') {
    const f = name === 'all'
      ? (vs: number[]) => vs.every(v => v !== 0)
      : (vs: number[]) => vs.some(v => v !== 0);
    if (axis === null || axis === undefined) {
      const all = f(valsOf(a.data));
      if (keepdims) return new NdArray([all], a.shape.map(() => 1), 'bool');
      return all;
    }
    return reduceAxis(a, axis, keepdims, (vs, _) => f(valsOf(vs)), 'bool');
  }

  if (name === 'cumsum' || name === 'cumprod') {
    // 累积：默认沿最后一轴（多维时按 flatten 展开序，教学子集按 1D/2D 最后一轴）
    const isSum = name === 'cumsum';
    if (a.shape.length === 1) {
      let acc = 0, p = 1;
      const out = a.data.map(v => { const x = num2(v); acc += x; p *= x; return isSum ? acc : p; });
      return new NdArray(out, a.shape.slice(), isSum ? dt : dt);
    }
    // 多维：沿 axis=-1（默认）逐行累积保形
    const ax = axis === null || axis === undefined ? a.shape.length - 1 : normAxis(axis, a.shape.length);
    if (a.shape.length === 2 && ax === 1) {
      const [r, c] = a.shape;
      const out: number[] = new Array(r * c);
      for (let i = 0; i < r; i++) {
        let acc = 0, p = 1;
        for (let j = 0; j < c; j++) { const x = num2(a.data[i * c + j]); acc += x; p *= x; out[i * c + j] = isSum ? acc : p; }
      }
      return new NdArray(out, a.shape.slice(), dt);
    }
    if (a.shape.length === 2 && ax === 0) {
      const [r, c] = a.shape;
      const out: number[] = new Array(r * c);
      for (let j = 0; j < c; j++) {
        let acc = 0, p = 1;
        for (let i = 0; i < r; i++) { const x = num2(a.data[i * c + j]); acc += x; p *= x; out[i * c + j] = isSum ? acc : p; }
      }
      return new NdArray(out, a.shape.slice(), dt);
    }
    // 更高维：展平累积（限制说明）
    let acc = 0, p = 1;
    const out = a.data.map(v => { const x = num2(v); acc += x; p *= x; return isSum ? acc : p; });
    return new NdArray(out, a.shape.slice(), dt);
  }

  if (name === 'std' || name === 'var') {
    const f = (vs: number[]) => {
      const v = variance(valsOf(vs), ddof);
      return name === 'std' ? Math.sqrt(v) : v;
    };
    if (axis === null || axis === undefined) {
      const r = f(valsOf(a.data));
      if (keepdims) return new NdArray([r], a.shape.map(() => 1), 'float64');
      return r;
    }
    return reduceAxis(a, axis, keepdims, f, 'float64');
  }

  const rf = REDS[name];
  if (!rf) throw new Error('AttributeError: numpy 暂不支持 ' + name);
  // mean 恒为浮点（py 语义）
  const outDt: Dtype = name === 'mean' ? 'float64' : dt;

  if (axis === null || axis === undefined) {
    const r = rf(valsOf(a.data));
    if (keepdims) return new NdArray([r], a.shape.map(() => 1), outDt);
    return r;
  }
  return reduceAxis(a, axis, keepdims, (vs, _) => rf(valsOf(vs)), outDt);
}

// argmax/argmin：axis=null 返回展平下标；axis=k 返回沿轴下标数组
export function argOp(name: 'argmax' | 'argmin', a: NdArray, axis: any): any {
  const better = name === 'argmax'
    ? (best: number, v: number) => v > best
    : (best: number, v: number) => v < best;
  if (axis === null || axis === undefined) {
    let bi = 0, bv = num2(a.data[0]);
    for (let i = 1; i < a.data.length; i++) {
      const v = num2(a.data[i]);
      if (better(bv, v)) { bv = v; bi = i; }
    }
    return bi;
  }
  const ax = normAxis(axis, a.shape.length);
  const outSh = a.shape.filter((_, d) => d !== ax);
  const st = stridesOf(a.shape);
  const out: number[] = [];
  iterateLines(a, ax, (base, stride) => {
    const n = a.shape[ax];
    let bi = 0, bv = num2(a.data[base]);
    for (let i = 1; i < n; i++) {
      const v = num2(a.data[base + i * stride]);
      if (better(bv, v)) { bv = v; bi = i; }
    }
    out.push(bi);
  });
  return new NdArray(out, outSh.length ? outSh : [1], 'int64');
}

function normAxis(axis: any, nd: number): number {
  let ax = typeof axis === 'number' ? axis : Number(axis);
  if (!Number.isInteger(ax)) throw new Error('TypeError: axis 应为整数');
  if (ax < 0) ax += nd;
  if (ax < 0 || ax >= nd) throw new Error('AxisError: axis ' + axis + ' is out of bounds for array of dimension ' + nd);
  return ax;
}

// 沿 ax 轴归约：f(该轴取值数组) → 标量
function reduceAxis(a: NdArray, axis: any, keepdims: boolean, f: (vs: number[], meta: { base: number; stride: number }) => number, dt: Dtype): NdArray {
  const nd = a.shape.length;
  const ax = normAxis(axis, nd);
  const outSh = a.shape.filter((_, d) => d !== ax);
  const out: number[] = [];
  iterateLines(a, ax, (base, stride) => {
    const n = a.shape[ax];
    const vs: number[] = new Array(n);
    for (let i = 0; i < n; i++) vs[i] = num2(a.data[base + i * stride]);
    out.push(f(vs, { base, stride }));
  });
  let sh = outSh;
  if (keepdims) {
    sh = a.shape.slice();
    sh[ax] = 1;
  }
  return new NdArray(out, sh.length ? sh : [1], dt);
}
