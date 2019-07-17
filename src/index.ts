import * as Matter from 'matter-js';
import * as Stats from 'stats.js';

const stats = new Stats();
stats.showPanel( 0 ); // fps
stats.dom.style.position = 'relative';
document.querySelector('#stats').appendChild(stats.dom);

const { Engine, Render, World, Bodies } = Matter;
const engine = Engine.create();
// const render = Render.create({ element: document.body, engine });

// create two boxes and a ground
const boxA = Bodies.rectangle(400, 200, 80, 80);
const boxB = Bodies.rectangle(450, 50, 80, 80);
var ground = Bodies.rectangle(400, 610, 810, 60, { isStatic: true });

World.add(engine.world, [boxA, boxB, ground]);

Engine.run(engine);
//Render.run(render);

function animate(time = 0) {
  stats.begin();

  // ...
  
  stats.end();
  requestAnimationFrame(animate);
}

animate();
