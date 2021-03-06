import * as Matter from 'matter-js';
import { CollisionCategory, ShadowCategory } from '../constants';
import { Primitives } from '../geometry/primitives';
import { Viewport } from '../viewport';
import { IShape, ShadowFilter, Transform } from './shape';
import { applyTexture } from '../shader';
import { Vector3D, Matrix4, createScalingMatrix, normalizeVector } from '../geometry/vector3d';
import { Quaternion } from '../geometry/quaternion';
import { Geometry } from '../geometry/geometry';

// Time step, assumimg 60 fps
const dt = 16.7e-3;

export class Ball implements IShape {

  public readonly isStatic = false;
  public visible = false;
  public readonly canCastShadow = true;
  public readonly shadowFilter: ShadowFilter = {
    category: ShadowCategory.BALL,
    mask: 0,
    // mask: ShadowCategory.CUE
  };  
  /** Angular velocity for a rolling ball (in the direction of the velocity) */
  omega = 0;
  /** Object Coordinate System (OCS), relative to the pool table */
  ocs: Matrix4;
  isPocketed: boolean;
  isOutside: boolean;
  activity: number[] = [];
  modified = false;
  public readonly geometry: Geometry;

  // Pre-transformation before transforming vertices to screen coords. since all balls share the vertices from the sphere primitive
  pretransform: Matrix4;

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

  public readonly sensor?: Matter.Body;

  constructor(
    public readonly value: number,  // Ball value 0-15
    public readonly radius: number, // Ball radius in [mm]
    public readonly texture: ImageData,
    public readonly body: Matter.Body
  ) {
    this.geometry = Primitives.Sphere;
    this.pretransform = createScalingMatrix(this.radius);

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
  
  public init(): void {
    this.omega = 0;
    this.visible = true;
    this.isPocketed = false;
    this.isOutside = false;
    this.ocs = Quaternion.createRandomRotationMatrix();
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

  public get position(): Vector3D {
    return {
      x: this.ocs.m30,
      y: this.ocs.m31,
      z: this.ocs.m32
    };
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
    const spinAxis = Quaternion.forAxisZ(spinAngle);
    
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
  public render(vp: Viewport): void {
    if (this.isPocketed) {
      return;
    }
    applyTexture(vp, this);
  }
}
