import * as Matter from 'matter-js';
import * as Stats from 'stats.js';

// https://github.com/liabru/matter-js/issues/559
// window['decomp'] = require('poly-decomp');
import * as decomp from 'poly-decomp';
window['decomp'] = decomp;

import { Ball } from './ball';
import { Rack } from './rack';
import { Primitives } from './primitives';

const { PI, random, floor, min, max, sqrt } = Math;
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

// const canvas2 = document.querySelector('#scene2') as HTMLCanvasElement;
// const gl = canvas2.getContext('webgl');
// console.log(gl);

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
// const ballRadius = 40;
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

const scale = .333;
const cueBall = balls[0];
const maxForceMag = 600;
let dragging = false;
const rack = new Rack();

/**
 * Definitions for the ball rack position and cue-ball line on the pool table
 */
const footSpotPos = { x: 1 / 2, y: 1 / 4 };
const cueBallLinePos = 3 / 4;

/**
 * Path2D
 * https://developer.mozilla.org/en-US/docs/Web/API/Path2D/Path2D
 */
const tablePath = new Path2D();
tablePath.moveTo(scale * holeRadius, 0);
tablePath.lineTo(scale * (tableWidth - holeRadius), 0);
tablePath.arc(scale * (tableWidth - holeRadius), scale * holeRadius, scale * holeRadius, -HALF_PI, 0);
tablePath.lineTo(scale * tableWidth, scale * (tableLength - holeRadius));
tablePath.arc(scale * (tableWidth - holeRadius), scale * (tableLength - holeRadius), scale * holeRadius, 0, HALF_PI);
tablePath.lineTo(scale * holeRadius, scale * tableLength);
tablePath.arc(scale * holeRadius, scale * (tableLength - holeRadius), scale * holeRadius, HALF_PI, PI);
tablePath.lineTo(0, scale * holeRadius);
tablePath.arc(scale * holeRadius, scale * holeRadius, scale * holeRadius, PI, -HALF_PI);

let tableImageData: ImageData;

// function createBallTexture(value: number, color: Color): ImageData {
//   const c = `rgb(${color.r},${color.g},${color.b})`;
//   const w = 256;
//   const h = 128;
//   // const r = h / 2 - 32;
//   // const hy = (value < 9) ? 0 : 16;
//   const r = h / 5;
//   const hy = (value < 9) ? 0 : h / 5;
//   const drawText = (x: number) => {
//     ctx.beginPath();
//     ctx.fillStyle = '#fff';
//     ctx.arc(x, h / 2, r, 0, TWO_PI);
//     ctx.fill();
//     ctx.fillStyle = '#000';
//     ctx.fillText(value.toString(), x, h / 2 + 4);  
//   };
//   ctx.clearRect(0, 0, w, h);
//   ctx.fillStyle = '#fff';
//   ctx.fillRect(0, 0, w, h);
//   ctx.fillStyle = c;
//   ctx.fillRect(0, hy, w, h - 2 * hy);
//   ctx.font = '24pt Trebuchet MS';
//   ctx.textAlign = 'center';
//   ctx.textBaseline = 'middle';  
//   drawText(0.76 * w);
//   drawText(0.25 * w);
//   return ctx.getImageData(0, 0, w, h);
// }

/*
function webgl_CreateBallTexture(value: number, color: Color): WebGLTexture {
  const imgData = createBallTexture(value, color);
  const texture: WebGLTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, imgData);
  return texture;
}
*/

function drawTable() {
  // Pool table surface
  ctx.fillStyle = 'rgba(0,80,0,1)'; 
  ctx.fill(tablePath);

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

  // Render ball
  /*
  Primitives.Sphere.faces.forEach(f => {
    // Transform the normal vectors of the unit sphere's faces to the ball's OCS
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
      // Flat shading - assuming that the light source is pointing down at the pool table
      const c = floor(255 * nz);
      // ctx.fillStyle = `rgba(${c},${c},${c},1)`;
      ctx.fillStyle = `rgb(${c},0,0)`;
      ctx.fill();
    }
  });
  */

  /**
   * Render ball
   *
   * Step 1. Compute the ball boundary on-screen 
   * Step 2. Find all visible faces
   */
  const bxmin = scale * (x - ball.radius),
        bxmax = scale * (x + ball.radius),
        bymin = scale * (y - ball.radius),
        bymax = scale * (y + ball.radius);

  const xmin = floor(bxmin),
        xmax = floor(bxmax),
        ymin = floor(bymin),
        ymax = floor(bymax);

  // ctx.beginPath();
  // ctx.strokeStyle = '#fff';
  // ctx.strokeRect(sxmin, symin, sxmax - sxmin, symax - symin);

  // Back face culling and transformation of edge direction vectors into the view
  const visibleFaces = Primitives.Sphere.faces
    .filter(f => (f.n.x * ez.x + f.n.y * ez.y + f.n.z * ez.z) >= 0)
    .map(f => ({ ...f, e: f.e.map(v => ({ x: v.x * ex.x + v.y * ex.y + v.z * ex.z, y: v.x * ey.x + v.y * ey.y + v.z * ey.z, z: 0 })) }));

  // Scan-convert all visible (quadrilateral) faces for this ball
  visibleFaces.forEach(face => {
    const p = face.v.map(v => Pview[v]);

    const sxmin = floor(min(...p.map(v => v.x))),
          sxmax = floor(max(...p.map(v => v.x))),
          symin = floor(min(...p.map(v => v.y))),
          symax = floor(max(...p.map(v => v.y)));

    // const sxmin = min(...p.map(v => v.x)),
    //   sxmax = max(...p.map(v => v.x)),
    //   symin = min(...p.map(v => v.y)),
    //   symax = max(...p.map(v => v.y));

    // New scan conversion method...
    const n1 = face.v[0], n2 = face.v[1], n3 = face.v[2], n4 = face.v[3];
    const a1 = Pview[n2].x - Pview[n1].x,
          a2 = Pview[n4].x - Pview[n1].x,
          a3 = Pview[n1].x - Pview[n2].x + Pview[n3].x - Pview[n4].x,
          b1 = Pview[n2].y - Pview[n1].y,
          b2 = Pview[n4].y - Pview[n1].y,
          b3 = Pview[n1].y - Pview[n2].y + Pview[n3].y - Pview[n4].y;          
    const c0 = a1 * b3 - a3 * b1;

    let a0: number, b0: number;
    let c1: number, c2: number;
    let d0: number, d1: number, d2: number;
    let u: number, v: number, uv: number;
    let tu: number, tv: number;

    const u1 = Primitives.Sphere.data[n1].u,
          u2 = Primitives.Sphere.data[n2].u,
          u3 = Primitives.Sphere.data[n3].u,
          u4 = Primitives.Sphere.data[n4].u,
          v1 = Primitives.Sphere.data[n1].v,
          v2 = Primitives.Sphere.data[n2].v,
          v3 = Primitives.Sphere.data[n3].v,
          v4 = Primitives.Sphere.data[n4].v;
    const f0 = u1,
          f1 = u2 - u1,
          f2 = u4 - u1,
          f3 = u1 - u2 + u3 - u4,
          g0 = v1,
          g1 = v2 - v1,
          g2 = v4 - v1,
          g3 = v1 - v2 + v3 - v4;
    let ix: number, iy: number;
    let srcIndex: number, targetIndex: number;

    yloop: for (let sy = symin; sy <= symax; sy++) {
      if (sy < 0 || sy > tableImageData.height - 1) { continue yloop; }
      b0 = Pview[n1].y - sy;

      xloop: for (let sx = sxmin; sx <= sxmax; sx++) {
        if (sx < 0 || sx > tableImageData.width - 1) { continue xloop; }
        a0 = Pview[n1].x - sx;
        c1 = a0 * b3 - a3 * b0 + a1 * b2 - a2 * b1;
        c2 = a0 * b2 - a2 * b0;
        d0 = c1 / (2 * c0);
        d1 = d0 * d0 - c2 / c0;
        d2 = sqrt(d1);
        u = -d0 - d2;
        if (u < 0 || u > 1) {
          u = -d0 + d2;
          if (u < 0 || u > 1) {
            continue xloop;
          }
        }
        v = -(a0 + a1 * u) / (a2 + a3 * u);
        if (v < 0 || v > 1) {
          continue xloop;
        }
        uv = u * v;
        // texture coords.
        tu = f0 + f1 * u + f2 * v + f3 * uv;
        tv = g0 + g1 * u + g2 * v + g3 * uv;
        if (tu < 0) {
          tu = 0;
        } else if (tu > 1) {
          tu = 1;
        }
        if (tv < 0) {
          tv = 0;
        } else if (tv > 1) {
          tv = 1;
        }
        // Assuming texture image size 256x128px
        ix = floor(tu * 256);
        iy = floor(tv * 128);
        if (ix < 0) {
          ix = 0;
        } else if (ix > 255) {
          ix = 255;
        }
        if (iy < 0) {
          iy = 0;
        } else if (iy > 127) {
          iy = 127;
        }
        // srcIndex = 4 * (ix + iy * 256);  // Assuming 256px texture width
        // targetIndex = (sx - xmin + (sy - ymin) * 64)<<2;

        srcIndex = (ix + (iy<<8)) << 2;  // Assuming 256px texture width

        // targetIndex = (sx - xmin + ((sy - ymin)<<6))<<2;
        // ball.imgData.data[targetIndex] = ball.texture.data[srcIndex];
        // ball.imgData.data[targetIndex+1] = ball.texture.data[srcIndex+1];
        // ball.imgData.data[targetIndex+2] = ball.texture.data[srcIndex+2];
        // ball.imgData.data[targetIndex+3] = 255;
        
        targetIndex = (sx + sy * tableImageData.width) << 2;

        tableImageData.data[targetIndex] = ball.texture.data[srcIndex];
        tableImageData.data[targetIndex+1] = ball.texture.data[srcIndex+1];
        tableImageData.data[targetIndex+2] = ball.texture.data[srcIndex+2];
        tableImageData.data[targetIndex+3] = 255;
      }
    }
  });

  // Output ball image
  // ctx.putImageData(ball.imgData, scale * (x - ball.radius), scale * (y - ball.radius), 0, 0, xmax-xmin, ymax-ymin);
}

// Place the cue-ball on the cue-ball line on the pool table
Matter.Body.setPosition(cueBall.body, {
  x: tableWidth / 2 + (2 * random() -1) * cueBall.radius,
  y: tableLength * 0.75
});

// Init balls
const maxBallSize = 64;
balls.forEach(ball => ball.init(ctx, maxBallSize));

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
  
  /*
  // Output textures for balls 1-15
  let index = 1;
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 3; j++) {
      // const tx = j * 256;
      // const ty = i * 128;
      const tx = canvas.width - (3 - j) * 256;
      const ty = i * 128;
      const imgData = balls[index].texture;
      ctx.putImageData(balls[index++].texture, tx, ty, 0, 0, imgData.width, imgData.height);
    }
  }
  */
 
  drawTable();

  // Render the cue-ball
  ctx.beginPath();
  ctx.arc(scale * cueBall.body.position.x, scale * cueBall.body.position.y, scale * cueBall.radius, 0, TWO_PI);
  ctx.fillStyle = '#fff';
  ctx.fill();

  // Get image data where to render the balls
  tableImageData = ctx.getImageData(0, 0, scale * tableWidth, scale * tableLength);

  // Render the object balls 1-15
  balls.filter(ball => ball.id !== 0).forEach(ball => {
    ball.update();
    drawBall(ball);
  });

  ctx.putImageData(tableImageData, 0, 0);

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
