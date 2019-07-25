import * as Matter from 'matter-js';
import * as Stats from 'stats.js';
import { Primitives } from './primitives';
import { Ball } from './ball';
import { Rack } from './rack';
import { PoolTable } from './pool-table';
import { Polyline } from './polyline';

const { PI, random, floor, min, max, sqrt, sin } = Math;

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
const mouse = Mouse.create(canvas);

ctx.fillStyle = 'rgb(51, 51, 51)';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.globalAlpha = 1;

/**
 * Create the ball bodies
 */
const balls: Ball[] = [];
const ballOptions: Matter.IBodyDefinition = {
  isStatic: false,
  friction: 0,
  frictionAir: .01,
  frictionStatic: .01,
  restitution: .99,
  // density: .8,
  density: 1.7  // g/cm^3
};
const ballRadius = 57.15 / 2; // mm
// const ballRadius = 50;
const ballRadiusTol = 0.127;  // introduces some imperfection
for (let i = 0; i < 16; i++) {
  const r = (i === 0) ? 0.9375 * ballRadius : ballRadius + (2 * random() - 1) * ballRadiusTol / 2;  // mm 
  const b = Bodies.circle(0, 0, r, { ...ballOptions, label: `ball-${i}` });
  balls.push(new Ball(i, r, b));
}

/**
 * Create the pool table boundary
 */
const tableOptions: Matter.IBodyDefinition = { isStatic: true, friction: .1, restitution: .99 };
const poolTable = new PoolTable(balls, 7 * 0.3048e3, 1.5 * ballRadius, tableOptions);  // length (ft -> mm), hole radius (mm)

const rack = new Rack();
const cueBall = balls[0];
const forceImpulse = new Array(5).fill(0).map((v, i) => floor(255 * sin(PI * ((i - 2) / 2 + 1) / 2)));
const maxForceMag = 200;
const scale = 1/3;
let dragging = false;
let shooting = false;
let shootStep = 0;
let shootDir: Matter.Vector;
let shootForce: number;
let tableImageData: ImageData;
// console.log(forceImpulse);

// Add the bodies for the table segments, pockets and balls to the world
World.add(world, poolTable.cushionBodies);
World.add(world, poolTable.pockets.map(pocket => pocket.body));
World.add(world, balls.map(b => b.body));
console.log('World bodies:', world);

// Ball sink  (container for all pocketed balls)
const ballSink: Ball[] = [];

// Handle collision events
Matter.Events.on(engine, 'collisionActive', (event: Matter.IEventCollision<Matter.Engine>) => {
  const pairs = event.pairs;
  // console.log('collisionActive', pairs);
  let a: Matter.Body, b: Matter.Body;
  for (let pair of pairs) {
    a = pair.bodyA;
    b = pair.bodyB;
    const isPocketA = a.label.startsWith('pocket');
    const isPocketB = isPocketA ? false : b.label.startsWith('pocket');
    const isBallA = isPocketA ? false : a.label.startsWith('ball');
    const isBallB = isPocketB ? false : b.label.startsWith('ball');
    if ((isPocketA || isPocketB) && (isBallA || isBallB)) {
      // Ensure that (a) is a pocket and (b) is a ball
      if (!isPocketA) {
        [a, b] = [b, a];
      }
      const ball = balls.find(ball => ball.body.id === b.id);
      const pocket = poolTable.pockets.find(pocket => pocket.body.id === a.id);
      // console.log(`Collision with Ball ${ball.body.id} and Pocket ${pocket.body.id}`);
      if ( pocket.isBallInside(ball) ) {
        ballSink.push(ball);
        Matter.Body.setVelocity(ball.body, { x: 0, y: null });
        Matter.Body.setAngularVelocity(ball.body, 0);
        Matter.Body.setPosition(ball.body, {
          x: ballSink.length * 3 * ball.radius,
          y: ball.radius * 1.1
        });
        Matter.World.remove(world, ball.body);
      }
    }
  }
});

// Matter.Events.on(engine, 'collisionEnd', (event: Matter.IEventCollision<Matter.Engine>) => {
//   const pairs = event.pairs;
//   // console.log('collisionEnd', pairs);
// });

function drawBall(ball: Ball, buffer: ImageData) {
  // Local coordinate axes for this ball
  const ex = { x: ball.ocs.m00, y: ball.ocs.m10, z: ball.ocs.m20 };
  const ey = { x: ball.ocs.m01, y: ball.ocs.m11, z: ball.ocs.m21 };
  const ez = { x: ball.ocs.m02, y: ball.ocs.m12, z: ball.ocs.m22 };

  const x = ball.body.position.x;
  const y = ball.body.position.y;
  // const L = 30;

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

  // Transform the unit sphere to the ball's Object Coordinate System (OCS)
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
   * Step 1. Compute the ball's bounding box
   * Step 2. Find all visible faces
   */
  // const bxmin = scale * (x - ball.radius),
  //       bxmax = scale * (x + ball.radius),
  //       bymin = scale * (y - ball.radius),
  //       bymax = scale * (y + ball.radius);

  // ctx.beginPath();
  // ctx.strokeStyle = '#fff';
  // ctx.strokeRect(sxmin, symin, sxmax - sxmin, symax - symin);

  // Back face culling and transformation of edge direction vectors into the view
  const visibleFaces = Primitives.Sphere.faces
    .filter(f => (f.n.x * ez.x + f.n.y * ez.y + f.n.z * ez.z) > 0)
    .map(f => ({ ...f, e: f.e.map(v => ({ x: v.x * ex.x + v.y * ex.y + v.z * ex.z, y: v.x * ey.x + v.y * ey.y + v.z * ey.z, z: 0 })) }));

  // Scan-convert all visible (quadrilateral) faces for this ball
  visibleFaces.forEach(face => {
    const p = face.v.map(v => Pview[v]);
    
    const sxmin = floor(min(...p.map(v => v.x)) + 0),
          sxmax = floor(max(...p.map(v => v.x)) + 0),
          symin = floor(min(...p.map(v => v.y)) + 0),
          symax = floor(max(...p.map(v => v.y)) + 0);

    // Transform the normal vectors of the unit sphere's faces to the ball's OCS
    // const nx = face.n.x * ex.x + face.n.y * ex.y + face.n.z * ex.z;
    // const ny = face.n.x * ey.x + face.n.y * ey.y + face.n.z * ey.z;
    const nz = face.n.x * ez.x + face.n.y * ez.y + face.n.z * ez.z;

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
      if (sy < 0 || sy > buffer.height - 1) {
        continue yloop;
      }
      b0 = Pview[n1].y - sy;

      xloop: for (let sx = sxmin; sx <= sxmax; sx++) {
        if (sx < 0 || sx > buffer.width - 1) {
          continue xloop;
        }
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
        ix = floor(tu * ball.texture.width);
        iy = floor(tv * ball.texture.height);
        if (ix < 0) {
          ix = 0;
        } else if (ix > ball.texture.width - 1) {
          ix = ball.texture.width - 1;
        }
        if (iy < 0) {
          iy = 0;
        } else if (iy > ball.texture.height - 1) {
          iy = ball.texture.height - 1;
        }

        srcIndex = (ix + iy * ball.texture.width)<<2;
        targetIndex = (sx + sy * buffer.width)<<2;

        /**
         * Pixel shading
         * Uses the z-component (0<=nz<=1) of the face's normal vector (n) to adjust the shade of the texture color value at (ix,iy).
         * Assumes that there is a directional light above the pool table.
         */       
        buffer.data[targetIndex] = nz * ball.texture.data[srcIndex];
        buffer.data[targetIndex+1] = nz * ball.texture.data[srcIndex+1];
        buffer.data[targetIndex+2] = nz * ball.texture.data[srcIndex+2];
        buffer.data[targetIndex+3] = 255;
      }
    }
  });
}

// Place the cue-ball on the cue-ball line on the pool table
Matter.Body.setPosition(cueBall.body, {
  x: poolTable.width / 2 + (2 * random() -1) * cueBall.radius,
  y: poolTable.length * 0.75
});

// Init balls
balls.forEach(ball => ball.init(ctx));

// Stack balls 1-15 in the triangular rack with the rack's apex at the foot spot
rack.setup();
console.log('Ball rack:', rack);

balls.filter(ball => ball.value !== 0).forEach(ball => {
  // find rack slot for this ball
  const slot = rack.slots.find(slot => slot.ballId === ball.value);
  // set ball position
  Matter.Body.setPosition(ball.body, {
    x: poolTable.width / 2 + slot.u * ball.radius,
    y: poolTable.length / 4 - slot.v * ball.radius
  });
});

// Polyline test
// const pline = new Polyline(0, 0)
//   .lineTo(500, 0)
//   .arcTo(750, 250)
//   .lineTo(1000, 250)
//   .arcTo(1000,500)
//   .lineTo(500, 500)
//   .close();
// console.log(pline);

// Start the physics engine
Engine.run(engine);

function animate(time = 0) {  
  stats.begin();

  if (shooting) {    
    const force = Matter.Vector.mult(shootDir, (shootForce * forceImpulse[shootStep]) >> 8);
    Matter.Body.applyForce(cueBall.body, cueBall.body.position, force);
    shootStep++;
    if (shootStep === forceImpulse.length) {
      shooting = false;
    }
  }

  if (!dragging) {
    if (mouse.button === 0 && poolTable.hasSettled()) { // left mouse button pressed
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
      shootForce = min(floor(0.5 * Matter.Vector.magnitude(v)), maxForceMag);
      shootDir = Matter.Vector.normalise(v);
      shootStep = 0;
      shooting = true;
      // console.log(shootForce);
    }
  }
  
  // ctx.fillStyle = '#333';
  // ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Output test polyline
  // ctx.save();
  // ctx.setTransform({ m11: .75, m12: 0, m21: 0, m22: -.75, m41: canvas.width / 3, m42: canvas.height * .75 });
  // ctx.beginPath();
  // ctx.moveTo(pline.p[0].x, pline.p[0].y);
  // for (let i = 1; i < pline.p.length; i++) {
  //   ctx.lineTo(pline.p[i].x, pline.p[i].y);
  // }
  // ctx.strokeStyle = '#fff';
  // ctx.lineWidth = 1;
  // ctx.stroke();
  // ctx.restore();

  ctx.save();
  ctx.setTransform({ m11: scale, m12: 0, m21: 0, m22: scale, m41: 0, m42: 0 });
  poolTable.render(ctx);
  ctx.restore();

  // Get image data where to render the balls
  tableImageData = ctx.getImageData(0, 0, scale * poolTable.width, scale * poolTable.length);
  // Render the object balls 1-15
  balls.filter(ball => !ball.isPocketed).forEach(ball => {
    ball.update();
    drawBall(ball, tableImageData);
  });
  ctx.putImageData(tableImageData, 0, 0);

  // Render the ball sink containing all pocketed balls
  ctx.beginPath();
  ctx.fillRect(100, canvas.height - 50, canvas.width - 100, 50);
  ctx.fillStyle = '#000';
  ctx.fill();
  const sinkImageData = ctx.getImageData(100, canvas.height - 50, canvas.width - 100, 50);  
  ballSink.forEach(ball => drawBall(ball, sinkImageData));
  ctx.putImageData(sinkImageData, 100, canvas.height - 50);

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

  // Player input
  if (dragging) {
    ctx.beginPath();
    ctx.moveTo(scale * cueBall.body.position.x, scale * cueBall.body.position.y);
    ctx.lineTo(mouse.position.x, mouse.position.y);
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 4;
    ctx.stroke();
  }

  stats.end();
  requestAnimationFrame(animate);
}

animate();
