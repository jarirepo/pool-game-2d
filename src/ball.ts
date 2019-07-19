import * as Matter from 'matter-js';
import { Vector3D, Matrix4, mmult4, mmult4all } from './vector3d';

const { PI, cos, sin, atan2 } = Math;

export class Ball {

  // Angular velocity for a rolling ball (in the direction of the linear motion)
  omega = 0;

  // Object Coordinate System (OCS)
  ocs: Matrix4 = {
    m00: 1, m01: 0, m02: 0, m03: 0,
    m10: 0, m11: 1, m12: 0, m13: 0,
    m20: 0, m21: 0, m22: 1, m23: 0,
    m30: 0, m31: 0, m32: 0, m33: 1
  }
  
  constructor(
    public readonly id: number,     // Ball id 0-15
    public readonly radius: number, // Ball radius in [mm]
    public readonly body: Matter.Body
  ) { }

  update() {
    /**
     * Angular velocity:
     *  ds = v * dt
     *  omega = ds / (2*pi*r) * 2*pi / dt = v / r
     * 
     * speed in [m/s], see https://github.com/liabru/matter-js/issues/179
     */
    this.omega = 1e3 * this.body.speed / this.radius;

    if (this.body.speed < .1) {
      return;
    }

    /**
     * Time step, assumimg 60 fps
     */
    const dt = 0.0166667;

    /**
     * Find the (ball roll axis) vector perpendicular to the linear motion direction
     */
    // const v: Vector3D = {
    //   x: this.body.speed * this.body.velocity.y,
    //   y: -this.body.speed * this.body.velocity.x,
    //   z: 0
    // };
    const v: Vector3D = {
      x: -this.body.speed * this.body.velocity.y,
      y: this.body.speed * this.body.velocity.x,
      z: 0
    };

    /**
     * Rotate about the z-axis such that the vector v coinsides with the x-axis
     */
    const theta = atan2(v.y, v.x);
    const cosTheta = cos(theta);
    const sinTheta = sin(theta);

    const Rz: Matrix4 = {
      m00: cosTheta, m01: sinTheta, m02: 0, m03: 0,
      m10: -sinTheta, m11: cosTheta, m12: 0, m13: 0,
      m20: 0, m21: 0, m22: 1, m23: 0,
      m30: 0, m31: 0, m32: 0, m33: 1
    };

    const Rzinv: Matrix4 = {
      m00: cosTheta, m01: -sinTheta, m02: 0, m03: 0,
      m10: sinTheta, m11: cosTheta, m12: 0, m13: 0,
      m20: 0, m21: 0, m22: 1, m23: 0,
      m30: 0, m31: 0, m32: 0, m33: 1
    };

    /**
     * Rotation about the x-axis for the roll effect
     */
    const alpha = this.omega * dt;
    const cosAlpha = cos(alpha);
    const sinAlpha = sin(alpha);

    const Troll: Matrix4 = {
      m00: 1, m01: 0, m02: 0, m03: 0,
      m10: 0, m11: cosAlpha, m12: sinAlpha, m13: 0,
      m20: 0, m21: -sinAlpha, m22: cosAlpha, m23: 0,
      m30: 0, m31: 0, m32: 0, m33: 1
    };

    /**
     * Rotation about the z-axis for the spin effect
     */
    const phi = this.body.angularVelocity * dt;
    const cosPhi = cos(phi);
    const sinPhi = sin(phi);

    const Tspin: Matrix4 = {
      m00: cosPhi, m01: sinPhi, m02: 0, m03: 0,
      m10: -sinPhi, m11: cosPhi, m12: 0, m13: 0,
      m20: 0, m21: 0, m22: 1, m23: 0,
      m30: 0, m31: 0, m32: 0, m33: 1
    };

    /**
     * Compute the total transformation and apply it to the OCS
     */
    const T = mmult4all([ Rz, Troll, Rzinv, Tspin ]);
    this.ocs = mmult4(this.ocs, T);
  }
}
