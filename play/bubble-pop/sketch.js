  // -------- Settings --------
  const N = 50; // number of bubbles

  // -------- State --------
  let bubbles = [];
  let gameWon = false;
  let score = 0;
  let numClicks = 0;

  // Reset button
  let btnX, btnY, btnW = 120, btnH = 50;

  class Bubble {
	constructor(_x, _r) {
	  this.x = _x;
	  this.r = _r;
	  this.alive = true;
	  this.spawned = false; // true after it enters visible area
	  this.y = height + random(0, height); // staggered start below screen
	  this.col = color(random(255), random(255), random(255), random(50, 90));
	}

	update() {
	  if (!this.alive) return;
	  this.y -= random(1, 4);
	  this.x += random(-1, 1);

	  // mark as spawned once it reaches the visible area
	  if (!this.spawned && this.y <= height + this.r / 2) this.spawned = true;
	}

	show() {
	  if (!this.alive || !this.spawned) return;

	  noStroke();
	  fill(this.col);
	  circle(this.x, this.y, this.r);

	  // small tab detail
	  fill(this.col);
	  circle(this.x - this.r / 2 + this.r / 8, this.y, this.r / 8);
	}

	edges() {
	  if (!this.alive) return;

	  // recycle from below with stagger again
	  if (this.y < -this.r) {
		this.y = height + this.r + random(0, 500);
		this.spawned = false;
	  }
	}

	isClicked(mx, my) {
	  // Only clickable when on screen
	  return this.spawned && dist(mx, my, this.x, this.y) < this.r / 2;
	}
  }

  function setup() {
	createCanvas(windowWidth, windowHeight);
	// Prevent touch events from scrolling the page while interacting
	canvas = createCanvas(windowWidth, windowHeight);
	canvas.elt.style.touchAction = 'none';
	textFont('Space Mono');
	initBubbles();

	// place button under centre text
	btnX = width / 2 - btnW / 2;
	btnY = height / 2 + 20;
  }

  function initBubbles() {
	bubbles = [];
	const spacing = width / N;
	for (let i = 0; i < N; i++) {
	  const x = (i + 0.5) * spacing;
	  const r = random(50, 150);
	  bubbles.push(new Bubble(x, r));
	}
	score = 0;
	numClicks = 0;     // <-- reset here
	gameWon = false;
	loop();
  }

  function draw() {
	background(255, 230, 230);

	let anyAlive = false;

	for (const b of bubbles) {
	  b.update();
	  b.edges();
	  b.show();
	  if (b.alive) anyAlive = true;
	}

	// Score (bottom right)
	// Score + Clicks (bottom right)
	fill(0);
	textAlign(RIGHT, BOTTOM);
	textSize(28);
	text(`Popped: ${score}   Clicks: ${numClicks}`, width - 20, height - 20);

	// Win check
	if (!anyAlive && !gameWon) {
	  gameWon = true;

	  // YOU WIN text
	  fill(0);
	  textAlign(CENTER, CENTER);
	  textSize(28);
	  text(`Hooray, you popped all the bubbles with ${numClicks} clicks!`, width / 2, height / 2 - 100);

	  // reset button
	  fill(50, 150, 250);
	  noStroke();
	  rect(btnX, btnY, btnW, btnH, 10);
	  fill(255);
	  textSize(28);
	  text('Reset', width / 2, btnY + btnH / 2);

	  noLoop(); // freeze until reset
	} else if (gameWon) {
	  // This will not run while frozen, but kept for parity
	  fill(0);
	  textAlign(CENTER, CENTER);
	  textSize(28);
	  text(`Hooray, you popped all the bubbles with ${numClicks} clicks!`, width / 2, height / 2 - 100);

	  fill(50, 150, 250);
	  noStroke();
	  rect(btnX, btnY, btnW, btnH, 10);
	  fill(255);
	  textSize(28);
	  text('Reset', width / 2, btnY + btnH / 2);
	}
  }

  
  function handlePress(px, py) {
	// If game is on the win screen, check reset button
	if (gameWon) {
	  if (px > btnX && px < btnX + btnW && py > btnY && py < btnY + btnH) {
		initBubbles();
	  }
	  return;
	}
  
	// Count this attempt
	numClicks++;
  
	// Pop all bubbles under this press location
	for (const b of bubbles) {
	  if (b.alive && b.isClicked(px, py)) {
		b.alive = false;
		score++;
	  }
	}
  }
  
  function mousePressed() {
	handlePress(mouseX, mouseY);
  }
  
  function touchStarted() {
	// Option A: count each finger as a separate click:
	// numClicks += touches.length;
  
	// Option B (recommended): count the gesture as ONE click total:
	// (uncomment next line and remove per-touch counting above)
	// numClicks++;
  
	if (gameWon) {
	  // Use the first touch to hit the reset button
	  if (touches.length > 0) {
		const t = touches[0];
		handlePress(t.x, t.y);
	  }
	} else {
	  // Pop under each finger (multi-touch supported)
	  if (touches.length === 0) {
		// Some browsers may still only deliver a single touch via mouse emulation
		handlePress(mouseX, mouseY);
	  } else {
		for (const t of touches) {
		  handlePress(t.x, t.y);
		}
	  }
	}
  
	// Prevent default browser actions (scroll/zoom) on touch
	return false;
  }

  function windowResized() {
	resizeCanvas(windowWidth, windowHeight);
	// keep button positioned relative to centre after resize
	btnX = width / 2 - btnW / 2;
	btnY = height / 2 + 20;
  }