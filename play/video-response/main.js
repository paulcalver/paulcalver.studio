// ===============================
// Split-screen: Mode System (no UI)
// Default: Gradient + Motion Field
// Keys: 1..7,0 to switch modes (see registry at bottom)
// ===============================

// ---- CONFIG ----
const SMOOTH_A = 0.85;
const MOTION_THRESHOLD = 2;
const BASE_SAT = 35;
const SAT_GAIN = 0.6;
const L_TOP = 55, L_MID = 50, L_BOT = 45;
const BG_ALPHA_H = 0.9;
const BG_ALPHA_V = 0.9;
const REGION_SMOOTH_A = 0.9;

// ---- DOM ----
const video = document.getElementById('vid');
const viz   = document.getElementById('viz');
const vctx  = viz.getContext('2d', { alpha: false });

// Offscreen sampler
const off  = document.createElement('canvas');
const octx = off.getContext('2d', { willReadFrequently: true });

// ---- State ----
let playing = false;
let cols = 24;                       // fixed default resolution
let rows = Math.round(cols * 9 / 16);
let prevFrame = null;
let prevMotion = null;

// Quadrant motion (for gradient modes)
let gTL = 0, gTR = 0, gBL = 0, gBR = 0;

// ---- Autoplay default video ----
video.addEventListener('canplay', async () => {
  if (!playing) {
    try {
      await video.play();
      playing = true;
      requestAnimationFrame(sizeCanvasToFrame);
    } catch (e) {
      console.log('Autoplay blocked; click the video to start.');
    }
  }
});

// ---- Keep canvas pixel size matched to its CSS box ----
function sizeCanvasToFrame() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  viz.width  = viz.clientWidth * dpr;
  viz.height = viz.clientHeight * dpr;
  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', sizeCanvasToFrame);

// ======================================================
// Helpers (metrics)
// ======================================================

// Compute simple spatial gradients on the downsampled luminance grid
function gradients(lum, cols, rows) {
  const gx = new Float32Array(cols*rows);
  const gy = new Float32Array(cols*rows);
  for (let y=1; y<rows-1; y++) {
    for (let x=1; x<cols-1; x++) {
      const i = y*cols + x;
      gx[i] = lum[i+1] - lum[i-1];
      gy[i] = lum[i+cols] - lum[i-cols];
    }
  }
  return { gx, gy };
}

// Quick luminance histogram (0..255 → N bins)
function luminanceHistogram(lum, bins=32) {
  const hist = new Uint32Array(bins);
  const scale = bins / 256;
  for (let i=0; i<lum.length; i++) {
    const b = Math.min(bins-1, (lum[i] * scale) | 0);
    hist[b]++;
  }
  return hist;
}

// Motion energy (global) and centroid (x,y in 0..1)
function motionStats(motion, cols, rows) {
  let sum=0, sx=0, sy=0;
  for (let y=0; y<rows; y++) {
    for (let x=0; x<cols; x++) {
      const i = y*cols + x;
      const m = motion[i] || 0;
      sum += m;
      sx += x * m;
      sy += y * m;
    }
  }
  const energy = sum / (cols*rows + 1e-6);
  const cx = sum ? (sx / sum) / (cols-1) : 0.5;
  const cy = sum ? (sy / sum) / (rows-1) : 0.5;
  return { energy, cx, cy };
}

// Radial sectors (like a pizza): motion per wedge
function radialSectors(motion, cols, rows, wedges=24) {
  const cx = (cols-1)/2, cy = (rows-1)/2;
  const acc = new Float32Array(wedges);
  const cnt = new Uint32Array(wedges);
  for (let y=0; y<rows; y++) {
    for (let x=0; x<cols; x++) {
      const i = y*cols + x;
      const dx = x - cx, dy = y - cy;
      const angle = (Math.atan2(dy, dx) + Math.PI*2) % (Math.PI*2);
      const k = Math.min(wedges-1, Math.floor(wedges * angle / (Math.PI*2)));
      acc[k] += motion[i]; cnt[k]++;
    }
  }
  for (let k=0; k<wedges; k++) acc[k] = cnt[k] ? acc[k]/cnt[k] : 0;
  return acc;
}

// Map motion → hue/sat
function motionToHue(m) { return Math.min(220, m * 2.5); }
function motionToSat(m) { return Math.min(80, BASE_SAT + m * SAT_GAIN); }

// Quadrant motion (for gradient background)
function updateRegionalMotion(motion) {
  const midR = Math.floor(rows / 2);
  const midC = Math.floor(cols / 2);

  let sumTL = 0, nTL = 0;
  let sumTR = 0, nTR = 0;
  let sumBL = 0, nBL = 0;
  let sumBR = 0, nBR = 0;

  for (let y = 0; y < rows; y++) {
    const top = y < midR;
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const right = x >= midC;
      const m = motion[i] || 0;
      if (top && !right) { sumTL += m; nTL++; }
      else if (top && right) { sumTR += m; nTR++; }
      else if (!top && !right) { sumBL += m; nBL++; }
      else { sumBR += m; nBR++; }
    }
  }

  const a = REGION_SMOOTH_A, b = 1 - a;
  if (nTL) gTL = a * gTL + b * (sumTL / nTL);
  if (nTR) gTR = a * gTR + b * (sumTR / nTR);
  if (nBL) gBL = a * gBL + b * (sumBL / nBL);
  if (nBR) gBR = a * gBR + b * (sumBR / nBR);
}

// ======================================================
// Renderers (modes)
// ======================================================

// Gradient background from quadrant motion
function drawMotionGradient() {
  const w = viz.clientWidth, h = viz.clientHeight;
  const cx = w / 2, cy = h / 2;

  const leftAvg  = (gTL + gBL) / 2;
  const rightAvg = (gTR + gBR) / 2;
  const topAvg   = (gTL + gTR) / 2;
  const botAvg   = (gBL + gBR) / 2;

  const hueL = motionToHue(leftAvg);
  const hueR = motionToHue(rightAvg);
  const hueT = motionToHue(topAvg);
  const hueB = motionToHue(botAvg);

  const satL = motionToSat(leftAvg);
  const satR = motionToSat(rightAvg);
  const satT = motionToSat(topAvg);
  const satB = motionToSat(botAvg);

  // Horizontal pass
  const gradH = vctx.createLinearGradient(0, cy, w, cy);
  gradH.addColorStop(0.00, `hsl(${hueL} ${satL}% ${L_TOP}%)`);
  gradH.addColorStop(0.50, `hsl(${(hueL + hueR) / 2} ${Math.min((satL + satR) / 2, 90)}% ${L_MID}%)`);
  gradH.addColorStop(1.00, `hsl(${hueR} ${satR}% ${L_BOT}%)`);
  vctx.globalCompositeOperation = 'source-over';
  vctx.globalAlpha = BG_ALPHA_H;
  vctx.fillStyle = gradH;
  vctx.fillRect(0, 0, w, h);

  // Vertical pass (screen blend)
  const gradV = vctx.createLinearGradient(cx, 0, cx, h);
  gradV.addColorStop(0.00, `hsl(${hueT} ${satT}% ${L_TOP}%)`);
  gradV.addColorStop(0.50, `hsl(${(hueT + hueB) / 2} ${Math.min((satT + satB) / 2, 90)}% ${L_MID}%)`);
  gradV.addColorStop(1.00, `hsl(${hueB} ${satB}% ${L_BOT}%)`);
  vctx.globalCompositeOperation = 'screen';
  vctx.globalAlpha = BG_ALPHA_V;
  vctx.fillStyle = gradV;
  vctx.fillRect(0, 0, w, h);

  vctx.globalCompositeOperation = 'source-over';
  vctx.globalAlpha = 1;
}

// Motion field (lines)
function drawMotionVectors(lum, motion) {
  const w = viz.clientWidth, h = viz.clientHeight;
  const cellW = w / cols, cellH = h / rows;

  vctx.lineWidth = Math.min(cellW, cellH) * 0.08;
  vctx.strokeStyle = '#111';
  vctx.globalAlpha = 0.85;

  for (let y = 1; y < rows - 1; y++) {
    for (let x = 1; x < cols - 1; x++) {
      const i = y * cols + x;
      const m = motion[i] || 0;
      if (m < MOTION_THRESHOLD) continue;

      const dx = (lum[i + 1] - lum[i - 1]) * -1;
      const dy = (lum[i + cols] - lum[i - cols]) * -1;
      const len = Math.hypot(dx, dy) || 1;
      const nx = dx / len, ny = dy / len;

      const scale = Math.min(cellW, cellH) * Math.min(m / 40, 1.5);
      const cx = x * cellW + cellW / 2;
      const cy = y * cellH + cellH / 2;

      vctx.beginPath();
      vctx.moveTo(cx - nx * scale * 0.5, cy - ny * scale * 0.5);
      vctx.lineTo(cx + nx * scale * 0.5, cy + ny * scale * 0.5);
      vctx.stroke();
    }
  }
  vctx.globalAlpha = 1;
}

// Brightness bars (per-column average luminance)
function drawBrightnessBars(lum) {
  const w = viz.clientWidth, h = viz.clientHeight;
  const colAvg = new Float32Array(cols);
  for (let x = 0; x < cols; x++) {
    let sum = 0;
    for (let y = 0; y < rows; y++) sum += lum[y * cols + x];
    colAvg[x] = sum / rows;
  }
  const barW = w / cols;
  vctx.fillStyle = '#222';
  for (let x = 0; x < cols; x++) {
    const pct = colAvg[x] / 255;
    const barH = pct * h;
    vctx.fillRect(x * barW, h - barH, barW * 0.9, barH);
  }
}

// Edge sparkles (edge strength + motion)
function drawEdgeSparkles(lum, motion) {
  const w = viz.clientWidth, h = viz.clientHeight;
  const cellW = w/cols, cellH = h/rows;
  const { gx, gy } = gradients(lum, cols, rows);

  vctx.clearRect(0,0,w,h);
  vctx.fillStyle = '#111';

  for (let y=1; y<rows-1; y++) {
    for (let x=1; x<cols-1; x++) {
      const i = y*cols + x;
      const edge = Math.hypot(gx[i], gy[i]); // edge strength
      const m = motion[i] || 0;
      const e = Math.max(0, edge - 4);       // soft threshold
      if (e < 1 && m < 2) continue;

      const cx = x*cellW + cellW/2;
      const cy = y*cellH + cellH/2;
      const r = Math.min(cellW, cellH) * Math.min((e + m)/60, 0.6);

      vctx.globalAlpha = Math.min(1, 0.2 + (e+m)/40);
      vctx.beginPath();
      vctx.arc(cx, cy, r, 0, Math.PI*2);
      vctx.fill();
    }
  }
  vctx.globalAlpha = 1;
}

// Motion rings (from centroid)
function drawMotionRings(motion) {
  const w = viz.clientWidth, h = viz.clientHeight;
  vctx.clearRect(0,0,w,h);
  const { energy, cx, cy } = motionStats(motion, cols, rows);
  const px = cx * w, py = cy * h;

  const maxR = Math.hypot(w, h) * 0.7;
  const rings = 8;
  for (let k=1; k<=rings; k++) {
    const r = (k/rings) * maxR;
    vctx.beginPath();
    vctx.arc(px, py, r, 0, Math.PI * 2);
    vctx.lineWidth = Math.max(1, (energy/8) * (1 + k*0.2));
    vctx.strokeStyle = `rgba(17,17,17,${0.08 + 0.06*(rings-k)})`;
    vctx.stroke();
  }
}

// Histogram bars
function drawHistogramBars(lum) {
  const w = viz.clientWidth, h = viz.clientHeight;
  vctx.clearRect(0,0,w,h);
  const hist = luminanceHistogram(lum, 32);
  const maxv = Math.max(...hist) || 1;
  const barW = w / hist.length;

  vctx.fillStyle = '#222';
  for (let i=0; i<hist.length; i++) {
    const barH = (hist[i]/maxv) * h;
    vctx.fillRect(i*barW, h - barH, barW*0.9, barH);
  }
}

// Centroid spotlight
function drawCentroidSpotlight(motion) {
  const w = viz.clientWidth, h = viz.clientHeight;
  vctx.clearRect(0,0,w,h);
  const { energy, cx, cy } = motionStats(motion, cols, rows);
  const px = cx * w, py = cy * h;
  const r = Math.max(w, h) * (0.25 + Math.min(0.4, energy/15));

  const grad = vctx.createRadialGradient(px, py, r*0.1, px, py, r);
  grad.addColorStop(0,   'rgba(17,17,17,0.9)');
  grad.addColorStop(0.7, 'rgba(17,17,17,0.3)');
  grad.addColorStop(1,   'rgba(17,17,17,0.0)');
  vctx.fillStyle = grad;
  vctx.fillRect(0,0,w,h);
}

// Radial rays
function drawRadialRays(motion) {
  const w = viz.clientWidth, h = viz.clientHeight;
  vctx.clearRect(0,0,w,h);
  const cx = w/2, cy = h/2;
  const rays = radialSectors(motion, cols, rows, 24);
  const R = Math.min(cx, cy) * 0.95;

  vctx.strokeStyle = '#111';
  for (let k=0; k<rays.length; k++) {
    const a0 = (k / rays.length) * Math.PI*2;
    const a1 = ((k+1) / rays.length) * Math.PI*2;
    const m = rays[k];
    const r = R * Math.min(1, 0.3 + m/20);

    const x0 = cx + Math.cos(a0) * r;
    const y0 = cy + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r;
    const y1 = cy + Math.sin(a1) * r;

    vctx.beginPath();
    vctx.moveTo(cx, cy);
    vctx.lineTo(x0, y0);
    vctx.lineTo(x1, y1);
    vctx.closePath();
    vctx.globalAlpha = 0.65;
    vctx.fillStyle = '#111';
    vctx.fill();
  }
  vctx.globalAlpha = 1;
}

// ======================================================
// Mode registry + keyboard switching
// ======================================================

let mode = 'gradient-motion'; // default (your current look)

const MODES = {
  'brightness':        ({lum})                => { vctx.clearRect(0,0,viz.clientWidth,viz.clientHeight); drawBrightnessBars(lum); },
  'motion':            ({lum,motion})         => { vctx.clearRect(0,0,viz.clientWidth,viz.clientHeight); drawMotionVectors(lum, motion); },
  'edge-sparkles':     ({lum,motion})         => { drawEdgeSparkles(lum, motion); },
  'motion-rings':      ({motion})             => { drawMotionRings(motion); },
  'histogram-bars':    ({lum})                => { drawHistogramBars(lum); },
  'centroid-spotlight':({motion})             => { drawCentroidSpotlight(motion); },
  'radial-rays':       ({motion})             => { drawRadialRays(motion); },
  'gradient-motion':   ({lum,motion})         => {
    updateRegionalMotion(motion);
    drawMotionGradient();
    drawMotionVectors(lum, motion);
  },
};

// 1..7,0 → switch modes
addEventListener('keydown', (e) => {
  const map = {
    '1':'brightness',
    '2':'motion',
    '3':'edge-sparkles',
    '4':'motion-rings',
    '5':'histogram-bars',
    '6':'centroid-spotlight',
    '7':'radial-rays',
    '0':'gradient-motion',
  };
  if (map[e.key]) mode = map[e.key];
});

// ======================================================
// Main loop
// ======================================================
function tick() {
  requestAnimationFrame(tick);
  if (!playing) return;
  if (!video.videoWidth) return;

  sizeCanvasToFrame();

  off.width = cols;
  off.height = rows;

  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const aspectVid = vw / vh;
  const aspectOff = cols / rows;
  let sx, sy, sw, sh;
  if (aspectVid > aspectOff) {
    sh = vh;
    sw = vh * aspectOff;
    sx = (vw - sw) / 2;
    sy = 0;
  } else {
    sw = vw;
    sh = vw / aspectOff;
    sx = 0;
    sy = (vh - sh) / 2;
  }
  octx.drawImage(video, sx, sy, sw, sh, 0, 0, cols, rows);

  const { data } = octx.getImageData(0, 0, cols, rows);
  const lum = new Float32Array(cols * rows);
  const motion = new Float32Array(cols * rows);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    lum[j] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  if (prevFrame && prevFrame.length === lum.length) {
    for (let j = 0; j < lum.length; j++) {
      const diff = Math.abs(lum[j] - prevFrame[j]);
      motion[j] = (prevMotion && prevMotion[j] != null)
        ? SMOOTH_A * prevMotion[j] + (1 - SMOOTH_A) * diff
        : diff;
    }
  }
  prevFrame = lum.slice(0);
  prevMotion = motion.slice(0);

  // Render current mode
  const render = MODES[mode] || MODES['gradient-motion'];
  vctx.clearRect(0, 0, viz.clientWidth, viz.clientHeight);
  render({ lum, motion });
}

tick();