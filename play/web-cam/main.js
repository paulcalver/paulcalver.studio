// ============================================
// Motion Circles + Motion-Reactive Gradient
// Webcam-only (main.js)
// ============================================

// ==== CONFIG (tweak these) ====
const COLS = 48;             // sampling grid width (48 → 48x27 for 16:9)
const SMOOTH_A = 0.85;       // motion smoothing (higher = calmer), 0..1
const MOTION_THRESHOLD = 10;  // ignore tiny motion (raise to be calmer)
const MAX_OVERLAP = 0.8;     // max multiple of cell for circle radius (bigger = more overlap)
const CIRCLE_ALPHA = 0.7;    // circle opacity (0..1)
const SENSITIVITY_DIV = 20;  // maps motion → radius (lower = bigger circles)


// Gradient behaviour
const REGION_SMOOTH_A = 0.1;   // smoothing for regional motion (0..1; higher = calmer)
const BG_ALPHA_H = 1.2;        // opacity of horizontal gradient pass
const BG_ALPHA_V = 1.2;        // opacity of vertical gradient pass
const BASE_SAT = 35;           // base saturation %
const SAT_GAIN = 1.6;          // how much saturation rises with motion
const L_TOP = 55, L_MID = 50, L_BOT = 45; // lightnesses used in stops

// ==== Elements ====
const landing  = document.getElementById('landing');
const stage    = document.getElementById('stage');
const startBtn = document.getElementById('startBtn');
const stopBtn  = document.getElementById('stopBtn');
const video    = document.getElementById('vid');
const viz      = document.getElementById('viz');
const vctx     = viz.getContext('2d', { alpha: false });

// Offscreen sampler
const off  = document.createElement('canvas');
const octx = off.getContext('2d', { willReadFrequently: true });

// Derived sampling (16:9)
let cols = COLS;
let rows = Math.round(cols * 9 / 16);

// State
let mediaStream = null;
let running = false;
let prevFrame = null;
let prevMotion = null;

// Smoothed regional motion (averages per quadrant)
let gTL = 0, gTR = 0, gBL = 0, gBR = 0;

// ==== Sizing ====
function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  viz.width  = viz.clientWidth * dpr;
  viz.height = viz.clientHeight * dpr;
  vctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', sizeCanvas);
addEventListener('orientationchange', () => setTimeout(sizeCanvas, 100));
sizeCanvas();

// ==== Secure origin helper ====
function isSecureOrigin() {
  return location.protocol === 'https:' ||
		 location.hostname === 'localhost' ||
		 location.hostname === '127.0.0.1' ||
		 location.hostname === '::1';
}

// ==== Start webcam ====
startBtn.addEventListener('click', async () => {
  if (!isSecureOrigin()) {
	alert('This needs to run over https or http://localhost for camera access.');
	return;
  }
  try {
	mediaStream = await navigator.mediaDevices.getUserMedia({
	  video: { facingMode: 'user' }, // change to 'environment' for rear camera on phones
	  audio: false
	});
	video.srcObject = mediaStream;

	await new Promise(res => {
	  if (video.readyState >= 1) res();
	  else video.addEventListener('loadedmetadata', res, { once: true });
	});
	await video.play();

	landing.hidden = true;
	stage.hidden = false;

	sizeCanvas();
	requestAnimationFrame(sizeCanvas);

	running = true;
	tick();
  } catch (err) {
	alert('Could not access camera. Check permissions and reload.');
	console.error(err);
  }
});

// ==== Stop webcam ====
stopBtn.addEventListener('click', stopAll);
function stopAll() {
  running = false;
  if (mediaStream) {
	mediaStream.getTracks().forEach(t => t.stop());
	mediaStream = null;
  }
  vctx.clearRect(0, 0, viz.clientWidth, viz.clientHeight);
  prevFrame = null;
  prevMotion = null;
  gTL = gTR = gBL = gBR = 0;
  stage.hidden = true;
  landing.hidden = false;
}

// ==== Utils: map motion → hue/sat ====
function motionToHue(m) {
  // map motion average (~0..60+) to 0..220 (cool→warm)
  return Math.min(360, m * 6);
}
function motionToSat(m) {
  return Math.min(80, BASE_SAT + m * SAT_GAIN); // 35%..80% typical
}

// ==== Compute smoothed regional motion (TL/TR/BL/BR) ====
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

// ==== Draw background gradient from regional motion ====
function drawMotionGradient() {
  const w = viz.clientWidth;
  const h = viz.clientHeight;
  const cx = w / 2, cy = h / 2;

  // Derive side averages
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

  // 1) Horizontal gradient (Left ↔ Right)
  let gradH = vctx.createLinearGradient(0, cy, w, cy);
  gradH.addColorStop(0.00, `hsl(${hueL} ${satL}% ${L_TOP}%)`);
  gradH.addColorStop(0.50, `hsl(${(hueL + hueR) / 2} ${Math.min((satL + satR) / 2, 90)}% ${L_MID}%)`);
  gradH.addColorStop(1.00, `hsl(${hueR} ${satR}% ${L_BOT}%)`);

  vctx.globalCompositeOperation = 'source-over';
  vctx.globalAlpha = BG_ALPHA_H;
  vctx.fillStyle = gradH;
  vctx.fillRect(0, 0, w, h);

  // 2) Vertical gradient (Top ↔ Bottom), blended with 'screen'
  let gradV = vctx.createLinearGradient(cx, 0, cx, h);
  gradV.addColorStop(0.00, `hsl(${hueT} ${satT}% ${L_TOP}%)`);
  gradV.addColorStop(0.50, `hsl(${(hueT + hueB) / 2} ${Math.min((satT + satB) / 2, 90)}% ${L_MID}%)`);
  gradV.addColorStop(1.00, `hsl(${hueB} ${satB}% ${L_BOT}%)`);

  vctx.globalCompositeOperation = 'screen';
  vctx.globalAlpha = BG_ALPHA_V;
  vctx.fillStyle = gradV;
  vctx.fillRect(0, 0, w, h);

  // reset for subsequent drawing
  vctx.globalCompositeOperation = 'source-over';
  vctx.globalAlpha = 1;
}

// ==== Draw motion circles on top ====
function drawMotionCircles(motion) {
  const w = viz.clientWidth;
  const h = viz.clientHeight;

  const cellW = w / cols;
  const cellH = h / rows;

  vctx.fillStyle = '#000';
  vctx.globalAlpha = CIRCLE_ALPHA;

  for (let y = 0; y < rows; y++) {
	for (let x = 0; x < cols; x++) {
	  const i = y * cols + x;
	  const m = motion[i] || 0;
	  if (m < MOTION_THRESHOLD) continue;

	  const cx = x * cellW + cellW / 2;
	  const cy = y * cellH + cellH / 2;

	  const base = Math.min(cellW, cellH);
	  const radius = Math.min(
		base * MAX_OVERLAP,
		(m / SENSITIVITY_DIV) * base * MAX_OVERLAP
	  );

	  vctx.beginPath();
	  vctx.arc(cx, cy, radius, 0, Math.PI * 2);
	  vctx.fill();
	}
  }
  vctx.globalAlpha = 1;
}

// ==== Main loop ====
function tick() {
  if (!running) return;
  requestAnimationFrame(tick);
  if (!video.videoWidth) return;

  // Offscreen downsample target
  off.width  = cols;
  off.height = rows;

  // Cover-crop the video into sampler (preserve aspect)
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

  // Pixels → luminance
  const { data } = octx.getImageData(0, 0, cols, rows);
  const lum = new Float32Array(cols * rows);
  for (let i = 0, j = 0; i < data.length; i += 4, j++) {
	const r = data[i], g = data[i + 1], b = data[i + 2];
	lum[j] = 0.299 * r + 0.587 * g + 0.114 * b;
  }

  // Smoothed motion (EMA of frame diff)
  const motion = new Float32Array(cols * rows);
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

  // Clear, then draw gradient background and circles
  vctx.clearRect(0, 0, viz.clientWidth, viz.clientHeight);
  updateRegionalMotion(motion);
  drawMotionGradient();
  drawMotionCircles(motion);
}