// numpy 子集：索引与切片（单下标/元组下标/切片/布尔掩码/花式索引/赋值）
import { NdArray, numel, stridesOf, isNd, num2 } from './core';

// 切片对象（由 $slice 钩子传入）
export interface PySlice { __pyslice: true; start: any; end: any; step: any; }
export const isSlice = (x: any): x is PySlice => !!(x && x.__pyslice === true);

function resolveSlice(sl: PySlice, len: number): number[] {
  let step = sl.step === undefined || sl.step === null ? 1 : num2(sl.step);
  if (step === 0) throw new Error('ValueError: slice step cannot be zero');
  let start: number, stop: number;
  if (step > 0) {
    start = sl.start === undefined || sl.start === null ? 0 : norm(sl.start, len);
    stop = sl.end === undefined || sl.end === null ? len : norm(sl.end, len);
  } else {
    start = sl.start === undefined || sl.start === null ? len - 1 : normNeg(sl.start, len);
    stop = sl.end === undefined || sl.end === null ? -1 : normNeg(sl.end, len);
  }
  const out: number[] = [];
  if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
  else for (let i = start; i > stop; i += step) out.push(i);
  return out;
}
function norm(v: number, len: number): number { let i = Math.trunc(v); if (i < 0) i += len; return Math.max(0, Math.min(i, len)); }
function normNeg(v: number, len: number): number { let i = Math.trunc(v); if (i < 0) i += len; return Math.max(-1, Math.min(i, len - 1)); }

// 花式/混合索引解析结果：每轴 int | int[] | null（全选）
type AxisIdx = number | number[];

const isIntArr = (x: any): x is number[] => Array.isArray(x) && x.length > 0 && x.every(v => typeof v === 'number' && Number.isInteger(v));

// 主入口：arr[...] 取值
export function getitem(a: NdArray, idx: any): any {
  if (isSlice(idx)) {
    if (a.shape.length !== 1) throw new Error('ValueError: 切片下标当前仅支持一维数组');
    const ids = resolveSlice(idx, a.shape[0]);
    return new NdArray(ids.map(i => a.data[i]), [ids.length], a.dtype);
  }
  if (typeof idx === 'number' && Number.isInteger(idx)) return singleIndex(a, idx);
  if (typeof idx === 'number') throw new Error('IndexError: 索引应为整数');
  if (isNd(idx) && idx.dtype === 'bool') return boolMask(a, idx);
  // 元组下标 a[0, 2]（转译层打 __pytuple 标记，与列表花式索引区分）
  if (idx && typeof idx === 'object' && idx.__pytuple) {
    const ids = idx.__pytuple;
    if (!Array.isArray(ids)) throw new Error('IndexError: 不支持下标');
    const isMixed = ids.some((v: any) => v === ':' || (v && typeof v === 'object' && v.__pyslice));
    if (isMixed) return mixedGet(a, ids);
    const allInt = ids.every((v: any) => typeof v === 'number' && Number.isInteger(v));
    if (allInt && ids.length === a.shape.length) return multiIndex(a, ids);
    if (ids.length === a.shape.length) return advanced(a, ids);
    throw new Error('IndexError: 元组下标数量 (' + ids.length + ') 与维度 (' + a.shape.length + ') 不匹配');
  }
  if (Array.isArray(idx)) {
    // 布尔数组（原生 JS 数组形式，如 a[arr > 2] 不可能——比较返回 NdArray；原生布尔数组极少见，支持之）
    if (idx.length && idx.every(v => typeof v === 'boolean')) {
      if (idx.length !== a.shape[0]) throw new Error('IndexError: boolean index did not match indexed array along dimension 0');
      const rowLen = numel(a.shape.slice(1));
      const picked: any[] = [];
      for (let i = 0; i < idx.length; i++) if (idx[i]) for (let j = 0; j < rowLen; j++) picked.push(a.data[i * rowLen + j]);
      const sh = a.shape.length === 1 ? [picked.length] : [picked.length / Math.max(rowLen, 1), ...a.shape.slice(1)];
      return new NdArray(picked, sh, a.dtype);
    }
    // 扁平全整数数组：ndim 元组下标（长度==ndim）或一维花式
    if (idx.length && idx.every(v => typeof v === 'number' && Number.isInteger(v))) {
      return advanced(a, [idx]);
    }
    // 空数组：花式选 0 行
    if (!idx.length) return advanced(a, [idx]);
    // 混合/嵌套：多轴花式
    return advanced(a, idx.map(v => (isNd(v) ? v.data.map(x => num2(x)) : v)));
  }
  throw new Error('IndexError: 不支持下标类型 ' + typeof idx);
}

// 单整数下标：1D → 标量；>1D → 行子数组
export function singleIndex(a: NdArray, i: number): any {
  let ii = Math.trunc(i);
  const n = a.shape[0];
  if (ii < 0) ii += n;
  if (ii < 0 || ii >= n) throw new Error('IndexError: index ' + i + ' is out of bounds for axis 0 with size ' + n);
  if (a.shape.length === 1) return a.data[ii];
  const rowLen = numel(a.shape.slice(1));
  return new NdArray(a.data.slice(ii * rowLen, (ii + 1) * rowLen), a.shape.slice(1), a.dtype);
}

// 多轴整数元组下标：a[1, 2] → 标量
function multiIndex(a: NdArray, ids: number[]): any {
  let cur: NdArray = a;
  for (const id of ids) {
    if (cur.shape.length === 0) throw new Error('IndexError: 过多的下标');
    const r = singleIndex(cur, id);
    if (isNd(r)) cur = r;
    else return r;
  }
  return cur;
}

// 布尔掩码：形状一致 → 1D 选中值
export function boolMask(a: NdArray, mask: NdArray): NdArray {
  if (mask.shape.length !== a.shape.length || mask.shape.some((s, i) => s !== a.shape[i])) {
    throw new Error('IndexError: boolean index did not match indexed array');
  }
  const picked: any[] = [];
  for (let i = 0; i < a.data.length; i++) if (mask.data[i]) picked.push(a.data[i]);
  return new NdArray(picked, [picked.length], a.dtype);
}

// 高级索引：advanced(a, axes)——axes 为每轴 int | int[]
// 支持：单轴数组选行、双轴配对取元素、整数+数组混合
function advanced(a: NdArray, axes: AxisIdx[]): any {
  if (axes.length > a.shape.length) throw new Error('IndexError: 过多的下标');
  // 归一：负数下标处理
  const normAx = (d: number, v: number): number => { let i = Math.trunc(v); if (i < 0) i += a.shape[d]; if (i < 0 || i >= a.shape[d]) throw new Error('IndexError: index ' + v + ' is out of bounds for axis ' + d + ' with size ' + a.shape[d]); return i; };
  const normList = (d: number, arr: number[]): number[] => arr.map(v => normAx(d, v));
  const normed: (number | number[])[] = axes.map((ax, k) => (Array.isArray(ax) ? normList(k, ax) : normAx(k, ax)));

  const arrAxes = normed.filter(v => Array.isArray(v)) as number[][];
  if (arrAxes.length === 0) {
    // 全整数 → multiIndex 已处理；兜底
    return multiIndex(a, normed as number[]);
  }
  if (arrAxes.length === 1 && normed.every(v => Array.isArray(v) || true) && arrAxes.length === 1 && normed.some(v => Array.isArray(v)) && normed.length === 1) {
    // 单轴数组：选该轴子集，其余轴保留
    const d = normed.findIndex(v => Array.isArray(v));
    const ids = normed[d] as number[];
    return pickAxisSubset(a, d, ids);
  }
  // 配对广播：所有数组长度必须相同，或与单整数组合
  const L = arrAxes[0].length;
  if (arrAxes.some(x => x.length !== L)) {
    throw new Error('IndexError: shape mismatch: indexing arrays could not be broadcast together');
  }
  // 生成 L 个下标组合：数组轴循环取值，整数轴固定
  const combos: number[][] = [];
  for (let t = 0; t < L; t++) {
    const combo: number[] = [];
    for (const ax of normed) combo.push(Array.isArray(ax) ? ax[t] : ax);
    combos.push(combo);
  }
  const vals = combos.map(c => flatGet(a, c));
  const dt = a.dtype;
  return new NdArray(vals, [L], dt);
}

// 单轴花式选择：选 d 轴的 ids 子集，其余维度保留
function pickAxisSubset(a: NdArray, d: number, ids: number[]): NdArray {
  const st = stridesOf(a.shape);
  const restSh = a.shape.filter((_, i) => i !== d);
  const restLen = numel(restSh);
  const flatRest = enumerateRest(a.shape, d);
  const out: any[] = new Array(ids.length * restLen);
  for (let t = 0; t < ids.length; t++) {
    for (let r = 0; r < restLen; r++) {
      out[t * restLen + r] = a.data[ids[t] * st[d] + flatRest[r]];
    }
  }
  if (a.shape.length === 1) return new NdArray(out, [ids.length], a.dtype);
  return new NdArray(out, [ids.length, ...restSh], a.dtype);
}

// 枚举除 d 轴外的所有扁平偏移（行主序）
function enumerateRest(shape: number[], d: number): number[] {
  const st = stridesOf(shape);
  const rest: number[] = [];
  for (let i = 0; i < shape.length; i++) if (i !== d) rest.push(i);
  const dims = rest.map(i => shape[i]);
  const total = dims.reduce((x, y) => x * y, 1);
  const out: number[] = [];
  const idx = new Array(dims.length).fill(0);
  for (let k = 0; k < total; k++) {
    let off = 0;
    for (let i = 0; i < dims.length; i++) off += idx[i] * st[rest[i]];
    out.push(off);
    for (let i = dims.length - 1; i >= 0; i--) { if (++idx[i] < dims[i]) break; idx[i] = 0; }
  }
  return out;
}

function flatGet(a: NdArray, ids: number[]): any {
  const st = stridesOf(a.shape);
  let off = 0;
  for (let d = 0; d < ids.length; d++) {
    let i = ids[d];
    if (i < 0) i += a.shape[d];
    off += i * st[d];
  }
  return a.data[off];
}

// 赋值：arr[idx] = v
// 混合下标（元组含 ':' 或切片）：a[:, 1] / a[0:2, 1:3] / a[1, :]
// 返回目标偏移数组与输出形状（getitem/setitem 共用）
function mixedOffsets(a: NdArray, ids: any[]): { offs: number[]; shape: number[] } {
  if (ids.length !== a.shape.length) throw new Error('IndexError: 元组下标数量 (' + ids.length + ') 与维度 (' + a.shape.length + ') 不匹配');
  const dims: number[][] = [];
  for (let d = 0; d < ids.length; d++) {
    const id = ids[d];
    if (id === ':') { dims.push(resolveSlice({ __pyslice: true, start: undefined, end: undefined, step: undefined }, a.shape[d])); continue; }
    if (id && typeof id === 'object' && id.__pyslice) {
      dims.push(resolveSlice(id as PySlice, a.shape[d]));
      continue;
    }
    if (typeof id === 'number' && Number.isInteger(id)) {
      let i = id;
      if (i < 0) i += a.shape[d];
      if (i < 0 || i >= a.shape[d]) throw new Error('IndexError: index ' + id + ' is out of bounds for axis ' + d + ' with size ' + a.shape[d]);
      dims.push([i]);
      continue;
    }
    throw new Error('IndexError: 暂不支持该混合下标元素');
  }
  const shape = dims.filter(ds => ds.length > 1).map(ds => ds.length);
  const st = stridesOf(a.shape);
  const offs: number[] = [];
  const rec = (d: number, off: number) => {
    if (d === dims.length) { offs.push(off); return; }
    for (const i of dims[d]) rec(d + 1, off + i * st[d]);
  };
  rec(0, 0);
  return { offs, shape: shape.length ? shape : [offs.length] };
}

function mixedGet(a: NdArray, ids: any[]): NdArray {
  const { offs, shape } = mixedOffsets(a, ids);
  const allBool = offs.every(o => typeof a.data[o] === 'boolean');
  return new NdArray(offs.map(o => a.data[o]), shape, allBool && offs.length ? 'bool' : a.dtype);
}

function mixedSet(a: NdArray, ids: any[], v: any): void {
  const { offs, shape } = mixedOffsets(a, ids);
  const n = offs.length;
  if (Array.isArray(v)) {
    if (v.length !== n) throw new Error('ValueError: 赋值形状不匹配');
    for (let k = 0; k < n; k++) a.data[offs[k]] = num2(v[k]);
    return;
  }
  if (isNd(v)) {
    const vv = v as NdArray;
    if (vv.size !== n) throw new Error('ValueError: 赋值形状不匹配');
    for (let k = 0; k < n; k++) a.data[offs[k]] = num2(vv.data[k]);
    return;
  }
  const x = num2(v);
  for (let k = 0; k < n; k++) a.data[offs[k]] = x;
}

export function setitem(a: NdArray, idx: any, v: any): void {
  if (isSlice(idx)) {
    if (a.shape.length !== 1) throw new Error('ValueError: 切片赋值当前仅支持一维数组');
    const ids = resolveSlice(idx, a.shape[0]);
    if (isNd(v)) {
      const vv = v as NdArray;
      if (vv.shape.length === 1 && vv.shape[0] === ids.length) {
        for (let k = 0; k < ids.length; k++) a.data[ids[k]] = num2(vv.data[k]);
        return;
      }
      throw new Error('ValueError: 切片赋值长度不匹配');
    }
    if (Array.isArray(v)) {
      if (v.length !== ids.length) throw new Error('ValueError: 切片赋值长度不匹配');
      for (let k = 0; k < ids.length; k++) a.data[ids[k]] = num2(v[k]);
      return;
    }
    const x = num2(v);
    for (const i of ids) a.data[i] = x;
    return;
  }
  if (typeof idx === 'number' && Number.isInteger(idx)) { singleSet(a, idx, v); return; }
  if (isNd(idx) && idx.dtype === 'bool') { maskSet(a, idx, v); return; }
  if (idx && typeof idx === 'object' && idx.__pytuple) {
    const ids = idx.__pytuple;
    if (Array.isArray(ids) && ids.length === a.shape.length && ids.some((x: any) => x === ':' || (x && typeof x === 'object' && x.__pyslice))) {
      mixedSet(a, ids, v);
      return;
    }
    if (Array.isArray(ids) && ids.length === a.shape.length && ids.every((x: any) => typeof x === 'number' && Number.isInteger(x))) {
      const st = stridesOf(a.shape);
      let off = 0;
      for (let d = 0; d < ids.length; d++) {
        let i = ids[d];
        if (i < 0) i += a.shape[d];
        if (i < 0 || i >= a.shape[d]) throw new Error('IndexError: index ' + ids[d] + ' is out of bounds');
        off += i * st[d];
      }
      a.data[off] = num2(v);
      return;
    }
    throw new Error('ValueError: 该元组赋值形式暂不支持');
  }
  if (Array.isArray(idx) && idx.length && idx.every(x => typeof x === 'number' && Number.isInteger(x)) && idx.length === a.shape.length) {
    // 元组下标定位赋值
    const st = stridesOf(a.shape);
    let off = 0;
    for (let d = 0; d < idx.length; d++) {
      let i = idx[d];
      if (i < 0) i += a.shape[d];
      if (i < 0 || i >= a.shape[d]) throw new Error('IndexError: index ' + idx[d] + ' is out of bounds');
      off += i * st[d];
    }
    a.data[off] = num2(v);
    return;
  }
  if (Array.isArray(idx) && idx.length === 1 && Array.isArray(idx[0])) {
    // 花式选行赋值（a[[0,2]] = v）：v 为行数组或标量
    const ids = (idx[0] as number[]).map(x => (x < 0 ? x + a.shape[0] : x));
    const rowLen = numel(a.shape.slice(1));
    if (isNd(v)) {
      const vv = v as NdArray;
      if (vv.shape.length === 1 && vv.shape[0] === ids.length * rowLen) {
        for (let t = 0; t < ids.length; t++) for (let j = 0; j < rowLen; j++) a.data[ids[t] * rowLen + j] = num2(vv.data[t * rowLen + j]);
        return;
      }
      throw new Error('ValueError: 花式赋值形状不匹配');
    }
    const x = num2(v);
    for (const i of ids) for (let j = 0; j < rowLen; j++) a.data[i * rowLen + j] = x;
    return;
  }
  throw new Error('ValueError: 该赋值形式暂不支持（支持单下标、切片、布尔掩码、元组下标与花式选行）');
}

function singleSet(a: NdArray, i: number, v: any): void {
  let ii = Math.trunc(i);
  const n = a.shape[0];
  if (ii < 0) ii += n;
  if (ii < 0 || ii >= n) throw new Error('IndexError: index ' + i + ' is out of bounds for axis 0 with size ' + n);
  if (a.shape.length === 1) { a.data[ii] = num2(v); return; }
  // 行赋值：行数组（等长）或标量广播
  const rowLen = numel(a.shape.slice(1));
  if (isNd(v)) {
    const vv = v as NdArray;
    const flat = vv.shape.length === 1 ? vv : new NdArray(vv.data, [vv.size], vv.dtype);
    if (flat.size === rowLen) {
      for (let j = 0; j < rowLen; j++) a.data[ii * rowLen + j] = num2(flat.data[j]);
      return;
    }
    throw new Error('ValueError: could not broadcast input array from shape ' + vv.shape + ' into shape (' + a.shape.slice(1).join(',') + ')');
  }
  if (Array.isArray(v)) {
    const flat: any[] = [];
    collect(v, flat);
    if (flat.length === rowLen) {
      for (let j = 0; j < rowLen; j++) a.data[ii * rowLen + j] = num2(flat[j]);
      return;
    }
    throw new Error('ValueError: 行赋值长度不匹配');
  }
  const x = num2(v);
  for (let j = 0; j < rowLen; j++) a.data[ii * rowLen + j] = x;
}

function collect(o: any, out: any[]) {
  if (Array.isArray(o)) { for (const x of o) collect(x, out); return; }
  out.push(o);
}

function maskSet(a: NdArray, mask: NdArray, v: any): void {
  const picked: number[] = [];
  for (let i = 0; i < a.data.length; i++) if (mask.data[i]) picked.push(i);
  if (isNd(v)) {
    const flat = (v as NdArray).data.map(x => num2(x));
    if (flat.length !== picked.length) throw new Error('ValueError: 掩码赋值长度不匹配');
    for (let k = 0; k < picked.length; k++) a.data[picked[k]] = flat[k];
    return;
  }
  const x = num2(v);
  for (const i of picked) a.data[i] = x;
}
