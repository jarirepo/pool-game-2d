import * as Matter from 'matter-js';
import { mmult } from './vector3d';

// https://github.com/liabru/matter-js/issues/559
// window['decomp'] = require('poly-decomp');
import * as decomp from 'poly-decomp';
window['decomp'] = decomp;

const { PI } = Math;
const TWO_PI = 2 * PI;
const HALF_PI = PI / 2;

export class PoolTable {
  width: number;
  egdeWidth: number;
  footSpotPos = { x: 1 / 2, y: 1 / 4 };   // ball rack position on the pool table
  cueBallLinePos = 3 / 4;                 // cue-ball line position on the pool table
  imgData: ImageData;
  boundary: Path2D;
  edgeSegments: Matter.Body[];
  pockets: Matter.Body[];

  constructor(
    public readonly length: number,
    public readonly pocketRadius: number,
    public readonly options: Matter.IBodyDefinition
  ) {
    this.width = this.length / 2;
    this.egdeWidth = this.pocketRadius / 3;
    const R90 = [ [ 0, 1, 0 ], [ -1, 0, 0 ], [ 0, 0, 1 ] ];
    const P1 = [
      [ this.pocketRadius, 0, 1 ],
      [ this.width - pocketRadius, 0, 1 ],
      [ this.width - 1.5 * this.pocketRadius, this.egdeWidth, 1 ],
      [ 1.5 * this.pocketRadius, this.egdeWidth, 1]
    ];
    const P2 = mmult(P1, R90);
    const P3 = mmult(P2, R90);
    const P4 = mmult(P3, R90);
    // console.log(P1, P1.length);
    const vertexSets1: Matter.Vector[][] = [ P1.map<Matter.Vector>(p => ({ x: p[0], y: p[1] })) ];
    const vertexSets2: Matter.Vector[][] = [ P2.map<Matter.Vector>(p => ({ x: p[0], y: p[1] })) ];
    const vertexSets3: Matter.Vector[][] = [ P3.map<Matter.Vector>(p => ({ x: p[0], y: p[1] })) ];
    const vertexSets4: Matter.Vector[][] = [ P4.map<Matter.Vector>(p => ({ x: p[0], y: p[1] })) ];
    this.edgeSegments = [
      Matter.Bodies.fromVertices(0, 0, vertexSets1, this.options),
      Matter.Bodies.fromVertices(0, 0, vertexSets2, this.options),
      Matter.Bodies.fromVertices(0, 0, vertexSets2, this.options),
      Matter.Bodies.fromVertices(0, 0, vertexSets3, this.options),
      Matter.Bodies.fromVertices(0, 0, vertexSets4, this.options),
      Matter.Bodies.fromVertices(0, 0, vertexSets4, this.options)
    ];
    // console.log(tableSegments[0].position, tableSegments[0].vertices);
    // Position the table edge segments and add them to the physics world since poly-decomp has translated them to their CoG.
    Matter.Body.setPosition(this.edgeSegments[0], { x: this.width / 2, y: this.egdeWidth / 2 });
    Matter.Body.setPosition(this.edgeSegments[1], { x: this.width - this.egdeWidth / 2, y: 0.25 * this.length });
    Matter.Body.setPosition(this.edgeSegments[2], { x: this.width - this.egdeWidth / 2, y: 0.75 * this.length });
    Matter.Body.setPosition(this.edgeSegments[3], { x: this.width / 2, y: this.length - this.egdeWidth / 2 });
    Matter.Body.setPosition(this.edgeSegments[4], { x: this.egdeWidth / 2, y: 0.25 * this.length });
    Matter.Body.setPosition(this.edgeSegments[5], { x: this.egdeWidth / 2, y: 0.75 * this.length });
    // Path2D, https://developer.mozilla.org/en-US/docs/Web/API/Path2D/Path2D
    this.boundary = new Path2D();
    this.boundary.moveTo(pocketRadius, 0);
    this.boundary.lineTo(this.width - pocketRadius, 0);
    this.boundary.arc(this.width - pocketRadius, pocketRadius, pocketRadius, -HALF_PI, 0);
    this.boundary.lineTo(this.width, this.length - pocketRadius);
    this.boundary.arc(this.width - pocketRadius, this.length - pocketRadius, pocketRadius, 0, HALF_PI);
    this.boundary.lineTo(pocketRadius, this.length);
    this.boundary.arc(pocketRadius, this.length - pocketRadius, pocketRadius, HALF_PI, PI);
    this.boundary.lineTo(0, pocketRadius);
    this.boundary.arc(pocketRadius, pocketRadius, pocketRadius, PI, -HALF_PI);
    // Create pockets (as detectors) which will  trigger collision events, https://github.com/liabru/matter-js/blob/master/examples/sensors.js    
    // this.pockets = [
    //   Matter.Bodies.circle(0, 0, this.pocketRadius, { isSensor: true, isStatic: true, label: 'pocket-1' }),
    //   Matter.Bodies.circle(this.width, 0, this.pocketRadius, { isSensor: true, isStatic: true, label: 'pocket-2' }),
    //   Matter.Bodies.circle(this.width, this.length / 2, this.pocketRadius, { isSensor: true, isStatic: true, label: 'pocket-3' }),
    //   Matter.Bodies.circle(this.width, this.length, this.pocketRadius, { isSensor: true, isStatic: true, label: 'pocket-4' }),
    //   Matter.Bodies.circle(0, this.length, this.pocketRadius, { isSensor: true, isStatic: true, label: 'pocket-5' }),
    //   Matter.Bodies.circle(0, this.length / 2, this.pocketRadius, { isSensor: true, isStatic: true, label: 'pocket-6' }),
    // ];
    this.pockets = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: .5 }, { x: 1, y: 1 }, { x: 0, y: 1 }, { x: 0, y: .5 }]
      .map<Matter.Body>((p, i) => Matter.Bodies.circle(p.x * this.width, p.y * this.length, this.pocketRadius, { isSensor: true, isStatic: true, label: `pocket-${i}` }));
  }

  render(ctx: CanvasRenderingContext2D) {
    // Pool table surface    
    ctx.fillStyle = 'rgba(0,80,0,1)'; 
    ctx.fill(this.boundary);
    // Foot spot (rack position)
    ctx.beginPath();
    ctx.arc(this.width / 2, this.length / 4, 10, 0, TWO_PI);
    ctx.fillStyle = 'rgba(0,64,0,.8)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(this.width / 2, this.length / 4, 5, 0, TWO_PI);
    ctx.fillStyle = 'rgba(0,96,0,1)';
    ctx.fill();
    // Cue-ball line
    ctx.beginPath();
    ctx.moveTo(this.egdeWidth, this.length * 0.75);
    ctx.lineTo(this.width - this.egdeWidth, this.length * 0.75);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,64,0,.8)';
    ctx.stroke();
    // Table edge segments
    ctx.beginPath();
    this.edgeSegments.forEach(segm => {
      ctx.moveTo(segm.vertices[0].x, segm.vertices[0].y);
      for (let k = 1; k < segm.vertices.length; k++) {
        ctx.lineTo(segm.vertices[k].x, segm.vertices[k].y);
      }
    });
    ctx.fillStyle = 'green';
    ctx.fill();
    // Pockets
    ctx.beginPath();
    this.pockets.forEach(pocket => {
      ctx.moveTo(pocket.position.x + this.pocketRadius,pocket.position.y);
      ctx.arc(pocket.position.x, pocket.position.y, this.pocketRadius, 0, TWO_PI);
      ctx.fillStyle = '#000';
    });
    ctx.fill();
  }
}
