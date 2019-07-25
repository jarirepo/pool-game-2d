import * as Matter from 'matter-js';
import { Ball } from './ball';
import { Constants } from './constants';

export class Pocket {

  balls: Ball[] = [];

  constructor(public readonly radius: number, public readonly body: Matter.Body) { }

  isBallInside(ball: Ball): boolean {
    // Determine if the collision is just a "touch" or if the ball is "inside" the pocket
    // by measuring the ball's distance from the pocket center
    const dx = this.body.position.x - ball.body.position.x;
    const dy = this.body.position.y - ball.body.position.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < this.radius * this.radius) {
      ball.isPocketed = true;
      console.log(`Ball ${ball.body.id} fell into Pocket ${this.body.id}`);
      return true;
    }
    return false;
  }

  render(ctx: CanvasRenderingContext2D): void {
    ctx.moveTo(this.body.position.x + this.radius, this.body.position.y);
    ctx.arc(this.body.position.x, this.body.position.y, this.radius, 0, Constants.TWO_PI);
    ctx.fillStyle = '#000';
  }
}
