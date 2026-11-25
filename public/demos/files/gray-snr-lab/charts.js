/* gray-snr-lab · charts.js —— canvas 绘图（依赖 sim.js，挂 window.GSL.draw） */
(function () {
  'use strict';
  var S = window.GSL;
  var D = S.draw = {};

  /* ---------- 主题色 ---------- */
  function palette() {
    var cs = getComputedStyle(document.documentElement);
    function c(n, f) { var v = (cs.getPropertyValue(n) || '').trim(); return v || f; }
    return {
      FG: c('--fg', '#1f2937'), MUT: c('--muted', '#64748b'), BRD: c('--border', '#e3e9f0'),
      ACC: c('--accent', '#2563eb'), CARD: c('--card', '#fff'), BG: c('--bg-soft', '#eef2f7'),
      WARN: c('--warn', '#dc2626'), OK: c('--ok', '#16a34a'), AMB: c('--amber', '#d97706')
    };
  }

  /* ---------- 坐标系 ---------- */
  function mkChart(cv, xr, yr, opt) {
    opt = opt || {};
    var dpr = window.devicePixelRatio || 1;
    var cw = cv.width, ch = cv.height;
    var ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    var P = palette();
    var pad = { l: 52, b: 30, t: 18, r: 14 };
    var x0 = pad.l, x1 = cw - pad.r, y0 = ch - pad.b, y1 = pad.t;
    function X(v) {
      if (opt.xlog) v = Math.log10(Math.max(v, 1e-9));
      return x0 + (v - xr[0]) / (xr[1] - xr[0]) * (x1 - x0);
    }
    function Y(v) {
      if (opt.ylog) v = Math.log10(Math.max(v, 1e-9));
      return y0 - (v - yr[0]) / (yr[1] - yr[0]) * (y0 - y1);
    }
    // 背景 + 网格
    ctx.fillStyle = P.CARD;
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = P.BRD; ctx.lineWidth = 1;
    for (var i = 1; i < 4; i++) {
      var gx = x0 + (x1 - x0) * i / 4;
      ctx.beginPath(); ctx.moveTo(gx, y1); ctx.lineTo(gx, y0); ctx.stroke();
      var gy = y1 + (y0 - y1) * i / 4;
      ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke();
    }
    // 轴
    ctx.strokeStyle = P.MUT;
    ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
    // 刻度
    ctx.fillStyle = P.MUT; ctx.font = '10px sans-serif'; ctx.textAlign = 'center';
    var nx = opt.xlog ? 5 : 4;
    for (var i2 = 0; i2 <= nx; i2++) {
      var vx = xr[0] + (xr[1] - xr[0]) * i2 / nx;
      ctx.fillText(opt.xfmt ? opt.xfmt(vx) : fmtNum(vx), X(vx), y0 + 14);
    }
    ctx.textAlign = 'right';
    var ny = 4;
    for (var i3 = 0; i3 <= ny; i3++) {
      var vy = yr[0] + (yr[1] - yr[0]) * i3 / ny;
      ctx.fillText(opt.yfmt ? opt.yfmt(vy) : fmtNum(vy), x0 - 6, Y(vy) + 3);
    }
    // 标题 / 轴名
    ctx.textAlign = 'left';
    if (opt.title) { ctx.fillStyle = P.FG; ctx.font = '600 12px sans-serif'; ctx.fillText(opt.title, x0 + 4, y1 + 10); }
    if (opt.xlabel) { ctx.fillStyle = P.MUT; ctx.font = '11px sans-serif'; ctx.textAlign = 'right'; ctx.fillText(opt.xlabel, x1, y0 + 26); }
    if (opt.ylabel) { ctx.fillStyle = P.MUT; ctx.textAlign = 'left'; ctx.fillText(opt.ylabel, x0 - 46, y1 - 4); }
    return { ctx: ctx, X: X, Y: Y, x0: x0, x1: x1, y0: y0, y1: y1, P: P, cw: cw, ch: ch };
  }
  function fmtNum(v) {
    var a = Math.abs(v);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    return v.toFixed(a < 0.01 ? 3 : 2);
  }
  function line(c, pts, color, dash, width) {
    c.ctx.save();
    if (dash) c.ctx.setLineDash(dash);
    c.ctx.strokeStyle = color; c.ctx.lineWidth = width || 2;
    c.ctx.beginPath();
    var started = false;
    for (var i = 0; i < pts.length; i++) {
      var x = c.X(pts[i][0]), y = c.Y(pts[i][1]);
      if (!isFinite(x) || !isFinite(y)) continue;
      if (!started) { c.ctx.moveTo(x, y); started = true; }
      else c.ctx.lineTo(x, y);
    }
    c.ctx.stroke();
    c.ctx.restore();
  }
  function dot(c, x, y, color, r) {
    c.ctx.fillStyle = color;
    c.ctx.beginPath(); c.ctx.arc(c.X(x), c.Y(y), r || 4, 0, 6.28318); c.ctx.fill();
  }
  function vline(c, x, color, label, dash) {
    c.ctx.save();
    if (dash) c.ctx.setLineDash(dash);
    c.ctx.strokeStyle = color; c.ctx.lineWidth = 1.4;
    c.ctx.beginPath(); c.ctx.moveTo(c.X(x), c.y1); c.ctx.lineTo(c.X(x), c.y0); c.ctx.stroke();
    c.ctx.restore();
    if (label) {
      c.ctx.fillStyle = color; c.ctx.font = '600 10px sans-serif';
      var lx = c.X(x), tx = lx + 5;
      if (tx > c.x1 - 60) tx = lx - 62;
      c.ctx.textAlign = 'left';
      c.ctx.fillText(label, tx, c.y1 + 24);
    }
  }
  function legend(c, items) {
    var ctx = c.ctx, x = c.x0 + 8, y = c.y1 + 12;
    ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
    items.forEach(function (it) {
      ctx.fillStyle = it.color;
      if (it.dash) {
        ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = it.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18, y); ctx.stroke(); ctx.restore();
      } else { ctx.fillRect(x, y - 4, 16, 3); }
      ctx.fillStyle = c.P.FG;
      ctx.fillText(it.t, x + 22, y + 3);
      x += 22 + ctx.measureText(it.t).width + 14;
    });
  }
  D.palette = palette; D.mkChart = mkChart; D.line = line; D.dot = dot; D.vline = vline; D.legend = legend;

  var XD = [-2.35, 0.18]; // log10 L 常用域

  /* ---------- ③ ROI 视图：左缩略定位 + 右放大 ---------- */
  D.roi = function (cv) {
    var st = S.st, p = S.PATCHES[st.sel];
    var ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    var P = palette();
    // 左：整卡缩略（170×128）
    var mw = 340, mh = 255, mx = 8, my = 22;
    if (S.shotImg) ctx.drawImage(S.shotImg, 0, 0, S.W, S.H, mx, my, mw, mh);
    ctx.strokeStyle = P.BRD; ctx.strokeRect(mx, my, mw, mh);
    var sc = mw / S.W;
    // 全 patch 中心点
    S.PATCHES.forEach(function (q) {
      ctx.fillStyle = q.i === st.sel ? P.ACC : P.MUT;
      ctx.beginPath(); ctx.arc(mx + q.cx * sc, my + q.cy * (mh / S.H), q.i === st.sel ? 4 : 2, 0, 6.28318); ctx.fill();
    });
    // 选中框
    var hs = (S.PSZ * sc) / 2;
    ctx.strokeStyle = P.OK; ctx.lineWidth = 1.5;
    ctx.strokeRect(mx + p.cx * sc - hs, my + p.cy * (mh / S.H) - hs, hs * 2, hs * 2);
    ctx.fillStyle = P.FG; ctx.font = '600 11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('整卡定位（点击选 patch）', mx, 14);
    ctx.fillText('patch #' + st.sel + '  d=' + p.d.toFixed(2), mx + 4, my + 14);
    // 右：放大 64×64 → 340×255 pixelated
    var zx = mx + mw + 26, zy = my, zw = cv.width - zx - 8, zh = mh;
    var zoom = 5, zw2 = Math.min(zw, 350);
    var cx0 = Math.round(p.cx), cy0 = Math.round(p.cy);
    var half = 32;
    if (S.shotImg) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(S.shotImg, cx0 - half, cy0 - half, half * 2, half * 2, zx, zy, zw2, zh);
      ctx.imageSmoothingEnabled = true;
    }
    ctx.strokeStyle = P.BRD; ctx.strokeRect(zx, zy, zw2, zh);
    // patch 边界（绿）与 ROI 采样框（红）
    var cs = zw2 / (half * 2);
    var ps = S.PSZ * cs;
    ctx.strokeStyle = P.OK; ctx.lineWidth = 1.2;
    ctx.strokeRect(zx + (cx0 - S.PSZ / 2 - (cx0 - half)) * cs, zy + (cy0 - S.PSZ / 2 - (cy0 - half)) * cs, ps, ps);
    var fs = S.PSZ * st.FILL * cs;
    ctx.strokeStyle = P.WARN; ctx.lineWidth = 1.6;
    ctx.strokeRect(zx + (p.cx - fs / 2 / cs - (cx0 - half)) * cs, zy + (p.cy - fs / 2 / cs - (cy0 - half)) * cs, fs, fs);
    ctx.fillStyle = P.MUT; ctx.font = '11px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('放大 ×' + zoom + '：绿框=patch 边界，红框=ROI 采样框（fill=' + st.FILL.toFixed(2) + '）', zx, 14);
  };

  /* ---------- ④ OECF ---------- */
  D.oecf = function (cv, meas, fitGamma) {
    var st = S.st;
    var c = mkChart(cv, XD, [0, 260], { xlog: true, title: 'OECF：实测 patch（点+误差条） vs 理论曲线', xlabel: 'log₁₀ L（相对亮度）', ylabel: 'DN' });
    // 理论曲线
    var th = [];
    for (var i = 0; i <= 60; i++) {
      var L = Math.pow(10, XD[0] + (XD[1] - XD[0]) * i / 60);
      var dn = 255 * Math.pow(Math.min(L * st.EXPO, 1), 1 / st.GAMMA);
      th.push([L, dn]);
    }
    line(c, th, c.P.MUT, [5, 4], 1.6);
    // 实测点 + 误差条
    meas.forEach(function (m) {
      var dn = 255 * m.m, err = m.sd > 0 && m.m > 0 ? dn * (m.sd / m.m) : 0;
      var x = c.X(m.L);
      c.ctx.strokeStyle = c.P.ACC; c.ctx.lineWidth = 1;
      c.ctx.beginPath(); c.ctx.moveTo(x, c.Y(dn - err)); c.ctx.lineTo(x, c.Y(dn + err)); c.ctx.stroke();
      dot(c, m.L, dn, c.P.ACC, 4.5);
    });
    legend(c, [
      { t: '理论 DN=255(L·E)^(1/γ)，γ=' + st.GAMMA.toFixed(2), color: c.P.MUT, dash: true },
      { t: '实测（误差条=patch 内 σ 映射）', color: c.P.ACC }
    ]);
    if (fitGamma) {
      c.ctx.fillStyle = c.P.OK; c.ctx.font = '600 12px sans-serif'; c.ctx.textAlign = 'right';
      c.ctx.fillText('拟合 γ = ' + fitGamma.toFixed(2), c.x1 - 8, c.y1 + 40);
    }
  };

  /* ---------- ⑤ SNR 曲线 ---------- */
  D.snr = function (cv, flat, raw) {
    var st = S.st, lref = S.lref(), lsnr = 0.13 * lref;
    var all = flat.concat(raw || []);
    var ymax = 10;
    all.forEach(function (m) { if (m.snr > ymax) ymax = m.snr; });
    ymax = Math.ceil(ymax * 1.15);
    var c = mkChart(cv, XD, [0, ymax], { xlog: true, title: 'SNR–亮度曲线（线性域）', xlabel: 'log₁₀ L', ylabel: 'SNR = S/N' });
    if (raw) line(c, raw.map(function (m) { return [m.L, m.snr]; }), c.P.MUT, [5, 4], 1.6);
    line(c, flat.map(function (m) { return [m.L, m.snr]; }), c.P.ACC, null, 2.2);
    flat.forEach(function (m) { dot(c, m.L, m.snr, c.P.ACC, 3.6); });
    vline(c, lref, c.P.AMB, 'L_ref（DN=245）', [3, 3]);
    vline(c, lsnr, c.P.WARN, 'L_SNR=0.13·L_ref', null);
    // 报告点
    var snr13 = S.interpLog(lsnr, flat.map(function (m) { return { L: m.L, snr: m.snr }; }));
    if (snr13 > 0) {
      dot(c, lsnr, snr13, c.P.WARN, 5.5);
      c.ctx.strokeStyle = c.P.WARN; c.ctx.lineWidth = 1; c.ctx.setLineDash([2, 3]);
      c.ctx.beginPath(); c.ctx.moveTo(c.X(lsnr), c.Y(snr13)); c.ctx.lineTo(c.x0, c.Y(snr13)); c.ctx.stroke();
      c.ctx.setLineDash([]);
      c.ctx.fillStyle = c.P.WARN; c.ctx.font = '600 11px sans-serif'; c.ctx.textAlign = 'left';
      c.ctx.fillText('SNR@L_SNR = ' + snr13.toFixed(1), c.x0 + 6, c.Y(snr13) - 6);
    }
    var items = [];
    if (raw) items.push({ t: '未去低频（含渐晕梯度）', color: c.P.MUT, dash: true });
    items.push({ t: '去低频后（Annex C）', color: c.P.ACC });
    legend(c, items);
    return snr13;
  };

  /* ---------- ⑥ 多帧三曲线 ---------- */
  D.multi = function (cv, ms) {
    var c = mkChart(cv, XD, [0, 30], { xlog: true, title: '噪声分离：SNR_t / SNR_s / SNR_total（N=' + S.st.N + ' 帧）', xlabel: 'log₁₀ L', ylabel: 'SNR' });
    line(c, ms.map(function (m) { return [m.L, m.st > 0 ? m.mean / m.st : 0]; }), c.P.OK, null, 2);
    line(c, ms.map(function (m) { return [m.L, m.sp > 0 ? m.mean / m.sp : 0]; }), c.P.AMB, null, 2);
    line(c, ms.map(function (m) { return [m.L, m.tot > 0 ? m.mean / m.tot : 0]; }), c.P.ACC, [6, 3], 2);
    legend(c, [
      { t: '时间噪声 σ_t（帧间）', color: c.P.OK },
      { t: '空间噪声 σ_s（PRNU）', color: c.P.AMB },
      { t: '总噪声 σ_total', color: c.P.ACC, dash: true }
    ]);
    if (S.st.N < 2) {
      c.ctx.fillStyle = c.P.WARN; c.ctx.font = '600 12px sans-serif'; c.ctx.textAlign = 'center';
      c.ctx.fillText('N=1 无法分离时间噪声（帧间只有 1 个样本）——请选 ≥2', (c.x0 + c.x1) / 2, c.y1 + 34);
    }
  };

  /* ---------- 单帧 vs 平均小图 ---------- */
  D.avgPair = function (cvA, cvB, N) {
    var st = S.st, p = S.PATCHES[st.sel];
    function render(cv, nF) {
      var ctx = cv.getContext('2d');
      var half = 20, W2 = 120;
      var img = ctx.createImageData(W2, W2);
      var gam = st.GAMMA;
      // nF 帧平均（线性域），直接用模型逐像素
      for (var fy = 0; fy < W2; fy++) {
        for (var fx = 0; fx < W2; fx++) {
          var x = Math.round(p.cx - half + fx / (W2 - 1) * half * 2);
          var y = Math.round(p.cy - half + fy / (W2 - 1) * half * 2);
          var acc = 0;
          for (var f = 0; f < nF; f++) {
            S.setSeed(770000 + f * 101);
            acc += Math.pow(S.pxModel(x, y) / 255, gam);
          }
          var lin = acc / N;
          var dn = Math.round(255 * Math.pow(Math.max(lin, 0), 1 / gam));
          var o = (fy * W2 + fx) * 4;
          img.data[o] = img.data[o + 1] = img.data[o + 2] = dn; img.data[o + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }
    render(cvA, 1); render(cvB, N);
  };

  /* ---------- ⑦ 动态范围 ---------- */
  D.dr = function (cv, msTemporal) {
    var st = S.st, dr = S.drCalc();
    var xr = [-3.4, 0.2], yr = [-5, 42];
    var c = mkChart(cv, xr, yr, { xlog: true, title: '时间噪声 SNR(dB) 全量程：理论 + 实测 + 两个尽头', xlabel: 'log₁₀ L', ylabel: 'SNR (dB)' });
    // 理论全程
    var th = [];
    for (var i = 0; i <= 80; i++) {
      var L = Math.pow(10, xr[0] + (xr[1] - xr[0]) * i / 80);
      th.push([L, 20 * Math.log10(Math.max(S.snrTheory(L), 1e-6))]);
    }
    line(c, th, c.P.MUT, [5, 4], 1.6);
    // 实测点
    msTemporal.forEach(function (m) {
      var snr = S.st.N > 1 ? (m.st > 0 ? m.mean / m.st : 0) : (m.tot > 0 ? m.mean / m.tot : 0);
      if (snr > 0) dot(c, m.L, 20 * Math.log10(snr), c.P.ACC, 3.6);
    });
    vline(c, dr.Lsat, c.P.WARN, 'L_sat', [3, 3]);
    vline(c, dr.Lmin, c.P.AMB, 'L_min（SNR=1，外推）', null);
    legend(c, [
      { t: '理论 σ_t=√(S·c+σr²)', color: c.P.MUT, dash: true },
      { t: '实测（' + S.st.N + ' 帧）', color: c.P.ACC }
    ]);
  };

  /* ---------- ⑧ py2js 输出 ---------- */
  D.pg = function (cv, pts, lsnr, snr13) {
    if (!pts || !pts.length) return;
    var ymax = 10;
    pts.forEach(function (m) { if (m.snr > ymax) ymax = m.snr; });
    ymax = Math.ceil(ymax * 1.15);
    var c = mkChart(cv, XD, [0, ymax], { xlog: true, title: 'Python 输出：SNR–亮度曲线（log-log 插值点已标出）', xlabel: 'log₁₀ L', ylabel: 'SNR' });
    line(c, pts.map(function (m) { return [m.L, m.snr]; }), c.P.ACC, null, 2.2);
    pts.forEach(function (m) { dot(c, m.L, m.snr, c.P.ACC, 3.6); });
    if (lsnr > 0 && snr13 > 0) {
      vline(c, lsnr, c.P.WARN, 'L_SNR', null);
      dot(c, lsnr, snr13, c.P.WARN, 5.5);
    }
  };
})();
