import { IShape } from './shape';
import { Matrix4, Vector3D, subtractVectors, dot, rotateZ } from '../geometry/vector3d';
import { Viewport } from '../viewport';
import { Ball } from './ball';
import { Quaternion } from '../geometry/quaternion';

const { abs, atan2 } = Math;

export class StrokeCorridor implements IShape {

  public readonly isStatic = true;
  public readonly modified = false;
  public visible = false;

  // Object Coordinate System, relative to the pool table
  public readonly ocs: Matrix4 = {
    m00: 1, m01: 0, m02: 0, m03: 0,
    m10: 0, m11: 1, m12: 0, m13: 0,
    m20: 0, m21: 0, m22: 1, m23: 0,
    m30: 0, m31: 0, m32: 0, m33: 1
  };

  private p0: Vector3D;
  private p1: Vector3D;
  private corridorWidth: number;

  constructor() { }

  public show(): void {
    this.visible = true;
  }

  public hide(): void {
    this.visible = false;
  }

  public update(cueDir: Vector3D, balls: Ball[]) {
    const activeBalls = balls.filter(ball => ball.value !== 0 && !ball.isPocketed && !ball.isOutside);
    
    if (activeBalls.length === 0) {
      this.visible = false;
      return;
    }
    
    const cueBall = balls.find(ball => ball.value === 0);

    // Create a rotation quaternion (qz) for rotation about the z-axis
    const theta = atan2(cueDir.y, cueDir.x);
    const qz = Quaternion.forAxis({ x: 0, y: 0, z: 1 }, -theta);

    // Find the closest ball ahead of the cue direction and inside the stroke collision corridor
    let closestBall: Ball = null;
    let minDist = 1e6;

    for (let ball of activeBalls) {
      const u = subtractVectors(ball.position, cueBall.position);
      const a = dot(cueDir, u);
      if (a > 0 && a < minDist) {
        const qu = Quaternion.forVector(u);
        const ur = qu.rotate(qz).toVector();
        const inside = abs(ur.y) < (cueBall.radius + ball.radius);
        if (inside) {
          minDist = a;
          closestBall = ball;
        }
      }
    }
    
    if (closestBall) {
      // Create the geometry for the collision corridor ...
      // console.log(`Ball ${closestBall.value} is inside the cue-ball stroke corridor`);
      this.p0 = cueBall.position;
      this.p1 = {
        x: cueBall.position.x + minDist * cueDir.x,
        y: cueBall.position.y + minDist * cueDir.y,
        z: 0
      };
      this.corridorWidth = 2 * cueBall.radius;
      this.visible = true;
    } else {
      this.visible = false;
    }
  }
  
  public render(vp: Viewport, T: Matrix4): void {
    vp.context.beginPath();
    vp.context.moveTo(this.p0.x, this.p0.y);
    vp.context.lineTo(this.p1.x, this.p1.y);
    vp.context.lineWidth = this.corridorWidth;
    vp.context.strokeStyle = 'rgba(255,255,255,.25)';
    // vp.context.lineCap = 5;
    vp.context.stroke();
  }
}
