import * as Matter from 'matter-js';
import * as Stats from 'stats.js';
import { Ball } from './ball';
import { Colors, Color } from './colors';

const { random, PI } = Math;
const TWO_PI = 2 * PI;

const stats = new Stats();
stats.showPanel( 0 ); // fps
stats.dom.style.position = 'relative';
document.querySelector('#stats').appendChild(stats.dom);

const { Engine, World, Bodies } = Matter;
const engine = Engine.create();
engine.world.gravity.y = 0;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'rgb(51, 51, 51)';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.globalAlpha = 1;

/**
 * Create the ball bodies
 * 0: white (cue-ball)
 * 1: yellow, 2: blue, 3: red, 4: purple, 5: orange, 6: green, 7: brown
 * 8: black
 * 9-15: white with color stripe
 */
const balls: Ball[] = [];
const ballOptions: Matter.IBodyDefinition = {
  isStatic: false,
  force: { x: 0, y: 0 },
  friction: 0.1,
  frictionAir: 0.01,
  frictionStatic: 0,
  density: 1.7  // g/cm^3
};
for (let i = 0; i < 16; i++) {
  const r = (57.15 + (2 * random() - 1) * .127) / 2;  // mm 
  const b = Bodies.circle(0, 0, r, ballOptions);
  balls.push(new Ball(i, r, b));
}

// create two boxes and a ground
// const boxA = Bodies.rectangle(400, 200, 80, 80);
// const boxB = Bodies.rectangle(450, 50, 80, 80);
// var ground = Bodies.rectangle(400, 610, 810, 60, { isStatic: true });
// World.add(engine.world, [boxA, boxB, ground]);

/*
const elms: HTMLImageElement[] = [];
for (let i = 1; i < 16; i++) {
  const img = document.getElementById(`b${i}`) as HTMLImageElement;
  elms.push(img);
}
// const im1 = ctx.createImageData(elms[0].width, elms[0].height);
ctx.drawImage(elms[0], 0, 0, elms[0].width / 4, elms[0].height / 4);
*/

function createBallTexture(value: number, color: Color): ImageData {
  const c = `rgb(${color.r},${color.g},${color.b})`;
  const w = 256;
  const h = 128;
  const r = h / 2 - 32;
  const hy = (value < 9) ? 0 : 16;

  const drawText = (x: number) => {
    ctx.beginPath();
    ctx.fillStyle = '#fff';
    ctx.arc(x, h / 2, r, 0, TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillText(value.toString(), x, h / 2 + 4);  
  };

  ctx.clearRect(0, 0, w, h);
  
  ctx.beginPath();
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  ctx.beginPath();
  ctx.fillStyle = c;
  ctx.rect(0, hy, w, h - 2 * hy);
  ctx.fill();

  ctx.font = '24pt Trebuchet MS';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';  

  drawText(0.25 * w);
  drawText(0.76 * w);

  return ctx.getImageData(0, 0, w, h);
}

const t1 = createBallTexture(1, Colors.YELLOW);
const t2 = createBallTexture(2, Colors.BLUE);
const t3 = createBallTexture(3, Colors.RED);
const t4 = createBallTexture(4, Colors.PURPLE);
const t5 = createBallTexture(5, Colors.ORANGE);
const t6 = createBallTexture(6, Colors.GREEN);
const t7 = createBallTexture(7, Colors.BROWN);
const t8 = createBallTexture(8, Colors.BLACK);
const t9 = createBallTexture(9, Colors.YELLOW);
const t10 = createBallTexture(10, Colors.BLUE);
const t11 = createBallTexture(11, Colors.RED);
const t12 = createBallTexture(12, Colors.PURPLE);
const t13 = createBallTexture(13, Colors.ORANGE);
const t14 = createBallTexture(14, Colors.GREEN);
const t15 = createBallTexture(15, Colors.BROWN);

const ballStyles = [
  { color: Colors.WHITE, texture: null },
  { color: Colors.YELLOW, texture: t1 },
  { color: Colors.BLUE, texture: t2 },
  { color: Colors.RED, texture: t3 },
  { color: Colors.PURPLE, texture: t4 },
  { color: Colors.ORANGE, texture: t5 },
  { color: Colors.GREEN, texture: t6 },
  { color: Colors.BROWN, texture: t7 },
  { color: Colors.BLACK, texture: t8 },
  { color: Colors.WHITE, texture: t9 },
  { color: Colors.WHITE, texture: t10 },
  { color: Colors.WHITE, texture: t11 },
  { color: Colors.WHITE, texture: t12 },
  { color: Colors.WHITE, texture: t13 },
  { color: Colors.WHITE, texture: t14 },
  { color: Colors.WHITE, texture: t15 }
];

ctx.fillStyle = '#333';
ctx.fillRect(0, 0, canvas.width, canvas.height);

Engine.run(engine);

const scale = 1;

function animate(time = 0) {
  stats.begin();

  // Output textures for balls 1-15
  let index = 1;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      const tx = j * 256;
      const ty = i * 128;
      const imgData = ballStyles[index].texture;
      index++;
      ctx.putImageData(imgData, tx, ty, 0, 0, imgData.width, imgData.height);
    }
  }

  // Render the cue-ball
  /*
  const b = balls[0];
  const px = .5 * canvas.width;
  const py = .8 * canvas.height;
  
  ctx.beginPath();
  ctx.fillStyle = '#fff';
  ctx.arc(px, py, scale * b.radius, 0, TWO_PI);
  ctx.fill();
  */
 
  stats.end();
  requestAnimationFrame(animate);
}

animate();
