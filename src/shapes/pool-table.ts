import * as Matter from 'matter-js';
import { Constants, CollisionCategory, ShadowCategory } from '../constants';
import { Vector3D, Matrix4, applyTransform } from '../geometry/vector3d';
import { Polyline } from '../geometry/polyline';
import { Pocket } from './pocket';
import { RailCushion } from './rail-cushion';
import { Rack } from '../rack';
import { Ball } from './ball';
import { IShape, ShadowFilter } from './shape';
import { Viewport } from '../viewport';
import { Geometry } from '../geometry/geometry';

// https://github.com/liabru/matter-js/issues/559
// window['decomp'] = require('poly-decomp');
import * as decomp from 'poly-decomp';
window['decomp'] = decomp;

const { tan, random } = Math;

export class PoolTable implements IShape {

  public readonly isStatic = true;
  public readonly modified = false;
  public readonly visible = true;
  public readonly geometry: Geometry;
  public readonly canCastShadow = false;
  public readonly shadowFilter: ShadowFilter = {
    category: ShadowCategory.TABLE,
    mask: ShadowCategory.CUE | ShadowCategory.BALL | ShadowCategory.CUSHION
  };
  width: number;
  
  /** Ball rack position on the pool table */
  footSpot: Vector3D;
  
  /** Cue-ball line location on the pool table */
  cueBallLinePos = 0.25;

  imgData: ImageData;
  boundary: Path2D;
  railCushions: RailCushion[] = [];
  pockets: Pocket[];
  cushionWidth: number;
  cushionBodies: Matter.Body[];
  cushionPaths: Path2D[];

  /** Polyline for the table surface */
  private tablePoly: Polyline;
  
  /** Object Coordinate System, relative to the World Coordinate System (WSC) */
  ocs: Matrix4 = {
    m00: 1, m01: 0, m02: 0, m03: 0,
    m10: 0, m11: 1, m12: 0, m13: 0,
    m20: 0, m21: 0, m22: 1, m23: 0,
    m30: 0, m31: 0, m32: 0, m33: 1
  };

  constructor(
    public readonly rack: Rack,
    public readonly balls: Ball[],
    public readonly length: number,
    public readonly pocketRadius: number,
    public readonly options: Matter.IBodyDefinition
  ) {
    this.width = this.length / 2;
    this.footSpot = {
      x: .5 * this.width,
      y: .75 * this.length,
      z: 0
    };
    this.cushionWidth = this.pocketRadius / 2;  // gives 45 degree angle

    const cushionRadius = this.cushionWidth * 2;  // < approx. max. 3 times the cusion width to prevent error
    const chamferLen = this.cushionWidth * Constants.SQRT_2;
    const chamferLineLen = cushionRadius / tan(3 * Constants.PI / 8);

    if (chamferLineLen > chamferLen) {
      console.log('Rail cushion radius is too large!');
    }

    // Set Object Coordinate System (OCS)
    this.ocs.m00 = 0; this.ocs.m01 = -1; this.ocs.m02 = 0;  // ex: (0,-1,0)
    this.ocs.m10 = 1; this.ocs.m11 = 0; this.ocs.m12 = 0;   // ey: (1,0,0)
    this.ocs.m20 = 0; this.ocs.m21 = 0; this.ocs.m22 = 1;   // ez: (0,0,1)
    this.ocs.m30 = 50; this.ocs.m31 = this.width + 50; this.ocs.m32 = 0;  // origin

    // Polygon for the pool table surface
    // this.tablePoly = new Polyline(this.pocketRadius, 0)
    //   .lineTo(this.width - this.pocketRadius, 0)
    //   .arcTo(this.width, pocketRadius)
    //   .lineTo(this.width, this.length - this.pocketRadius)
    //   .arcTo(this.width - this.pocketRadius, this.length)
    //   .lineTo(this.pocketRadius, this.length)
    //   .arcTo(0, this.length - this.pocketRadius)
    //   .lineTo(0, this.pocketRadius)
    //   .arcTo(this.pocketRadius, 0);

    // Non-convex!
    // this.tablePoly = new Polyline(this.pocketRadius, 0)
    //   .lineTo(this.width - this.pocketRadius, 0)
    //   .setDir(Constants.HALF_PI)
    //   .arcTo(this.width, this.pocketRadius)
    //   .lineTo(this.width, this.length / 2 - this.pocketRadius)
    //   .setDir(Constants.PI)
    //   .arcTo(this.width, this.length / 2 + this.pocketRadius, 6)
    //   .lineTo(this.width, this.length - this.pocketRadius)
    //   .setDir(Constants.PI)
    //   .arcTo(this.width - this.pocketRadius, this.length)
    //   .lineTo(this.pocketRadius, this.length)
    //   .setDir(-Constants.HALF_PI)
    //   .arcTo(0, this.length - this.pocketRadius)
    //   .lineTo(0, this.length / 2 + this.pocketRadius)
    //   .setDir(0)
    //   .arcTo(0, this.length / 2 - this.pocketRadius, 6)
    //   .lineTo(0, this.pocketRadius)
    //   .setDir(0)
    //   .arcTo(this.pocketRadius, 0);

    this.tablePoly = new Polyline(this.pocketRadius, 0)
      .lineTo(this.pocketRadius + this.cushionWidth, this.cushionWidth)
      .lineTo(this.width - this.pocketRadius - this.cushionWidth, this.cushionWidth)
      .lineTo(this.width - this.pocketRadius, 0)
      .setDir(Constants.HALF_PI)
      .arcTo(this.width, this.pocketRadius)
      
      .lineTo(this.width - this.cushionWidth, this.pocketRadius + this.cushionWidth)
      .lineTo(this.width - this.cushionWidth, this.length / 2 - this.cushionWidth - this.pocketRadius)
      .lineTo(this.width, this.length / 2 - this.pocketRadius)
      // .lineTo(this.width, this.length / 2 - this.pocketRadius)
      .setDir(Constants.PI)
      .arcTo(this.width, this.length / 2 + this.pocketRadius, 6)
      .lineTo(this.width, this.length - this.pocketRadius)
      .setDir(Constants.PI)
      .arcTo(this.width - this.pocketRadius, this.length)
      .lineTo(this.pocketRadius, this.length)
      .setDir(-Constants.HALF_PI)
      .arcTo(0, this.length - this.pocketRadius)
      .lineTo(0, this.length / 2 + this.pocketRadius)
      .setDir(0)
      .arcTo(0, this.length / 2 - this.pocketRadius, 6)
      .lineTo(0, this.pocketRadius)
      .setDir(0)
      .arcTo(this.pocketRadius, 0);

    // Create solid polygon (since the pool table can receive shadows)
    console.log('Creating pool table geometry');
    this.geometry = Geometry.fromVertices(this.tablePoly.p.filter((_, i, arr) => i < arr.length - 1));
    console.log('Pool table geometry:', this.geometry);

    this.boundary = this.tablePoly.toPath2D();

    // Rail cushion segment, relative to the pool table.
    // The remaining segments are generated by cloning and a sequence of rotatations and translations.
    let railCushion = new RailCushion({
      length: this.width - 2 * this.pocketRadius,
      width: this.pocketRadius / 2,
      radius: this.pocketRadius
    });
    railCushion.moveTo(this.pocketRadius, 0);
    this.railCushions.push(railCushion);
    for (let i = 0; i < 5; i++) {
      railCushion = railCushion.clone();
      if (i === 0 || i === 2 || i === 3) {
        railCushion.rotateZ(Constants.HALF_PI);
      }
      this.railCushions.push(railCushion);
    }
    // Positioning
    [
      { x: this.pocketRadius, y: 0 },
      { x: this.width, y: this.pocketRadius },
      { x: this.width, y: this.length / 2 + this.pocketRadius },
      { x: this.width - this.pocketRadius, y: this.length },
      { x: 0, y: this.length - this.pocketRadius },
      { x: 0, y: this.length / 2 - this.pocketRadius }
    ]
    .forEach((p, i) => this.railCushions[i].moveTo(p.x, p.y, 30));

    /**
     * Create cushion segment bodies for the physics world
     * The polylines must NOT be closed to prevent the Matter.js collision detector failure.
     * Requires re-positioning since "poly-decomp" has translated them to their CoG.
     */
    this.cushionBodies = this.railCushions.map<Matter.Body>((obj, i) => {
      // Transform vertices to the pool table
      const P = obj.polyline.p
        .filter((p, k) => k < obj.polyline.p.length - 1)
        .map(p => applyTransform(p, obj.ocs))
        .map(p => ({ x: p.x, y: p.y }));
      const cushionOptions: Matter.IBodyDefinition = {
        ...this.options,
        label: `cushion-${i}`,
        collisionFilter: {
          group: -1,  // Two rail cushion segments will never collide
          category: CollisionCategory.CUSHION,
          mask: CollisionCategory.BALL
        }
      };
      const body = Matter.Bodies.fromVertices(0, 0, [ P ], cushionOptions);
      return body;
    });

    // Re-positioning
    const cushionPos: Matter.Vector[] = [
      { x: this.width / 2, y: this.cushionWidth / 2 },
      { x: this.width - this.cushionWidth / 2, y: 0.25 * this.length },
      { x: this.width - this.cushionWidth / 2, y: 0.75 * this.length },
      { x: this.width / 2, y: this.length - this.cushionWidth / 2 },
      { x: this.cushionWidth / 2, y: 0.75 * this.length },
      { x: this.cushionWidth / 2, y: 0.25 * this.length }
    ];
    try {
      for (let i = 0; i < 6; i++) {
        Matter.Body.setPosition(this.cushionBodies[i], cushionPos[i]);
      }  
    } catch ( e ) {
      console.log('Failed to create bodies for cushion segments. Is the rail cushion radius too large?', e);
    }

    // Create rail cushion boundaries (Path2D objects) for rendering
    // Path2D, https://developer.mozilla.org/en-US/docs/Web/API/Path2D/Path2D
    this.cushionPaths = this.cushionBodies.map(body => {
      const path = new Path2D();
      path.moveTo(body.vertices[0].x, body.vertices[0].y);
      for (let i = 1; i < body.vertices.length; i++) {
        path.lineTo(body.vertices[i].x, body.vertices[i].y);
      }
      return path;
    });

    // Create pool table pockets, relative to the pool table.
    // Defined as Matter.js detectors (these will trigger collision events).
    // https://github.com/liabru/matter-js/blob/master/examples/sensors.js
    const pocketPos = [
      { u: 0, v: 0 },
      { u: 1, v: 0 },
      { u: 1, v: .5 },
      { u: 1, v: 1 },
      { u: 0, v: 1 },
      { u: 0, v: .5 }
    ];
    this.pockets = pocketPos
      .map<Vector3D>(p => ({ x: p.u * this.width, y: p.v * this.length, z: 5 }))
      .map<Pocket>((p, i) => {
        const pocketOptions: Matter.IBodyDefinition = {
          label: `pocket-${i}`,
          isSensor: true,
          isStatic: true,
          collisionFilter: {
            group: -1,  // Two pockets will never collide
            category: CollisionCategory.POCKET,
            mask: CollisionCategory.BALL
          }
        };
        const body = Matter.Bodies.circle(p.x, p.y, this.pocketRadius, pocketOptions);
        return new Pocket({ radius: this.pocketRadius}, body).moveTo(p.x, p.y, p.z);                
      });

    console.log('Table surface polyline:', this.tablePoly);
    console.log('Rail cushions:', this.railCushions);
    console.log('Pockets:', this.pockets);
  }

  public init(): void {
    // Stack balls 1-15 in the triangular rack (with the rack's apex at the foot spot)
    this.rack.setup();
    this.rack.slots.forEach(slot => {
      const ball = this.balls[slot.ballId];
      // Ball's position on the pool table
      const Pocs: Vector3D = {
        x: 0.5 * this.width + slot.u * ball.radius,
        y: 0.75 * this.length + slot.v * ball.radius,
        z: ball.radius
      };
      ball.moveTo(Pocs.x, Pocs.y, Pocs.z);
    });
    // Place the cue-ball on the cue-ball line on the pool table
    const cueBall = this.balls.find(ball => ball.value === 0);
    cueBall.moveTo(this.width / 2 + (2 * random() -1) * cueBall.radius, 0.25 * this.length, cueBall.radius);
  }

  /** Returns true if a non-pocketed ball is outside of the pool table surface */
  public isBallOutside(ball: Ball): boolean {
    if (ball.isPocketed) {
      return false;
    }
    if (ball.isOutside) {
      return true;
    }
    // Get ball's position on the pool table's xy-plane
    const p = ball.body.position;
    ball.isOutside = (p.x + ball.radius < 0) || (p.x - ball.radius > this.width) || (p.y + ball.radius < 0) || (p.y - ball.radius > this.length);
    return ball.isOutside;
  }

  public render(vp: Viewport): void {
    // Pool table surface
    vp.context.beginPath();
    vp.context.fillStyle = 'rgba(0,80,0,1)';
    vp.context.fill(this.boundary);
    // Foot spot (rack position)
    vp.context.beginPath();
    vp.context.arc(this.footSpot.x, this.footSpot.y, 12, 0, Constants.TWO_PI);
    vp.context.fillStyle = 'rgba(0,64,0,.8)';
    vp.context.fill();
    vp.context.beginPath();
    vp.context.arc(this.footSpot.x, this.footSpot.y, 6, 0, Constants.TWO_PI);
    vp.context.fillStyle = 'rgba(0,96,0,1)';
    vp.context.fill();
    // Cue-ball line
    vp.context.beginPath();
    vp.context.moveTo(this.cushionWidth, 0.25 * this.length);
    vp.context.lineTo(this.width - this.cushionWidth, 0.25 * this.length);
    vp.context.lineWidth = 6;
    vp.context.strokeStyle = 'rgba(0,64,0,.8)';
    vp.context.stroke();
  }
}
