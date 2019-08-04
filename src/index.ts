import * as Matter from 'matter-js';
import * as Stats from 'stats.js';
import { Ball } from './shapes/ball';
import { Rack } from './rack';
import { PoolTable } from './shapes/pool-table';
import { Viewport } from './viewport';
import { Scene } from './scene';
import { Cue, CueState } from './shapes/cue';
import { PoolMonitor } from './pool-monitor';
import { Pocket } from './shapes/pocket';
import { CollisionCategory } from './constants';

const { random } = Math;

const stats = new Stats();
stats.showPanel( 0 ); // fps
stats.dom.style.position = 'relative';
document.querySelector('#stats').appendChild(stats.dom);

const { Engine, World, Bodies } = Matter;
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
 * Create Scene and Viewport
 *****************************************************************************/
const gameScene = new Scene();
const gameView = new Viewport(ctx, gameScene, {
  screen: { xmin: 25, ymin: 25, xmax: canvas.width - 200, ymax: canvas.height - 125 },
  world: { xmin: -50, ymin: -50, xmax: 2300, ymax: 1200 },
  showGrid: true,
  gridSizeX: 50,
  gridSizeY: 50
});

/*****************************************************************************
 * Create balls
 *****************************************************************************/
const ballOptions: Matter.IBodyDefinition = {
  collisionFilter: {
    group: 1, // positive number => two balls will always collide
    category: CollisionCategory.BALL,
    mask: CollisionCategory.CUSHION | CollisionCategory.POCKET | CollisionCategory.CUEBALL
  },
  isStatic: false,
  isSensor: false,
  slop: 0,                        // prevents a ball from sinking into other bodies
  friction: 0,
  frictionAir: .01,
  frictionStatic: .01,
  restitution: .99,
  density: 1.7                    // g/cm^3
};
const ballRadius = 57.15 / 2;     // mm
const ballRadiusTol = 0.127 / 2;  // introduces some imperfection
const balls: Ball[] = [];
const ballSink: Ball[] = [];      // ball sink  (container for all pocketed balls)
for (let i = 0; i < 16; i++) {
  const r = (i === 0) ? 0.9375 * ballRadius : ballRadius + (2 * random() - 1) * ballRadiusTol;  // mm
  let options: Matter.IBodyDefinition = {
    ...ballOptions,
    label: `ball-${i}`
  };
  if (i === 0) {  // Cue-ball
    // Don't allow the cue-ball to collide with the cue-ball sensor!
    options = {
      ...options,
      collisionFilter: {
        ...options.collisionFilter,
        mask: CollisionCategory.CUSHION | CollisionCategory.POCKET
      }
    };
  }
  const b = Bodies.circle(0, 0, r, options);
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
const cue = new Cue(poolTable, cueBall, { length: 1500, tipRadius: 6.5, buttRadius: 15 });
cue.init(ctx);

/*****************************************************************************
 * Add the bodies for the rail cushions, pockets and balls to the physics world
 *****************************************************************************/
World.add(world, poolTable.cushionBodies);
World.add(world, poolTable.pockets.map(pocket => pocket.body));
World.add(world, balls.map(b => b.body));
World.add(world, balls[0].sensor);

/*****************************************************************************
 * Add pool table, pockets, rail cushions, cue and balls to the game scene
 *****************************************************************************/
gameScene
  .add(poolTable)
  .setTransform(poolTable.ocs)
  .add(poolTable.pockets)
  .add(poolTable.railCushions)
  .add(cue.strokeCorridor)
  .add(cue)
  .add(balls);
  
/*****************************************************************************
 * Pool monitor
 *****************************************************************************/
const monitor = new PoolMonitor(poolTable, engine);
document.querySelector('#monitor').appendChild(monitor.dom);

/*****************************************************************************
 * Pool table init
 * - Stacks balls 1-15 in the triangular rack (with the rack's apex at the foot spot)
 * - Positioning of the balls on the pool table
 * - Positioning of the cue-ball on the cue-ball line on the pool table
 *****************************************************************************/
poolTable.init();

gameView.currentAxes = poolTable.ocs;

let dragging = false;

console.log('Rack:', rack);
console.log('Viewport transformation:', gameView.getTransform());
console.log('World bodies:', world);
console.log('Scene shapes:', gameScene.shapes);

/*****************************************************************************
 * Handle keyboard events
 *****************************************************************************/
document.body.addEventListener('keypress', (e: KeyboardEvent) => {
  // console.log(e.key, e.keyCode);
  const M = gameView.mouse.position;
  switch (e.keyCode) {
    case 43:  // '+'
      // gameView.zoomOrigin(1.1);
      // gameView.zoomCenter(1.05);
      gameView.zoomAt(M.x, M.y, 1.05);
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
  }
});

/*****************************************************************************
 * Handle pool game events
 *****************************************************************************/
monitor
.on('settled', data => {
  console.log('Pool table has settled');
  cue.aimAt(null);
})
.on('pocketed', (data: { ball: Ball, pocket: Pocket }) => {
  const { ball, pocket } = data;
  console.log(`Ball ${ball.value} went into pocket ${pocket.body.id}`);
  ballSink.push(ball);
  Matter.Body.setVelocity(ball.body, { x: 0, y: null });
  Matter.Body.setAngularVelocity(ball.body, 0);
  Matter.Body.setPosition(ball.body, {
    x: ballSink.length * 3 * ball.radius,
    y: ball.radius * 1.1
  });
  Matter.World.remove(world, ball.body);
})
.on('outside', (ball: Ball) => {
  console.log(`Ball ${ball.value} is outside of the pool table`);
})
.on('ballision', (balls: Ball[]) => {
  console.log(`Ball ${balls[0].value} collided with ball ${balls[1].value}`);
});

/*****************************************************************************
 * Game loop
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
  
  // Update all non-pocketed balls
  balls.filter(ball => !ball.isPocketed).forEach(ball => ball.update());
  
  // Render game scene
  gameView.render();
  // gameScene.render(gameView);

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
