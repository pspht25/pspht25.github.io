// 轻量 Python → JavaScript 转译器（浏览器内即时转译）
// 覆盖：变量 / 算术(含 // % ** 链比较) / 控制流 / 函数(默认参数 *args) / 字符串(f-string/raw)
//      列表 / 字典 / 集合 / 元组 / 切片 / 负索引 / 推导式 / lambda / 常用内建与方法
// 不支持（明确报错）：类 / try-except / async / 装饰器 / 第三方库 / open / input / format
// 作者：A-编程 2026-11-24

export interface Py2JsError { line: number; msg: string }
export interface TranspileResult {
  js: string;   // 完整可执行源码（runtime + IIFE 包裹的用户代码）
  body: string; // 用户代码对应的 JS（展示用）
  errors: Py2JsError[];
}

// ---------------- 运行时 helpers（注入产物头部） ----------------
export const RUNTIME = String.raw`
const $OUT = [];
const $bool = (x) => x === null || x === undefined ? false
  : typeof x === 'boolean' ? x
  : typeof x === 'number' ? (x !== 0 && !Number.isNaN(x))
  : typeof x === 'string' ? x.length > 0
  : Array.isArray(x) ? x.length > 0
  : x instanceof Set ? x.size > 0
  : typeof x === 'object' ? Object.keys(x).length > 0
  : true;
const $not = (x) => !$bool(x);
const $type = (x) => x === null || x === undefined ? 'NoneType'
  : typeof x === 'boolean' ? 'bool'
  : typeof x === 'number' ? (Number.isInteger(x) ? 'int' : 'float')
  : typeof x === 'string' ? 'str'
  : Array.isArray(x) ? 'list'
  : x instanceof Set ? 'set'
  : typeof x === 'function' ? 'function'
  : typeof x === 'object' ? 'dict' : 'unknown';
const $str = (x) => {
  if (x === null || x === undefined) return 'None';
  if (typeof x === 'boolean') return x ? 'True' : 'False';
  if (typeof x === 'number') return Number.isNaN(x) ? 'nan' : String(x);
  if (typeof x === 'string') return x;
  return $repr(x);
};
const $repr = (x) => {
  if (x === null || x === undefined) return 'None';
  if (typeof x === 'boolean') return x ? 'True' : 'False';
  if (typeof x === 'number') return Number.isNaN(x) ? 'nan' : String(x);
  if (typeof x === 'string') return "'" + x.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  if (Array.isArray(x)) return '[' + x.map($repr).join(', ') + ']';
  if (x instanceof Set) return '{' + Array.from(x).map($repr).join(', ') + '}';
  if (typeof x === 'function') return '<function>';
  if (typeof x === 'object') return '{' + Object.entries(x).map(([k, v]) => $repr(k) + ': ' + $repr(v)).join(', ') + '}';
  return String(x);
};
const $eq = (a, b) => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return a === b;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => $eq(v, b[i]));
  if (a instanceof Set && b instanceof Set) return a.size === b.size && Array.from(a).every(v => b.has(v));
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every(k => Object.prototype.hasOwnProperty.call(b, k) && $eq(a[k], b[k]));
};
const $add = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return a + b;
  if (Array.isArray(a) && Array.isArray(b)) return a.concat(b);
  if (typeof a === 'string' || typeof b === 'string') return $str(a) + $str(b);
  throw new TypeError('不支持的 + 操作数类型（' + $type(a) + ' + ' + $type(b) + '）');
};
const $mul = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return a * b;
  const rep = (v, n) => { n = Math.floor(n); if (n < 0) n = 0; if (typeof v === 'string') return v.repeat(n); const r = []; for (let i = 0; i < n; i++) r.push(...v); return r; };
  if (typeof a === 'string' && typeof b === 'number') return rep(a, b);
  if (typeof b === 'string' && typeof a === 'number') return rep(b, a);
  if (Array.isArray(a) && typeof b === 'number') return rep(a, b);
  if (Array.isArray(b) && typeof a === 'number') return rep(b, a);
  throw new TypeError('不支持的 * 操作数类型');
};
const $mod = (a, b) => {
  if (typeof a === 'string') throw new TypeError('字符串 % 格式化不支持，请改用 f-string');
  if (b === 0) throw new Error('ZeroDivisionError: division by zero');
  return ((a % b) + b) % b;
};
const $floordiv = (a, b) => {
  if (b === 0) throw new Error('ZeroDivisionError: division by zero');
  return Math.floor(a / b);
};
const $len = (x) => {
  if (typeof x === 'string' || Array.isArray(x)) return x.length;
  if (x instanceof Set) return x.size;
  if (x && typeof x === 'object') return Object.keys(x).length;
  throw new TypeError("对象没有 len()（" + $type(x) + "）");
};
const $iter = (x) => {
  if (Array.isArray(x) || typeof x === 'string' || x instanceof Set) return x;
  if (x && typeof x === 'object') return Object.keys(x);
  throw new TypeError('对象不可迭代（' + $type(x) + '）');
};
const $arr = (x) => Array.isArray(x) ? x : Array.from($iter(x));
const $items = (d) => Object.entries(d);
const $enumerate = (x, s) => { let i = s === undefined ? 0 : s; return $arr($iter(x)).map(v => [i++, v]); };
const $zip = (...xs) => {
  const arrs = xs.map($arr);
  const n = Math.min(...arrs.map(a => a.length));
  const out = [];
  for (let i = 0; i < n; i++) out.push(arrs.map(a => a[i]));
  return out;
};
const $cmpv = (a, b) => {
  const ok = (typeof a === 'number' && typeof b === 'number') || (typeof a === 'string' && typeof b === 'string');
  if (!ok) { if ($eq(a, b)) return 0; throw new TypeError('比较失败：<' + $type(a) + '> 与 <' + $type(b) + '> 不可比较'); }
  return a < b ? -1 : a > b ? 1 : 0;
};
const $sorted = (x, key, rev) => {
  const a = $arr(x).slice();
  a.sort(key ? (p, q) => $cmpv(key(p), key(q)) : $cmpv);
  if (rev) a.reverse();
  return a;
};
const $sortInplace = (x, key, rev) => {
  x.sort(key ? (p, q) => $cmpv(key(p), key(q)) : $cmpv);
  if (rev) x.reverse();
  return x;
};
const $minmax = (xs, isMin) => {
  const arr = xs.length === 1 ? $arr(xs[0]) : xs;
  if (!arr.length) throw new Error('ValueError: 序列为空');
  let best = arr[0];
  for (const v of arr) { const c = $cmpv(v, best); if (isMin ? c < 0 : c > 0) best = v; }
  return best;
};
const $sum = (x, start) => $arr(x).reduce((s, v) => s + v, start === undefined ? 0 : start);
const $int = (x, base) => {
  if (base !== undefined && typeof x === 'string') return parseInt(x, base);
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (typeof x === 'number') { if (Number.isNaN(x)) throw new Error('ValueError: int() 参数无效'); return Math.trunc(x); }
  if (typeof x === 'string') { const v = Number(x.trim()); if (Number.isNaN(v)) throw new Error("ValueError: int('" + x + "') 无效字面量"); return Math.trunc(v); }
  throw new TypeError('int() 参数类型不支持');
};
const $float = (x) => {
  if (typeof x === 'boolean') return x ? 1 : 0;
  if (typeof x === 'number') return x;
  if (typeof x === 'string') { const v = parseFloat(x.trim()); if (Number.isNaN(v)) throw new Error("ValueError: float('" + x + "') 无效"); return v; }
  throw new TypeError('float() 参数类型不支持');
};
const $round = (x, n) => {
  if (n !== undefined && n !== 0) {
    const f = Math.pow(10, n), v = x * f;
    let r = $round(v);
    if (Math.abs(v - r) === 0.5) r = r % 2 === 0 ? r : r + (r > 0 ? -1 : 1);
    return r / f;
  }
  const fl = Math.floor(x), d = x - fl;
  if (d > 0.5) return fl + 1;
  if (d < 0.5) return fl;
  return fl % 2 === 0 ? fl : fl + 1;
};
const $abs = Math.abs;
const $ord = (c) => { if (typeof c !== 'string' || c.length !== 1) throw new TypeError('ord() 需要单个字符'); return c.codePointAt(0); };
const $chr = (n) => String.fromCodePoint(n);
const $divmod = (a, b) => [$floordiv(a, b), $mod(a, b)];
const $pow = (a, b, c) => { const p = Math.pow(a, b); return c === undefined ? p : ((p % c) + c) % c; };
const $list = (x) => x === undefined ? [] : $arr(x);
const $tuple = (x) => $arr(x);
const $set = (x) => x === undefined ? new Set() : new Set($arr(x));
const $dict = (x) => { const o = {}; if (x) for (const kv of $arr(x)) o[kv[0]] = kv[1]; return o; };
const $map = (f, ...xs) => xs.length === 1 ? $arr(xs[0]).map(f) : $zip(...xs).map(a => f(...a));
const $filter = (f, x) => $arr(x).filter(f);
const $any = (x) => $arr(x).some($bool);
const $all = (x) => $arr(x).every($bool);
const $reversed = (x) => $arr(x).slice().reverse();
const $bin = (x) => (x < 0 ? '-0b' + (-x).toString(2) : '0b' + x.toString(2));
const $hex = (x) => (x < 0 ? '-0x' + (-x).toString(16) : '0x' + x.toString(16));
const $oct = (x) => (x < 0 ? '-0o' + (-x).toString(8) : '0o' + x.toString(8));
const $in = (x, c) => {
  if (typeof c === 'string') return c.includes($str(x));
  if (Array.isArray(c)) return c.some(v => $eq(x, v));
  if (c instanceof Set) return c.has(x);
  if (c && typeof c === 'object') return Object.prototype.hasOwnProperty.call(c, x);
  throw new TypeError('in 的右侧不可成员检测（' + $type(c) + '）');
};
const $idx = (seq, i) => {
  if (seq && typeof seq === 'object' && !Array.isArray(seq) && !(seq instanceof Set)) return seq[i];
  if (seq instanceof Set) throw new TypeError('set 不可索引');
  const n = seq.length, j = i < 0 ? n + i : i;
  if (j < 0 || j >= n) throw new Error('IndexError: 索引越界（' + String(i) + '，长度 ' + n + '）');
  return seq[j];
};
const $setidx = (seq, i, v) => {
  if (typeof seq === 'string') throw new TypeError('字符串不可变，不能按下标赋值');
  if (seq instanceof Set) throw new TypeError('set 不可索引');
  if (seq && typeof seq === 'object' && !Array.isArray(seq)) { seq[i] = v; return; }
  const n = seq.length, j = i < 0 ? n + i : i;
  if (j < 0 || j >= n) throw new Error('IndexError: 赋值索引越界');
  seq[j] = v;
};
const $slice = (seq, start, end, step) => {
  const isStr = typeof seq === 'string';
  if (seq instanceof Set) throw new TypeError('set 不可切片');
  const n = seq.length;
  step = step === undefined ? 1 : step;
  if (step === 0) throw new Error('ValueError: 切片步长不能为 0');
  const s = start === undefined ? (step > 0 ? 0 : n - 1) : (start < 0 ? Math.max(n + start, step > 0 ? 0 : -1) : Math.min(start, step > 0 ? n : n - 1));
  const e = end === undefined ? (step > 0 ? n : -1) : (end < 0 ? Math.max(n + end, step > 0 ? 0 : -1) : Math.min(end, step > 0 ? n : n - 1));
  const out = [];
  if (step > 0) for (let i = Math.max(s, 0); i < e; i += step) out.push(seq[i]);
  else for (let i = Math.min(s, n - 1); i > e; i += step) out.push(seq[i]);
  return isStr ? out.join('') : out;
};
const $print = (items, sep, end) => { $OUT.push(items.map($str).join(sep === undefined ? ' ' : sep) + (end === undefined ? '\n' : end)); };
const $assert = (x, msg) => { if (!$bool(x)) throw new Error('AssertionError' + (msg !== undefined ? ': ' + $str(msg) : '')); };
const $dget = (d, k, def) => Object.prototype.hasOwnProperty.call(d, k) ? d[k] : (def === undefined ? null : def);
const $dpop = (d, k, def) => { if (Object.prototype.hasOwnProperty.call(d, k)) { const v = d[k]; delete d[k]; return v; } if (def !== undefined) return def; throw new Error('KeyError: ' + $repr(k)); };
const $dupdate = (d, o) => {
  if (o && typeof o === 'object' && !Array.isArray(o) && !(o instanceof Set)) Object.assign(d, o);
  else for (const kv of $arr(o)) d[kv[0]] = kv[1];
  return d;
};
const $dsetdef = (d, k, def) => { if (!Object.prototype.hasOwnProperty.call(d, k)) d[k] = def === undefined ? null : def; return d[k]; };
const $clear = (x) => { if (Array.isArray(x)) x.length = 0; else if (x instanceof Set) x.clear(); else if (x && typeof x === 'object') for (const k of Object.keys(x)) delete x[k]; };
const $copy = (x) => Array.isArray(x) ? x.slice() : (x instanceof Set ? new Set(x) : Object.assign({}, x));
const $extend = (l, x) => { for (const v of $iter(x)) l.push(v); return l; };
const $insert = (l, i, v) => { l.splice(i < 0 ? Math.max(0, l.length + i) : i, 0, v); return l; };
const $pop = (x, a, def) => { if (x && typeof x === 'object' && !Array.isArray(x) && !(x instanceof Set)) return $dpop(x, a, def); return $popAt(x, a); };
const $range = (a, b, st) => { let start = 0, stop = a, step = 1; if (b !== undefined) { start = a; stop = b; } if (st !== undefined) step = st; if (step === 0) throw new Error('ValueError: range() arg 3 must not be zero'); const out = []; if (step > 0) for (let x = start; x < stop; x += step) out.push(x); else for (let x = start; x > stop; x += step) out.push(x); return out; };
const $popAt = (l, i) => {
  if (i === undefined) { if (!l.length) throw new Error('IndexError: pop 空列表'); return l.pop(); }
  const n = l.length, j = i < 0 ? n + i : i;
  if (j < 0 || j >= n) throw new Error('IndexError: pop 索引越界');
  return l.splice(j, 1)[0];
};
const $remove = (l, v) => { const i = l.findIndex(x => $eq(x, v)); if (i < 0) throw new Error('ValueError: 元素不存在'); l.splice(i, 1); return l; };
const $index = (l, v) => { const i = l.findIndex(x => $eq(x, v)); if (i < 0) throw new Error('ValueError: 元素不存在'); return i; };
const $count = (l, v) => (typeof l === 'string' ? (v === '' ? l.length + 1 : l.split(v).length - 1) : l.filter(x => $eq(x, v)).length);
const $find = (s, v) => s.indexOf($str(v));
const $rfind = (s, v) => s.lastIndexOf($str(v));
const $strip = (s, ch) => { if (ch === undefined) return s.trim(); let a = 0, b = s.length; while (a < b && ch.includes(s[a])) a++; while (b > a && ch.includes(s[b - 1])) b--; return s.slice(a, b); };
const $lstrip = (s, ch) => { if (ch === undefined) return s.replace(/^\s+/, ''); let a = 0; while (a < s.length && ch.includes(s[a])) a++; return s.slice(a); };
const $rstrip = (s, ch) => { if (ch === undefined) return s.replace(/\s+$/, ''); let b = s.length; while (b > 0 && ch.includes(s[b - 1])) b--; return s.slice(0, b); };
const $wsplit = (s) => s.trim().length ? s.trim().split(/\s+/) : [];
const $join = (it, sep) => $arr($iter(it)).map($str).join(sep);
const $replace = (s, a, b) => s.split(a).join($str(b));
const $title = (s) => s.replace(/[A-Za-z]+['’]?[A-Za-z]*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
const $capitalize = (s) => s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s;
const $zfill = (s, w) => s.padStart(w, '0');
const $center = (s, w, fill) => { fill = fill === undefined ? ' ' : fill; const pad = w - s.length; if (pad <= 0) return s; const l = Math.floor(pad / 2); return fill.repeat(l) + s + fill.repeat(pad - l); };
const $isdigit = (s) => s.length > 0 && /^[0-9]+$/.test(s);
const $isalpha = (s) => s.length > 0 && /^[A-Za-z]+$/.test(s);
const $isalnum = (s) => s.length > 0 && /^[0-9A-Za-z]+$/.test(s);
const $isspace = (s) => s.length > 0 && /^\s+$/.test(s);
const $islower = (s) => /[a-z]/.test(s) && !/[A-Z]/.test(s);
const $isupper = (s) => /[A-Z]/.test(s) && !/[a-z]/.test(s);
const $startswith = (s, p) => s.startsWith(p);
const $endswith = (s, p) => s.endsWith(p);
const $union = (a, b) => new Set([...a, ...$arr(b)]);
const $intersection = (a, b) => new Set([...a].filter(v => b.has(v)));
const $difference = (a, b) => new Set([...a].filter(v => !b.has(v)));
const $sremove = (s, v) => { if (!s.delete(v)) throw new Error('KeyError: ' + $repr(v)); return s; };
const $getattr = (o, k) => { if (o === null || o === undefined) throw new Error("AttributeError: '" + $type(o) + "' 对象没有属性 '" + k + "'"); return o[k]; };
`;

// ---------------- 工具 ----------------
function unescapePy(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\' || i + 1 >= s.length) { out += c; continue; }
    const n = s[i + 1]; i++;
    switch (n) {
      case 'n': out += '\n'; break;
      case 't': out += '\t'; break;
      case 'r': out += '\r'; break;
      case '\\': out += '\\'; break;
      case "'": out += "'"; break;
      case '"': out += '"'; break;
      case 'a': out += '\x07'; break;
      case 'b': out += '\b'; break;
      case 'f': out += '\f'; break;
      case 'v': out += '\v'; break;
      case '0': out += '\0'; break;
      case 'x': { const h = s.slice(i + 1, i + 3); if (/^[0-9a-fA-F]{2}$/.test(h)) { out += String.fromCharCode(parseInt(h, 16)); i += 2; } else out += '\\x'; break; }
      case 'u': { const h = s.slice(i + 1, i + 5); if (/^[0-9a-fA-F]{4}$/.test(h)) { out += String.fromCharCode(parseInt(h, 16)); i += 4; } else out += '\\u'; break; }
      default: out += '\\' + n; break; // Python：未知转义保留反斜杠
    }
  }
  return out;
}

const JS_RESERVED = new Set(['let', 'var', 'const', 'function', 'class', 'new', 'typeof', 'instanceof', 'delete',
  'void', 'case', 'switch', 'default', 'do', 'throw', 'catch', 'this', 'super', 'extends', 'export', 'enum',
  'implements', 'interface', 'package', 'private', 'protected', 'public', 'static', 'arguments', 'eval',
  'null', 'undefined', 'NaN', 'Infinity']);
const ident = (n: string) => JS_RESERVED.has(n) ? n + '_' : n;

// ---------------- Lexer ----------------
interface Tok { t: string; v: string; line: number }

const PY_KW = new Set(['if', 'elif', 'else', 'while', 'for', 'in', 'def', 'return', 'break', 'continue', 'pass',
  'and', 'or', 'not', 'is', 'lambda', 'True', 'False', 'None', 'import', 'from', 'class', 'try', 'except',
  'finally', 'with', 'as', 'global', 'nonlocal', 'del', 'assert', 'raise', 'yield', 'async', 'await']);

function lex(src: string, errs: Py2JsError[]): Tok[] {
  const toks: Tok[] = [];
  const indents: number[] = [0];
  let i = 0, line = 1, depth = 0, atLineStart = true;
  const push = (t: string, v: string, ln = line) => toks.push({ t, v, line: ln });
  const len = src.length;

  const scanString = (prefix: string, q: string) => {
    const isRaw = prefix.toLowerCase().includes('r');
    const isF = prefix.toLowerCase().includes('f');
    if (prefix.toLowerCase().includes('b')) errs.push({ line, msg: 'bytes 字符串不支持' });
    let content = '', closed = false;
    i += q.length;
    while (i < len) {
      const ch = src[i];
      if (ch === '\\' && i + 1 < len) {
        if (isRaw) { content += ch + src[i + 1]; i += 2; continue; }
        content += ch + src[i + 1]; i += 2; continue; // 保留原文，非 raw 在下方解码
      }
      if (src.startsWith(q, i)) { i += q.length; closed = true; break; }
      if (ch === '\n') {
        if (q.length === 1) break; // 单引号不可跨行
        line++; content += ch; i++; continue;
      }
      content += ch; i++;
    }
    if (!closed) { errs.push({ line, msg: '字符串未闭合' }); return; }
    if (isF) push('fstr', content);
    else if (isRaw) push('str', '\x00RAW\x00' + content);
    else push('str', unescapePy(content));
  };

  while (i < len) {
    if (atLineStart && depth === 0) {
      let w = 0;
      while (i < len && (src[i] === ' ' || src[i] === '\t')) { w += src[i] === '\t' ? 4 - (w % 4) : 1; i++; }
      if (i >= len) break;
      if (src[i] === '\n' || src[i] === '#') { // 空行 / 纯注释行
        while (i < len && src[i] !== '\n') i++;
        if (i < len) { i++; line++; }
        continue;
      }
      const cur = indents[indents.length - 1];
      if (w > cur) { indents.push(w); push('indent', ''); }
      else if (w < cur) {
        while (indents.length > 1 && w < indents[indents.length - 1]) { indents.pop(); push('dedent', ''); }
        if (w !== indents[indents.length - 1]) errs.push({ line, msg: '缩进不一致' });
      }
      atLineStart = false;
      continue;
    }
    const c = src[i];
    if (c === '\n') { line++; i++; if (depth === 0) { push('nl', ''); atLineStart = true; } continue; }
    if (c === ' ' || c === '\t') { i++; continue; }
    if (c === '#') { while (i < len && src[i] !== '\n') i++; continue; }
    if (c === '\\' && src[i + 1] === '\n') { i += 2; line++; continue; } // 续行符
    // 字符串（含前缀）
    if (c === '"' || c === "'") { scanString('', c); continue; }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^([fFrRbBuU]{1,2})("""|'''|"|')/.exec(src.slice(i));
      if (m && !/[\w]/.test(src[i - 1] || '')) { i += m[1].length; scanString(m[1], m[2]); continue; }
      let k = i;
      while (k < len && /[\w]/.test(src[k])) k++;
      const w = src.slice(i, k);
      i = k;
      push(PY_KW.has(w) ? 'kw' : 'name', w);
      continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      let k = i;
      if (c === '0' && /[xXbBoO]/.test(src[i + 1] || '')) {
        k = i + 2;
        while (k < len && /[0-9a-fA-F_]/.test(src[k])) k++;
        push('num', src.slice(i, k).replace(/_/g, '')); i = k; continue;
      }
      while (k < len && /[0-9_]/.test(src[k])) k++;
      if (k < len && src[k] === '.' && /[0-9]/.test(src[k + 1] || '')) { k++; while (k < len && /[0-9_]/.test(src[k])) k++; }
      if (k < len && /[eE]/.test(src[k]) && /[0-9+\-]/.test(src[k + 1] || '')) { k += 2; while (k < len && /[0-9_]/.test(src[k])) k++; }
      if (k < len && src[k] === 'j') { errs.push({ line, msg: '复数不支持' }); k++; }
      push('num', src.slice(i, k).replace(/_/g, '')); i = k; continue;
    }
    const three = src.slice(i, i + 3);
    const two = src.slice(i, i + 2);
    if (three === '**=' || three === '//=' || three === '>>=' || three === '<<=') { push('op', three); i += 3; continue; }
    if (two === ':=') { errs.push({ line, msg: '海象运算符 := 不支持，请拆成普通赋值' }); i += 2; continue; }
    if (['**', '//', '<<', '>>', '<=', '>=', '==', '!=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '->'].includes(two)) {
      if (two === '->') { i += 2; continue; } // 返回注解，忽略
      push('op', two); i += 2; continue;
    }
    if ('+-*/%()[]{},:.<>=&|^~;'.includes(c)) {
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth = Math.max(0, depth - 1);
      push('op', c); i++; continue;
    }
    if (c === '@') { errs.push({ line, msg: '装饰器不支持' }); i++; continue; }
    errs.push({ line, msg: '无法识别的字符 ' + JSON.stringify(c) });
    i++;
  }
  while (indents.length > 1) { indents.pop(); push('dedent', '', line); }
  push('eof', '', line);
  return toks;
}

// ---------------- Parser ----------------
class ParseBreak extends Error {}

type Node = any;
interface KV { k: string; v: Node }

function createParser(toks: Tok[], errs: Py2JsError[]) {
  let pos = 0;
  let uid = 0;
  const peek = (k = 0): Tok => toks[pos + k] || toks[toks.length - 1];
  const next = (): Tok => toks[pos++];
  const at = (v: string) => { const t = peek(); return t.v === v || (v === 'nl' && t.t === 'nl'); };
  const eat = (v: string) => { if (at(v)) { pos++; return true; } return false; };
  const expect = (v: string) => {
    if (!eat(v)) {
      const t = peek();
      errs.push({ line: t.line, msg: `语法错误：期望 '${v}'，实际是 '${t.t === 'eof' ? '结尾' : t.v || t.t}'` });
      throw new ParseBreak();
    }
  };
  const atKw = (v: string) => peek().t === 'kw' && peek().v === v;
  const eatKw = (v: string) => { if (atKw(v)) { pos++; return true; } return false; };
  const expectName = (): string => {
    const t = peek();
    if (t.t !== 'name') { errs.push({ line: t.line, msg: '期望标识符' }); throw new ParseBreak(); }
    pos++; return t.v;
  };
  const skipNl = () => { while (peek().t === 'nl') pos++; };
  const syncLine = () => { while (peek().t !== 'nl' && peek().t !== 'eof' && peek().t !== 'dedent') pos++; if (peek().t === 'nl') pos++; };

  // ---- 语句 ----
  function program(): Node[] {
    const body: Node[] = [];
    skipNl();
    while (peek().t !== 'eof') {
      if (peek().t === 'nl' || peek().t === 'dedent') { pos++; continue; }
      try { body.push(...statement()); } catch (e) { if (e instanceof ParseBreak) { syncLine(); continue; } throw e; }
    }
    return body;
  }

  function statement(): Node[] {
    if (atKw('if')) return [parseIf()];
    if (atKw('while')) return [parseWhile()];
    if (atKw('for')) return [parseFor()];
    if (atKw('def')) return [parseDef()];
    return parseLine();
  }

  function parseLine(): Node[] {
    const out: Node[] = [simpleStmt()];
    while (eat(';')) {
      if (peek().t === 'nl' || peek().t === 'eof' || peek().t === 'dedent' || at(';')) break;
      out.push(simpleStmt());
    }
    if (peek().t === 'nl') pos++;
    return out;
  }

  function suite(): Node[] {
    if (peek().t === 'nl') {
      skipNl();
      if (peek().t !== 'indent') { errs.push({ line: peek().line, msg: '缺少缩进块' }); throw new ParseBreak(); }
      pos++;
      const body: Node[] = [];
      while (peek().t !== 'dedent' && peek().t !== 'eof') {
        if (peek().t === 'nl') { pos++; continue; }
        try { body.push(...statement()); } catch (e) {
          if (e instanceof ParseBreak) {
            // 跳到块内下一行
            while (peek().t !== 'nl' && peek().t !== 'eof' && peek().t !== 'dedent') pos++;
            continue;
          }
          throw e;
        }
      }
      if (peek().t === 'dedent') pos++;
      return body;
    }
    return parseLine(); // if x: stmt 单行
  }

  function parseIf(): Node {
    pos++; // if / elif
    const test = expr();
    expect(':');
    const body = suite();
    let orelse: Node[] = [];
    if (atKw('elif')) orelse = [parseIf()];
    else if (eatKw('else')) { expect(':'); orelse = suite(); }
    return { type: 'if', test, body, orelse };
  }

  function parseWhile(): Node {
    pos++;
    const test = expr();
    expect(':');
    const body = suite();
    if (eatKw('else')) { errs.push({ line: peek().line, msg: 'while-else 不支持' }); throw new ParseBreak(); }
    return { type: 'while', test, body };
  }

  // 专用目标解析：不进入表达式比较层（避免把 `i in range(...)` 当成比较链）
  function parseTarget(): Node {
    const first = parseTargetAtom();
    if (at(',')) {
      const items = [first];
      while (eat(',')) {
        if (atKw('in') || peek().t === 'nl' || peek().t === 'eof' || peek().t === 'dedent') break;
        items.push(parseTargetAtom());
      }
      return { type: 'tuple', items };
    }
    return first;
  }

  function parseTargetAtom(): Node {
    const t = peek();
    if (t.t === 'name') { pos++; return { type: 'name', id: t.v, line: t.line }; }
    if (eat('*')) return parseTargetAtom(); // 星号目标宽松接受
    if (t.t === 'op' && t.v === '(') {
      pos++;
      if (eat(')')) return { type: 'tuple', items: [] };
      const first = parseTargetAtom();
      if (at(',')) {
        const items = [first];
        while (eat(',')) { if (at(')')) break; items.push(parseTargetAtom()); }
        expect(')');
        return { type: 'tuple', items };
      }
      expect(')');
      return first;
    }
    if (t.t === 'op' && t.v === '[') {
      pos++;
      const items: Node[] = [];
      if (!eat(']')) {
        while (true) {
          items.push(parseTargetAtom());
          if (eat(',')) { if (eat(']')) break; continue; }
          expect(']');
          break;
        }
      }
      return { type: 'tuple', items };
    }
    errs.push({ line: t.line, msg: '循环/解包目标只能是变量名（或元组解包）' });
    throw new ParseBreak();
  }

  function parseFor(): Node {
    pos++;
    const target = parseTarget();
    if (!eatKw('in')) { errs.push({ line: peek().line, msg: "期望 'in'" }); throw new ParseBreak(); }
    const iter = expr();
    expect(':');
    const body = suite();
    if (eatKw('else')) { errs.push({ line: peek().line, msg: 'for-else 不支持' }); throw new ParseBreak(); }
    return { type: 'for', target, iter, body };
  }

  function parseDef(): Node {
    pos++;
    const name = expectName();
    expect('(');
    const params: { name: string; def: Node | null }[] = [];
    let star: string | null = null;
    let seenDef = false;
    if (!eat(')')) {
      while (true) {
        if (eat('*')) { star = expectName(); if (!eat(',') ) { expect(')'); break; } continue; }
        if (eat('**')) { errs.push({ line: peek().line, msg: '**kwargs 不支持' }); throw new ParseBreak(); }
        const pn = expectName();
        let pd: Node | null = null;
        if (eat('=')) { pd = expr(); seenDef = true; }
        else if (seenDef) { errs.push({ line: peek().line, msg: '非默认参数不能跟在默认参数后' }); throw new ParseBreak(); }
        params.push({ name: pn, def: pd });
        if (eat(',')) { if (eat(')')) break; continue; }
        expect(')');
        break;
      }
    }
    if (star && params.some(p => p.def)) { /* *args 后默认参数按 py 规则合法，宽松放行 */ }
    expect(':');
    const body = suite();
    return { type: 'def', name, params, star, body };
  }

  function forbidKw(kw: string, alt: string) {
    errs.push({ line: peek().line, msg: `${kw} 暂不支持${alt ? '（' + alt + '）' : ''}` });
    throw new ParseBreak();
  }

  function simpleStmt(): Node {
    const t = peek();
    if (t.t === 'kw') {
      switch (t.v) {
        case 'return': {
          pos++;
          const e = (peek().t === 'nl' || peek().t === 'eof' || peek().t === 'dedent' || at(';')) ? null : exprOrTuple();
          return { type: 'return', e };
        }
        case 'break': pos++; return { type: 'break' };
        case 'continue': pos++; return { type: 'continue' };
        case 'pass': pos++; return { type: 'pass' };
        case 'assert': {
          pos++;
          const e = expr();
          let msg: Node | null = null;
          if (eat(',')) msg = expr();
          return { type: 'assert', e, msg };
        }
        case 'import': forbidKw('import', '转译模式无法引入库，仅支持纯 Python 子集');
        case 'from': forbidKw('from-import', '转译模式无法引入库');
        case 'class': forbidKw('class', '请改用函数与字典组织代码');
        case 'try': case 'except': case 'finally': forbidKw('try/except', '错误处理暂不支持');
        case 'with': forbidKw('with', '上下文管理器暂不支持');
        case 'raise': forbidKw('raise', '手动抛错暂不支持');
        case 'del': forbidKw('del', 'del 暂不支持');
        case 'yield': forbidKw('yield', '生成器函数暂不支持');
        case 'async': case 'await': forbidKw('async/await', '异步暂不支持');
        case 'global': case 'nonlocal': forbidKw(t.v, '函数内直接赋值会创建局部变量');
        case 'lambda': break;
      }
    }
    // 表达式 / 赋值
    const first = exprOrTuple();
    if (at('=')) {
      const targets: Node[] = [first];
      let value: Node = first;
      while (eat('=')) {
        value = exprOrTuple();
        targets.push(value);
      }
      const realTargets = targets.slice(0, -1);
      value = targets[targets.length - 1];
      for (const tg of realTargets) {
        const check = (n: Node): void => {
          if (n.type === 'name' || n.type === 'sub' || n.type === 'attr') return;
          if (n.type === 'tuple') { n.items.forEach(check); return; }
          errs.push({ line: t.line, msg: '赋值目标不合法' });
          throw new ParseBreak();
        };
        check(tg);
      }
      return { type: 'assign', targets: realTargets, value };
    }
    const AUG_OPS = ['+=', '-=', '*=', '/=', '%=', '**=', '//=', '&=', '|=', '^=', '<<=', '>>='];
    if (t.t === 'op' && AUG_OPS.includes(t.v) === false && peek(-0) === t) { /* noop */ }
    for (const op of AUG_OPS) {
      // 需要回溯判断：first 后面紧跟 aug op
      if (at(op)) {
        pos++;
        const value = exprOrTuple();
        const check = (n: Node): boolean => n.type === 'name' || n.type === 'sub' || n.type === 'attr';
        if (!check(first)) { errs.push({ line: t.line, msg: '增强赋值目标不合法' }); throw new ParseBreak(); }
        return { type: 'aug', target: first, op: op.slice(0, -1), value };
      }
    }
    return { type: 'expr', e: first };
  }

  // ---- 表达式 ----
  function exprOrTuple(): Node {
    const e = expr();
    if (at(',')) {
      const items = [e];
      while (eat(',')) {
        if (peek().t === 'nl' || peek().t === 'eof' || peek().t === 'dedent' || at(')') || at(']') || at('}') || at('=') || at(';') || atKw('in') || atKw('if')) break;
        items.push(expr());
      }
      return { type: 'tuple', items };
    }
    return e;
  }

  function expr(): Node {
    if (atKw('lambda')) return parseLambda();
    const body = orExpr();
    if (atKw('if')) {
      pos++;
      const test = orExpr();
      if (!eatKw('else')) { errs.push({ line: peek().line, msg: '三元表达式期望 else' }); throw new ParseBreak(); }
      const orelse = expr();
      return { type: 'ifexp', test, body, orelse };
    }
    return body;
  }

  function parseLambda(): Node {
    pos++;
    const params: { name: string; def: Node | null }[] = [];
    if (peek().t === 'name') {
      while (true) {
        params.push({ name: expectName(), def: null });
        if (!eat(',')) break;
        if (peek().t !== 'name') break;
      }
    }
    expect(':');
    const body = expr();
    return { type: 'lambda', params, body };
  }

  function orExpr(): Node {
    let e = andExpr();
    if (atKw('or')) {
      const items = [e];
      while (eatKw('or')) items.push(andExpr());
      e = { type: 'bool', op: 'or', items };
    }
    return e;
  }
  function andExpr(): Node {
    let e = notExpr();
    if (atKw('and')) {
      const items = [e];
      while (eatKw('and')) items.push(notExpr());
      e = { type: 'bool', op: 'and', items };
    }
    return e;
  }
  function notExpr(): Node {
    if (atKw('not')) { pos++; return { type: 'unary', op: 'not', e: notExpr() }; }
    return cmpExpr();
  }

  function cmpExpr(): Node {
    const first = bitOr();
    const ops: string[] = [];
    const rest: Node[] = [];
    while (true) {
      const t = peek();
      if (t.t === 'op' && ['<', '>', '<=', '>=', '==', '!='].includes(t.v)) { pos++; ops.push(t.v); rest.push(bitOr()); continue; }
      if (atKw('in')) { pos++; ops.push('in'); rest.push(bitOr()); continue; }
      if (atKw('not') && peek(1).t === 'kw' && peek(1).v === 'in') { pos += 2; ops.push('not in'); rest.push(bitOr()); continue; }
      if (atKw('is')) {
        pos++;
        if (eatKw('not')) ops.push('is not'); else ops.push('is');
        rest.push(bitOr()); continue;
      }
      break;
    }
    if (!ops.length) return first;
    return { type: 'cmp', first, ops, rest };
  }

  function bitOr(): Node { let e = bitXor(); while (at('|')) { pos++; e = { type: 'bin', op: '|', l: e, r: bitXor() }; } return e; }
  function bitXor(): Node { let e = bitAnd(); while (at('^')) { pos++; e = { type: 'bin', op: '^', l: e, r: bitAnd() }; } return e; }
  function bitAnd(): Node { let e = shift(); while (at('&')) { pos++; e = { type: 'bin', op: '&', l: e, r: shift() }; } return e; }
  function shift(): Node { let e = arith(); while (at('<<') || at('>>')) { const op = next().v; e = { type: 'bin', op, l: e, r: arith() }; } return e; }
  function arith(): Node { let e = term(); while (at('+') || at('-')) { const op = next().v; e = { type: 'bin', op, l: e, r: term() }; } return e; }
  function term(): Node {
    let e = unary();
    while (at('*') || at('/') || at('//') || at('%')) { const op = next().v; e = { type: 'bin', op, l: e, r: unary() }; }
    return e;
  }
  function unary(): Node {
    const t = peek();
    if (t.t === 'op' && (t.v === '-' || t.v === '+' || t.v === '~')) { pos++; return { type: 'unary', op: t.v, e: unary() }; }
    return power();
  }
  function power(): Node {
    const base = postfix();
    if (at('**')) { pos++; const exp = unary(); return { type: 'bin', op: '**', l: base, r: exp }; }
    return base;
  }

  function postfix(): Node {
    let e = atom();
    while (true) {
      if (eat('(')) e = parseCall(e);
      else if (eat('[')) e = parseSubscript(e);
      else if (eat('.')) { const name = expectName(); e = { type: 'attr', obj: e, name }; }
      else break;
    }
    return e;
  }

  function parseCall(fn: Node): Node {
    const args: Node[] = [];
    const kwargs: KV[] = [];
    if (!eat(')')) {
      while (true) {
        if (peek().t === 'name' && peek(1).t === 'op' && peek(1).v === '=') {
          const k = next().v; pos++; // '='
          kwargs.push({ k, v: expr() });
        } else if (at('**')) { errs.push({ line: peek().line, msg: '** 字典展开不支持' }); throw new ParseBreak(); }
        else if (at('*')) { errs.push({ line: peek().line, msg: '* 序列展开不支持' }); throw new ParseBreak(); }
        else args.push(expr());
        if (eat(',')) { if (eat(')')) break; continue; }
        expect(')');
        break;
      }
    }
    return { type: 'call', fn, args, kwargs };
  }

  function parseSubscript(obj: Node): Node {
    // 支持单索引与切片 x[a:b:c]，负步长；多维报错
    let lo: Node | null = null, hi: Node | null = null, step: Node | null = null;
    let isSlice = false;
    if (!at(':')) lo = exprOrTuple();
    if (eat(':')) {
      isSlice = true;
      if (!at(':') && !at(']')) hi = expr();
      if (eat(':')) { if (!at(']')) step = expr(); }
    }
    expect(']');
    if (isSlice) return { type: 'slice', obj, lo, hi, step };
    if (lo && lo.type === 'tuple') { errs.push({ line: peek().line, msg: '多维索引不支持' }); throw new ParseBreak(); }
    return { type: 'sub', obj, idx: lo };
  }

  function atom(): Node {
    const t = peek();
    if (t.t === 'num') { pos++; return { type: 'num', v: t.v, line: t.line }; }
    if (t.t === 'str' || t.t === 'fstr') {
      // 连续字符串拼接
      const parts: any[] = [];
      while (peek().t === 'str' || peek().t === 'fstr') {
        const st = next();
        if (st.t === 'str') {
          if (st.v.startsWith('\x00RAW\x00')) parts.push({ lit: st.v.slice(5), raw: true });
          else parts.push({ lit: st.v });
        } else parts.push(...parseFString(st.v, st.line).parts);
      }
      if (parts.length === 1 && parts[0].lit !== undefined && parts.length && !parts[0].expr) return { type: 'str', v: parts[0].lit, raw: !!parts[0].raw, line: t.line };
      return { type: 'fstr', parts, line: t.line };
    }
    if (t.t === 'name') { pos++; return { type: 'name', id: t.v, line: t.line }; }
    if (t.t === 'kw') {
      if (t.v === 'True') { pos++; return { type: 'const', v: true }; }
      if (t.v === 'False') { pos++; return { type: 'const', v: false }; }
      if (t.v === 'None') { pos++; return { type: 'const', v: null }; }
      if (t.v === 'not') { pos++; return { type: 'unary', op: 'not', e: notExpr() }; }
      if (t.v === 'lambda') return parseLambda();
      errs.push({ line: t.line, msg: `此处不能使用 '${t.v}'` });
      throw new ParseBreak();
    }
    if (t.t === 'op') {
      if (t.v === '(') {
        pos++;
        if (eat(')')) return { type: 'tuple', items: [] };
        const e = expr();
        if (atKw('for')) { const comp = compRest(e, 'list'); eat(')'); return comp; }
        if (eat(',')) {
          const items = [e];
          while (!at(')')) { if (at(',')) { pos++; continue; } items.push(expr()); }
          expect(')');
          items.push(); // noop
          return { type: 'tuple', items };
        }
        expect(')');
        return e;
      }
      if (t.v === '[') {
        pos++;
        if (eat(']')) return { type: 'list', items: [] };
        const e = expr();
        if (atKw('for')) { const comp = compRest(e, 'list'); eat(']'); return comp; }
        const items = [e];
        while (eat(',')) { if (eat(']')) return { type: 'list', items }; items.push(expr()); }
        expect(']');
        return { type: 'list', items };
      }
      if (t.v === '{') return parseBrace();
      if (t.v === '-' || t.v === '+' || t.v === '~') { pos++; return { type: 'unary', op: t.v, e: unary() }; }
    }
    errs.push({ line: t.line, msg: `无法解析的记号 '${t.t === 'eof' ? '结尾' : t.v || t.t}'` });
    throw new ParseBreak();
  }

  function parseBrace(): Node {
    pos++; // {
    const line = peek().line;
    if (eat('}')) return { type: 'dict', pairs: [], line };
    const first = expr();
    if (eat(':')) {
      const v = expr();
      if (atKw('for')) { const comp = compRestDict(first, v, line); eat('}'); return comp; }
      const pairs = [{ k: first, v }];
      while (eat(',')) {
        if (eat('}')) return { type: 'dict', pairs, line };
        const k = expr(); expect(':'); pairs.push({ k, v: expr() });
      }
      expect('}');
      return { type: 'dict', pairs, line };
    }
    if (atKw('for')) { const comp = compRest(first, 'set'); eat('}'); return comp; }
    const items = [first];
    while (eat(',')) { if (eat('}')) return { type: 'set', items, line }; items.push(expr()); }
    expect('}');
    return { type: 'set', items, line };
  }

  function compRest(elt: Node, kind: 'list' | 'set'): Node {
    const gens = parseGenerators();
    return { type: 'comp', kind, elt, gens, line: peek().line };
  }
  function compRestDict(key: Node, val: Node, line: number): Node {
    const gens = parseGenerators();
    return { type: 'comp', kind: 'dict', key, val: elt2(val), gens, line };
  }
  const elt2 = (x: Node) => x;
  function parseGenerators(): { target: Node; iter: Node; ifs: Node[] }[] {
    const gens: { target: Node; iter: Node; ifs: Node[] }[] = [];
    while (atKw('for')) {
      pos++;
      const target = parseTarget();
      if (!eatKw('in')) { errs.push({ line: peek().line, msg: "推导式期望 'in'" }); throw new ParseBreak(); }
      const iter = orExpr();
      const ifs: Node[] = [];
      while (eatKw('if')) ifs.push(orExpr());
      gens.push({ target, iter, ifs });
    }
    return gens;
  }

  function parseFString(src: string, line: number): Node {
    const parts: any[] = [];
    let lit = '', i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === '{') {
        if (src[i + 1] === '{') { lit += '{'; i += 2; continue; }
        let depth = 1, j = i + 1, inStr: string | null = null;
        for (; j < src.length; j++) {
          const cj = src[j];
          if (inStr) { if (cj === '\\') { j++; continue; } if (cj === inStr) inStr = null; continue; }
          if (cj === '"' || cj === "'") inStr = cj;
          else if (cj === '{') depth++;
          else if (cj === '}') { depth--; if (!depth) break; }
        }
        if (depth) { errs.push({ line, msg: 'f-string 花括号不配对' }); break; }
        let exprSrc = src.slice(i + 1, j);
        i = j + 1;
        if (lit) { parts.push({ lit: unescapePy(lit) }); lit = ''; }
        let conv: string | null = null, dbg = false;
        if (exprSrc.endsWith('=') && !exprSrc.endsWith('==') && !exprSrc.endsWith('!=') && !exprSrc.endsWith('>=')) { dbg = true; exprSrc = exprSrc.slice(0, -1).trim(); }
        const m = /!([rsa])\s*$/.exec(exprSrc);
        if (m) { conv = m[1]; exprSrc = exprSrc.slice(0, -2).trim(); }
        // 顶层冒号 → 格式 spec
        let specDepth = 0, specIdx = -1, fIn: string | null = null;
        for (let k = 0; k < exprSrc.length; k++) {
          const ck = exprSrc[k];
          if (fIn) { if (ck === fIn) fIn = null; continue; }
          if (ck === '"' || ck === "'") fIn = ck;
          else if (ck === '(' || ck === '[' || ck === '{') specDepth++;
          else if (ck === ')' || ck === ']' || ck === '}') specDepth--;
          else if (ck === ':' && specDepth === 0) { specIdx = k; break; }
        }
        if (specIdx >= 0) {
          errs.push({ line, msg: 'f-string 格式说明符（:...）暂不支持，请预先用 round()/字符串处理' });
          exprSrc = exprSrc.slice(0, specIdx);
        }
        const node = miniExpr(exprSrc, line);
        parts.push({ expr: node, conv, dbg, src: exprSrc });
        continue;
      }
      if (c === '}') { if (src[i + 1] === '}') { lit += '}'; i += 2; continue; } errs.push({ line, msg: 'f-string 出现单个 }' }); i++; continue; }
      lit += c; i++;
    }
    if (lit) parts.push({ lit: unescapePy(lit) });
    return { type: 'fstr', parts, line };
  }

  function miniExpr(src: string, line: number): Node {
    const sub: Py2JsError[] = [];
    const toks2 = lex(src, sub);
    if (sub.length) { errs.push({ line, msg: sub[0].msg }); throw new ParseBreak(); }
    const sub2 = createParser(toks2, sub);
    let node: Node;
    try { node = sub2.exprOnly(); } catch (e) { if (sub.length) errs.push({ line, msg: sub[0].msg }); throw e; }
    return node;
  }

  return {
    program,
    exprOnly(): Node { const e = expr(); if (peek().t !== 'eof') { errs.push({ line: peek().line, msg: '表达式后有多余内容' }); throw new ParseBreak(); } return e; },
  };
}

// ---------------- Codegen ----------------
// 产物优先级层级（用于括号判断）
const P_LAMBDA = 1, P_TERNARY = 2, P_OR = 3, P_NOT = 4, P_CMP = 5, P_BIT = 6, P_SHIFT = 9, P_ADD = 10, P_MUL = 11, P_UNARY = 12, P_POW = 13, P_ATOM = 15;

const BIN_HELPER: Record<string, string> = { '+': '$add', '*': '$mul', '%': '$mod', '//': '$floordiv' };
const BIN_DIRECT: Record<string, string> = { '-': '-', '/': '/', '&': '&', '|': '|', '^': '^', '<<': '<<', '>>': '>>' };

const NAME2HELPER: Record<string, string> = {
  len: '$len', abs: '$abs', sum: '$sum', sorted: '$sorted', reversed: '$reversed', enumerate: '$enumerate',
  zip: '$zip', int: '$int', float: '$float', str: '$str', bool: '$bool', list: '$list', dict: '$dict',
  set: '$set', tuple: '$tuple', map: '$map', filter: '$filter', any: '$any', all: '$all', ord: '$ord',
  chr: '$chr', divmod: '$divmod', pow: '$pow', repr: '$repr', type: '$type', bin: '$bin', hex: '$hex', oct: '$oct',
};

function codegen(prog: Node[], errs: Py2JsError[]): { body: string; defs: Set<string> } {
  const defs = new Set<string>();
  const userBindings = new Set<string>();
  const numericVars = new Set<string>();
  const NUM_CALLS = ['len', 'int', 'float', 'sum', 'round', 'min', 'max', 'abs', 'pow', 'ord'];
  function isNum(n: Node): boolean {
    if (!n) return false;
    switch (n.type) {
      case 'num': return true;
      case 'name': return numericVars.has(n.id);
      case 'unary': return (n.op === '-' || n.op === '+') && isNum(n.e);
      case 'bin': return ['+', '-', '*', '/', '//', '%', '**'].includes(n.op) && isNum(n.l) && isNum(n.r);
      case 'call': return !!n.fn && n.fn.type === 'name' && NUM_CALLS.includes(n.fn.id) && !userBindings.has(n.fn.id);
      default: return false;
    }
  }
  let uid = 0;
  const newId = () => `$t${++uid}`;

  // 预收集所有 def 名（供调用分派）
  const collectDefs = (nodes: Node[]) => {
    for (const st of nodes) {
      if (st.type === 'def') { defs.add(st.name); userBindings.add(st.name); collectDefs(st.body); }
      else if (st.type === 'if') { collectDefs(st.body); collectDefs(st.orelse); }
      else if (st.type === 'while') collectDefs(st.body);
      else if (st.type === 'for') collectDefs(st.body);
    }
  };
  collectDefs(prog);

  // ---- 表达式生成 ----
  function genE(n: Node, prec = 0): string {
    switch (n.type) {
      case 'num': return n.v;
      case 'str': return n.raw ? JSON.stringify(n.v) : JSON.stringify(n.v);
      case 'const': return n.v === null ? 'null' : String(n.v);
      case 'name': return NAME2HELPER[n.id] && !userBindings.has(n.id) ? NAME2HELPER[n.id] : ident(n.id);
      case 'fstr': return genFstr(n);
      case 'list': return `[${n.items.map((x: Node) => genE(x, 0)).join(', ')}]`;
      case 'tuple': return `[${n.items.map((x: Node) => genE(x, 0)).join(', ')}]`;
      case 'set': return `new Set([${n.items.map((x: Node) => genE(x, 0)).join(', ')}])`;
      case 'dict': return genDict(n);
      case 'bin': return genBin(n, prec);
      case 'unary': return genUnary(n, prec);
      case 'bool': return genBool(n, prec);
      case 'cmp': return genCmp(n);
      case 'ifexp': {
        const js = `$bool(${genE(n.test, 0)}) ? ${genE(n.body, P_TERNARY + 1)} : ${genE(n.orelse, P_TERNARY)}`;
        return prec > P_TERNARY ? `(${js})` : js;
      }
      case 'lambda': {
        const ps = n.params.map((p: any) => ident(p.name)).join(', ');
        const js = `(${ps}) => ${genE(n.body, P_TERNARY + 1)}`;
        return prec > P_LAMBDA ? `(${js})` : js;
      }
      case 'attr': return `${genE(n.obj, P_ATOM)}.${safeAttr(n.name)}`;
      case 'sub': return `${genE(n.obj, P_ATOM)} === null ? (() => { throw new Error("TypeError: 'NoneType' 不可索引"); })() : $idx(${genE(n.obj, 0)}, ${genE(n.idx, 0)})`.replace(/^/, '');
      case 'slice': {
        const a = (x: Node) => x ? genE(x, 0) : 'undefined';
        return `$slice(${genE(n.obj, 0)}, ${a(n.lo)}, ${a(n.hi)}, ${a(n.step)})`;
      }
      case 'call': return genCall(n);
      case 'comp': return genComp(n);
      default: throw new Error('codegen: 未知节点 ' + n.type);
    }
  }

  const safeAttr = (name: string) => /^[A-Za-z_$][\w$]*$/.test(name) ? name : `[${JSON.stringify(name)}]`;

  function genFstr(n: Node): string {
    let s = '`';
    for (const p of n.parts) {
      if (p.lit !== undefined) s += p.lit.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
      else {
        const inner = genE(p.expr, 0);
        const val = p.conv === 'r' ? `$repr(${inner})` : (p.conv === 's' ? `$str(${inner})` : inner);
        if (p.dbg) {
          const label = p.src.replace(/[\\`$"]/g, ' ');
          s += `${JSON.stringify(label + '=')}\${$repr(${inner})}`;
        } else s += `\${${val}}`;
      }
    }
    return s + '`';
  }

  function genDict(n: Node): string {
    if (!n.pairs.length) return '{}';
    const items = n.pairs.map(({ k, v }: KV) => {
      const kjs = genE(k, 0);
      // 字符串/数字字面量键直接生成，其他用计算键
      if ((k.type === 'str' && !k.raw) || k.type === 'num') return `${kjs}: ${genE(v, 0)}`;
      if (k.type === 'str') return `${JSON.stringify(k.v)}: ${genE(v, 0)}`;
      return `[${kjs}]: ${genE(v, 0)}`;
    });
    return `{${items.join(', ')}}`;
  }

  function genBin(n: Node, prec: number): string {
    const helper = BIN_HELPER[n.op];
    if (helper) {
      if (n.op === '+' && isNum(n.l) && isNum(n.r)) {
        return `(${genE(n.l, P_ADD)} + ${genE(n.r, P_ADD + 1)})`;
      }
      const js = `${helper}(${genE(n.l, 0)}, ${genE(n.r, 0)})`;
      return prec > P_ATOM ? `(${js})` : js;
    }
    const op = BIN_DIRECT[n.op] ?? n.op;
    const myP = n.op === '**' ? P_POW : n.op === '<<' || n.op === '>>' ? P_SHIFT : ['&', '|', '^'].includes(n.op) ? P_BIT : n.op === '*' || n.op === '/' ? P_MUL : P_ADD;
    // ** 右结合，其余左结合
    const lp = n.op === '**' ? myP + 1 : myP;
    const rp = n.op === '**' ? myP : myP + 1;
    const js = `${genE(n.l, lp)} ${op} ${genE(n.r, rp)}`;
    return prec > myP ? `(${js})` : js;
  }

  function genUnary(n: Node, prec: number): string {
    const op = n.op === 'not' ? '' : n.op; // not 走 helper
    const js = n.op === 'not' ? `$not(${genE(n.e, 0)})` : `${op}${genE(n.e, P_UNARY)}`;
    return prec > P_UNARY ? `(${js})` : js;
  }

  function genBool(n: Node, prec: number): string {
    // 保留短路 + Python truthy 语义：a and b → (!$bool(a) ? a : b)（三元嵌套）
    const fold = (items: Node[], op: string, idx = 0): string => {
      const head = items[idx];
      if (idx === items.length - 1) return genE(head, P_TERNARY);
      const rest = fold(items, op, idx + 1);
      const h = genE(head, P_TERNARY + 1);
      return op === 'and' ? `($bool(${h}) ? ${rest} : ${h})` : `($bool(${h}) ? ${h} : ${rest})`;
    };
    const js = fold(n.items, n.op);
    return prec > P_TERNARY ? `(${js})` : js;
  }

  function genCmp(n: Node): string {
    const opJs = (op: string, l: string, r: string): string => {
      switch (op) {
        case '<': case '>': case '<=': case '>=': return `${l} ${op} ${r}`;
        case '==': return `$eq(${l}, ${r})`;
        case '!=': return `!$eq(${l}, ${r})`;
        case 'in': return `$in(${l}, ${r})`;
        case 'not in': return `!$in(${l}, ${r})`;
        case 'is': return `${l} === ${r}`;
        case 'is not': return `${l} !== ${r}`;
      }
      throw new Error('cmp op');
    };
    // 全 temp 中间量，避免重复求值副作用
    const temps: string[] = [];
    const gen = (e: Node): string => {
      if (e.type === 'name' || e.type === 'num' || e.type === 'const') return genE(e, 0);
      const t = newId();
      temps.push(`const ${t} = ${genE(e, 0)};`);
      return t;
    };
    const parts: string[] = [];
    let left = gen(n.first);
    for (let i = 0; i < n.ops.length; i++) {
      const right = gen(n.rest[i]);
      parts.push(opJs(n.ops[i], left, right));
      left = right;
    }
    if (!temps.length) return parts.join(' && ');
    return `(function () { ${temps.join(' ')} return ${parts.join(' && ')}; })()`;
  }

  function genCall(n: Node): string {
    const fn = n.fn;
    // 方法调用
    if (fn.type === 'attr') return genMethod(n);
    if (fn.type === 'name') {
      const name = fn.id;
      if (defs.has(name)) {
        if (n.kwargs.length) { errs.push({ line: n.line || 0, msg: `自定义函数 ${name}() 暂不支持关键字实参` }); return 'null'; }
        return `${ident(name)}(${n.args.map((a: Node) => genE(a, 0)).join(', ')})`;
      }
      if (name === 'print') return genPrint(n);
      const bi = genBuiltin(name, n);
      if (bi !== null) return bi;
      // 未知名字：直接生成调用（运行时自然报错）
      if (n.kwargs.length) { errs.push({ line: n.line || 0, msg: `未知函数 ${name}() 不支持关键字实参` }); return 'null'; }
      return `${ident(name)}(${n.args.map((a: Node) => genE(a, 0)).join(', ')})`;
    }
    // 表达式调用（lambda 赋值等）
    if (n.kwargs.length) { errs.push({ line: n.line || 0, msg: '该调用不支持关键字实参' }); return 'null'; }
    return `${genE(fn, P_ATOM)}(${n.args.map((a: Node) => genE(a, 0)).join(', ')})`;
  }

  const kwGet = (n: Node, k: string): Node | null => {
    const f = n.kwargs.find((kv: KV) => kv.k === k);
    return f ? f.v : null;
  };
  const kwCheck = (n: Node, allowed: string[]) => {
    for (const kv of n.kwargs) {
      if (!allowed.includes(kv.k)) { errs.push({ line: n.line || 0, msg: `'${kv.k}' 不是此调用的有效关键字实参` }); }
    }
  };

  function genPrint(n: Node): string {
    kwCheck(n, ['sep', 'end', 'flush']);
    const sep = kwGet(n, 'sep'), end = kwGet(n, 'end');
    const args = n.args.map((a: Node) => genE(a, 0)).join(', ');
    return `$print([${args}], ${sep ? genE(sep, 0) : 'undefined'}, ${end ? genE(end, 0) : 'undefined'})`;
  }

  function genBuiltin(name: string, n: Node): string | null {
    const a = (i: number, d = 'undefined') => n.args[i] ? genE(n.args[i], 0) : d;
    const all = () => n.args.map((x: Node) => genE(x, 0)).join(', ');
    const noKw = (extra: string[] = []) => kwCheck(n, extra);
    switch (name) {
      case 'len': noKw(); return `$len(${a(0)})`;
      case 'range': noKw(); return `$range(${all() || '0'})`;
      case 'abs': noKw(); return `Math.abs(${a(0)})`;
      case 'sum': noKw(); return `$sum(${a(0)}, ${a(1, 'undefined')})`;
      case 'min': case 'max': noKw(); return `$minmax([${all()}], ${name === 'min'})`;
      case 'round': noKw(); return `$round(${a(0)}, ${a(1, 'undefined')})`;
      case 'sorted': noKw(['key', 'reverse']); return `$sorted(${a(0)}, ${kwGet(n, 'key') ? genE(kwGet(n, 'key')!, 0) : 'null'}, ${kwGet(n, 'reverse') ? `$bool(${genE(kwGet(n, 'reverse')!, 0)})` : 'false'})`;
      case 'reversed': noKw(); return `$reversed(${a(0)})`;
      case 'enumerate': noKw(); return `$enumerate(${a(0)}, ${a(1, 'undefined')})`;
      case 'zip': noKw(); return `$zip(${all()})`;
      case 'int': noKw(); return n.args.length ? `$int(${a(0)}, ${a(1, 'undefined')})` : '0';
      case 'float': noKw(); return n.args.length ? `$float(${a(0)})` : '0';
      case 'str': noKw(); return n.args.length ? `$str(${a(0)})` : `''`;
      case 'bool': noKw(); return n.args.length ? `$bool(${a(0)})` : 'false';
      case 'list': noKw(); return n.args.length ? `$list(${a(0)})` : '[]';
      case 'dict': noKw(); return n.args.length ? `$dict(${a(0)})` : '{}';
      case 'set': noKw(); return n.args.length ? `$set(${a(0)})` : 'new Set()';
      case 'tuple': noKw(); return n.args.length ? `$tuple(${a(0)})` : '[]';
      case 'map': noKw(); return `$map(${all()})`;
      case 'filter': noKw(); return `$filter(${all()})`;
      case 'any': noKw(); return `$any(${a(0)})`;
      case 'all': noKw(); return `$all(${a(0)})`;
      case 'ord': noKw(); return `$ord(${a(0)})`;
      case 'chr': noKw(); return `$chr(${a(0)})`;
      case 'divmod': noKw(); return `$divmod(${all()})`;
      case 'pow': noKw(); return `$pow(${all()})`;
      case 'repr': noKw(); return `$repr(${a(0)})`;
      case 'type': noKw(); return `$type(${a(0)})`;
      case 'bin': noKw(); return `$bin(${a(0)})`;
      case 'hex': noKw(); return `$hex(${a(0)})`;
      case 'oct': noKw(); return `$oct(${a(0)})`;
      case 'input': errs.push({ line: n.line || 0, msg: 'input() 在浏览器不可用，请在编辑器里写死输入数据' }); return "''";
      case 'open': errs.push({ line: n.line || 0, msg: '文件读写(open)在浏览器不可用' }); return 'null';
      case 'isinstance': case 'hash': case 'id': case 'vars': case 'dir': case 'getattr': case 'setattr': case 'super': case 'format': case 'iter': case 'next': case 'callable': case 'hasattr':
        errs.push({ line: n.line || 0, msg: `${name}() 暂不支持` }); return 'null';
      default: return null;
    }
  }

  // 方法调用映射
  function genMethod(n: Node): string {
    const m: any = n.fn;
    const obj = genE(m.obj, 0);
    const name = m.name;
    const a = (i: number, d = 'undefined') => n.args[i] ? genE(n.args[i], 0) : d;
    const all = () => n.args.map((x: Node) => genE(x, 0)).join(', ');
    const noKw = (extra: string[] = []) => kwCheck(n, extra);
    switch (name) {
      case 'append': noKw(); if (n.args.length !== 1) { errs.push({ line: n.line || 0, msg: 'append() 需要 1 个参数' }); } return `${obj}.push(${a(0)})`;
      case 'extend': noKw(); return `$extend(${obj}, ${a(0)})`;
      case 'insert': noKw(); return `$insert(${obj}, ${a(0)}, ${a(1)})`;
      case 'pop': noKw(); return n.args.length ? `$pop(${obj}, ${a(0)})` : `$pop(${obj})`;
      case 'remove': noKw(); return `$remove(${obj}, ${a(0)})`;
      case 'index': noKw(); return `$index(${obj}, ${a(0)})`;
      case 'count': noKw(); return `$count(${obj}, ${a(0)})`;
      case 'reverse': noKw(); return `${obj}.reverse()`;
      case 'sort': noKw(['key', 'reverse']); return `$sortInplace(${obj}, ${kwGet(n, 'key') ? genE(kwGet(n, 'key')!, 0) : 'null'}, ${kwGet(n, 'reverse') ? `$bool(${genE(kwGet(n, 'reverse')!, 0)})` : 'false'})`;
      case 'copy': noKw(); return `$copy(${obj})`;
      case 'clear': noKw(); return `$clear(${obj})`;
      case 'lower': noKw(); return `${obj}.toLowerCase()`;
      case 'upper': noKw(); return `${obj}.toUpperCase()`;
      case 'strip': noKw(); return n.args.length ? `$strip(${obj}, ${a(0)})` : `$strip(${obj})`;
      case 'lstrip': noKw(); return n.args.length ? `$lstrip(${obj}, ${a(0)})` : `$lstrip(${obj})`;
      case 'rstrip': noKw(); return n.args.length ? `$rstrip(${obj}, ${a(0)})` : `$rstrip(${obj})`;
      case 'split': noKw(); return n.args.length ? `${obj}.split(${a(0)})` : `$wsplit(${obj})`;
      case 'rsplit': errs.push({ line: n.line || 0, msg: 'rsplit 暂不支持，请用 split' }); return 'null';
      case 'join': noKw(); return `$join(${a(0)}, ${obj})`;
      case 'replace': noKw(); return `$replace(${obj}, ${a(0)}, ${a(1)})`;
      case 'find': noKw(); return `$find(${obj}, ${a(0)})`;
      case 'rfind': noKw(); return `$rfind(${obj}, ${a(0)})`;
      case 'startswith': noKw(); return `$startswith(${obj}, ${a(0)})`;
      case 'endswith': noKw(); return `$endswith(${obj}, ${a(0)})`;
      case 'title': noKw(); return `$title(${obj})`;
      case 'capitalize': noKw(); return `$capitalize(${obj})`;
      case 'zfill': noKw(); return `$zfill(${obj}, ${a(0)})`;
      case 'center': noKw(); return `$center(${obj}, ${a(0)}, ${a(1)})`;
      case 'isdigit': noKw(); return `$isdigit(${obj})`;
      case 'isalpha': noKw(); return `$isalpha(${obj})`;
      case 'isalnum': noKw(); return `$isalnum(${obj})`;
      case 'isspace': noKw(); return `$isspace(${obj})`;
      case 'islower': noKw(); return `$islower(${obj})`;
      case 'isupper': noKw(); return `$isupper(${obj})`;
      case 'format': errs.push({ line: n.line || 0, msg: 'str.format 不支持，请改用 f-string' }); return 'null';
      case 'keys': noKw(); return `Object.keys(${obj})`;
      case 'values': noKw(); return `Object.values(${obj})`;
      case 'items': noKw(); return `$items(${obj})`;
      case 'get': noKw(); return n.args.length >= 2 ? `$dget(${obj}, ${a(0)}, ${a(1)})` : `$dget(${obj}, ${a(0)})`;
      case 'update': noKw(); return `$dupdate(${obj}, ${a(0)})`;
      case 'setdefault': noKw(); return n.args.length >= 2 ? `$dsetdef(${obj}, ${a(0)}, ${a(1)})` : `$dsetdef(${obj}, ${a(0)})`;
      case 'add': noKw(); return `${obj}.add(${a(0)})`;
      case 'discard': noKw(); return `${obj}.delete(${a(0)})`;
      case 'union': noKw(); return `$union(${obj}, ${a(0)})`;
      case 'intersection': noKw(); return `$intersection(${obj}, ${a(0)})`;
      case 'difference': noKw(); return `$difference(${obj}, ${a(0)})`;
      default:
        // 未知属性调用：直接生成（可能是用户对象方法）
        return `${genE(n.fn as Node, P_ATOM)}(${all()})`;
    }
  }

  function genComp(n: Node): string {
    const build = (gi: number, acc: string): string => {
      if (gi === n.gens.length) {
        if (n.kind === 'list') return acc + `$r.push(${genE(n.elt, 0)});`;
        if (n.kind === 'set') return acc + `$r.add(${genE(n.elt, 0)});`;
        return acc + `$r[${genE(n.key, 0)}] = ${genE(n.val, 0)};`;
      }
      const g = n.gens[gi];
      const tgt = destruct(g.target);
      let inner = build(gi + 1, acc);
      for (const f of [...g.ifs].reverse()) inner = `if (!$bool(${genE(f, 0)})) continue; ` + inner;
      return `for (const ${tgt} of $iter(${genE(g.iter, 0)})) { ${inner} }`;
    };
    const init = n.kind === 'list' ? 'const $r = [];' : n.kind === 'set' ? 'const $r = new Set();' : 'const $r = {};';
    return `(() => { ${init} ${build(0, '')} return $r; })()`;
  }

  // 赋值/解包目标 → JS 解构目标
  function destruct(t: Node): string {
    if (t.type === 'tuple') return `[${t.items.map(destruct).join(', ')}]`;
    return genE(t, P_ATOM);
  }

  // ---- 语句生成 ----
  const lines: string[] = [];
  let ind = 1;
  const W = (s: string) => lines.push('  '.repeat(ind) + s);

  function collectLocals(body: Node[]): Set<string> {
    const names = new Set<string>();
    const addTarget = (t: Node) => {
      if (t.type === 'name') names.add(t.id);
      else if (t.type === 'tuple') t.items.forEach(addTarget);
    };
    const walk = (nodes: Node[]) => {
      for (const st of nodes) {
        if (st.type === 'assign') st.targets.forEach(addTarget);
        else if (st.type === 'aug') addTarget(st.target.type === 'name' ? st.target : { type: 'none' });
        else if (st.type === 'if') { walk(st.body); walk(st.orelse); }
        else if (st.type === 'while') walk(st.body);
        else if (st.type === 'for') walk(st.body); // target 由 for 循环自身声明
        else if (st.type === 'def') { /* function 声明自带绑定，不能重复 let 声明 */ }
      }
    };
    walk(body);
    return names;
  }

  function genBody(body: Node[]) {
    for (const st of body) genStmt(st);
  }

  function genStmt(st: Node) {
    switch (st.type) {
      case 'assign': genAssign(st); break;
      case 'aug': {
        const t = st.target;
        const v = genE(st.value, 0);
        const helper = BIN_HELPER[st.op];
        const inlineAdd = st.op === '+' && isNum(t) && isNum(st.value);
        const opJs = helper ? (l: string) => (inlineAdd ? `(${l} + ${v})` : `${helper}(${l}, ${v})`) : (l: string) => `${l} ${st.op} ${v}`;
        if (t.type === 'name') { if (!inlineAdd) numericVars.delete(t.id); W(`${ident(t.id)} = ${opJs(ident(t.id))};`); }
        else if (t.type === 'attr') W(`${genE(t.obj, P_ATOM)}.${safeAttr(t.name)} = ${opJs(`${genE(t.obj, P_ATOM)}.${safeAttr(t.name)}`)};`);
        else if (t.type === 'sub') W(`$setidx(${genE(t.obj, 0)}, ${genE(t.idx, 0)}, ${opJs(`$idx(${genE(t.obj, 0)}, ${genE(t.idx, 0)})`)});`);
        break;
      }
      case 'expr': W(`${genE(st.e, 0)};`); break;
      case 'if': {
        W(`if ($bool(${genE(st.test, 0)})) {`);
        ind++; genBody(st.body); ind--;
        if (st.orelse.length) {
          W('} else {');
          ind++; genBody(st.orelse); ind--;
          W('}');
        } else W('}');
        break;
      }
      case 'while': {
        W(`while ($bool(${genE(st.test, 0)})) {`);
        ind++; genBody(st.body); ind--;
        W('}');
        break;
      }
      case 'for': genFor(st); break;
      case 'def': genFunc(st); break;
      case 'return': W(st.e ? `return ${genE(st.e, 0)};` : 'return;'); break;
      case 'break': W('break;'); break;
      case 'continue': W('continue;'); break;
      case 'pass': break;
      case 'assert': W(`$assert(${genE(st.e, 0)}${st.msg ? `, ${genE(st.msg, 0)}` : ''});`); break;
      default: break;
    }
  }

  function genAssign(st: Node) {
    const value = genE(st.value, 0);
    const targets = st.targets;
    // 链式：a = b = expr（仅 name 目标）
    if (targets.length > 1) {
      if (targets.some((t: Node) => t.type !== 'name')) {
        errs.push({ line: st.line || 0, msg: '链式赋值目标只能是变量名' });
        return;
      }
      const num = isNum(st.value);
      for (const tg of targets) { if (num) numericVars.add(tg.id); else numericVars.delete(tg.id); }
      let js = value;
      for (let k = targets.length - 1; k >= 0; k--) js = `${ident(targets[k].id)} = (${js})`;
      W(js + ';');
      return;
    }
    const t = targets[0];
    if (t.type === 'name') { if (isNum(st.value)) numericVars.add(t.id); else numericVars.delete(t.id); W(`${ident(t.id)} = ${value};`); return; }
    if (t.type === 'attr') { W(`${genE(t.obj, P_ATOM)}.${safeAttr(t.name)} = ${value};`); return; }
    if (t.type === 'sub') {
      if (t.idx && t.idx.type === 'slice') { errs.push({ line: st.line || 0, msg: '切片赋值暂不支持，请用循环逐项赋值' }); return; }
      W(`$setidx(${genE(t.obj, 0)}, ${genE(t.idx, 0)}, ${value});`);
      return;
    }
    if (t.type === 'tuple') {
      const allNum = st.value.type === 'tuple' && st.value.items.length === t.items.length && st.value.items.every((x: Node) => isNum(x));
      for (const it of t.items) { if (it.type === 'name') { if (allNum) numericVars.add(it.id); else numericVars.delete(it.id); } }
      const rhs = st.value.type === 'tuple' ? value : `$arr($iter(${value}))`;
      W(`${destruct(t)} = ${rhs};`);
      return;
    }
  }

  function genFor(st: Node) {
    // range 优化：for i in range(...) → C 风格循环
    const iter = st.iter;
    const isRange = iter.type === 'call' && iter.fn.type === 'name' && iter.fn.id === 'range' && !defs.has('range') && !iter.kwargs.length && iter.args.length >= 1 && iter.args.length <= 3;
    if (isRange && st.target.type === 'name') {
      numericVars.add(st.target.id);
      const args = iter.args;
      const start = args.length >= 2 ? genE(args[0], 0) : '0';
      const stop = genE(args.length >= 2 ? args[1] : args[0], 0);
      const step = args.length >= 3 ? genE(args[2], 0) : '1';
      const simple = (e: Node) => e.type === 'num' || e.type === 'name' || e.type === 'const';
      const sid = args.length >= 2 && !simple(args[0]);
      const eid = !simple(args.length >= 2 ? args[1] : args[0]);
      const spd = args.length >= 3 && !simple(args[2]);
      const n = ++uid;
      const parts = [`let ${ident(st.target.id)} = ${sid ? `(${start})` : start}`];
      if (eid) parts.push(`$e${n} = (${stop})`);
      if (spd) parts.push(`$s${n} = (${step})`);
      const eRef = eid ? `$e${n}` : `(${stop})`;
      const sRef = spd ? `$s${n}` : `(${step})`;
      W(`for (${parts.join(', ')}; ${sRef} > 0 ? ${ident(st.target.id)} < ${eRef} : ${ident(st.target.id)} > ${eRef}; ${ident(st.target.id)} += ${sRef}) {`);
      ind++; genBody(st.body); ind--;
      W('}');
      return;
    }
    const tgt = destruct(st.target);
    W(`for (const ${tgt} of $iter(${genE(iter, 0)})) {`);
    ind++; genBody(st.body); ind--;
    W('}');
  }

  function genFunc(st: Node) {
    const params = st.params.map((p: any) => p.def ? `${ident(p.name)} = ${genE(p.def, 0)}` : ident(p.name));
    if (st.star) params.push(`...${ident(st.star)}`);
    W(`function ${ident(st.name)}(${params.join(', ')}) {`);
    ind++;
    const addedU: string[] = [];
    const pushU = (nm: string) => { if (!userBindings.has(nm)) { userBindings.add(nm); addedU.push(nm); } };
    for (const p of st.params) pushU(p.name);
    if (st.star) pushU(st.star);
    const locals = collectLocals(st.body);
    for (const nm of locals) pushU(nm);
    if (locals.size) W(`let ${[...locals].map(ident).join(', ')};`);
    const savedNum = [...numericVars];
    numericVars.clear();
    genBody(st.body);
    numericVars.clear();
    for (const nm of savedNum) numericVars.add(nm);
    for (const nm of addedU) userBindings.delete(nm);
    ind--;
    W('}');
  }

  // 顶层
  const topLocals = collectLocals(prog);
  for (const nm of topLocals) userBindings.add(nm);
  if (topLocals.size) lines.push(`let ${[...topLocals].map(ident).join(', ')};`);
  genBody(prog);

  return { body: lines.join('\n'), defs };
}

export function transpile(src: string): TranspileResult {
  const errs: Py2JsError[] = [];
  const toks = lex(src, errs);
  let prog: Node[] = [];
  try { prog = createParser(toks, errs).program(); } catch (e) { if (!(e instanceof ParseBreak)) throw e; }
  if (errs.length) return { js: '', body: '', errors: errs };
  let body = '';
  try { body = codegen(prog, errs).body; } catch (e) { errs.push({ line: 0, msg: '内部错误：' + (e as Error).message }); }
  if (errs.length) return { js: '', body: '', errors: errs };
  const js = 'return (() => {\n' + body + '\nreturn { out: $OUT.join("") };\n})()';
  return { js, body, errors: errs };
}
