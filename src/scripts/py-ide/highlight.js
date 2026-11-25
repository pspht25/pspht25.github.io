// py-ide · 轻量 Python 语法高亮（零依赖，逐行 tokenizer）
// 与 python-runner 页同款实现，抽出为共享模块
export function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const KW = new Set(
  'def return if elif else for while import from as with try except finally class in not and or lambda None True False await async yield global nonlocal assert break continue pass raise del is match case'.split(' ')
);
const BUILTIN = new Set(
  'print len range int float str list dict set tuple sum min max abs round sorted enumerate zip map filter open type isinstance super bool bytes repr format any all hex oct bin divmod pow iter next getattr setattr hasattr'.split(' ')
);

export function hlPython(src) {
  const out = [];
  for (const line of String(src).split('\n')) {
    let html = '';
    let i = 0;
    const n = line.length;
    while (i < n) {
      const c = line[i];
      if (c === '#') {
        html += '<span class="tok-com">' + escHtml(line.slice(i)) + '</span>';
        break;
      }
      // 字符串（含 f/r/b/u 前缀；未闭合引号着色到行尾）
      const sm = line.slice(i).match(/^[A-Za-z]{0,2}("""|'''|"|')/);
      if (sm && sm[0] && !/[\w.]/.test(line[i - 1] || '')) {
        const q = sm[1];
        const end = line.indexOf(q, i + sm[0].length);
        const stop = end === -1 ? n : end + q.length;
        html += '<span class="tok-str">' + escHtml(line.slice(i, stop)) + '</span>';
        i = stop;
        continue;
      }
      // 数字（避免吃进标识符）
      if (/[0-9]/.test(c) && !/[\w.]/.test(line[i - 1] || '')) {
        const nm = line.slice(i).match(/^0[xXbBoO][\da-fA-F_]+|\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d+)?[jJ]?/);
        if (nm) {
          html += '<span class="tok-num">' + escHtml(nm[0]) + '</span>';
          i += nm[0].length;
          continue;
        }
      }
      // 标识符 / 关键字 / 内建 / 类名
      const im = line.slice(i).match(/^[A-Za-z_]\w*/);
      if (im) {
        const w = im[0];
        const cls = KW.has(w) ? 'tok-kw' : BUILTIN.has(w) ? 'tok-bi' : /^[A-Z][A-Za-z0-9_]*$/.test(w) ? 'tok-cl' : '';
        html += cls ? '<span class="' + cls + '">' + escHtml(w) + '</span>' : escHtml(w);
        i += w.length;
        continue;
      }
      html += escHtml(c);
      i++;
    }
    out.push(html);
  }
  return out.join('\n');
}
