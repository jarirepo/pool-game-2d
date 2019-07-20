import * as Matter from 'matter-js';
import * as Stats from 'stats.js';

// https://github.com/liabru/matter-js/issues/559
// window['decomp'] = require('poly-decomp');
import * as decomp from 'poly-decomp';
window['decomp'] = decomp;

import { Ball } from './ball';
import { Colors, Color } from './colors';
import { Rack } from './rack';
import { Vector3D, Matrix4 } from './vector3d';
import { Primitives } from './primitives';

const { cos, PI, random, sin, atan2, asin, floor } = Math;
const TWO_PI = 2 * PI;
const HALF_PI = PI / 2;

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
  frictionStatic: .01,
  restitution: 1,
  // density: .8,
  density: 1.7  // g/cm^3
  // sleepThreshold: 30
};

const ballRadius = 57.15 / 2; // mm
// const ballRadius = 60;
const ballRadiusTol = 0.127;  // introduces some imperfection

for (let i = 0; i < 16; i++) {
  const r = ballRadius + (2 * random() - 1) * ballRadiusTol / 2;  // mm 
  // const r = ballRadius - random() * .127;  // mm
  // const r = ballRadius;  // mm
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
  friction: .1,
  restitution: .99
};
const tableLength = 7 * 0.3048e3; // ft -> mm
const tableWidth = tableLength / 2;
const holeRadius = 2 * ballRadius;  // mm
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

// Position the table edge segments and add them to the physics world since poly-decomp has translated them to their CoG.
Matter.Body.setPosition(tableSegments[0], { x: tableWidth / 2, y: tableEdgeWidth / 2 });
Matter.Body.setPosition(tableSegments[1], { x: tableWidth - tableEdgeWidth / 2, y: 0.25 * tableLength });
Matter.Body.setPosition(tableSegments[2], { x: tableWidth - tableEdgeWidth / 2, y: 0.75 * tableLength });
Matter.Body.setPosition(tableSegments[3], { x: tableWidth / 2, y: tableLength - tableEdgeWidth / 2 });
Matter.Body.setPosition(tableSegments[4], { x: tableEdgeWidth / 2, y: 0.25 * tableLength });
Matter.Body.setPosition(tableSegments[5], { x: tableEdgeWidth / 2, y: 0.75 * tableLength });

World.add(world, tableSegments);

// Add the ball bodies to the world
World.add(world, balls.map(b => b.body));

// console.log(tableSegments[0].position, tableSegments[0].vertices);

/**
 * Definitions for the ball rack position and cue-ball line on the pool table
 */
const footSpotPos = { x: 1 / 2, y: 1 / 4 };
const cueBallLinePos = 3 / 4;

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

function drawTable() {
  // Pool table surface
  ctx.beginPath();
  ctx.moveTo(scale * holeRadius, 0);
  ctx.lineTo(scale * (tableWidth - holeRadius), 0);
  ctx.arc(scale * (tableWidth - holeRadius), scale * holeRadius, scale * holeRadius, -HALF_PI, 0);
  ctx.lineTo(scale * tableWidth, scale * (tableLength - holeRadius));
  ctx.arc(scale * (tableWidth - holeRadius), scale * (tableLength - holeRadius), scale * holeRadius, 0, HALF_PI);
  ctx.lineTo(scale * holeRadius, scale * tableLength);
  ctx.arc(scale * holeRadius, scale * (tableLength - holeRadius), scale * holeRadius, HALF_PI, PI);
  ctx.lineTo(0, scale * holeRadius);
  ctx.arc(scale * holeRadius, scale * holeRadius, scale * holeRadius, PI, -HALF_PI);
  ctx.fillStyle = 'rgba(0,80,0,1)'; 
  ctx.fill();

  // Foot spot (rack position)
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
}

function drawBall(ball: Ball) {
  // Local coordinate axes for this ball
  const ex = { x: ball.ocs.m00, y: ball.ocs.m10, z: ball.ocs.m20 };
  const ey = { x: ball.ocs.m01, y: ball.ocs.m11, z: ball.ocs.m21 };
  const ez = { x: ball.ocs.m02, y: ball.ocs.m12, z: ball.ocs.m22 };

  const x = ball.body.position.x;
  const y = ball.body.position.y;
  const L = 30;

  // Display the Object Coordinate System (OCS)

  // ctx.beginPath();
  // ctx.lineWidth = 2;

  // ctx.beginPath();
  // ctx.moveTo(scale * x, scale * y);
  // ctx.lineTo(scale * x + L * ex.x, scale * y - L * ex.y);
  // ctx.strokeStyle = 'blue';
  // ctx.stroke();

  // ctx.beginPath();
  // ctx.moveTo(scale * x, scale * y);
  // ctx.lineTo(scale * x + L * ey.x, scale * y - L * ey.y);
  // ctx.strokeStyle = 'red';
  // ctx.stroke();

  // ctx.beginPath();
  // ctx.moveTo(scale * x, scale * y);
  // ctx.lineTo(scale * x + L * ez.x, scale * y - L * ez.y);
  // ctx.strokeStyle = 'magenta';
  // ctx.stroke();

  
  // ctx.beginPath();
  // ctx.arc(scale * ball.body.position.x, scale * ball.body.position.y, scale * ball.radius, 0, TWO_PI);
  // ctx.fillStyle = '#fff';
  // ctx.fill();

  // Transform the unit sphere to the ball's Object Coordinate System (OCS)
  // Primitives.Sphere.data.forEach(p => {
  //   const px = ball.radius * (p.x * ex.x + p.y * ex.y + p.z * ex.z);
  //   const py = -ball.radius * (p.x * ey.x + p.y * ey.y + p.z * ey.z);
  //   const sx = scale * (x + px);
  //   const sy = scale * (y + py);
  //   ctx.beginPath();
  //   ctx.arc(sx, sy, 1, 0, TWO_PI);
  //   ctx.fillStyle = '#fff';
  //   ctx.fill();
  // });

  const Pview = Primitives.Sphere.data.map(p => {
    const px = ball.radius * (p.x * ex.x + p.y * ex.y + p.z * ex.z);
    const py = ball.radius * (p.x * ey.x + p.y * ey.y + p.z * ey.z);
    const sx = scale * (x + px);
    const sy = scale * (y - py);
    return { x: sx, y: sy, z: 0 };
  });

  // Transform the normal vectors of the unit sphere's faces to the ball's OCS
  Primitives.Sphere.faces.forEach(f => {
    // const nx = f.n.x * ex.x + f.n.y * ex.y + f.n.z * ex.z;
    // const ny = f.n.x * ey.x + f.n.y * ey.y + f.n.z * ey.z;
    const nz = f.n.x * ez.x + f.n.y * ez.y + f.n.z * ez.z;
    if (nz > 0) {
      ctx.beginPath();
      ctx.moveTo(Pview[f.v[0]].x, Pview[f.v[0]].y);
      ctx.lineTo(Pview[f.v[1]].x, Pview[f.v[1]].y);
      ctx.lineTo(Pview[f.v[2]].x, Pview[f.v[2]].y);
      ctx.lineTo(Pview[f.v[3]].x, Pview[f.v[3]].y);
      // ctx.lineTo(Pview[f.v[0]].x, Pview[f.v[0]].y);
      ctx.closePath();
      // ctx.fillStyle = '#fff';
      // ctx.fillStyle = 'rgba(255,255,255,.8)';
      const c = floor(255 * nz);
      // ctx.fillStyle = `rgba(${c},${c},${c},1)`;
      ctx.fillStyle = `rgb(${c},0,0)`;
      ctx.fill();
    }
  });

  // Display the angle (spin on the XY-plane)
  // ctx.beginPath();
  // ctx.strokeStyle = '#000';
  // ctx.lineWidth = 2;
  // ctx.moveTo(scale * ball.body.position.x, scale * ball.body.position.y);
  // const dx = ball.radius * cos(ball.body.angle);
  // const dy = ball.radius * sin(ball.body.angle);
  // ctx.lineTo(scale * (ball.body.position.x + dx), scale * (ball.body.position.y + dy));
  // ctx.stroke();

  // Display the velocity vector
  // const v = Matter.Vector.normalise(ball.body.velocity);
  // ctx.beginPath();
  // ctx.moveTo(scale * ball.body.position.x, scale * ball.body.position.y);
  // ctx.lineTo(scale * (ball.body.position.x + 10 * ball.body.speed * v.x), scale * (ball.body.position.y + 10 * ball.body.speed * v.y));
  // ctx.strokeStyle = 'rgb(0,0,128)';
  // ctx.stroke();
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

  drawTable();

  // Render the cue-ball
  ctx.beginPath();
  ctx.arc(scale * cueBall.body.position.x, scale * cueBall.body.position.y, scale * cueBall.radius, 0, TWO_PI);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Render the object balls 1-15
  balls.filter(ball => ball.id !== 0).forEach(ball => {
    ball.update();
    drawBall(ball);
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
