import * as Matter from 'matter-js';
import { ShadowCategory } from '../constants';
import { Matrix4 } from '../geometry/vector3d';
import { Viewport } from '../viewport';
import { IShape, ShadowFilter } from './shape';
import { Ball } from './ball';

export interface PocketParams {
  radius: number;
}

export class Pocket implements IShape {

  public readonly isStatic = true;
  public readonly visible = true;
  public readonly canCastShadow = false;
  public readonly shadowFilter: ShadowFilter = {
    category: ShadowCategory.TABLE,
    mask: 0 // pockets do not receive any shadows
  };
  // Object Coordinate System, relative to the pool table
  public readonly ocs: Matrix4 = {
    m00: 1, m01: 0, m02: 0, m03: 0,
    m10: 0, m11: 1, m12: 0, m13: 0,
    m20: 0, m21: 0, m22: 1, m23: 0,
    m30: 0, m31: 0, m32: 0, m33: 1
  };

  public readonly modified = false;
  
  constructor(public readonly params: PocketParams, public readonly body: Matter.Body) { }
  
  public moveTo(x: number, y: number, z: number): Pocket {
    // Position is relative to the pool table
    this.ocs.m30 = x;
    this.ocs.m31 = y;
    this.ocs.m32 = z;
    Matter.Body.setPosition(this.body, { x, y });
    return this;
  }

  public isBallInside(ball: Ball): boolean {
    // Determine if the collision is just a "touch" or if the ball is "inside" the pocket
    // by measuring the ball's distance from the pocket center
    const dx = this.body.position.x - ball.body.position.x;
    const dy = this.body.position.y - ball.body.position.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < this.params.radius * this.params.radius) {
      ball.isPocketed = true;
      return true;
    }
    return false;
  }
  
  public render(vp: Viewport): void {
    // vp.context.beginPath();
    // vp.context.arc(0, 0, this.params.radius, 0, Constants.TWO_PI);
    // vp.context.fillStyle = '#111';
    // vp.context.fill();
  }
}
