import { Constants } from '../constants';
import { Matrix4, mmult4, createRotationMatrixZ } from '../geometry/vector3d';
import { Viewport } from '../viewport';
import { Polyline } from '../geometry/polyline';
import { IShape } from './shape';

const { tan } = Math;

export interface RailCushionParams {
  length?: number;
  width?: number;
  radius?: number;
  clone?: RailCushion;
}

export class RailCushion implements IShape {
  
  public readonly isStatic = true;

  /** Object Coordinate System, relative to the pool table */
  public readonly ocs: Matrix4 = {
    m00: 1, m01: 0, m02: 0, m03: 0,
    m10: 0, m11: 1, m12: 0, m13: 0,
    m20: 0, m21: 0, m22: 1, m23: 0,
    m30: 0, m31: 0, m32: 0, m33: 1
  };

  public readonly polyline: Polyline;
  public readonly boundary: Path2D;
  public readonly modified = false;  

  constructor(public readonly params: RailCushionParams) {
    if (!params.clone) {
      // Filleted rail cushion segment
      // const cushionRadius = this.cushionWidth * 2;  // < approx. max. 3 times the cusion width to prevent error
      const chamferLen = params.width * Constants.SQRT_2;
      const chamferLineLen = params.radius / tan(3 * Constants.PI / 8);
      this.polyline = new Polyline(0, 0)
        .lineTo(params.length, 0)
        .lineTo(params.length - (chamferLen - chamferLineLen) * Constants.SQRT_2 / 2, (chamferLen - chamferLineLen) * Constants.SQRT_2 / 2)
        .arcTo(params.length - params.width - chamferLineLen, params.width)
        .lineTo(params.width + chamferLineLen, params.width)
        .arcTo(params.width - chamferLineLen * Constants.SQRT_2 / 2, params.width - chamferLineLen * Constants.SQRT_2 / 2)
        .close();
      this.boundary = this.polyline.toPath2D();
    } else if (params.clone) {
      // Shared local polyline and boundary objects
      this.polyline = params.clone.polyline;
      this.boundary = params.clone.boundary;
      this.ocs = { ...params.clone.ocs };
    }
  }

  public moveTo(x: number, y: number, z = 0): RailCushion {
    this.ocs.m30 = x;
    this.ocs.m31 = y;
    this.ocs.m32 = z;
    return this;
  }

  public rotateZ(angle: number): RailCushion {
    const T = createRotationMatrixZ(angle);
    const OCS0: Matrix4 = { ...this.ocs, m30: 0, m31: 0, m33: 0 };
    const OCS1 = mmult4(OCS0, T);
    this.ocs.m00 = OCS1.m00;
    this.ocs.m01 = OCS1.m01;
    this.ocs.m10 = OCS1.m10;
    this.ocs.m11 = OCS1.m11;
    return this;
  }

  /** Returns a semi-shallow clone of this object */
  public clone(): RailCushion {
    return new RailCushion({ clone: this });
  }

  public render(vp: Viewport, T: Matrix4): void {
    vp.context.beginPath();
    vp.context.fillStyle = 'green';
    vp.context.fill(this.boundary);
  }
}
