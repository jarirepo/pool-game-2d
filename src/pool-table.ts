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
  edgeSegments: Matter.Body[];
  footSpotPos = { x: 1 / 2, y: 1 / 4 };   // ball rack position on the pool table
  cueBallLinePos = 3 / 4;                 // cue-ball line position on the pool table
  imgData: ImageData;
  boundary: Path2D;

  constructor(
    public readonly length: number,
    public readonly holeRadius: number,
    public readonly options: Matter.IBodyDefinition
  ) {
    this.width = this.length / 2;
    this.egdeWidth = this.holeRadius / 2;
    const R90 = [ [ 0, 1, 0 ], [ -1, 0, 0 ], [ 0, 0, 1 ] ];
    const P1 = [
      [ this.holeRadius, 0, 1 ],
      [ this.width - holeRadius, 0, 1 ],
      [ this.width - 1.5 * this.holeRadius, this.egdeWidth, 1 ],
      [ 1.5 * this.holeRadius, this.egdeWidth, 1]
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
    this.boundary.moveTo(holeRadius, 0);
    this.boundary.lineTo(this.width - holeRadius, 0);
    this.boundary.arc(this.width - holeRadius, holeRadius, holeRadius, -HALF_PI, 0);
    this.boundary.lineTo(this.width, this.length - holeRadius);
    this.boundary.arc(this.width - holeRadius, this.length - holeRadius, holeRadius, 0, HALF_PI);
    this.boundary.lineTo(holeRadius, this.length);
    this.boundary.arc(holeRadius, this.length - holeRadius, holeRadius, HALF_PI, PI);
    this.boundary.lineTo(0, holeRadius);
    this.boundary.arc(holeRadius, holeRadius, holeRadius, PI, -HALF_PI);
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
    /*ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,100,0,1)';
    ctx.stroke();*/
  }
}
