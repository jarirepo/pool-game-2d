import * as Matter from 'matter-js';
import * as Stats from 'stats.js';

// https://github.com/liabru/matter-js/issues/559
// window['decomp'] = require('poly-decomp');
import * as decomp from 'poly-decomp';
window['decomp'] = decomp;

import { Ball } from './ball';
import { Colors, Color } from './colors';
import { Rack } from './rack';

const { cos, PI, random, sin } = Math;
const TWO_PI = 2 * PI;

const stats = new Stats();
stats.showPanel( 0 ); // fps
stats.dom.style.position = 'relative';
document.querySelector('#stats').appendChild(stats.dom);

const { Engine, World, Bodies, Mouse } = Matter;
const engine = Engine.create();
const world = engine.world;
world.gravity.y = 0;

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'rgb(51, 51, 51)';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.globalAlpha = 1;

const mouse = Mouse.create(canvas);

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
  // force: { x: 0, y: 0 },
  friction: 0,
  frictionAir: .01,
  frictionStatic: 0,
  restitution: 1,
  density: 1.7  // g/cm^3
  // sleepThreshold: 30
};
const ballRadius = 57.15; // mm
for (let i = 0; i < 16; i++) {
  // const r = (ballRadius + (2 * random() - 1) * .127) / 2;  // mm 
  // const r = ballRadius - random() * .127;  // mm
  const r = ballRadius / 2;  // mm
  const b = Bodies.circle(0, 0, r, ballOptions);
  balls.push(new Ball(i, r, b));
}

/**
 * Create the pool table boundary
 */
function mmult(P: number[][], T: number[][]): number[][] {
  const Q = new Array(P.length);
  for (let i = 0; i < P.length; i++) {
    const x = P[i][0] * T[0][0] + P[i][1] * T[1][0] + P[i][2] * T[2][0];
    const y = P[i][0] * T[0][1] + P[i][1] * T[1][1] + P[i][2] * T[2][1];
    const w = P[i][0] * T[0][2] + P[i][1] * T[1][2] + P[i][2] * T[2][2];
    Q[i] = [ x, y, w ];
  }
  return Q;
}

const tableOptions: Matter.IBodyDefinition = {
  isStatic: true,
  friction: .05,
  restitution: 1
};
const tableLength = 7 * 0.3048e3; // ft -> mm
const tableWidth = tableLength / 2;
const holeRadius = 1.333 * ballRadius;  // mm
const tableEdgeWidth = holeRadius / 2;
const R90 = [ [ 0, 1, 0 ], [ -1, 0, 0 ], [ 0, 0, 1 ] ];
const P1 = [
  [ holeRadius, 0, 1 ],
  [ tableWidth - holeRadius, 0, 1 ],
  [ tableWidth - 1.5 * holeRadius, tableEdgeWidth, 1 ],
  [ 1.5 * holeRadius, tableEdgeWidth, 1]
];
const P2 = mmult(P1, R90);
const P3 = mmult(P2, R90);
const P4 = mmult(P3, R90);

// console.log(P1, P1.length);

const vertexSets1: Matter.Vector[][] = [ P1.map<Matter.Vector>(p => ({ x: p[0], y: p[1] })) ];
const vertexSets2: Matter.Vector[][] = [ P2.map<Matter.Vector>(p => ({ x: p[0], y: p[1] })) ];
const vertexSets3: Matter.Vector[][] = [ P3.map<Matter.Vector>(p => ({ x: p[0], y: p[1] })) ];
const vertexSets4: Matter.Vector[][] = [ P4.map<Matter.Vector>(p => ({ x: p[0], y: p[1] })) ];

const tableSegments: Matter.Body[] = [
  Bodies.fromVertices(0, 0, vertexSets1, tableOptions),
  Bodies.fromVertices(0, 0, vertexSets2, tableOptions),
  Bodies.fromVertices(0, 0, vertexSets2, tableOptions),
  Bodies.fromVertices(0, 0, vertexSets3, tableOptions),
  Bodies.fromVertices(0, 0, vertexSets4, tableOptions),
  Bodies.fromVertices(0, 0, vertexSets4, tableOptions)
];

// Position the table edge segments and add them to the physics world since poly-decomp has moved to their CoG.
Matter.Body.setPosition(tableSegments[0], { x: tableWidth / 2, y: tableEdgeWidth / 2 });
Matter.Body.setPosition(tableSegments[1], { x: tableWidth - tableEdgeWidth / 2, y: 0.25 * tableLength });
Matter.Body.setPosition(tableSegments[2], { x: tableWidth - tableEdgeWidth / 2, y: 0.75 * tableLength });
Matter.Body.setPosition(tableSegments[3], { x: tableWidth / 2, y: tableLength - tableEdgeWidth / 2 });
Matter.Body.setPosition(tableSegments[4], { x: tableEdgeWidth / 2, y: 0.25 * tableLength });
Matter.Body.setPosition(tableSegments[5], { x: tableEdgeWidth / 2, y: 0.75 * tableLength });

World.add(world, tableSegments);

// Add the ball bodies to the world
// World.add(world, balls[0].body);
World.add(world, balls.map(b => b.body));

// console.log(tableSegments[0].position, tableSegments[0].vertices);

/**
 * Definitions for the ball rack position and cue-ball line on the pool table
 */
const footSpotPos = { x: 1 / 2, y: 1 / 4 };
const cueBallLinePos = 3 / 4;

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
  
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = c;
  ctx.fillRect(0, hy, w, h - 2 * hy);
  
  ctx.font = '24pt Trebuchet MS';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';  

  drawText(0.76 * w);
  drawText(0.25 * w);

  return ctx.getImageData(0, 0, w, h);
}

const ballStyles = [
  { color: Colors.WHITE, texture: null },
  { color: Colors.YELLOW, texture: createBallTexture(1, Colors.YELLOW) },
  { color: Colors.BLUE, texture: createBallTexture(2, Colors.BLUE) },
  { color: Colors.RED, texture: createBallTexture(3, Colors.RED) },
  { color: Colors.PURPLE, texture: createBallTexture(4, Colors.PURPLE) },
  { color: Colors.ORANGE, texture: createBallTexture(5, Colors.ORANGE) },
  { color: Colors.GREEN, texture: createBallTexture(6, Colors.GREEN) },
  { color: Colors.BROWN, texture: createBallTexture(7, Colors.BROWN) },
  { color: Colors.BLACK, texture: createBallTexture(8, Colors.BLACK) },
  { color: Colors.WHITE, texture: createBallTexture(9, Colors.YELLOW) },
  { color: Colors.WHITE, texture: createBallTexture(10, Colors.BLUE) },
  { color: Colors.WHITE, texture: createBallTexture(11, Colors.RED) },
  { color: Colors.WHITE, texture: createBallTexture(12, Colors.PURPLE) },
  { color: Colors.WHITE, texture: createBallTexture(13, Colors.ORANGE) },
  { color: Colors.WHITE, texture: createBallTexture(14, Colors.GREEN) },
  { color: Colors.WHITE, texture: createBallTexture(15, Colors.BROWN) }
];

const scale = .333;
const cueBall = balls[0];
const maxForceMag = 600;
let dragging = false;
const rack = new Rack();

// Place the cue-ball on the cue-ball line on the pool table
Matter.Body.setPosition(cueBall.body, {
  x: tableWidth / 2 + (2 * random() -1) * cueBall.radius,
  y: tableLength * 0.75
});

// Stack balls 1-15 in the triangular rack with ball #8 at the rack position
rack.setup();

balls.filter(ball => ball.id !== 0).forEach(ball => {
  // find rack slot for this ball
  const slot = rack.slots.find(slot => slot.ballId === ball.id);
  // set ball position
  Matter.Body.setPosition(ball.body, {
    x: tableWidth / 2 + slot.u * ball.radius,
    y: tableLength / 4 - slot.v * ball.radius
  });
});

// Start the physics engine
Engine.run(engine);

function animate(time = 0) {  
  stats.begin();

  // console.log(cueBall.body.speed, cueBall.body.isSleeping);

  if (cueBall.body.speed < 1) {
    // Matter.Body.setVelocity(cueBall.body, { x: 0, y: 0 });
    if (!dragging) {
      if (mouse.button === 0) { // left mouse button pressed
        dragging = true;
      }
    } else {
      if (mouse.button === -1) {  // mouse button released      
        dragging = false;
        const m: Matter.Vector = {
          x: mouse.mouseupPosition.x / scale,
          y: mouse.mouseupPosition.y / scale
        };
        const v = Matter.Vector.sub(cueBall.body.position, m);
        const vn = Matter.Vector.normalise(v);
        const f = Matter.Vector.mult(vn, maxForceMag);
        Matter.Body.applyForce(cueBall.body, cueBall.body.position, f);
        console.log('Applied force:', f);
      }
    }
  }

  ctx.fillStyle = '#333';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // Output textures for balls 1-15
  let index = 1;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      // const tx = j * 256;
      // const ty = i * 128;
      const tx = canvas.width - (3 - j) * 256;
      const ty = i * 128;
      const imgData = ballStyles[index].texture;
      index++;
      ctx.putImageData(imgData, tx, ty, 0, 0, imgData.width, imgData.height);
    }
  }

  /**
   * Pool table surface and table edges
   */
  ctx.beginPath();
  // ctx.rect(0, 0, scale * tableWidth, scale * tableLength);
  // top-left corner
  ctx.moveTo(scale * holeRadius, 0);
  ctx.arc(scale * holeRadius, scale * holeRadius, scale * holeRadius, -PI / 2, PI, true);
  ctx.lineTo(scale * holeRadius, scale * holeRadius);
  ctx.closePath();
  // top-right corner
  ctx.moveTo(scale * (tableWidth - holeRadius), scale * holeRadius);
  ctx.lineTo(scale * tableWidth, scale * holeRadius);
  ctx.arc(scale * (tableWidth - holeRadius), scale * holeRadius, scale * holeRadius, 0, -PI / 2, true);
  ctx.closePath();
  // bottom-right corner
  ctx.moveTo(scale * (tableWidth - holeRadius), scale * (tableLength - holeRadius));
  ctx.lineTo(scale * tableWidth, scale * (tableLength - holeRadius));
  ctx.arc(scale * (tableWidth - holeRadius), scale * (tableLength - holeRadius), scale * holeRadius, 0, PI / 2, false);
  ctx.closePath();
  // botton-left corner
  ctx.moveTo(scale * holeRadius, scale * (tableLength - holeRadius));
  ctx.lineTo(scale * holeRadius, scale * tableLength);
  ctx.arc(scale * holeRadius, scale * (tableLength - holeRadius), scale * holeRadius, PI / 2, PI, false);
  ctx.closePath();
  // table surface
  ctx.rect(scale * holeRadius, 0, scale * (tableWidth - 2 * holeRadius), scale * holeRadius);
  ctx.rect(scale * holeRadius, scale * (tableLength - holeRadius), scale * (tableWidth - 2 * holeRadius), scale * holeRadius); 
  ctx.rect(0, scale * holeRadius, scale * tableWidth, scale * (tableLength - 2 * holeRadius));

  ctx.fillStyle = 'rgba(0,80,0,1)'; 
  ctx.fill();

  // Ball rack position
  ctx.beginPath();
  ctx.arc(scale * tableWidth / 2, scale * tableLength / 4, scale * ballRadius / 3, 0, TWO_PI);
  ctx.fillStyle = 'rgba(0,64,0,.8)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(scale * tableWidth / 2, scale * tableLength / 4, scale * ballRadius / 6, 0, TWO_PI);
  ctx.fillStyle = 'rgba(0,96,0,1)';
  ctx.fill();

  // Cue-ball line
  ctx.beginPath();
  ctx.moveTo(scale * tableEdgeWidth, scale * tableLength * 0.75);
  ctx.lineTo(scale * (tableWidth - tableEdgeWidth), scale * tableLength * 0.75);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0,64,0,.8)';
  ctx.stroke();

  // Table edge segments
  ctx.beginPath();
  tableSegments.forEach(segm => {
    ctx.moveTo(scale * segm.vertices[0].x, scale * segm.vertices[0].y);
    for (let k = 1; k < segm.vertices.length; k++) {
      ctx.lineTo(scale * segm.vertices[k].x, scale * segm.vertices[k].y);
    }
  });
  ctx.fillStyle = 'green';
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(0,100,0,1)';
  ctx.fill();
  ctx.stroke();

  // Render the cue-ball
  ctx.beginPath();
  ctx.arc(scale * cueBall.body.position.x, scale * cueBall.body.position.y, scale * cueBall.radius, 0, TWO_PI);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Render the object balls
  balls.filter(ball => ball.id !== 0).forEach(ball => {
    ctx.beginPath();
    ctx.arc(scale * ball.body.position.x, scale * ball.body.position.y, scale * ball.radius, 0, TWO_PI);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  });

  if (dragging) {
    ctx.beginPath();
    ctx.moveTo(scale * cueBall.body.position.x, scale * cueBall.body.position.y);
    ctx.lineTo(mouse.position.x, mouse.position.y);
    ctx.strokeStyle = '#fff';
    ctx.stroke();
  }

  stats.end();
  requestAnimationFrame(animate);
}

animate();
