import * as Matter from 'matter-js';
import { Vector3D, Matrix4, mmult4, mmult4all, getRandomAxes } from './vector3d';
import { Color, Colors } from './colors';
import { Constants } from './constants';

const { cos, sin, atan2 } = Math;

const ballTextureWidth = 256,
      ballTextureHeight = 128;

function createBallTexture(value: number, color: Color, ctx: CanvasRenderingContext2D): ImageData {
  const c = `rgb(${color.r},${color.g},${color.b})`;
  const w = ballTextureWidth;
  const h = ballTextureHeight;
  // const r = h / 2 - 32;
  // const hy = (value < 9) ? 0 : 16;
  const r = h / 5;
  const hy = (value < 9) ? 0 : h / 5;
  const drawText = (x: number) => {
    ctx.beginPath();
    ctx.fillStyle = '#fff';
    ctx.arc(x, h / 2, r, 0, Constants.TWO_PI);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillText(value.toString(), x, h / 2 + 4);  
  };
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = c;
  ctx.fillRect(0, hy, w, h - 2 * hy);
  ctx.font = '24pt Trebuchet MS';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';  
  drawText(0.76 * w);
  drawText(0.25 * w);
  return ctx.getImageData(0, 0, w, h);
}

/*
* Ball colors:
 * 0: white (cue-ball)
 * 1: yellow, 2: blue, 3: red, 4: purple, 5: orange, 6: green, 7: brown
 * 8: black
 * 9-15: white with color stripe
 */
const ballColors = {
  0: Colors.WHITE,
  1: Colors.YELLOW,
  2: Colors.BLUE,
  3: Colors.RED,
  4: Colors.PURPLE,
  5: Colors.ORANGE,
  6: Colors.GREEN,
  7: Colors.BROWN,
  8: Colors.BLACK,
  9: Colors.YELLOW,
  10: Colors.BLUE,
  11: Colors.RED,
  12: Colors.PURPLE,
  13: Colors.ORANGE,
  14: Colors.GREEN,
  15: Colors.BROWN
};

export class Ball {

  /**
   * Angular velocity for a rolling ball (in the direction of the linear motion)
   */
  omega = 0;
  
  /**
   * Object Coordinate System (OCS)
   */
  ocs: Matrix4;

  texture: ImageData;  
  isPocketed: boolean;

  constructor(
    public readonly value: number,  // Ball value 0-15
    public readonly radius: number, // Ball radius in [mm]
    public readonly body: Matter.Body
  ) { }
  
  init(ctx: CanvasRenderingContext2D): void {
    this.omega = 0;
    this.isPocketed = false;
    this.ocs = getRandomAxes();
    this.texture = createBallTexture(this.value, ballColors[this.value], ctx);
  }

  isRolling(): boolean {
    return this.body.speed > .5;    
  }

  isSpinning(): boolean {
    return this.omega > 1;  // ???
  }

  /**
   * Angular velocity:
   *  ds = v * dt
   *  omega = ds / (2*pi*r) * 2*pi / dt = v / r
   * 
   * speed in [m/s], see https://github.com/liabru/matter-js/issues/179
   */
  update(): void {
    this.omega = 1e2 * this.body.speed / this.radius; // scaling by 100 produces a nuch better rolling effect!

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
    const v: Vector3D = {
      x: this.body.speed * this.body.velocity.y,
      y: -this.body.speed * this.body.velocity.x,
      z: 0
    };
    // const v: Vector3D = {
    //   x: -this.body.speed * this.body.velocity.y,
    //   y: this.body.speed * this.body.velocity.x,
    //   z: 0
    // };

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
    const phi = 1e2 * this.body.angularVelocity * dt;
    // const phi = 1e3 * this.body.angularSpeed * dt;
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
