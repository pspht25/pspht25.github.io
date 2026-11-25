/* gray-snr-lab · sim.js —— patch 几何 / 成像模型 / ROI 采样与统计
   独立模块：挂 window.GSL，不依赖任何其他演示页。 */
(function () {
  'use strict';
  var S = window.GSL = {};

  /* ---------- 常量 ---------- */
  var W = 720, H = 540, CX = 360, CY = 270;
  var C_SHOT = 0.002;          // 散粒噪声系数 c（教学量级）
  var PSZ = 44, EDGE = 1.5;    // patch 边长 / 软过渡带宽
  var D_OUT = [0.1, 0.19, 0.3, 0.41, 0.53, 0.66, 0.81, 0.97, 1.17, 1.39, 1.66, 2.0];
  var D_CEN = [0.77, 0.90, 1.05];
  var BG_D = 0.62;

  /* ---------- patch 几何（ISO 15739 noise target 示意）---------- */
  var PATCHES = [];
  (function () {
    for (var k = 0; k < 12; k++) {
      var th = k * Math.PI / 6; // 自正上方起顺时针
      PATCHES.push({
        i: k, d: D_OUT[k], R: Math.pow(10, -D_OUT[k]),
        cx: CX + 255 * Math.sin(th), cy: CY - 165 * Math.cos(th), cen: false
      });
    }
    for (var j = 0; j < 3; j++) {
      PATCHES.push({
        i: 12 + j, d: D_CEN[j], R: Math.pow(10, -D_CEN[j]),
        cx: CX + (j - 1) * 62, cy: CY, cen: true
      });
    }
  })();
  S.PATCHES = PATCHES;
  S.L_LIST = PATCHES.map(function (p) { return p.R; });
  S.W = W; S.H = H; S.CX = CX; S.CY = CY;
  S.PSZ = PSZ; S.EDGE = EDGE;
  S.BG_R = Math.pow(10, -BG_D);
  S.C_SHOT = C_SHOT;

  /* ---------- 状态 ---------- */
  S.st = {
    EXPO: 1.15, READ: 0.003, PRNU: 0.02, GAMMA: 2.2, VIGN: 0.25,
    FILL: 0.65, LF: true, N: 8, sel: 7, reshot: 0
  };

  /* ---------- 种子随机（mulberry32）+ Box-Muller ---------- */
  var rngState = 1, spare = null;
  S.setSeed = function (s) { rngState = (s >>> 0) || 1; spare = null; };
  function rnd() {
    rngState = (rngState + 0x6D2B79F5) | 0;
    var t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function gauss() {
    if (spare !== null) { var v = spare; spare = null; return v; }
    var u = 0, vv = 0;
    while (u === 0) u = rnd();
    vv = rnd();
    var r = Math.sqrt(-2 * Math.log(u)), a = 2 * Math.PI * vv;
    spare = r * Math.sin(a);
    return r * Math.cos(a);
  }
  S.gauss = gauss;

  /* ---------- PRNU：每像素固定 N(0,1)（位置哈希，帧间不变）---------- */
  function frac(x) { return x - Math.floor(x); }
  function hashG(x, y) {
    var h1 = frac(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453);
    var h2 = frac(Math.sin(x * 39.3468 + y * 11.135 + 7.7) * 24634.6345);
    if (h1 < 1e-9) h1 = 1e-9;
    return Math.sqrt(-2 * Math.log(h1)) * Math.cos(6.28318 * h2);
  }
  S.hashG = hashG;

  /* ---------- patch 索引表（渲染查表，避免逐像素 15 次矩形判断）---------- */
  var patchAt = new Int16Array(W * H);
  PATCHES.forEach(function (p, pi) {
    var x0 = Math.round(p.cx - PSZ / 2), y0 = Math.round(p.cy - PSZ / 2);
    for (var y = y0; y < y0 + PSZ; y++)
      for (var x = x0; x < x0 + PSZ; x++)
        if (x >= 0 && x < W && y >= 0 && y < H) patchAt[y * W + x] = pi + 1;
  });
  S.patchAt = patchAt;

  /* ---------- 物理模型：单像素 ---------- */
  function vign(dx, dy) {
    return 1 - S.st.VIGN * (dx * dx / (W * W / 4) + dy * dy / (H * H / 4));
  }
  function pxModel(x, y) {
    var idx = patchAt[y * W + x], R;
    if (idx > 0) {
      var p = PATCHES[idx - 1];
      R = p.R;
      var lox = x - (p.cx - PSZ / 2), loy = y - (p.cy - PSZ / 2);
      var dE = Math.min(lox, PSZ - 1 - lox, loy, PSZ - 1 - loy);
      if (dE < EDGE) { // 软过渡带：与背景混反射率
        var a = dE / EDGE;
        R = R * a + S.BG_R * (1 - a);
      }
    } else R = S.BG_R;
    var s0 = R * S.st.EXPO * vign(x - CX, y - CY);
    var g = 1 + S.st.PRNU * hashG(x, y);
    var nt = gauss() * Math.sqrt(s0 * C_SHOT + S.st.READ * S.st.READ);
    var lin = s0 * g + nt;
    if (lin < 0) lin = 0; if (lin > 1) lin = 1;
    return Math.round(255 * Math.pow(lin, 1 / S.st.GAMMA));
  }
  S.pxModel = pxModel;

  /* ---------- 渲染一帧 ---------- */
  S.shotImg = null; S.shotData = null;
  S.shoot = function (frame) {
    S.setSeed(1234567 + (S.st.reshot | 0) * 7777 + (frame | 0) * 101);
    var img = new ImageData(W, H), d = img.data;
    for (var y = 0; y < H; y++) {
      for (var x = 0; x < W; x++) {
        var dn = pxModel(x, y), o = (y * W + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = dn; d[o + 3] = 255;
      }
    }
    S.shotData = d; S.shotImg = img;
    return img;
  };

  /* ---------- ROI 采样 ---------- */
  // 12×12 网格 DN（从已渲染帧 shotData 读）
  S.sampleROI = function (pi, fill) {
    var p = PATCHES[pi], g = 12, out = [];
    var sz = PSZ * fill, x0 = Math.round(p.cx - sz / 2), y0 = Math.round(p.cy - sz / 2);
    for (var jy = 0; jy < g; jy++) {
      for (var jx = 0; jx < g; jx++) {
        var x = Math.round(x0 + (jx + 0.5) / g * sz);
        var y = Math.round(y0 + (jy + 0.5) / g * sz);
        x = x < 0 ? 0 : (x >= W ? W - 1 : x);
        y = y < 0 ? 0 : (y >= H ? H - 1 : y);
        out.push(S.shotData[(y * W + x) * 4]);
      }
    }
    return out;
  };
  // 模型直采（多帧分析用；种子已由调用方按帧设置）
  function sampleDirect(pi, fill) {
    var p = PATCHES[pi], g = 12, out = [];
    var sz = PSZ * fill, x0 = Math.round(p.cx - sz / 2), y0 = Math.round(p.cy - sz / 2);
    for (var jy = 0; jy < g; jy++) {
      for (var jx = 0; jx < g; jx++) {
        var x = Math.round(x0 + (jx + 0.5) / g * sz);
        var y = Math.round(y0 + (jy + 0.5) / g * sz);
        out.push(pxModel(x, y));
      }
    }
    return out;
  }
  S.multiSample = function (fill, N) {
    var res = [];
    for (var f = 0; f < N; f++) {
      S.setSeed(770000 + f * 101);
      var fr = [];
      for (var pi = 0; pi < 15; pi++) fr.push(sampleDirect(pi, fill));
      res.push(fr);
    }
    return res;
  };

  /* ---------- 统计（线性域；信号=原始均值，噪声=可选高通残差 rms）---------- */
  S.stats = function (dn, doFlat) {
    var n = dn.length, a = new Array(n), gam = S.st.GAMMA;
    for (var i = 0; i < n; i++) a[i] = Math.pow(dn[i] / 255, gam);
    var m = 0, i3;
    for (i3 = 0; i3 < n; i3++) m += a[i3];
    m /= n;
    if (doFlat) { // 3×3 高通：线性梯度完全落在邻域均值里，残差≈纯噪声
      var w = 12, res = new Array(n);
      for (var i2 = 0; i2 < n; i2++) {
        var x = i2 % w, y = (i2 / w) | 0, s = 0, c = 0;
        for (var dy = -1; dy <= 1; dy++) {
          for (var dx = -1; dx <= 1; dx++) {
            var xx = x + dx, yy = y + dy;
            xx = xx < 0 ? 0 : (xx > w - 1 ? w - 1 : xx);
            yy = yy < 0 ? 0 : (yy > w - 1 ? w - 1 : yy);
            s += a[yy * w + xx]; c++;
          }
        }
        res[i2] = a[i2] - s / c;
      }
      a = res;
    }
    // σ 对数据自身均值（残差时≈0）
    var m2 = 0;
    for (i3 = 0; i3 < n; i3++) m2 += a[i3];
    m2 /= n;
    var v = 0;
    for (i3 = 0; i3 < n; i3++) { var dd = a[i3] - m2; v += dd * dd; }
    return { m: m, sd: Math.sqrt(v / n) };
  };

  /* ---------- SNR 曲线（当前帧，15 patch）---------- */
  S.snrCurve = function (fill, lf) {
    return PATCHES.map(function (p) {
      var st = S.stats(S.sampleROI(p.i, fill), lf);
      return { L: p.R, m: st.m, sd: st.sd, snr: st.sd > 0 ? st.m / st.sd : 0 };
    });
  };

  /* ---------- 多帧分离：temporal / spatial ---------- */
  // σ_t = 逐像素跨帧 std 的均方（散粒噪声逐像素独立，帧均值会把它平均掉）
  // σ_s = N 帧平均图内 patch 像素波动（固定模式，平均不掉）
  S.multiStats = function (fill, N) {
    var frames = S.multiSample(fill, N);
    var nP = 15, g = 144, gam = S.st.GAMMA;
    var acc = [], pi, k;
    for (pi = 0; pi < nP; pi++) {
      acc.push([]);
      for (k = 0; k < g; k++) acc[pi].push(0);
    }
    for (var f = 0; f < N; f++) {
      for (pi = 0; pi < nP; pi++) {
        var dn = frames[f][pi];
        for (k = 0; k < g; k++) acc[pi][k] += Math.pow(dn[k] / 255, gam);
      }
    }
    return PATCHES.map(function (p, pi3) {
      var mA = 0, k3;
      for (k3 = 0; k3 < g; k3++) mA += acc[pi3][k3] / N;
      mA /= g;
      // temporal：每像素跨帧方差 → 平均 → 开方
      var vPix = 0;
      for (k3 = 0; k3 < g; k3++) {
        var mu = acc[pi3][k3] / N, v2 = 0, f3;
        for (f3 = 0; f3 < N; f3++) {
          var lv = Math.pow(frames[f3][pi3][k3] / 255, gam);
          var d = lv - mu; v2 += d * d;
        }
        vPix += v2 / N;
      }
      var stT = N > 1 ? Math.sqrt(vPix / g) : 0;
      // spatial：平均图像素波动
      var vA = 0;
      for (k3 = 0; k3 < g; k3++) { var d2 = acc[pi3][k3] / N - mA; vA += d2 * d2; }
      var sp = Math.sqrt(vA / g);
      return { L: p.R, mean: mA, st: stT, sp: sp, tot: Math.sqrt(stT * stT + sp * sp) };
    });
  };

  /* ---------- L_ref / L_SNR / DR ---------- */
  S.lref = function () { return Math.pow(245 / 255, S.st.GAMMA) / S.st.EXPO; };
  S.interpLog = function (x, pts) { // pts:[{L,snr}] 按 L 升序；log-log 插值
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      if ((a.L - x) * (b.L - x) <= 0 && a.L !== b.L) {
        var t = Math.log(x / a.L) / Math.log(b.L / a.L);
        return a.snr + t * (b.snr - a.snr);
      }
    }
    return 0;
  };
  S.drCalc = function () { // 理论：σ² = σr² + S·c → SNR=1 处解方程
    var c = C_SHOT, r = S.st.READ;
    var smin = (c + Math.sqrt(c * c + 4 * r * r)) / 2;
    return { smin: smin, Lmin: smin / S.st.EXPO, Lsat: 1 / S.st.EXPO, dr: 1 / smin };
  };
  // 时间噪声理论曲线（全量程，供 ⑦ 叠加）
  S.snrTheory = function (L) {
    var s = L * S.st.EXPO;
    return s / Math.sqrt(s * C_SHOT + S.st.READ * S.st.READ);
  };
})();
