import { Vector3D, Matrix4 } from './vector3d';
import { Constants } from '../constants';

const { cos, random, sin, sqrt } = Math;

/** Represents the quaternion: q = a + bi + cj + dk */
export class Quaternion {

  constructor(public readonly a: number, public readonly b: number, public readonly c: number, public readonly d: number) { }

  /** Returns a quaternion for vector v */
  public static forVector(v: Vector3D): Quaternion {
    return new Quaternion(0, v.x, v.y, v.z);
  }

  /** Returns a quaternion for a rotation an angle alpha about vector v */
  public static forAxis(v: Vector3D, alpha: number) {
    const s = sin(alpha / 2);
    return new Quaternion(cos(alpha / 2), v.x * s, v.y * s, v.z * s); 
  }

  /** Returns a randomized orthogonal 4-by-4 rotation matrix from rotations about the x,y,z-axes */
  public static createRandomRotationMatrix(): Matrix4 {
    const alpha = (1 - random()) * Constants.TWO_PI,
          beta = (1 - random()) * Constants.TWO_PI,
          gamma = (1 - random()) * Constants.TWO_PI;
    const qx = Quaternion.forAxis({ x: 1, y: 0, z: 0 }, alpha),
          qy = Quaternion.forAxis({ x: 0, y: 1, z: 0 }, beta),
          qz = Quaternion.forAxis({ x: 0, y: 0, z: 1 }, gamma);
    return qx.multiply(qy).multiply(qz).toMatrix();
  }
  
  /** Returns the conjugate to this quaternion */
  public conjugate(): Quaternion {
    return new Quaternion(this.a, -this.b, -this.c, -this.d);
  }

  /** Returns the magnitude of this quaternion */
  public magnitude(): number {
    return sqrt(this.a * this.a + this.b * this.b + this.c * this.c + this.d * this.d);
  }

  /**
   * Multiplies this quaternion (q1) with another quaternion (q2)
   * 
   *  q = q1 * q2 = (a1 + b1*i + c1*j + d1*k) * (a2 + b2*i + c2*j + d2*k) =
   *  
   *  where
   *    i^2 = j^2 = k^2 = ijk -1
   *    ij = -ji = k
   *    ki = -ik = j
   *    jk = -jk = i
   *  
   *  q = a1*a2 + a1*b2*i + a1*c2*j + a1*d2*k + 
   *      a2*b1*i + b1*b2*i^2 + b1*c2*i*j + b1*d2*i*k +
   *      a2*c1*j + b2*c1*j*i + c1*c2*j^2 + c1*d2*j*k +
   *      a2*d1*k + b2*d1*k*i + c2*d1*k*j + d1*d2*k^2 =
   *      
   *      a1*a2 - b1*b2 - c1*c2 - d1*d2 +
   *      (a1*b2 + b1*a2 + c1*d2 - d1*c2) * i + 
   *      (a1*c2 - b1*d2 + c1*a2 + d1*b2) * j +
   *      (a1*d2 + b1*c2 - c1*b2 + d1*a2) * k
   */
  public multiply(q: Quaternion): Quaternion {
    return new Quaternion(
      this.a * q.a - this.b * q.b - this.c * q.c - this.d * q.d,
      this.a * q.b + this.b * q.a + this.c * q.d - this.d * q.c,
      this.a * q.c - this.b * q.d + this.c * q.a + this.d * q.b,
      this.a * q.d + this.b * q.c - this.c * q.b + this.d * q.a
    );
  }

  /** Rotates this quaternion about the axis and angle represented by quaternion q */
  public rotate(q: Quaternion): Quaternion {
    return q.multiply(this).multiply(q.conjugate());
  }

  public toVector(): Vector3D {
    return { x: this.b, y: this.c, z: this.d };
  }
  
  /** Returns the orthogonal 4x4-matrix corresponding to this quaternion */
  public toMatrix(): Matrix4 {
    const a2 = this.a * this.a,
          b2 = this.b * this.b,
          c2 = this.c * this.c,
          d2 = this.d * this.d,
          ab = this.a * this.b,
          ac = this.a * this.c,
          ad = this.a * this.d,
          bc = this.b * this.c,
          bd = this.b * this.d,
          cd = this.c * this.d;
    return {
      m00: a2 + b2 - c2 - d2,
      m01: 2 * (bc - ad),
      m02: 2 * (bd + ac),
      m03: 0,
      m10: 2 * (bc + ad),
      m11: a2 - b2 + c2 - d2,
      m12: 2 * (cd - ab),
      m13: 0,
      m20: 2 * (bd - ac),
      m21: 2 * (cd + ab),
      m22: a2 - b2 - c2 + d2,
      m23: 0,
      m30: 0,
      m31: 0,
      m32: 0,
      m33: 1
    };
  }
}
