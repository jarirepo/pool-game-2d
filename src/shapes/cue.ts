import { Geometry } from '../geometry/geometry';
import { IShape } from './shape';
import { Matrix4, createScalingMatrix, createRotationMatrixX, mmult4 } from '../geometry/vector3d';
import { Viewport } from '../viewport';
import { Constants } from '../constants';
import { Primitives } from '../geometry/primitives';
import { applyTexture } from '../shader';

export interface CueParams {
  length: number;
  tipRadius: number;
  buttRadius: number;
  mass: number;
};

export class Cue implements IShape {

  public readonly isStatic = false;
  public readonly modified = false;
  public readonly geometry: Geometry;
  public texture: ImageData;

  /** Object Coordinate System, relative to the pool table */
  ocs: Matrix4 = {
    m00: 1, m01: 0, m02: 0, m03: 0,
    m10: 0, m11: 1, m12: 0, m13: 0,
    m20: 0, m21: 0, m22: 1, m23: 0,
    m30: 0, m31: 0, m32: 0, m33: 1
  };

  constructor(private readonly params: CueParams) {
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
    const T = createRotationMatrixX(-100 * Constants.D2R);
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

  /** Renders a cue into a viewport's pixel buffer */
  public render(vp: Viewport, T: Matrix4): void {
    applyTexture(vp, this.geometry, this.texture, T);
  }
}
