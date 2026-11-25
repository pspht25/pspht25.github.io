// numpy 子集组装：createNumpy() 构建 np 对象 + 运行时钩子注册
// 用法：new Function('$npmod', RUNTIME + '\n' + js)(createNumpy())
// RUNTIME 内部：if ($npmod) { $MODULES.numpy = $npmod.np; $numpyHook($npmod.__hooks); }
import { NdArray, Dtype, asarray, array, zeros, ones, full, eye, identity, arange, linspace, diag, transpose, isNd, num2, pickAxis } from './core';
import { binop, mathUfunc, absLike, binUfunc, maxmin, clip, matmul, where, cmpOp, negArr, scalarOp } from './ops';
import { agg, argOp } from './reduce';
import { getitem, setitem, PySlice } from './indexing';
import { buildStr, reprArr } from './format';
import { sortArr, argsortArr, unique, concatenate, vstack, hstack, norm, det, inv, makeRandom } from './funcs';

export interface NumpyPackage {
  np: any;
  __hooks: {
    UO: (op: string, a: any, b: any) => any;
    UC: (op: string, a: any, b: any) => any;
    UEQ: (a: any, b: any, ne: boolean) => any;
    UI: (a: any, i: any, v?: any) => any;
    UR: (a: any, mode: 's' | 'r') => string;
    UN: (a: any) => any;
  };
}

export function createNumpy(): NumpyPackage {
  // $MOBJ kw 错位自愈：args 为空时 kw 对象落在第一个参数位
  const fixKw = (axis: any, kw: any): [any, any] => {
    if (axis && typeof axis === 'object' && !Array.isArray(axis) && !isNd(axis) &&
        (axis.axis !== undefined || axis.keepdims !== undefined || axis.ddof !== undefined)) {
      return [undefined, axis];
    }
    return [axis, kw];
  };
  // 聚合方法挂到 NdArray 原型（多模块解耦，避免循环依赖）
  const proto = NdArray.prototype as any;
  const aggWrap = (name: string) =>
    function (this: NdArray, axis?: any, kw?: any) {
      const [a2, k2] = fixKw(axis, kw);
      return agg(name, this, pickAxis(a2, k2), k2);
    };
  proto.sum = aggWrap('sum');
  proto.prod = aggWrap('prod');
  proto.mean = aggWrap('mean');
  proto.var = function (this: NdArray, axis?: any, kw?: any) { const [a2, k2] = fixKw(axis, kw); return agg('var', this, pickAxis(a2, k2), k2); };
  proto.std = function (this: NdArray, axis?: any, kw?: any) { const [a2, k2] = fixKw(axis, kw); return agg('std', this, pickAxis(a2, k2), k2); };
  proto.max = aggWrap('max');
  proto.min = aggWrap('min');
  proto.all = aggWrap('all');
  proto.any = aggWrap('any');
  proto.cumsum = function (this: NdArray, axis?: any, kw?: any) { const [a2, k2] = fixKw(axis, kw); return agg('cumsum', this, pickAxis(a2, k2), k2); };
  proto.cumprod = function (this: NdArray, axis?: any, kw?: any) { const [a2, k2] = fixKw(axis, kw); return agg('cumprod', this, pickAxis(a2, k2), k2); };
  proto.argmax = function (this: NdArray, axis?: any, kw?: any) { const [a2, k2] = fixKw(axis, kw); return argOp('argmax', this, pickAxis(a2, k2)); };
  proto.argmin = function (this: NdArray, axis?: any, kw?: any) { const [a2, k2] = fixKw(axis, kw); return argOp('argmin', this, pickAxis(a2, k2)); };
  // 原地排序（py 语义：a.sort() 就地修改并返回 None）
  proto.sort = function (this: NdArray, axis?: any, kw?: any) {
    const sorted = sortArr(this, axis, kw);
    for (let i = 0; i < this.data.length; i++) this.data[i] = sorted.data[i];
    return null;
  };
  proto.argsort = function (this: NdArray, axis?: any, kw?: any) { const [a2, k2] = fixKw(axis, kw); return argsortArr(this, a2, k2); };
  proto.clip = function (this: NdArray, lo: any, hi?: any) { return clip(this, lo, hi); };
  proto.round = function (this: NdArray, digits?: any) { return absLike('round', this); };

  const rand = makeRandom();

  const np: any = {};
  np.__npmodule = true;
  // 创建
  np.array = array;
  np.asarray = asarray;
  np.zeros = zeros;
  np.ones = ones;
  np.full = full;
  np.eye = eye;
  np.identity = identity;
  np.arange = arange;
  np.linspace = linspace;
  np.diag = diag;
  // 运算
  np.abs = (a: any) => (isNd(a) ? absLike('abs', a) : Math.abs(num2(a)));
  np.floor = (a: any) => (isNd(a) ? absLike('floor', a) : Math.floor(num2(a)));
  np.ceil = (a: any) => (isNd(a) ? absLike('ceil', a) : Math.ceil(num2(a)));
  np.round = (a: any) => (isNd(a) ? absLike('round', a) : Math.round(num2(a)));
  np.maximum = (a: any, b: any) => maxmin('maximum', a, b);
  np.minimum = (a: any, b: any) => maxmin('minimum', a, b);
  np.power = (a: any, b: any) => binUfunc('power', a, b);
  np.clip = clip;
  np.where = where;
  np.concatenate = concatenate;
  np.vstack = vstack;
  np.hstack = hstack;
  np.sort = sortArr;
  np.argsort = argsortArr;
  np.unique = unique;
  np.all = (a: any, kw?: any) => (isNd(a) ? agg('all', a, pickAxis(undefined, kw), kw) : !!num2(a));
  np.any = (a: any, kw?: any) => (isNd(a) ? agg('any', a, pickAxis(undefined, kw), kw) : !!num2(a));
  // 顶层聚合函数
  const aggFn = (name: string) => (a: any, kw?: any) => {
    if (!isNd(a)) throw new Error('TypeError: np.' + name + ' 需要 numpy 数组');
    const [a2, k2] = fixKw(undefined, kw);
    return agg(name, a, pickAxis(a2, k2), k2);
  };
  np.sum = aggFn('sum');
  np.prod = aggFn('prod');
  np.mean = aggFn('mean');
  np.std = aggFn('std');
  np.var = aggFn('var');
  np.max = aggFn('max');
  np.min = aggFn('min');
  np.amax = aggFn('max');
  np.amin = aggFn('min');
  np.cumsum = aggFn('cumsum');
  np.cumprod = aggFn('cumprod');
  np.argmax = (a: any, kw?: any) => argOp('argmax', a, pickAxis(undefined, kw));
  np.argmin = (a: any, kw?: any) => argOp('argmin', a, pickAxis(undefined, kw));
  np.median = (a: any) => {
    if (!isNd(a)) throw new Error('TypeError: np.median 需要 numpy 数组');
    const vs = a.data.map((v: any) => num2(v)).sort((x: number, y: number) => x - y);
    const n = vs.length;
    return n % 2 ? vs[(n - 1) / 2] : (vs[n / 2 - 1] + vs[n / 2]) / 2;
  };
  // 数学 ufunc（数组；标量直接走 Math 映射，py ufunc 本就收标量）
  const SCUF: Record<string, (v: number) => number> = { sqrt: Math.sqrt, exp: Math.exp, log: Math.log, log2: Math.log2, log10: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, negative: (v) => -v, sign: Math.sign, reciprocal: (v) => 1 / v };
  for (const nm of ['sqrt', 'exp', 'log', 'log2', 'log10', 'sin', 'cos', 'tan', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh', 'negative', 'sign', 'reciprocal']) {
    np[nm] = (a: any) => (isNd(a) ? mathUfunc(nm, a) : SCUF[nm](num2(a)));
  }
  // 常量
  np.pi = Math.PI;
  np.e = Math.E;
  np.nan = NaN;
  np.inf = Infinity;
  np.NAN = NaN;
  // linalg
  np.linalg = { norm, det, inv };
  // random
  np.random = rand;

  const hooks: NumpyPackage['__hooks'] = {
    UO: (op, a, b) => {
      if (op === '@') return matmul(a, b);
      return binop(op, a, b);
    },
    UC: (op, a, b) => cmpOp(op, a, b),
    UEQ: (a, b, ne) => {
      const eq = cmpOp('==', a, b);
      if (!ne) return eq;
      const e = eq as NdArray;
      return new NdArray(e.data.map(v => !v), e.shape.slice(), 'bool');
    },
    UI: (a, i, v) => (v === undefined ? getitem(a, i) : (setitem(a, i, v), undefined)),
    UR: (a, mode) => reprArr(a, mode),
    UN: (a) => negArr(a),
  };

  return { np, __hooks: hooks };
}
