// 兼容入口：实际实现已模块化到 py2js/ 目录
export { transpile, RUNTIME } from './py2js/core';
export type { TranspileResult } from './py2js/core';
export { createNumpy } from './py2js/numpy';
export type { NumpyPackage } from './py2js/numpy';
export { NdArray } from './py2js/numpy/core';
export { runPython } from './py2js/index';
export type { RunResult } from './py2js/index';
