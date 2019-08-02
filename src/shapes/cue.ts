import * as Matter from 'matter-js';
import { Geometry } from '../geometry/geometry';
import { IShape } from './shape';
import { Matrix4, createScalingMatrix, createRotationMatrixX, mmult4, createRotationMatrixZ, Vector3D, normalizeVector, crossProduct, dot } from '../geometry/vector3d';
import { Viewport } from '../viewport';
import { Constants } from '../constants';
import { Primitives } from '../geometry/primitives';
import { applyTexture } from '../shader';
import { Ball } from './ball';
import { constrain } from '../utils';
import { PoolTable } from './pool-table';

const { acos, cos, sign, sin, floor } = Math;

const MAX_STROKE_DIST = 200;
const WARMUP_STROKE_PERIOD = 1000;
const timestep = 50;
const forceImpulse = new Array(5).fill(0).map((v, i) => floor(255 * sin(Constants.PI * ((i - 2) / 2 + 1) / 2)));

export interface CueParams {
  length: number;
  tipRadius: number;
  buttRadius: number;
  mass: number;
};

export enum CueState {
  AIMING,
  STROKING
};

export class Cue implements IShape {

  public readonly isStatic = false;
  public readonly modified = false;
  public readonly geometry: Geometry;
  public texture: ImageData;
  
  public strokeDist = 0;
  public strokeSpeed = 0;
  public state: CueState = CueState.AIMING;

  private strokeStep = 0;
  private strokeDir: Matter.Vector;
  private strokeForce: number;

  private warmup = false;
  private warmupStrokeTime = 0;  
  private accumulator = 0;
  private lastTime = NaN;
  
  /** Object Coordinate System, relative to the pool table */
  ocs: Matrix4 = {
    m00: 1, m01: 0, m02: 0, m03: 0,
    m10: 0, m11: 1, m12: 0, m13: 0,
    m20: 0, m21: 0, m22: 1, m23: 0,
    m30: 0, m31: 0, m32: 0, m33: 1
  };

  constructor(
    private readonly poolTable: PoolTable,
    private readonly cueBall: Ball,
    public readonly params: CueParams
  ) {
    // Truncated cone along the z-axis
    // x = 1 corresponds to the cue's butt radius and z = 1 corresponds to the cue length
    this.geometry = Primitives.Cone.create(params.tipRadius / params.buttRadius);
    // Apply scaling
    const S = createScalingMatrix(params.buttRadius, params.buttRadius, params.length);
    this.geometry.transform(S);

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

  init(ctx: CanvasRenderingContext2D): void {
    const T = createRotationMatrixX(-91 * Constants.D2R);
    this.ocs = mmult4(this.ocs, T);
    this.moveTo(800, 200, 500);

    // console.log('Cue Transform:', this.ocs);

    const w = 64;
    const h = 256;

    // TODO: Create texture...
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgb(64,224,208)';    
    ctx.fillRect(0, h-10, w, 10);
    
    this.texture = ctx.getImageData(0, 0, w, h);
  }
  
  public moveTo(x: number, y: number, z: number): Cue {
    // Position is relative to the pool table
    this.ocs.m30 = x;
    this.ocs.m31 = y;
    this.ocs.m32 = z;
    return this;
  }

  rotateZ(angle: number): IShape {
    const O: Vector3D = {
      x: this.ocs.m30,
      y: this.ocs.m31,
      z: this.ocs.m32
    };
    this.ocs.m30 = 0;
    this.ocs.m31 = 0;
    this.ocs.m32 = 0;
    const T = createRotationMatrixZ(angle);
    this.ocs = mmult4(this.ocs, T);
    this.ocs.m30 = O.x;
    this.ocs.m31 = O.y;
    this.ocs.m32 = O.z;
    return this;
  }

  /** Aiming of the cue; re-orients the cue and initiates the warm-up motion back and forth along the cue's z-axis */
  public aimAt(target: Vector3D): void {
    if (!target) {
      this.state = CueState.AIMING;
      this.warmup = false;
      return;
    }
    const zAxis: Vector3D = {
      x: this.ocs.m20,
      y: this.ocs.m21,
      z: this.ocs.m22
    };
    // const theta = Constants.HALF_PI - acos(dot(zAxis, { x: 0, y: 0, z: -1 }));  // angle between the cue's z-axis and the pool table's xy-plane
    const cueBallPos: Vector3D = { x: this.cueBall.ocs.m30, y: this.cueBall.ocs.m31, z: 0 };
    const v: Vector3D = normalizeVector({ x: target.x - cueBallPos.x, y: target.y - cueBallPos.y, z: 0 });
    const cueDir: Vector3D = normalizeVector({ x: this.ocs.m20, y: this.ocs.m21, z: 0 });
    const w = crossProduct(cueDir, v);
    const cosPhi = constrain(dot(cueDir, v), -1, 1);
    const phi = sign(w.z) * acos(cosPhi);
    const a = this.cueBall.radius + this.strokeDist + this.params.length;
    const cueX = cueBallPos.x - a * v.x;
    const cueY = cueBallPos.y - a * v.y;
    const cueZ = this.ocs.m32;
    this.moveTo(cueX - this.cueBall.ocs.m30, cueY - this.cueBall.ocs.m31, 0);
    this.rotateZ(phi);
    this.moveTo(cueX, cueY, cueZ);
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
    this.strokeDir = { x: this.ocs.m20, y: this.ocs.m21 };
    this.strokeForce = 1.0 * this.strokeDist;
    this.strokeStep = 0;
    console.log('Stroking', this.strokeForce);
  }

  /** Updates the warm-up stroke speed and distance */
  public update(time: number): void {
    switch (this.state) {
      case CueState.AIMING:
        if (!isNaN(this.lastTime)) {
          this.accumulator += time - this.lastTime;
          const omega = Constants.TWO_PI / WARMUP_STROKE_PERIOD;
          const n = floor(this.accumulator / timestep);
          this.warmupStrokeTime += n * timestep;
          this.accumulator -= n * timestep;
          this.strokeDist = 0.5 * MAX_STROKE_DIST * (1 + cos(omega * this.warmupStrokeTime));
        }
        this.lastTime = time;
        break;

      case CueState.STROKING:
        if (this.strokeStep < forceImpulse.length) {
          // Apply force pulse
          const force = Matter.Vector.mult(this.strokeDir, (this.strokeForce * forceImpulse[this.strokeStep]) >> 8);
          Matter.Body.applyForce(this.cueBall.body, this.cueBall.body.position, force);
          // console.log('Applied force:', this.strokeDist, force);
          this.strokeStep += 1;
        } else {
          if (this.poolTable.hasSettled()) {
            this.state = CueState.AIMING;
          }
        }
        break;
    }
  }

  /** Renders a cue into a viewport's pixel buffer */
  public render(vp: Viewport, T: Matrix4): void {
    if (this.state === CueState.AIMING) {
      applyTexture(vp, this.geometry, this.texture, T);
    }
  }
}
