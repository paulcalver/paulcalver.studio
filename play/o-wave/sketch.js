let num = 8;
let inverted = false;
let phase = 0;      // smooth accumulator for wave motion
let mx, my;         // smoothed mouse proxies

function setup() {
  createCanvas(windowWidth, windowHeight);
  mx = width  / 2;  // start centered
  my = height / 2;
}

function draw() {
  // smooth mouse tracking (works even before the first move)
  const targetX = (mouseX || width / 2);
  const targetY = (mouseY || height / 2);
  mx = lerp(mx, targetX, 0.2);
  my = lerp(my, targetY, 0.2);

  if (inverted) {
    background(255);
    stroke(0, 200);
  } else {
    background(0);
    stroke(255, 200);
  }
  noFill();

  // ellipse size controlled by smoothed X
  const cw  = map(mx, 0, width, 50, height);
  const ch  = cw * 1.2;
  const csw = cw * 0.33;
  strokeWeight(csw);

  // wave speed controlled by smoothed Y (use a gentle range)
  const speed = map(my, 0, height, 0.005, 0.21);

  // advance phase smoothly by current speed
  phase += speed;

  // equal margins and gaps across width
  const totalSlots = num + 1;
  const gap = width / totalSlots;

  const baseY = height / 2;
  const amplitude = height*0.30;

  for (let i = 0; i < num; i++) {
    const x = gap * (i + 1);
    const yOffset = sin(phase + i * 0.6) * amplitude;
    const y = baseY + yOffset;
    ellipse(x, y, cw, ch);
  }
}

function mousePressed() {
  inverted = !inverted;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // keep the proxies centred on resize to avoid a jump
  mx = width  / 2;
  my = height / 2;
}