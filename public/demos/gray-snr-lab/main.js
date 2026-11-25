/* gray-snr-lab · main.js —— 交互绑定 / 读数更新 / py2js 实操区
   依赖 sim.js、charts.js；与其他演示页零耦合。 */
(function () {
  'use strict';
  var S = window.GSL, D = S.draw;
  function $(id) { return document.getElementById(id); }

  /* ---------- 主题同步 / KaTeX / 返回与顶部 ---------- */
  (function () {
    var t = localStorage.getItem('theme') ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = t;
    if (location.protocol === 'file:') { $('backDemo').style.display = 'none'; }
    addEventListener('storage', function (e) { if (e.key === 'theme' && e.newValue) document.documentElement.dataset.theme = e.newValue; });
  })();
  window.addEventListener('load', function () {
    if (!window.katex) return;
    document.querySelectorAll('[data-tex]').forEach(function (el) {
      try { katex.render(el.dataset.tex, el, { throwOnError: false }); } catch (e) { /* fallback 文本已在 HTML */ }
    });
  });
  $('toTop').addEventListener('click', function () { scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ---------- 滑块 ---------- */
  function knob(id, key, fmt) {
    var el = $(id), lb = $('lb' + id.slice(2));
    lb.textContent = fmt(S.st[key]);
    el.value = S.st[key];
    el.addEventListener('input', function () {
      S.st[key] = parseFloat(el.value);
      lb.textContent = fmt(S.st[key]);
      if (key === 'EXPO' || key === 'GAMMA') { syncTop(); }
      scheduleHeavy();
    });
  }
  knob('knExpo', 'EXPO', function (v) { return v.toFixed(2); });
  knob('knRead', 'READ', function (v) { return v.toFixed(3); });
  knob('knPrnu', 'PRNU', function (v) { return (v * 100).toFixed(1) + '%'; });
  knob('knGamma', 'GAMMA', function (v) { return v.toFixed(2); });
  knob('knVign', 'VIGN', function (v) { return v.toFixed(2); });
  var elFill = $('knFill');
  $('lbFill').textContent = S.st.FILL.toFixed(2);
  elFill.addEventListener('input', function () {
    S.st.FILL = parseFloat(elFill.value);
    $('lbFill').textContent = S.st.FILL.toFixed(2);
    updateAll();
  });
  $('btnReshoot').addEventListener('click', function () {
    S.st.reshot++;
    heavy();
  });

  var heavyTimer = null;
  function scheduleHeavy() {
    if (heavyTimer) return;
    heavyTimer = setTimeout(function () { heavyTimer = null; heavy(); }, 140);
  }

  /* ---------- γ 拟合（log-log 回归，排除饱和/黑端）---------- */
  function fitGamma(meas) {
    var sx = 0, sy = 0, sxx = 0, sxy = 0, n = 0;
    meas.forEach(function (m) {
      var dn = 255 * m.m;
      if (dn < 3 || dn > 253) return;
      var x = Math.log10(m.L), y = Math.log10(Math.max(dn, 1e-9));
      sx += x; sy += y; sxx += x * x; sxy += x * y; n++;
    });
    if (n < 2) return 0;
    var slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
    return slope > 0 ? 1 / slope : 0;
  }

  /* ---------- 主更新（shoot 后）---------- */
  function heavy() {
    S.shoot();
    $('shotCv').getContext('2d').putImageData(S.shotImg, 0, 0);
    updateAll();
    schedulePg();
  }

  function updateAll() {
    var st = S.st;
    /* ③ ROI */
    D.roi($('roiCv'));
    var s3 = S.stats(S.sampleROI(st.sel, st.FILL), st.LF);
    $('roFillN').textContent = '144';
    $('roFillMean').textContent = Math.round(255 * s3.m).toString();
    $('roFillSd').textContent = s3.sd > 0 ? s3.sd.toExponential(2) : '—';
    $('roFillSnr').textContent = s3.sd > 0 ? (s3.m / s3.sd).toFixed(2) : '—';
    var wn = $('roiWarn');
    if (st.FILL > 0.8) {
      wn.innerHTML = '⚠️ fill=' + st.FILL.toFixed(2) + '：采样框（红）已压到 patch 边缘软过渡带——σ 虚高、SNR 被低估。Imatest 建议 ≤ 0.65。';
      wn.style.color = '';
    } else if (st.FILL > 0.7) {
      wn.innerHTML = '△ fill=' + st.FILL.toFixed(2) + '：接近边缘（距边界仅 ' + ((44 * (1 - st.FILL) / 2)).toFixed(1) + 'px），软过渡带的离群像素开始混入。';
    } else {
      wn.innerHTML = '点左边缩略图可以换 patch；右图红框是当前 fill 的采样框，绿框是 patch 边界。';
    }
    /* ④ OECF */
    var meas = S.snrCurve(st.FILL, false);
    var fg = fitGamma(meas);
    $('roSetGamma').textContent = st.GAMMA.toFixed(2);
    $('roFitGamma').textContent = fg > 0 ? fg.toFixed(2) : '—';
    var nClip = 0;
    meas.forEach(function (m) { if (255 * m.m >= 254) nClip++; });
    $('roClip').textContent = nClip > 0 ? nClip + ' 个（已饱和！）' : '0';
    D.oecf($('oecfCv'), meas, fg);
    /* ⑤ SNR */
    var flatC = S.snrCurve(st.FILL, true), rawC = S.snrCurve(st.FILL, false);
    var snr13 = D.snr($('snrCv'), flatC, rawC);
    var lref = S.lref(), lsnr = 0.13 * lref;
    $('roLref').textContent = lref.toFixed(4);
    $('roLsnr').textContent = lsnr.toFixed(4);
    $('roSnr13').textContent = snr13 > 0 ? snr13.toFixed(2) : '—';
    $('roSnr13dB').textContent = snr13 > 0 ? (20 * Math.log10(snr13)).toFixed(1) + ' dB' : '—';
    var peak = 0;
    flatC.forEach(function (m) { if (m.snr > peak) peak = m.snr; });
    $('roPeak').textContent = peak > 0 ? peak.toFixed(2) : '—';
    /* ⑥ 多帧 */
    var ms = S.multiStats(st.FILL, st.N);
    D.multi($('multiCv'), ms);
    var mSel = ms[st.sel];
    var sigAvg = Math.sqrt(mSel.st * mSel.st / st.N + mSel.sp * mSel.sp);
    var gain = (mSel.tot > 0 && sigAvg > 0) ? mSel.tot / sigAvg : 1;
    $('roGain').textContent = gain.toFixed(2) + '×';
    $('roGainTh').textContent = st.N > 1 ? '√N = ' + Math.sqrt(st.N).toFixed(2) + '×' : '—';
    D.avgPair($('avgA'), $('avgB'), st.N);
    $('avgLabelA').textContent = '单帧（N=1）· patch d=' + S.PATCHES[st.sel].d.toFixed(2);
    $('avgLabelB').textContent = 'N 帧平均（N=' + st.N + '）· 同一 patch';
    /* ⑦ DR */
    D.dr($('drCv'), ms);
    var dr = S.drCalc();
    $('roLsat').textContent = dr.Lsat.toFixed(4);
    $('roLmin').textContent = dr.Lmin.toFixed(5);
    $('roDrdB').textContent = (20 * Math.log10(dr.dr)).toFixed(1) + ' dB';
    $('roDrStops').textContent = (Math.log2(dr.dr)).toFixed(2) + ' stops';
  }

  /* ---------- patch 选择 / 帧数 / 低频开关 / 悬停 ---------- */
  $('roiCv').addEventListener('click', function (e) {
    var r = this.getBoundingClientRect();
    var x = (e.clientX - r.left) * (this.width / r.width);
    var y = (e.clientY - r.top) * (this.height / r.height);
    // 缩略图区域：x∈[8,348], y∈[22,277]
    if (x >= 8 && x <= 348 && y >= 22 && y <= 277) {
      var mx = (x - 8) * (S.W / 340), my = (y - 22) * (S.H / 255);
      var best = -1, bd = 1e9;
      S.PATCHES.forEach(function (p) {
        var d = (p.cx - mx) * (p.cx - mx) + (p.cy - my) * (p.cy - my);
        if (d < bd) { bd = d; best = p.i; }
      });
      if (best >= 0 && bd < 55 * 55) { S.st.sel = best; updateAll(); }
    }
  });
  document.querySelectorAll('.nbtn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.nbtn').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      S.st.N = parseInt(b.dataset.n, 10);
      updateAll();
    });
  });
  $('btnLF').addEventListener('click', function () {
    S.st.LF = !S.st.LF;
    this.textContent = S.st.LF ? '🔘 低频去除（ISO 15739 Annex C）：开' : '🔘 低频去除（ISO 15739 Annex C）：关';
    this.classList.toggle('on', S.st.LF);
    updateAll();
  });
  $('shotCv').addEventListener('mousemove', function (e) {
    var r = this.getBoundingClientRect();
    var x = Math.round((e.clientX - r.left) * (this.width / r.width));
    var y = Math.round((e.clientY - r.top) * (this.height / r.height));
    if (x < 0 || y < 0 || x >= S.W || y >= S.H) return;
    var idx = S.patchAt[y * S.W + x];
    var dn = S.shotData[(y * S.W + x) * 4];
    $('shotNote').textContent = idx > 0
      ? '→ 悬停：patch #' + (idx - 1) + '（d=' + S.PATCHES[idx - 1].d.toFixed(2) + '）此处 DN = ' + dn
      : '→ 悬停：背景（d=0.62）此处 DN = ' + dn;
  });

  /* ============================================================
     ⑧ py2js 实操区
  ============================================================ */
  var TPL_BASE = [
    'import math',
    '',
    'GAMMA = 2.2   # ← 与左侧「Gamma」旋钮同步',
    'EXPO  = 1.15  # ← 与左侧「曝光」旋钮同步',
    'K13   = 0.13  # ISO 15739：L_SNR = 0.13 × L_ref',
    'LF    = 1     # 1 = 低频去除（Annex C 3×3 高通），0 = 关闭',
    'READ  = 0.003',
    'CSHOT = 0.002',
    '',
    'def inv_g(dn):',
    '    return (dn / 255.0) ** GAMMA',
    '',
    'def mean_v(a):',
    '    s0 = 0.0',
    '    for v0 in a:',
    '        s0 += v0',
    '    return s0 / len(a)',
    '',
    'def rms_v(a):',
    '    m0 = mean_v(a)',
    '    s1 = 0.0',
    '    for v1 in a:',
    '        s1 += (v1 - m0) * (v1 - m0)',
    '    return math.sqrt(s1 / len(a))',
    '',
    'def flat3(a, w):',
    '    # 3×3 均值高通：去掉 patch 内低频起伏（渐晕 / 照明不均）',
    '    # 注：py2js 在浏览器内转译执行，各层循环变量名保持唯一以免互相遮蔽',
    '    out = []',
    '    for fi in range(len(a)):',
    '        x = fi % w',
    '        y = fi // w',
    '        s2 = 0.0',
    '        n1 = 0',
    '        for dy in (-1, 0, 1):',
    '            for dx in (-1, 0, 1):',
    '                xx = min(max(x + dx, 0), w - 1)',
    '                yy = min(max(y + dy, 0), w - 1)',
    '                s2 += a[yy * w + xx]',
    '                n1 += 1',
    '        out.append(a[fi] - s2 / n1)',
    '    return out',
    '',
    '# ---- 第一步：逐 patch 线性化 + 统计 ----',
    'SNR = []',
    'for pi in range(len(PATCHES_DN)):',
    '    lin = [inv_g(v) for v in PATCHES_DN[pi]]',
    '    m = mean_v(lin)   # 信号：原始线性均值',
    '    if LF == 1:',
    '        lin = flat3(lin, 12)   # 噪声：去低频后的残差',
    '    sd = rms_v(lin)',
    '    snr = 0.0',
    '    if sd > 0:',
    '        snr = m / sd',
    '    SNR.append([L_LIST[pi], m, sd, snr])',
    '',
    '# ---- 第二步：L_ref 与 L_SNR ----',
    'L_REF = (245.0 / 255.0) ** GAMMA / EXPO',
    'L_SNR = K13 * L_REF',
    '',
    '# ---- 第三步：log-log 插值取报告值 ----',
    'snr13 = 0.0',
    'for j3 in range(len(SNR) - 1):',
    '    lo = SNR[j3]',
    '    hi = SNR[j3 + 1]',
    '    if (lo[0] - L_SNR) * (hi[0] - L_SNR) <= 0 and lo[0] != hi[0]:',
    '        t = math.log(L_SNR / lo[0]) / math.log(hi[0] / lo[0])',
    '        snr13 = lo[3] + t * (hi[3] - lo[3])',
    '',
    '# ---- 第四步：读出噪声地板 → 外推动态范围 ----',
    'S_MIN = (CSHOT + math.sqrt(CSHOT * CSHOT + 4 * READ * READ)) / 2',
    'DR = 1.0 / S_MIN',
    '',
    "print('---RES---')",
    'for row in SNR:',
    "    print(round(row[1], 4), round(row[2], 5), round(row[3], 3))",
    "print('---FIT---')",
    "print('L_REF', round(L_REF, 4))",
    "print('L_SNR', round(L_SNR, 4))",
    'db = 0.0',
    'if snr13 > 0:',
    '    db = 20 * math.log10(snr13)',
    "print('SNR13', round(snr13, 2), round(db, 1))",
    "print('DR_dB', round(20 * math.log10(DR), 1))",
    "print('DR_stops', round(math.log2(DR), 2))",
    ''
  ].join('\n');

  function tpl(name) {
    var s = TPL_BASE;
    if (name === 'lf0') s = s.replace('LF    = 1 ', 'LF    = 0 ');
    if (name === 'k13') s = s.replace('K13   = 0.13', 'K13   = 0.18');
    if (name === 'g10') s = s.replace('GAMMA = 2.2 ', 'GAMMA = 1.0 ');
    return s;
  }
  function syncTop() {
    var s = $('pgCode').value;
    if (!/GAMMA = /.test(s) || !/EXPO  = /.test(s)) return;
    s = s.replace(/^GAMMA = [\d.]+/m, 'GAMMA = ' + S.st.GAMMA.toFixed(2));
    s = s.replace(/^EXPO  = [\d.]+/m, 'EXPO  = ' + S.st.EXPO.toFixed(2));
    $('pgCode').value = s;
  }
  function pyLiteral(name, arr) { return name + ' = ' + JSON.stringify(arr) + '\n'; }
  function showErr(el, msg) { el.textContent = msg; el.classList.add('err'); }

  var pyReady = false;
  function ensurePy(cb) {
    if (window.PY2JS) { pyReady = true; cb(window.PY2JS); return; }
    var s = document.createElement('script');
    s.src = '../../assets/py2js.bundle.js';       // 在线：站点共享缓存
    s.onload = function () {
      if (window.PY2JS) { pyReady = true; cb(window.PY2JS); } else loadLocal();
    };
    s.onerror = loadLocal;                         // 离线 zip：页面目录内副本
    function loadLocal() {
      var s2 = document.createElement('script');
      s2.src = 'py2js.bundle.js';
      s2.onload = function () {
        if (window.PY2JS) { pyReady = true; cb(window.PY2JS); }
        else showErr($('pgOut'), 'py2js 转译器加载失败：PY2JS 全局不可用');
      };
      s2.onerror = function () {
        showErr($('pgOut'), 'py2js 转译器加载失败（站点内访问、或使用导出 zip 中的页面副本可解决）');
      };
      document.head.appendChild(s2);
    }
    document.head.appendChild(s);
  }
  function buildSrc() {
    var dn = S.PATCHES.map(function (p) { return S.sampleROI(p.i, 0.65); });
    return pyLiteral('PATCHES_DN', dn) + pyLiteral('L_LIST', S.L_LIST) + '\n' + $('pgCode').value;
  }
  function pgRun() {
    var el = $('pgOut');
    el.classList.remove('err');
    if (!window.PY2JS) {
      el.textContent = '转译器正在加载…请稍候再点一次';
      ensurePy(function () { pgRun(); });
      return;
    }
    var t0 = performance.now();
    var r = window.PY2JS.runPython(buildSrc());
    var ms = (performance.now() - t0).toFixed(0);
    if (r && r.errors && r.errors.length) {
      var e0 = r.errors[0];
      showErr(el, '编译/运行错误（第 ' + e0.line + ' 行）：' + e0.message);
      return;
    }
    var out = (r && r.out) || '';
    var resRows = [], fit = {}, mode = '';
    out.split('\n').forEach(function (ln) {
      ln = ln.trim();
      if (ln === '---RES---') { mode = 'res'; return; }
      if (ln === '---FIT---') { mode = 'fit'; return; }
      if (!ln) return;
      if (mode === 'res') {
        var p = ln.split(/\s+/).map(Number);
        if (p.length >= 3) resRows.push(p);
      } else if (mode === 'fit') {
        var p2 = ln.split(/\s+/);
        if (p2.length >= 2) fit[p2[0]] = p2.slice(1).map(Number);
      }
    });
    var lines = [];
    lines.push('✓ py2js 编译 + 执行 ' + ms + 'ms · 输入 15 patch × 144 样本（fill 0.65，当前帧）');
    lines.push('────────── 测量报告 ──────────');
    if (fit.L_REF) lines.push('L_REF  = ' + fit.L_REF[0] + '   L_SNR = ' + fit.L_SNR[0] + ' (0.13 × L_REF)');
    if (fit.SNR13) lines.push('SNR @ L_SNR = ' + fit.SNR13[0] + '   (' + fit.SNR13[1] + ' dB)   ← 相机单值报告');
    if (fit.DR_dB) lines.push('动态范围 DR = ' + (fit.DR_dB[0] > 0 ? Math.round(Math.pow(10, fit.DR_dB[0] / 20)) : '—') + ' : 1   (' + fit.DR_dB[0] + ' dB, ' + fit.DR_stops[0] + ' stops)');
    lines.push('── 每 patch [mean_lin, sd_lin, SNR] ──');
    resRows.forEach(function (row, i) {
      lines.push('d=' + S.L_LIST[i].toFixed(4) + '  ' + row[0].toFixed(4) + '  ' + row[1].toFixed(5) + '  ' + row[2].toFixed(2));
    });
    el.textContent = lines.join('\n');
    var pts = resRows.map(function (row, i) { return { L: S.L_LIST[i], snr: row[2] }; });
    D.pg($('pgCv'), pts, fit.L_SNR ? fit.L_SNR[0] : 0, fit.SNR13 ? fit.SNR13[0] : 0);
  }

  $('btnPgRun').addEventListener('click', pgRun);
  $('btnPgReset').addEventListener('click', function () {
    $('pgCode').value = TPL_BASE;
    $('pgOut').textContent = '（已还原为基准模板，点击「▶ 运行」执行）';
    $('pgCv').getContext('2d').clearRect(0, 0, $('pgCv').width, $('pgCv').height);
  });
  document.querySelectorAll('.tpl').forEach(function (b) {
    b.addEventListener('click', function () {
      $('pgCode').value = tpl(b.dataset.tpl);
      pgRun();
    });
  });
  var pgTimer = null;
  function schedulePg() {
    if (pgTimer) clearTimeout(pgTimer);
    pgTimer = setTimeout(function () { if (pyReady) pgRun(); }, 800);
  }

  /* ---------- 启动 ---------- */
  $('pgCode').value = TPL_BASE;
  heavy();
  setTimeout(function () { ensurePy(function () { pgRun(); }); }, 700);
})();
