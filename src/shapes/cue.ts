import * as Matter from 'matter-js';
import { Geometry } from '../geometry/geometry';
import { IShape, ShadowFilter, Transform } from './shape';
import { Matrix4, createScalingMatrix, createRotationMatrixX, mmult4, Vector3D, normalizeVector, crossProduct, dot, scaleVector } from '../geometry/vector3d';
import { Viewport } from '../viewport';
import { Constants, ShadowCategory } from '../constants';
import { Primitives } from '../geometry/primitives';
import { applyTexture } from '../shader';
import { Ball } from './ball';
import { constrain } from '../utils';
import { PoolTable } from './pool-table';
import { Quaternion } from '../geometry/quaternion';
import { StrokeCorridor } from './stroke-corridor';

const { acos, cos, sign, sin, floor } = Math;

const MAX_STROKE_DIST = 200;
const WARMUP_STROKE_PERIOD = 1000;
const timestep = 50;
const forceImpulse = new Array(5).fill(0).map((v, i) => sin(Constants.PI * ((i - 2) / 2 + 1) / 2));
const OMEGA = Constants.TWO_PI / WARMUP_STROKE_PERIOD;

function warmupStrokeDist(t: number): number {
  return 0.5 * MAX_STROKE_DIST * (1 + cos(OMEGA * t));
}

interface StrokeForceParams {
  strokeDistance: number;
}

function strokeForce(params: StrokeForceParams): number {
  return 1.1 * params.strokeDistance;
}

export interface CueParams {
  length: number;
  tipRadius: number;
  buttRadius: number;
};

export enum CueState {
  AIMING,
  STROKING
};

export class Cue implements IShape {

  public readonly isStatic = false;
  public readonly modified = false;
  public readonly canCastShadow = true;
  public readonly shadowFilter: ShadowFilter = {
    category: ShadowCategory.CUE,
    mask: 0
  };
  public visible = false;

  public readonly geometry: Geometry;
  
  public strokeDist = 0;
  public strokeSpeed = 0;
  public state: CueState = CueState.AIMING;

  private strokeStep = 0;
  private strokeDir: Vector3D;
  private strokeForce: number;

  private warmup = false;
  private warmupStrokeTime = 0;  
  private accumulator = 0;
  private lastTime = NaN;

  public readonly strokeCorridor: StrokeCorridor;

  // public readonly sensor: Matter.Body;

  /** Object Coordinate System, relative to the pool table */
  ocs: Matrix4 = {
    m00: 1, m01: 0, m02: 0, m03: 0,
    m10: 0, m11: 1, m12: 0, m13: 0,
    m20: 0, m21: 0, m22: 1, m23: 0,
    m30: 0, m31: 0, m32: 0, m33: 1
  };

  // Attributes set when rendering the scene
  transform?: Transform;
  /** Total transformation to screen coords. */
  T?: Matrix4;
  /** Transformed vertices to screen coords. */
  Pscr?: Vector3D[];
  /** Transformed face normals to screen coords. */
  Nscr?: Vector3D[];
  /** Transformed vertex normals to screen coords. */
  Vscr?: Vector3D[];

  constructor(
    private readonly poolTable: PoolTable,
    private readonly cueBall: Ball,
    public readonly params: CueParams,
    public readonly texture: ImageData,
  ) {
    // Create a truncated cone along the z-axis
    // x = 1 corresponds to the cue's butt radius and z = 1 corresponds to the cue length
    this.geometry = Primitives.Cone.create(params.tipRadius / params.buttRadius);
    const T = createScalingMatrix(params.buttRadius, params.buttRadius, params.length);
    this.geometry.transform(T);

    this.strokeCorridor = new StrokeCorridor();
    
    // const P = new Polyline(0, 0, 0)
    //   .lineTo(params.buttRadius, 0, 0)
    //   .lineTo(params.tipRadius, 0, params.length)
    //   .lineTo(0, 0, params.length)
    //   .p;
    
    // // Generate surface by a sequence of rotations about the z-axis
    // const NSIZE = 24;
    // const T = createRotationMatrixZ(2 * Constants.PI / NSIZE);
    // const vertices: Vertex[] = P.map<Vertex>(v => ({ ...v, u: NaN, v: NaN, n: null }));

    // for (let i = 0; i < NSIZE; i++) {
    //   for (let j = 0; j < P.length; j++) {
    //     P[j] = applyTransform(P[j], T);
    //   }
    //   vertices.push(...P.map<Vertex>(v => ({ ...v, u: NaN, v: NaN, n: null })));
    // }
  }

  init(): void {
    const T = createRotationMatrixX(-95 * Constants.D2R);
    this.ocs = mmult4(this.ocs, T);
    const target: Vector3D = { x: this.poolTable.width / 2, y: this.poolTable.length / 2, z: 100 };
    const v: Vector3D = { x: 0, y: 1, z: 0 };
    this.orient(target, v, 0);
  }
  
  /** Positions the cue relative to the pool table */
  public moveTo(x: number, y: number, z: number): Cue {
    this.ocs.m30 = x;
    this.ocs.m31 = y;
    this.ocs.m32 = z;
    return this;
  }

  rotateZ(angle: number): IShape {
    // const O: Vector3D = {
    //   x: this.ocs.m30,
    //   y: this.ocs.m31,
    //   z: this.ocs.m32
    // };
    // this.ocs.m30 = 0;
    // this.ocs.m31 = 0;
    // this.ocs.m32 = 0;
    // const T = createRotationMatrixZ(angle);
    // this.ocs = mmult4(this.ocs, T);
    // this.ocs.m30 = O.x;
    // this.ocs.m31 = O.y;
    // this.ocs.m32 = O.z;
    
    const r = Quaternion.forAxisZ(angle),
          vx = Quaternion.forVector({ x: this.ocs.m00, y: this.ocs.m01, z: this.ocs.m02 }).rotate(r).toVector(),
          vy = Quaternion.forVector({ x: this.ocs.m10, y: this.ocs.m11, z: this.ocs.m12 }).rotate(r).toVector(),
          vz = Quaternion.forVector({ x: this.ocs.m20, y: this.ocs.m21, z: this.ocs.m22 }).rotate(r).toVector();
    this.ocs.m00 = vx.x; this.ocs.m01 = vx.y; this.ocs.m02 = vx.z;
    this.ocs.m10 = vy.x; this.ocs.m11 = vy.y; this.ocs.m12 = vy.z;
    this.ocs.m20 = vz.x; this.ocs.m21 = vz.y; this.ocs.m22 = vz.z;
    return this;
  }

  /** Aiming of the cue; re-orients the cue and initiates the warm-up motion back and forth along the cue's z-axis */
  public aimAt(target: Vector3D): void {
    if (!target) {
      this.state = CueState.AIMING;
      this.warmup = false;
      return;
    }

    const cueBallPos: Vector3D = {
      x: this.cueBall.ocs.m30,
      y: this.cueBall.ocs.m31,
      z: 0
    };

    const v: Vector3D = normalizeVector({
      x: target.x - cueBallPos.x,
      y: target.y - cueBallPos.y,
      z: 0
    });

    this.orient(cueBallPos, v, this.cueBall.radius + this.strokeDist);

    this.strokeCorridor.update(v, this.poolTable.balls);
    
    // Start automatic warm-up strokes back and forth
    if (!this.warmup) {
      this.warmup = true;
      this.strokeDist = MAX_STROKE_DIST;
      this.strokeSpeed = 0;
      this.lastTime = NaN;
      this.warmupStrokeTime = 0;
    }
  }

  /** Starts shooting the cue-ball by applying a force to it */
  public stroke(): void {
    this.state = CueState.STROKING;
    this.strokeDir = { x: this.ocs.m20, y: this.ocs.m21, z: 0 };
    // this.strokeForce = 1.25 * this.strokeDist;
    this.strokeForce = strokeForce({ strokeDistance: this.strokeDist });
    this.strokeStep = 0;
    this.strokeCorridor.hide();
  }

  /** Updates the warm-up stroke speed and distance */
  public update(time: number): void {
    switch (this.state) {
      case CueState.AIMING:
        if (!isNaN(this.lastTime)) {
          this.accumulator += time - this.lastTime;
          const n = floor(this.accumulator / timestep);
          this.warmupStrokeTime += n * timestep;
          this.accumulator -= n * timestep;
          this.strokeDist = warmupStrokeDist(this.warmupStrokeTime);
        }
        this.lastTime = time;
        this.visible = true;
        break;

      case CueState.STROKING:
        if (this.strokeStep < forceImpulse.length) {
          // Apply force pulse
          const force = scaleVector(this.strokeDir, this.strokeForce * forceImpulse[this.strokeStep]);
          Matter.Body.applyForce(this.cueBall.body, this.cueBall.body.position, force);
          // console.log('Applied force:', this.strokeDist, force);
          this.strokeStep += 1;
          this.visible = false;
        }
        break;
    }
  }

  /** Renders a cue into a viewport's pixel buffer */
  public render(vp: Viewport): void {
    if (this.state === CueState.AIMING) {
      // this.Vscr[0].x = 0;
      // this.Vscr[0].y = 0;
      // this.Vscr[0].z = 1;
      applyTexture(vp, this);
    }
  }

  /** Positions and orients the cue relative to a distance from a target point on the pool table */
  private orient(target: Vector3D, v: Vector3D, distance: number): void {
    const zAxis: Vector3D = {
      x: this.ocs.m20,
      y: this.ocs.m21,
      z: this.ocs.m22
    };
    // Angle between the cue's z-axis and the pool table's xy-plane
    // const theta = Constants.HALF_PI - acos(constrain(dot(zAxis, { x: 0, y: 0, z: -1 }), -1, 1));
    const theta = Constants.HALF_PI - acos(constrain(-zAxis.z, -1, 1));
    const a = (distance + this.params.length) * cos(theta);
    const cueDir: Vector3D = normalizeVector({
      x: this.ocs.m20,
      y: this.ocs.m21,
      z: 0
    });
    const w = crossProduct(cueDir, v);
    const phi = sign(w.z) * acos(constrain(dot(cueDir, v), -1, 1));
    const cuePos: Vector3D = {
      x: target.x - a * v.x,
      y: target.y - a * v.y,
      z: target.z - a * zAxis.z + 65 // ensures that the cue stays above the balls
    };
    // Rotates the cue about the z-axis with the cue-ball as the center of rotation
    this.moveTo(cuePos.x - target.x, cuePos.y - target.y, cuePos.z - target.x);
    this.rotateZ(phi);
    this.moveTo(cuePos.x, cuePos.y, cuePos.z);
  }
}
