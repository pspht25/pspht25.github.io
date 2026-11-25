// py2js 出口：转译器 + 运行时 + numpy 子集
// 全站调用方式：
//   import { transpile, RUNTIME, createNumpy, runPython } from '.../scripts/py2js'
//   const r = runPython('import numpy as np\nprint(np.array([1,2,3]).sum())')
export { transpile, RUNTIME } from './core';
export type { TranspileResult } from './core';
export { createNumpy } from './numpy';
export type { NumpyPackage } from './numpy';
export { NdArray } from './numpy/core';

import { transpile, RUNTIME } from './core';
import { createNumpy as mkNumpy } from './numpy';

export interface RunResult {
  out: string;
  errors: { line: number; message: string }[];
  imports: string[];
}

// 便捷执行：转译 + 组装 + 运行（自动按 import 需求注入 numpy）
export function runPython(src: string, opts?: { numpy?: boolean }): RunResult {
  const r = transpile(src);
  if (r.errors.length) return { out: '', errors: r.errors.map(e => ({ line: e.line, message: e.msg })), imports: r.imports };
  const wantNp = opts && opts.numpy !== undefined ? !!opts.numpy : r.imports.includes('numpy');
  let out = '';
  try {
    const fn = new Function('$npmod', '$pyin', RUNTIME + '\n' + r.js);
    const res = fn(wantNp ? mkNumpy() : undefined, null);
    out = res && res.out !== undefined ? String(res.out) : '';
  } catch (e: any) {
    return { out, errors: [{ line: 0, message: e && e.message ? String(e.message) : String(e) }], imports: r.imports };
  }
  return { out, errors: [], imports: r.imports };
}
