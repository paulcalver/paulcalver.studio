const num = 100;

function setup() {
  createCanvas(windowWidth, windowHeight);
  textFont('Space Mono');
  
}

function draw() {
  let bgColor = map(mouseX, 0, width, 0, 255);
  let fillColor = map(mouseX, 0, width, 255, 0);
  let sw = 12;
  background(bgColor);
  strokeWeight(sw);
  noFill();

  // Hide Everything
  let hide = 0;
  sw = 12;
  if (mouseIsPressed) {
  hide = 255;
  sw = 0;
  str = '*_*';
  } else {
  hide = 0;
  sw = 12;
  str = 'EYES HURTING?\nCLICK & HOLD TO FIX';
  }

  // Circles
  noFill();
  for (let i=0; i<num; i++) {
    stroke(fillColor);
    strokeWeight(sw);
    let cw = 50 + i * 50;
    circle(width/2, height/2, cw);
    circle(mouseX, mouseY, cw);

  }
  
  // Text Follows Mouse
  strokeWeight(sw);
  stroke(bgColor);
  fill(255,0,0);
  textSize(42);
  textStyle(BOLD);
  textAlign(CENTER, CENTER);
  text(str, mouseX, mouseY);

}


function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}