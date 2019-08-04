import * as Matter from 'matter-js';
import { PoolTable } from './shapes/pool-table';
import { EventEmitter } from 'events';
import { roundTo } from './utils';

const { abs, atan2, max, sqrt } = Math;

export interface PoolMonitorOptions {
  width?: number;
  height?: number;
  settlingThreshold?: number;
}

/**
 * Monitors the settling of the pool table and pocketing of balls
 * 
 * Triggered events:
 * * 'settled' - triggered when the pool table has settled after a stroke
 * * 'pocketed' - triggered when a ball has been pocketed
 * * 'outside' - triggered when a ball is outside of the pool table
 * * 'ballision' - triggered when two balls collide
 */
export class PoolMonitor extends EventEmitter {

  public readonly dom: HTMLCanvasElement;
  private readonly context: CanvasRenderingContext2D;
  private readonly activity: number[];

  private lastSettlingTime = NaN;

  constructor(
    public readonly poolTable: PoolTable,
    private readonly engine: Matter.Engine,
    public readonly options: PoolMonitorOptions = { width: 96, height: 48, settlingThreshold: 4.0 }
  ) {
    super();
    this.dom = document.createElement('canvas') as HTMLCanvasElement;
    this.dom.setAttribute('position', 'relative');
    this.dom.setAttribute('width', `${options.width}px`);
    this.dom.setAttribute('height', `${options.height}px`);
    this.context = this.dom.getContext('2d') as CanvasRenderingContext2D;
    this.activity = [];
    // Set up collision event handler
    Matter.Events.on(engine, 'collisionActive', this.handleCollisions.bind(this));
    this.render()
  }

  public hasSettled(): boolean {
    return (this.activity.length > 0)
      ? this.activity[this.activity.length - 1] < this.options.settlingThreshold
      : true;
  }

  /** Renders the pool table "activity graph" */
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
      const n = this.activity.length;
      for (let i = 1; i < n; i++) {
        this.context.lineTo(i, this.activity[i]);
      }
      this.context.strokeStyle = 'cyan';
      this.context.lineWidth = 1;
      this.context.stroke();      
      this.context.restore();
      // Output the global pool table settling weight value
      this.context.fillStyle = '#000';
      this.context.fillRect(0, 0, this.dom.width, 20);
      this.context.fillStyle = 'cyan';
      this.context.font = '8pt Arial';
      this.context.textAlign = 'left';
      this.context.textBaseline = 'middle';
      const value = roundTo(this.activity[n - 1], 1);
      this.context.fillText(value.toString(), 10, 10);
    }
    requestAnimationFrame(this.render.bind(this));
  }

    /** Detects pocketing of balls and triggers the 'pocketed' event */
  private handleCollisions(event: Matter.IEventCollision<Matter.Engine>): void {
    const pairs = event.pairs;
    let a: Matter.Body,
        b: Matter.Body;
    let i = 0;
    
    for (let pair of pairs) {
      a = pair.bodyA;
      b = pair.bodyB;

      i++;
      // console.log(`${i}: ${a.label} - ${b.label}`);        

      let isPocketA = a.label.startsWith('pocket'),
          isPocketB = isPocketA ? false : b.label.startsWith('pocket'),
          isBallA = isPocketA ? false : a.label.startsWith('ball'),
          isBallB = isPocketB ? false : b.label.startsWith('ball'),
          isCueballSensorA = (isPocketA || isBallA) ? false : a.label === 'cueball-sensor',
          isCueballSensorB = (isPocketB || isBallB) ? false : b.label === 'cueball-sensor';

      if (isCueballSensorA) {
        isBallA = true;
        a = this.poolTable.balls.find(ball => ball.value === 0).body;
        // console.log('isCueballSensorA', a);
      } else if (isCueballSensorB) {
        isBallB = true;
        b = this.poolTable.balls.find(ball => ball.value === 0).body;
        // console.log('isCueballSensorB', b);
      }

      if (isBallA && isBallB) {
        // Collision between two balls ...
        // Matter.js will notify about collisions even when the balls are not in motion,
        // for example when being located inside the rack. We are only interested in collisions
        // between moving bodies. It also has some difficulties in detecting collisions with 
        // high-speed bodies which makes it difficult for us to correctly detect the initial
        // collision between the cue-ball and the target ball.
        const balls = this.poolTable.balls.filter(ball => [a.id, b.id].indexOf(ball.body.id) !== -1);
        if (balls[0].isRolling() || balls[1].isRolling()) {
          this.emit('ballision', balls);
        }
      } else if ((isPocketA || isPocketB) && (isBallA || isBallB)) {
        // Collision between a ball and a pocket ... Ensure that (a) is a pocket and (b) is a ball
        if (!isPocketA) {
          [a, b] = [b, a];
        }
        const ball = this.poolTable.balls.find(ball => ball.body.id === b.id);
        const pocket = this.poolTable.pockets.find(pocket => pocket.body.id === a.id);
        if (pocket && ball && pocket.isBallInside(ball) ) {
          this.emit('pocketed', { ball, pocket });
        }
      }
    }
  }

  /** Computes the "perceived settling" of the pool table */
  private update(): void {
    // this.poolTable.balls
    //   .filter(ball => !ball.isPocketed)
    //   .map(ball => !ball.isRolling())
    //   .reduce((result, val) => result && val, true);

    // const activeBalls = this.poolTable.balls.filter(ball => !ball.isPocketed);

    const insideBallIds = this.poolTable.balls
      .filter(ball => !(ball.isPocketed || ball.isOutside))
      .map(ball => ball.body.id);

    const outsideBalls = this.poolTable.balls
      .filter(ball => this.poolTable.isBallOutside(ball));

    for (let ball of outsideBalls) {
      // Only emit an event if the ball was found to be inside before the outside test
      if (insideBallIds.indexOf(ball.body.id) !== -1) {
        this.emit('outside', ball);
      }
    }

    const outsideBallIds = outsideBalls.map(ball => ball.body.id);

    const activeBalls = this.poolTable.balls
      .filter(ball => !ball.isPocketed)
      .filter(ball => outsideBallIds.indexOf(ball.body.id) === -1);

    let wMax = 0;

    for (let i = 0; i < activeBalls.length; i++) {
      const ballA = activeBalls[i];
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
      if (w0 > this.options.settlingThreshold && w1 < this.options.settlingThreshold) {
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
