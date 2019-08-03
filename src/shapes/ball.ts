import * as Matter from 'matter-js';
import { Vector3D, Matrix4, mmult4, mmult4all, getRandomAxes, applyTransform, createScalingMatrix, createRotationMatrixX, createRotationMatrixZ } from '../geometry/vector3d';
import { Color, Colors } from '../colors';
import { Constants } from '../constants';
import { Primitives } from '../geometry/primitives';
import { Viewport } from '../viewport';
import { IShape } from './shape';
import { applyTexture } from '../shader';

const { cos, sin, atan2 } = Math;

const ballTextureWidth = 256,
      ballTextureHeight = 128;

// Time step, assumimg 60 fps
const dt = 16.7e-3;

function createBallTexture(value: number, color: Color, ctx: CanvasRenderingContext2D): ImageData {
  const c = `rgb(${color.r},${color.g},${color.b})`;
  const w = ballTextureWidth;
  const h = ballTextureHeight;
  // const r = h / 2 - 32;
  // const hy = (value < 9) ? 0 : 16;
  const r = h / 6;
  const hy = (value < 9) ? 0 : h / 6;
  const drawText = (x: number) => {
    ctx.beginPath();
    ctx.arc(x, h / 2, r, 0, Constants.TWO_PI);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.font = '24pt Trebuchet MS';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000';
    ctx.fillText(value.toString(), x, h / 2 + 4);    
  };
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = c;
  ctx.fillRect(0, hy, w, h - 2 * hy);
  if (value > 0) {
    drawText(0.75 * w);
    drawText(0.25 * w);
  } else {
    ctx.beginPath();
    ctx.arc(0.25 * w, h / 2, r / 2, 0, Constants.TWO_PI);
    ctx.fillStyle = '#ffc0cb';  // pink
    ctx.fill();
  }
  return ctx.getImageData(0, 0, w, h);
}

/*
* Ball colors for eight-ball game:
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

export class Ball implements IShape {

  public readonly isStatic = false;

  /** Angular velocity for a rolling ball (in the direction of the velocity) */
  omega = 0;
  /** Object Coordinate System (OCS), relative to the pool table, dynamic! */
  ocs: Matrix4 = getRandomAxes();
  texture: ImageData;  
  isPocketed: boolean;
  activity: number[] = [];
  modified = false;
  
  constructor(
    public readonly value: number,  // Ball value 0-15
    public readonly radius: number, // Ball radius in [mm]
    public readonly body: Matter.Body
  ) { }
  
  public init(ctx: CanvasRenderingContext2D): void {
    this.omega = 0;
    this.isPocketed = false;
    this.texture = createBallTexture(this.value, ballColors[this.value], ctx);
  }

  public moveTo(x: number, y: number, z: number): Ball {
    // Position is relative to the pool table
    this.ocs.m30 = x;
    this.ocs.m31 = y;
    this.ocs.m32 = z;
    Matter.Body.setPosition(this.body, { x, y });
    return this;
  }

  public isRolling(): boolean {
    return this.body.speed > .5;    
  }

  public isSpinning(): boolean {
    return this.omega > 1;  // ???
  }

  /**
   * Updates the ball's coordinate system based on the velocity of its body as obtained from the physics engine.
   * 
   * Angular velocity:
   *  ds = v * dt
   *  omega = ds / (2*pi*r) * 2*pi / dt = v / r
   * 
   * speed in [m/s], see https://github.com/liabru/matter-js/issues/179
   */
  public update(): void {    
    // Update the ball's position from the physics engine    
    this.ocs.m30 = this.body.position.x;
    this.ocs.m31 = this.body.position.y;
        
    // Angular velocity; scaling by 100 produces a nuch better rolling effect
    this.omega = 100 * this.body.speed / this.radius;

    if (this.body.speed < .1) {
      return;
    }

    // console.log(this.body.velocity);

    // Ball roll axis vector (perpendicular to the linear motion direction on the z-plane)
    const v: Vector3D = {
      x: -this.body.speed * this.body.velocity.y,
      y: this.body.speed * this.body.velocity.x,
      z: 0
    };

    // Rotate about the z-axis such that the vector v coinsides with the x-axis
    const theta = -atan2(v.y, v.x);
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
    
    // Rotation about the x-axis for the ROLL effect
    const alpha = this.omega * dt;
    const Troll = createRotationMatrixX(alpha);

    // Rotation about the z-axis for the SPIN effect
    const phi = 100 * this.body.angularVelocity * dt;
    const Tspin = createRotationMatrixZ(phi);

    // Compute the total transformation and apply it to the OCS
    const T = mmult4all([ Rz, Troll, Rzinv, Tspin ]);
    this.ocs = mmult4(this.ocs, T);

    this.ocs.m30 = this.body.position.x;
    this.ocs.m31 = this.body.position.y;
    this.ocs.m32 = this.radius;
  }

  /** Renders a ball into a viewport's pixel buffer */
  public render(vp: Viewport, T: Matrix4): void {
    if (this.isPocketed) {
      return;
    }
    const S = createScalingMatrix(this.radius);
    const scaler = (v: Vector3D) => applyTransform(v, S);
    applyTexture(vp, Primitives.Sphere, this.texture, T, scaler);
  }
}
