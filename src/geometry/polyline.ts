import { Vector3D, createRotationMatrixZ, applyTransform, angleXY, rotationDirectionXY } from './vector3d';

const { sqrt, cos, sin } = Math;

/**
 * Helper class to allow generating complex shapes
 */
export class Polyline {
  /** Generated vertices */
  public readonly p: Vector3D[] = [];

  /** Last defined direction */
  public readonly v: Vector3D = { x: 0, y: 0, z: 0 };

  constructor(x = 0, y = 0, z = 0) {
    this.p.push({ x, y, z});
  }

  public lineTo(x: number, y: number, z = 0): Polyline {
    // console.log('lineTo');
    const d: Vector3D = {
      x: x - this.p[this.p.length - 1].x,
      y: y - this.p[this.p.length - 1].y,
      z: z - this.p[this.p.length - 1].z
    };
    this.p.push({ x, y, z });
    const m = sqrt(d.x * d.x + d.y * d.y + d.z * d.z);
    this.v.x = d.x / m;
    this.v.y = d.y / m;
    this.v.z = d.z / m;
    return this;
  }

  /**
   * Generate an arc that continues in the last defined direction to the specified endpoint (x,y)
   * 
   * Based on the Circle Spline formulation which doesn't require evaluation of the center point
   * and radius,
   * 
   * http://citeseerx.ist.psu.edu/viewdoc/download?doi=10.1.1.87.3282&rep=rep1&type=pdf
   */
  public arcTo(x: number, y: number, numseg = 3): Polyline {
    // console.log('arcTo');
    if (this.v.x === 0 && this.v.y === 0 && this.v.z === 0) {
      console.log('Invalid direction vector');
      return this;
    }
    /**
     * Set p0 as the origin
     * Rotate point p1 and vector v about the z-axis to let p1=(x1,y1) coinside with the x-axis
     */    
    const p0 = this.p[ this.p.length-1 ];
    const p1: Vector3D = { x: x - p0.x, y: y - p0.y, z: 0 };
    const rz = angleXY(p1);
    const T = createRotationMatrixZ(-rz);
    const a = applyTransform(p1, T);
    const t0 = applyTransform(this.v, T);
    const b = a.x;
    const tau = angleXY(t0);
    const sgn = rotationDirectionXY(t0, a);
    const dtau = sgn * tau / numseg;
    const T2 = createRotationMatrixZ(dtau);
    const T3 = createRotationMatrixZ(rz);
    let tu = t0;

    for (let i = 0; i < numseg; i++) {
      tu = applyTransform(tu, T2);
      const u = (i + 1) / numseg;
      const ru = b * sin(u * tau) / sin(tau);
      const phiu = (1 - u) * tau;
      const pu: Vector3D = { x: ru * cos(phiu), y: ru * sin(phiu), z: 0 };
      const pt = applyTransform(pu, T3);
      pt.x += p0.x;
      pt.y += p0.y;
      this.p.push(pt);
    }

    // console.log({ x, y, a, t0, b, tau: tau * Constants.R2D, dtau: dtau * Constants.R2D, tu, p: this.p[this.p.length-1] })
    
    // Update endpoint direction vector
    const te = applyTransform(tu, T3);
    this.v.x = te.x;
    this.v.y = te.y;
    this.v.z = te.z;
    return this;
  }

  setDir(v: Vector3D | number): Polyline {
    if (typeof(v) === 'number') {
      this.v.x = cos(v);
      this.v.y = sin(v);
      this.v.z = 0;
    } else {
      this.v.x = v.x;
      this.v.y = v.y;
      this.v.z = v.z;
    }
    return this;
  }

  close(): Polyline {
    this.lineTo(this.p[0].x, this.p[0].y);
    this.v.x = NaN;
    this.v.y = NaN;
    this.v.z = NaN;
    return this;
  }

  /** Returns a Path2D object from the generated vertices */
  toPath2D(): Path2D {
    if (this.p.length < 2) {
      return null;
    }
    const path = new Path2D();
    path.moveTo(this.p[0].x, this.p[0].y);
    for (let i = 0; i < this.p.length; i++) {
      path.lineTo(this.p[i].x, this.p[i].y);
    }
    return path;
  }
}
