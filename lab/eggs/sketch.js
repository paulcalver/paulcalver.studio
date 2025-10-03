const num = 50;

let eggs = [];

class Egg {
  constructor(_x, _y) {
  this.x = _x;
  this.y = _y;
  this.s = random(0.8, 1.3); // fixed scale per egg
  this.rot = radians(40);
}

update() {
  this.x += random(0,0);
  this.y += random(3,5);
}

show() {
    push();
    translate(this.x, this.y);
    rotate(this.rot);
    scale(this.s);

    // Shadow
    noStroke();
    fill(0, 0, 0, 150);
    ellipse(2, 0, 100, 120);

    // Egg white
    fill(255);
    ellipse(0, 0, 100, 120);

    // Yolk
    fill(250, 222, 36);
    circle(0, 0, 40);

    // Highlight
    fill(255, 255, 255, 250);
    ellipse(-12, 0, 7, 9);

    pop();
  }

edges() {
  const halfW = (100 * this.s) / 2;
  const halfH = (120 * this.s) / 2;
  if (this.x - halfW > width)    this.x = -halfW;
  if (this.x + halfW < 0)        this.x = width + halfW;
  if (this.y - halfH > height)   this.y = -halfH;
  if (this.y + halfH < 0)        this.y = height + halfH;
}
}


function setup() {
  createCanvas(windowWidth, windowHeight);
  initEggs();
}

function initEggs() {
  eggs = [];
  for (let i=0; i<num; i++) {
    let egg = new Egg(random(width), random(height));
    eggs.push(egg);
  }
}


function draw() {
  background(255,240,240);
  noStroke();

  // Eggs
  for (let egg of eggs) {
    egg.update();
    egg.edges();
    egg.show();
  }

}
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}