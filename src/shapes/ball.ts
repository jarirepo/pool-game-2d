import * as Matter from 'matter-js';
import { Color, Colors } from '../colors';
import { Constants, CollisionCategory } from '../constants';
import { Primitives } from '../geometry/primitives';
import { Viewport } from '../viewport';
import { IShape } from './shape';
import { applyTexture } from '../shader';
import { Vector3D, Matrix4, applyTransform, createScalingMatrix, normalizeVector } from '../geometry/vector3d';
import { Quaternion } from '../geometry/quaternion';

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
  /** Object Coordinate System (OCS), relative to the pool table */
  ocs: Matrix4;
  texture: ImageData;
  isPocketed: boolean;
  isOutside: boolean;
  activity: number[] = [];
  modified = false;

  public readonly sensor?: Matter.Body;

  constructor(
    public readonly value: number,  // Ball value 0-15
    public readonly radius: number, // Ball radius in [mm]
    public readonly body: Matter.Body
  ) {
    if (this.value === 0) {
      // The sensor will be moving with the cue-ball and is used to detect collisions with other balls
      const sensorOptions: Matter.IBodyDefinition = {
        label: 'cueball-sensor',        
        isSensor: true, 
        isStatic: false,
        collisionFilter: {
          group: -1,
          category: CollisionCategory.CUEBALL,
          mask: CollisionCategory.BALL
        }
      };
      // this.sensor = Matter.Bodies.circle(0, 0, this.radius + 15, sensorOptions);
      this.sensor = Matter.Bodies.circle(0, 0, this.radius, sensorOptions);
    }
  }
  
  public init(ctx: CanvasRenderingContext2D): void {
    this.omega = 0;
    this.isPocketed = false;
    this.isOutside = false;
    this.ocs = Quaternion.createRandomRotationMatrix();
    this.texture = createBallTexture(this.value, ballColors[this.value], ctx);
  }

  public moveTo(x: number, y: number, z: number): Ball {
    // Position is relative to the pool table
    this.ocs.m30 = x;
    this.ocs.m31 = y;
    this.ocs.m32 = z;
    Matter.Body.setPosition(this.body, { x, y });
    if (this.value === 0) {
      Matter.Body.setPosition(this.sensor, { x, y });
    }
    return this;
  }

  public isRolling(): boolean {
    return this.body.speed > .1;    
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
    this.moveTo(this.body.position.x, this.body.position.y, this.radius);
        
    // Angular velocity; scaling by 100 produces a nuch better rolling effect
    this.omega = 100 * this.body.speed / this.radius;

    if (this.body.speed < .01) {
      return;
    }

    // console.log(this.body.velocity);

    // Apply rolling and spinning to this ball
    // This solution uses quaternions for the rotation of ball's coordinate axes.
    
    // Ball roll axis vector (perpendicular to the linear motion direction on the z-plane)
    // This must be normalized to create a valid rotation quaternion.
    // Note that this vector -> 0 when speed -> 0
    const v: Vector3D = normalizeVector({
      x: -this.body.speed * this.body.velocity.y,
      y: this.body.speed * this.body.velocity.x,
      z: 0
    });

    const rollAngle = this.omega * dt;
    const spinAngle = 100 * this.body.angularVelocity * dt;

    // Create quaternions for the roll-axis and spin-axis
    const rollAxis = Quaternion.forAxis(v, rollAngle);
    const spinAxis = Quaternion.forAxis({ x: 0, y: 0, z: 1 }, spinAngle);

    // Combined rotation quaternion (r) equivalent for the rolling and spinning
    const r = rollAxis.multiply(spinAxis);

    // Create the quaternions for the coordinates axes for this ball, applies the rotation quaternion and get the resulting vectors
    const vx = Quaternion.forVector({ x: this.ocs.m00, y: this.ocs.m01, z: this.ocs.m02 }).rotate(r).toVector(),
          vy = Quaternion.forVector({ x: this.ocs.m10, y: this.ocs.m11, z: this.ocs.m12 }).rotate(r).toVector(),
          vz = Quaternion.forVector({ x: this.ocs.m20, y: this.ocs.m21, z: this.ocs.m22 }).rotate(r).toVector();
          
    // Update the OCS with the rotated x,y,z-axis
    this.ocs.m00 = vx.x; this.ocs.m01 = vx.y; this.ocs.m02 = vx.z;
    this.ocs.m10 = vy.x; this.ocs.m11 = vy.y; this.ocs.m12 = vy.z;
    this.ocs.m20 = vz.x; this.ocs.m21 = vz.y; this.ocs.m22 = vz.z;

    /*
    // This is the correspoding matrix solution for the rolling and spinning of the ball:

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
    */
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
