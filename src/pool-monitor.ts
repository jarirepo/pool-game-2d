import * as Matter from 'matter-js';
import { PoolTable } from './shapes/pool-table';
import { EventEmitter } from 'events';

const { abs, atan2, max, sqrt } = Math;

const SETTLING_THRESHOLD = 4;

export interface PoolMonitorOptions {
  width?: number;
  height?: number;
}

/**
 * Monitors the settling of the pool table
 */
export class PoolMonitor extends EventEmitter {

  public readonly dom: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly activity: number[];

  private lastSettlingTime = NaN;

  constructor(
    public readonly poolTable: PoolTable,
    public readonly options: PoolMonitorOptions = { width: 96, height: 48 }
  ) {
    super();
    this.dom = document.createElement('canvas') as HTMLCanvasElement;
    this.dom.setAttribute('position', 'relative');
    this.dom.setAttribute('width', `${options.width}px`);
    this.dom.setAttribute('height', `${options.height}px`);
    this.context = this.dom.getContext('2d') as CanvasRenderingContext2D;
    this.activity = [];
    this.render()
  }

  public hasSettled(): boolean {
    return (this.activity.length > 0)
      ? this.activity[this.activity.length - 1] < SETTLING_THRESHOLD
      : true;
  }

  private render(time?: number) {
    this.update();
    // Plot global activity weights
    if (this.activity.length > 1) {
      this.context.fillStyle = 'rgb(25,25,112)';
      this.context.fillRect(0, 0, this.dom.width, this.dom.height);
      this.context.save();
      this.context.setTransform({ m11: 1, m12: 0, m21: 0, m22: -0.2, m41: 0, m42: this.dom.height - 1 });
      this.context.beginPath();
      this.context.moveTo(0, this.activity[0]);
      for (let i = 1; i < this.activity.length; i++) {
        this.context.lineTo(i, this.activity[i]);
      }
      this.context.strokeStyle = 'cyan';
      this.context.lineWidth = 1;
      this.context.stroke();
      this.context.restore();
    }
    requestAnimationFrame(this.render.bind(this));
  }
  
  /** Computes the "perceived" settling of the pool table */
  private update(): void {
    // this.poolTable.balls
    //   .filter(ball => !ball.isPocketed)
    //   .map(ball => !ball.isRolling())
    //   .reduce((result, val) => result && val, true);

    const activeBalls = this.poolTable.balls.filter(ball => !ball.isPocketed);
    let wMax = 0;

    for (let i = 0; i < activeBalls.length; i++) {
      const ballA = activeBalls[i];
      const rb = ballA.radius;
      const b = ballA.body.position;
      const vA = ballA.body.velocity;
      const vAn = Matter.Vector.normalise(vA);
      const vmag = (ballA.body.speed < .1) ? 0 : ballA.body.speed;
      const W: { angle: number, distance: number, speed: number }[] = [];

      for (let pocket of this.poolTable.pockets) {
        const p = pocket.body.position;
        const u = Matter.Vector.sub(p, b);
        const d2 = Matter.Vector.magnitudeSquared(u) - pocket.params.radius * pocket.params.radius;
        const un = Matter.Vector.normalise(u);
        let cosTheta = Matter.Vector.dot(vAn, un).valueOf();
        if (vmag === 0) {
          cosTheta = 0;
        }
        if (cosTheta > 0) {
          // Pocket is in front of the ball
          W.push({
            angle: cosTheta,
            distance: 1 / (1 + sqrt(d2)),
            speed: vmag
          });
        } else {
          W.push({ angle: 0, distance: 0, speed: 0 });
        }
      }

      const Wt: number[] = [];

      if (i < activeBalls.length - 1) {
        // Check potential collisions with balls i+1, i+2, ...
        // Wt will contain the weights based on the estimated time to potential collisions

        innerLoop: for (let j = i + 1; j < activeBalls.length; j++) {
          const ballB = activeBalls[j];
          const vB = ballB.body.velocity;
          const u = Matter.Vector.sub(ballB.body.position, ballA.body.position);
          const umag = Matter.Vector.magnitude(u);
          const alpha = atan2(u.y, u.x);
          const va = Matter.Vector.rotate(vA, -alpha);
          const vb = Matter.Vector.rotate(vB, -alpha);

          let vax = (abs(va.x) < 1) ? 0 : va.x;
          let vay = (abs(va.y) < 1) ? 0 : va.y;
          let vbx = (abs(vb.x) < 1) ? 0 : vb.x;
          let vby = (abs(vb.y) < 1) ? 0 : vb.y;

          let tc = 0; // estimated time to collision between balls A and B

          if (vax === 0 && vbx === 0) {
            continue innerLoop;
          }
          if (vax === 0 && vay === 0) {
            [ vax, vbx ] = [ vbx, vax ];
            [ vay, vby ] = [ vby, vay ];
          }
          if (vax < 0 && vbx === 0) {
            continue innerLoop;
          }
          if (vax > 0 && vbx === 0) {
            tc = (umag - ballA.radius - ballB.radius) / vax;
          }
          if (vax > 0 && vbx > 0) {
            if (vax > vbx) {
              // How long time for ball A to catch ball B
              tc = (ballA.radius + umag) / (vax - vbx);
              // Check if Ball B can escape the collision corridor
              if (vby !== 0) {
                const t2r = 2 * ballB.radius / abs(vby);
                if (t2r < tc) {
                  // console.log(`Ball ${ballB.value} will escape the collision corridor`);
                  continue innerLoop;
                }
              }
            } else if (vax < vbx) {
              // How long time for ball B to catch ball A
              tc = (ballB.radius + umag) / (vbx - vax);
              // Check if Ball A can escape the collision corridor
              if (vay !== 0) {
                const t2r = 2 * ballA.radius / abs(vay);
                if (t2r < tc) {
                  // console.log(`Ball ${ballA.value} will escape the collision corridor`);
                  continue innerLoop;
                }
              }
            }
          } else if ((vax > 0 && vbx) < 0 || (vax < 0 && vbx > 0)) {
            /**
             * s(i) = vx(i) * tc
             * s(j) = vx(j) * tc
             * d(i) = s(i) + s(j) = ||p(i)-p(j)||+r(i)+r(j)
             * tc = d(i) / |vx(i)| + |vx(j)|
             */
            tc = umag / (abs(vax) + abs(vbx));
            // Check if ball A or ball B can escape the collision corridor before a collision occurs
            if (abs(vay) > 0) {
              const t = 2 * ballA.radius / abs(vay);
              if (t < tc) {
                // console.log(`Ball ${ballA.value} will escape the collision corridor`);
                continue innerLoop;
              }
            }
            if (abs(vby) > 0) {
              const t = 2 * ballB.radius / abs(vby);
              if (t < tc) {
                // console.log(`Ball ${ballA.value} will escape the collision corridor`);
                continue innerLoop;
              }
            }
          }
          if (tc > 0) {
            // console.log({ vax, vay, vbx, vby, tc, Wt: 1 / (1 + 1e-3 * tc) });
            // console.log({ ballA: ballA.value, ballB: ballB.value, tc, Wt: 1 / (1 + 1e-3 * tc) });
            const wt = 1 / (1 + 1e-3 * tc);
            Wt.push(wt);
          }
        }
      }

      // Weighting
      if (W.length > 0) {
        // console.log(`Ball ${ball.value} weights:`, W);
        let w = W
          .map(weight => (1 + weight.speed) * (weight.angle + weight.distance))
          .reduce((result, val) => result + val, 0);
          // console.log(`Ball ${ball.value} weights:`, W, max(w));
        if (Wt.length > 0) {
          // Get max weight from the ball collision checks
          const wt = max(...Wt);
          w *= wt;
        }
        if (ballA.activity.length > this.dom.width - 1) {
          ballA.activity.splice(0, 1);
        }
        ballA.activity.push(w);
        const m = max(w);
        if (m > wMax) {
          wMax = m;
        }
      }
    }

    this.activity.push(wMax);

    const n = this.activity.length;
    
    if (n > 1) {
      const w0 = this.activity[n - 2];
      const w1 = this.activity[n - 1];
      if (w0 > SETTLING_THRESHOLD && w1 < SETTLING_THRESHOLD) {
        const now = Date.now();
        if ((!isNaN(this.lastSettlingTime) && (now - this.lastSettlingTime > 1000)) || isNaN(this.lastSettlingTime)) {
          this.lastSettlingTime = now;
          this.emit('settled', [ ]);
        }
      }
    }

    if (n > this.dom.width) {
      this.activity.splice(0, 1);
    }
  }
}