import * as Matter from 'matter-js';
import { Constants } from '../constants';
import { Matrix4 } from '../vector3d';
import { Viewport } from '../viewport';
import { IShape } from './shape';
import { Ball } from './ball';

export interface PocketParams {
  radius: number;
}

export class Pocket implements IShape {

  public readonly isStatic = true;

  // Object Coordinate System, relative to the pool table
  public readonly ocs: Matrix4 = {
    m00: 1, m01: 0, m02: 0, m03: 0,
    m10: 0, m11: 1, m12: 0, m13: 0,
    m20: 0, m21: 0, m22: 1, m23: 0,
    m30: 0, m31: 0, m32: 0, m33: 1
  }

  public readonly modified = false;
  
  // balls: Ball[] = [];

  constructor(public readonly params: PocketParams, public readonly body: Matter.Body) { }
  
  public isBallInside(ball: Ball): boolean {
    // Determine if the collision is just a "touch" or if the ball is "inside" the pocket
    // by measuring the ball's distance from the pocket center
    const dx = this.body.position.x - ball.body.position.x;
    const dy = this.body.position.y - ball.body.position.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < this.params.radius * this.params.radius) {
      ball.isPocketed = true;
      console.log(`Ball ${ball.body.id} fell into Pocket ${this.body.id}`);
      return true;
    }
    return false;
  }
  
  public render(vp: Viewport, T: Matrix4): void {
    vp.context.beginPath();
    vp.context.arc(0, 0, this.params.radius, 0, Constants.TWO_PI);
    vp.context.fillStyle = '#111';
    vp.context.fill();
  }
}
