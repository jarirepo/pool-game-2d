import * as Matter from 'matter-js';
import { Vector3D, Matrix4, mmult4, mmult4all, getRandomAxes, applyTransform } from '../vector3d';
import { Color, Colors } from '../colors';
import { Constants } from '../constants';
import { Primitives } from '../primitives';
import { Viewport } from '../viewport';
import { IShape } from './shape';
import { coonsSolver } from '../solvers';

const { cos, sin, atan2, floor, min, max, sqrt } = Math;

const ballTextureWidth = 256,
      ballTextureHeight = 128;

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

  public modified = false;

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

    // Time step, assumimg 60 fps
    const dt = 0.0166667;

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
    const cosAlpha = cos(alpha);
    const sinAlpha = sin(alpha);
    const Troll: Matrix4 = {
      m00: 1, m01: 0, m02: 0, m03: 0,
      m10: 0, m11: cosAlpha, m12: sinAlpha, m13: 0,
      m20: 0, m21: -sinAlpha, m22: cosAlpha, m23: 0,
      m30: 0, m31: 0, m32: 0, m33: 1
    };
    
    // Rotation about the z-axis for the SPIN effect
    const phi = 100 * this.body.angularVelocity * dt;
    const cosPhi = cos(phi);
    const sinPhi = sin(phi);
    const Tspin: Matrix4 = {
      m00: cosPhi, m01: sinPhi, m02: 0, m03: 0,
      m10: -sinPhi, m11: cosPhi, m12: 0, m13: 0,
      m20: 0, m21: 0, m22: 1, m23: 0,
      m30: 0, m31: 0, m32: 0, m33: 1
    };
    
    // Compute the total transformation and apply it to the OCS
    const T = mmult4all([ Rz, Troll, Rzinv, Tspin ]);
    this.ocs = mmult4(this.ocs, T);

    this.ocs.m30 = this.body.position.x;
    this.ocs.m31 = this.body.position.y;
    this.ocs.m32 = this.radius;
  }

  /** Renders a ball into a viewport's pixel buffer */
  public render(vp: Viewport, T: Matrix4): void {
    // T: Transformation from OCS to screen coordinates
    const pixels = vp.pixelBuffer.data;

    // Transform the unit sphere to the screen
    const Pscr = Primitives.Sphere.data
      .map(v => ({ x: v.x * this.radius, y: v.y * this.radius, z: v.z * this.radius }))
      .map(v => applyTransform(v, T));

    // Transform the normal vectors of the sphere's faces to the screen
    const Nscr = Primitives.Sphere.faces
      .map(face => face.n)
      .map(v => ({
        x: v.x * T.m00 + v.y * T.m10 + v.z * T.m20,
        y: v.x * T.m01 + v.y * T.m11 + v.z * T.m21,
        z: v.x * T.m02 + v.y * T.m12 + v.z * T.m22
      }));

    // Scan-convert all visible faces for this ball
    faceLoop: for (let i = 0; i < Primitives.Sphere.faces.length; i++) {
      const nz = Nscr[i].z;
      if (nz < 0) {
        continue faceLoop;
      }

      const face = Primitives.Sphere.faces[i];
      const p = face.v.map(v => Pscr[v]);
      const sxmin = floor(min(...p.map(v => v.x)) - 1),
            sxmax = floor(max(...p.map(v => v.x)) + 1),
            symin = floor(min(...p.map(v => v.y)) - 1),
            symax = floor(max(...p.map(v => v.y)) + 1);

      if (sxmin > vp.screen.xmax || sxmax < vp.screen.xmin || symin > vp.screen.ymax || symax < vp.screen.ymin) {
        continue faceLoop;
      }

      // New scan conversion algorithm!

      // Polygon vertices and texture coords.
      const P = face.v.map(i => Pscr[i]);
      const T = face.v.map(i => ({
        u: Primitives.Sphere.data[i].u,
        v: Primitives.Sphere.data[i].v
      }));

      // Interpolation constants
      let a: number[], b: number[], c: number[], d: number[];

      switch (face.v.length) {
        case 3:
          a = [ NaN, P[1].x - P[0].x, P[2].x - P[0].x, P[0].x - P[2].x ];
          b = [ NaN, P[1].y - P[0].y, P[2].y - P[0].y, P[0].y - P[2].y ];
          c = [ T[0].u, T[1].u - T[0].u, T[2].u - T[0].u, T[0].u - T[2].u ];
          d = [ T[0].v, T[1].v - T[0].v, T[2].v - T[0].v, T[0].v - T[2].v ];
          break;
        case 4:
          a = [ NaN, P[1].x - P[0].x, P[3].x - P[0].x, P[0].x - P[1].x + P[2].x - P[3].x ];
          b = [ NaN, P[1].y - P[0].y, P[3].y - P[0].y, P[0].y - P[1].y + P[2].y - P[3].y ];
          c = [ T[0].u, T[1].u - T[0].u, T[3].u - T[0].u, T[0].u - T[1].u + T[2].u - T[3].u ];
          d = [ T[0].v, T[1].v - T[0].v, T[3].v - T[0].v, T[0].v - T[1].v + T[2].v - T[3].v ];
          break;
        default:
          console.log('Scan converter supports only triangular and quadrilateral faces');
          return;
      }

      let u: number, v: number;
      let tu: number, tv: number;                  
      let ix: number, iy: number;
      let srcIndex: number, destIndex: number;

      yloop: for (let sy = symin; sy <= symax; sy++) {
        if (sy - vp.screen.ymin < 0 || sy - vp.screen.ymin > vp.pixelBuffer.height - 1) {
          continue yloop;
        }
        b[0] = P[0].y - sy;

        xloop: for (let sx = sxmin; sx <= sxmax; sx++) {
          if (sx - vp.screen.xmin < 0 || sx - vp.screen.xmin > vp.pixelBuffer.width - 1) {
            continue xloop;
          }
          a[0] = P[0].x - sx;

          // Solve for parameters (u,v) on Coon's linear surface, 0 <= u,v <= 1
          const params = coonsSolver(a, b);
          if (!params) {
            continue xloop;
          }
          u = params.u;
          v = params.v;

          // Interpolate texture coords.
          tu = c[0] + c[1] * u + c[2] * v + c[3] * u * v;
          tv = d[0] + d[1] * u + d[2] * v + d[3] * u * v;

          /*
          if (tu < 0) {
            tu = 0;
          } else if (tu > 1) {
            tu = 1;
          }
          
          if (tv < 0) {
            tv = 0;
          } else if (tv > 1) {
            tv = 1;
          }
          */
         
          ix = floor(tu * (this.texture.width - 1) + .5);
          iy = floor(tv * (this.texture.height - 1) + .5);

          // if (ix < 0) {
          //   ix = 0;
          // } else if (ix > this.texture.width - 1) {
          //   ix = this.texture.width - 1;
          // }
          
          // if (iy < 0) {
          //   iy = 0;
          // } else if (iy > this.texture.height - 1) {
          //   iy = this.texture.height - 1;
          // }
  
          srcIndex = (ix + iy * this.texture.width)<<2;
          destIndex = (sx - vp.screen.xmin + (sy - vp.screen.ymin) * vp.pixelBuffer.width)<<2;

          /**
           * Pixel shading
           * Uses the z-component (0<=nz<=1) of the face's normal vector (n) to adjust the shade of the texture color value at (ix,iy).
           * Assumes that there is a directional light above the pool table.
           */
          pixels[destIndex] = nz * this.texture.data[srcIndex];
          pixels[destIndex + 1] = nz * this.texture.data[srcIndex + 1];
          pixels[destIndex + 2] = nz * this.texture.data[srcIndex + 2];
          pixels[destIndex + 3] = 255;
        }
      }
    }
  }
}
