// numpy 子集：str()/repr() 显示格式（对齐 Python numpy 2.4.6 print 输出）
// 权威规则（读 numpy FloatingFormat/dragon4 源码 + 实测）：
// - float：元素 = int_part.rjust(L) + '.' + frac_part.padEnd(R)；L = max(len(int含负号))，R = max(len(frac))
//   整数浮点显示 'x.'；小数 8 位去尾零；nan/inf/-inf；join(' ')
// - int/bool：元素 rjust(max(len))；bool 显示 True/False
// - str 模式：叶子行缩进 nd-1，顶层块（nd>=3）间 '\n\n' 顶格，其余行 '\n'+缩进(nd-d-1)
// - repr 模式：join(', ')，行缩进 6+depth-1（叶子）、块间 '\n\n'+(6+depth)（仅 nd>=3 顶层）、dtype 后缀仅 bool
import { NdArray } from './core';

// 元素原始字符串（不含对齐）
function rawStr(v: any, dt: string): string {
  if (typeof v === 'boolean') return v ? 'True' : 'False';
  if (typeof v !== 'number') return String(v);
  if (Number.isNaN(v)) return 'nan';
  if (v === Infinity) return 'inf';
  if (v === -Infinity) return '-inf';
  if (dt === 'int64') return String(v);
  // float64：整数值 → 'x.'；小数 → 8 位去尾零
  if (Number.isInteger(v) && Math.abs(v) < 1e16) return String(v) + '.';
  if (Math.abs(v) >= 1e16 || (Math.abs(v) < 1e-4 && v !== 0)) {
    return v.toExponential(7).replace(/\.?0+e/, 'e');
  }
  let s = v.toFixed(8);
  s = s.replace(/(\.\d*?)0+$/, '$1');
  if (s === '-0.') s = '0.';
  if (s.endsWith('.')) return s;
  return s;
}

// 对齐参数与单元格函数
function makeCellFn(a: NdArray): (v: any) => string {
  if (a.dtype === 'float64') {
    const raws = a.data.map(v => rawStr(v, 'float64'));
    let L = 0, R = 0;
    for (const s of raws) {
      if (s === 'nan' || s === 'inf' || s === '-inf') continue;
      const [ip, fp] = s.split('.');
      if (ip.length > L) L = ip.length;
      if (fp && fp.length > R) R = fp.length;
    }
    return (v: any) => {
      const s = rawStr(v, 'float64');
      if (s === 'nan' || s === 'inf' || s === '-inf') return s.padStart(Math.max(L + R + 1, s.length));
      const [ip, fp] = s.split('.');
      return ip.padStart(L) + '.' + (fp || '').padEnd(R);
    };
  }
  // int/bool：rjust(max len)
  const raws = a.data.map(v => rawStr(v, a.dtype));
  const w = Math.max(...raws.map(s => s.length), 1);
  return (v: any) => rawStr(v, a.dtype).padStart(w);
}

export function buildStr(a: NdArray): string {
  if (a.data.length === 0) return '[]';
  const cell = makeCellFn(a);
  const nd = a.shape.length;
  const render = (base: number, sh: number[], d: number): string => {
    if (sh.length === 1) {
      const parts: string[] = [];
      for (let i = 0; i < sh[0]; i++) parts.push(cell(a.data[base + i]));
      return '[' + parts.join(' ') + ']';
    }
    const rows: string[] = [];
    const rowLen = sh.slice(1).reduce((x, y) => x * y, 1);
    for (let i = 0; i < sh[0]; i++) rows.push(render(base + i * rowLen, sh.slice(1), d + 1));
    const isLeafLayer = d === nd - 1;
    const joiner = isLeafLayer
      ? '\n' + ' '.repeat(nd - 1)
      : (d === 0 && nd >= 3 ? '\n\n' : '\n' + ' '.repeat(Math.max(nd - d - 1, 0)));
    return '[' + rows.join(joiner) + ']';
  };
  return render(0, a.shape, 0);
}

// repr() 模式：'array([[1, 2],\n       [3, 4]])' / bool 数组带 dtype 后缀
export function reprArr(a: NdArray, mode: 's' | 'r'): string {
  if (mode === 's') return buildStr(a);
  if (a.data.length === 0) return 'array([], dtype=' + a.dtype + ')';
  const cell = makeCellFn(a);
  const nd = a.shape.length;
  const render = (base: number, sh: number[], depth: number): string => {
    if (sh.length === 1) {
      const parts: string[] = [];
      for (let i = 0; i < sh[0]; i++) parts.push(cell(a.data[base + i]));
      return '[' + parts.join(', ') + ']';
    }
    const rows: string[] = [];
    const rowLen = sh.slice(1).reduce((x, y) => x * y, 1);
    for (let i = 0; i < sh[0]; i++) rows.push(render(base + i * rowLen, sh.slice(1), depth + 1));
    const isLeafLayer = depth === nd;
    const isTop = depth === 1;
    const padLeaf = ' '.repeat(Math.max(6 + depth - 1, 1));
    const joiner = isLeafLayer
      ? ',\n' + padLeaf
      : ((isTop && nd >= 3) ? ',\n\n' + ' '.repeat(6 + depth) : ',\n' + ' '.repeat(6 + depth));
    return '[' + rows.join(joiner) + ']';
  };
  const suffix = '';
  return 'array(' + render(0, a.shape, 1) + suffix + ')';
}
