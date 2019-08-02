import * as Matter from 'matter-js';
import * as Stats from 'stats.js';
import { Ball } from './shapes/ball';
import { Rack } from './rack';
import { PoolTable } from './shapes/pool-table';
import { Viewport } from './viewport';
import { Scene } from './scene';
import { Cue, CueState } from './shapes/cue';

const { random } = Math;

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

document.body.focus({ preventScroll: true });

ctx.fillStyle = 'rgb(51, 51, 51)';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.globalAlpha = 1;

/*****************************************************************************
 * Game state
 *****************************************************************************/
enum GameState {
  AIMING,
  STROKING
};
let state = GameState.AIMING;

/*****************************************************************************
 * Create Scene and Viewport
 *****************************************************************************/
const gameScene = new Scene();
const gameView = new Viewport(ctx, gameScene, {
  screen: { xmin: 50, ymin: 50, xmax: canvas.width - 50, ymax: canvas.height - 125 },
  world: { xmin: -50, ymin: -50, xmax: 2300, ymax: 1200 },
  showGrid: true,
  gridSizeX: 50,
  gridSizeY: 50
});

/*****************************************************************************
 * Create balls
 *****************************************************************************/
const ballOptions: Matter.IBodyDefinition = {
  isStatic: false,
  friction: 0,
  frictionAir: .01,
  frictionStatic: .01,
  restitution: .99,
  density: 1.7  // g/cm^3
};
const ballRadius = 57.15 / 2; // mm
const ballRadiusTol = 0.127;  // introduces some imperfection
const balls: Ball[] = [];
const ballSink: Ball[] = [];  // Ball sink  (container for all pocketed balls)
for (let i = 0; i < 16; i++) {
  const r = (i === 0) ? 0.9375 * ballRadius : ballRadius + (2 * random() - 1) * ballRadiusTol / 2;  // mm 
  const b = Bodies.circle(0, 0, r, { ...ballOptions, label: `ball-${i}` });
  balls.push(new Ball(i, r, b));
}
balls.forEach(ball => ball.init(ctx));
const cueBall = balls[0];

/*****************************************************************************
 * Create the pool table
 *****************************************************************************/
const rack = new Rack();
const poolTableOptions: Matter.IBodyDefinition = { isStatic: true, friction: .1, restitution: .99 };
const poolTable = new PoolTable(rack, balls, 7 * 0.3048e3, 1.5 * ballRadius, poolTableOptions);  // length (ft -> mm), hole radius (mm)

/*****************************************************************************
 * Create the cue
 *****************************************************************************/
const cue = new Cue(poolTable, cueBall, { length: 1500, tipRadius: 13/2, buttRadius: 30/2, mass: 0.54 });
cue.init(ctx);

/*****************************************************************************
 * Add the bodies for the rail cushions, pockets and balls to the physics world
 *****************************************************************************/
World.add(world, poolTable.cushionBodies);
World.add(world, poolTable.pockets.map(pocket => pocket.body));
World.add(world, balls.map(b => b.body));

/*****************************************************************************
 * Add pool table, pockets, rail cushions, cue and balls to the game scene
 *****************************************************************************/
gameScene
  .add(poolTable)
  .setTransform(poolTable.ocs)
  .add(poolTable.pockets)
  .add(poolTable.railCushions)
  .add(cue)
  .add(balls);
  
/*****************************************************************************
 * Pool table init
 * - Stacks balls 1-15 in the triangular rack (with the rack's apex at the foot spot)
 * - Positioning of the balls on the pool table
 * - Positioning of the cue-ball on the cue-ball line on the pool table
 *****************************************************************************/
poolTable.init();

gameView.currentAxes = poolTable.ocs;

const Wmax = new Array(200).fill(0);

let dragging = false;

console.log('Rack:', rack);
console.log('Viewport transformation:', gameView.getTransform());
console.log('World bodies:', world);
console.log('Scene shapes:', gameScene.shapes);

/*****************************************************************************
 * Handle collision events
 *****************************************************************************/
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

/*****************************************************************************
 * Handle keyboard events
 *****************************************************************************/
document.body.addEventListener('keypress', (e: KeyboardEvent) => {
  console.log(e.key, e.keyCode);
  const M = gameView.mouse.position;
  switch (e.keyCode) {
    case 43:  // '+'
      // gameView.zoomOrigin(1.1);
      // gameView.zoomCenter(1.05);
      gameView.zoomAt(M.x, M.y, 1.1);
      break;
    case 45:  // '-'
      // gameView.zoomOrigin(.9);
      // gameView.zoomCenter(.95);
      gameView.zoomAt(M.x, M.y, 0.95);
      break;
    case 65:  // 'a'
    case 97:  // 'A'
      gameView.toggleAxes();
      break;
    case 71:  // 'G'
    case 103: // 'g'
      gameView.toggleGrid();
      break;
    case 87:  // 'W'
    case 119: // 'w'
      // Move cue forward
      break;
  }
});

/*****************************************************************************
 * Animation
 *****************************************************************************/
Engine.run(engine);

function gameLoop(time = 0) {  
  stats.begin();

  // const hasSettled = poolTable.hasSettled();

  cue.update(time);

  switch (cue.state) {
    case CueState.AIMING:
      const mousePos = gameView.getMousePos();
      cue.aimAt(mousePos);
      // cue.update(time);

      if (!dragging && !cueBall.isPocketed) {
        if (gameView.mouse.button === 0) {  // left mouse button pressed
          dragging = true;
          console.log('Dragging');
        }
      } else {
        if (gameView.mouse.button === -1) { // mouse button released
          dragging = false;
          cue.stroke();
        }
      }
      break;

    case CueState.STROKING:
      break;
  }

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Update the non-pocketed balls
  balls.filter(ball => !ball.isPocketed).forEach(ball => ball.update());

  // Game viewport and scene
  gameView.render();
  // gameScene.render(gameView);
  
  /*
  // Render ball activity (during dragging)
  //if (dragging) {
    Wmax.fill(0);

    ctx.fillStyle = '#000';
    ctx.fillRect(canvas.width - 200, canvas.height - 125, 200, 75);    
    ctx.lineWidth = 1;

    balls
    .filter(ball => !ball.isPocketed)
    // .filter(ball => [0, 8].indexOf(ball.value) !== -1)
    .forEach((ball, index) => {
      if (ball.activity.length > 1) {
        // ctx.beginPath();
        // ctx.moveTo(canvas.width - 100, canvas.height - 125 - 2 * ball.activity[0]);
        if (ball.activity[0] > Wmax[0]) {
          Wmax[0] = ball.activity[0];
        }        
        for (let i = 1; i < ball.activity.length; i++) {
          if (ball.activity[i] > Wmax[i]) {
            Wmax[i] = ball.activity[i];
          }
          // ctx.lineTo(canvas.width - 100 + 0.5 * i, canvas.height - 125 - 2 * ball.activity[i]);
        }
        // ctx.strokeStyle = `rgba(${128  + 127 * index / 15}, ${128 * index / 15}, 64, .5)`;
        // ctx.stroke();  
      }
    });

    // Plot global weight max
    ctx.save();
    ctx.setTransform({ m11: 1, m12: 0, m21: 0, m22: -0.5, m41: canvas.width - 200, m42: canvas.height - 50 });
    // ctx.beginPath(); ctx.fillRect(0, 0, 200, 75); ctx.clip();
    ctx.beginPath();
    ctx.moveTo(0, Wmax[0]);
    for (let i = 1; i < Wmax.length; i++) {
      ctx.lineTo(i, Wmax[i]);
    }
    ctx.strokeStyle = 'rgba(0,128,64,1)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

  //}
*/

  // Render the ball sink containing all pocketed balls
  /*
  ctx.beginPath();
  ctx.fillRect(100, canvas.height - 50, canvas.width - 100, 50);
  ctx.fillStyle = '#ccc';
  ctx.fill();
  const sinkImageData = ctx.getImageData(100, canvas.height - 50, canvas.width - 100, 50);  
  // ballSink.forEach(ball => drawBall(ball, sinkImageData));
  ctx.putImageData(sinkImageData, 100, canvas.height - 50);
  */

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


  stats.end();
  requestAnimationFrame(gameLoop);
}

gameLoop();
