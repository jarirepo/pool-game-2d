import { isUndefined } from 'util';
import * as Matter from 'matter-js';
import { Matrix4, Vector3D, createWCS } from './geometry/vector3d';
import { Scene } from './scene';
import { solve2 } from './solvers';

const { abs, floor, min, max } = Math;

interface Rectangle {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export interface ViewportOptions {
  screen: Rectangle;
  world: Rectangle;
  showGrid?: boolean;
  showAxes?: boolean;
  gridSizeX?: number;
  gridSizeY?: number;
}

/**
 * @class Viewport
 *  Defines a viewport as a rectangular window into the world.
 * 
 *  A point (x,y) is transformed into screen coordinates as:
 *  px = xOrg + xScl * x
 *  py = yOrg + yScl * y
 */
export class Viewport {
  xOrg: number;
  yOrg: number;
  xScl: number;
  yScl: number;

  readonly screen: Rectangle;
  readonly world: Rectangle;

  /** Precalculated grid x-coords. */
  private gridX: number[];

  /** Precalculated grid y-coords. */
  private gridY: number[];

  private static readonly MIN_GRID_SPACING = 10;

  private imageBuffer: ImageData;
  private redrawGrid = true;

  /** Buffer that can be used for rendering of dynamic shapes */
  public pixelBuffer: ImageData;
  // public readonly pixelBuffer: ImageData;
  
  /** Depth buffer */
  public readonly zBuffer: number[];

  /** Shadow buffer */
  public shadowBuffer: ImageData;

  /** Current coordinate system */
  public currentAxes: Matrix4 = createWCS();

  public readonly mouse: Matter.Mouse;

  constructor(
    public readonly context: CanvasRenderingContext2D,
    private readonly scene: Scene,
    private readonly opts: ViewportOptions
  ) {
    this.mouse = Matter.Mouse.create(this.context.canvas);
    this.screen = opts.screen;
    this.world = opts.world;
    // Default options
    if (isUndefined(this.opts.showGrid)) {
      this.opts.showGrid = true;
    }
    if (isUndefined(this.opts.gridSizeX)) {
      this.opts.gridSizeX = (this.world.xmax - this.world.xmin) / 10;
    }
    if (isUndefined(this.opts.gridSizeY)) {
      this.opts.gridSizeY = (this.world.ymax - this.world.ymin) / 10;
    }
    if (isUndefined(this.opts.showAxes)) {
      this.opts.showAxes = true;
    }
    this.calcScaleAndOrigin();
    this.generateGridPoints();

    // this.pixelBuffer = this.context.createImageData(this.screen.xmax - this.screen.xmin, this.screen.ymax - this.screen.ymin);
    this.zBuffer = new Array<number>(this.width * this.height);

    // Sets the clipping boundary for this viewport (this only needs to be set once)
    this.context.beginPath();
    this.context.rect(this.screen.xmin, this.screen.ymin, this.width, this.height);
    this.context.clip();

    this.scene.on('modified', args => {
      console.log('Scene modified', args);
      // TODO: Render the view...
    });
  }

  public get width(): number {
    return this.screen.xmax - this.screen.xmin;
  }

  public get height(): number {
    return this.screen.ymax - this.screen.ymin;
  }

  /** Returns the transformation from world to screen coordinates */
  public getTransform(): Matrix4 {
    return {
      m00: this.xScl, m01: 0, m02: 0, m03: 0,
      m10: 0, m11: this.yScl, m12: 0, m13: 0,
      m20: 0, m21: 0, m22: 1, m23: 0,
      m30: this.xOrg, m31: this.yOrg, m32: 0, m33: 1
    };
  }

  /** Transforms screen coordinates (x,y) to the specific coordinate system Tocs
   * 
   * Based on calculation:
   *  Pscr = Pocs*T
   *  where T = Tocs*Tscr and Pocs=[x y z 1], z=0
  */
  public transformPoint(x: number, y: number, Tocs: Matrix4): Vector3D {
    const A = [
      [ Tocs.m00, Tocs.m10 ],
      [ Tocs.m01, Tocs.m11 ]
    ];
    const b = [
      (x - this.xOrg) / this.xScl - Tocs.m30,
      (y - this.yOrg) / this.yScl - Tocs.m31
    ];
    const result = solve2(A, b);
    return result ? { x: result[0], y: result[1], z: 0 } : null;
  }

  /** Returns the current mouse position relative to the current axes */
  public getMousePos(): Vector3D {
    return this.transformPoint(this.mouse.position.x, this.mouse.position.y, this.currentAxes);
  }

  /** Zooms at the origin by a given factor and regenerates the grid points */
  public zoomOrigin(factor: number): void {
    if (factor <= 0) {
      return;
    }
    if (!this.canApplyScaleFactor(factor)) {
      return;
    }
    this.xScl *= factor;
    this.yScl *= factor;
    this.world.xmin /= factor;
    this.world.xmax /= factor;
    this.world.ymin /= factor;
    this.world.ymax /= factor;
    if (this.opts.showGrid) {
      this.generateGridPoints();
      this.redrawGrid = true;
    }
  }

  /** Zooms at the viewport center and regenerates the grid points */
  public zoomCenter(factor: number): void {
    // Viewport center
    const xc = (this.screen.xmin + this.screen.xmax) / 2;
    const yc = (this.screen.ymin + this.screen.ymax) / 2;
    this.zoomAt(xc,yc, factor);
  }

  /** Zooms at the specified position and regenerates the grid points */
  public zoomAt(xc: number, yc: number, factor: number): void {
    if (factor <= 0) {
      return;
    }
    if (!this.canApplyScaleFactor(factor)) {
      return;
    }
    const x = (xc - this.xOrg) / this.xScl;
    const y = (yc - this.yOrg) / this.yScl;
    // Apply zoom factor
    this.xScl *= factor;
    this.yScl *= factor;
    // Calculate new origin
    this.xOrg = xc - x * this.xScl;
    this.yOrg = yc - y * this.yScl;
    // Calculate axes limits
    this.world.xmin = (this.screen.xmin - this.xOrg) / this.xScl;
    this.world.xmax = (this.screen.xmax - this.xOrg) / this.xScl;
    this.world.ymin = (this.screen.ymax - this.yOrg) / this.yScl;
    this.world.ymax = (this.screen.ymin - this.yOrg) / this.yScl;
    if (this.opts.showGrid) {
      this.generateGridPoints();
      this.redrawGrid = true;
    }
  }

  /** Toggles grid on/off */
  public toggleGrid(): void {
    this.opts.showGrid = !this.opts.showGrid;
    this.generateGridPoints();
    this.redrawGrid = true;
  }

  /** Toggles axes on/off */
  public toggleAxes(): void {    
    this.opts.showAxes = !this.opts.showAxes;
    this.redrawGrid = true;
  }

  /** Returns true if point (x,y) is inside the viewport */
  public isPointInside(x: number, y: number): boolean {
    return !(x < this.screen.xmin || x > this.screen.xmax || y < this.screen.ymin || y > this.screen.ymax);
  }

  /** Returns true if the polygon vertices in p is inside the viewport */
  public isPolygonInside(p: Vector3D[]): boolean {
    const px = p.map(v => v.x);
    const xmin = min(...px);
    if (xmin > this.screen.xmax) { return false; }
    const xmax = max(...px);
    if (xmax < this.screen.xmin) { return false; }
    const py = p.map(v => v.y);
    const ymin = min(...py);
    if (ymin > this.screen.ymax) { return false; }
    const ymax = max(...py);
    if (ymax < this.screen.ymin) { return false; }
    return true;
  }

  /** Saves the current image data */
  public save(): void {
    this.pixelBuffer = this.context.getImageData(this.screen.xmin, this.screen.ymin, this.width, this.height);
    this.shadowBuffer = this.context.getImageData(this.screen.xmin, this.screen.ymin, this.width, this.height);
  }

  /** Restores saved image data */
  public restore(): void {
    if (this.pixelBuffer) {
      this.context.putImageData(this.pixelBuffer, this.screen.xmin, this.screen.ymin);
    }
    if (this.shadowBuffer) {
      // this.context.putImageData(this.shadowBuffer, this.screen.xmin, this.screen.ymin);
    }
  }

  public initZBuffer(): void {
    this.zBuffer.fill(-1e9);
  }

  /** Sets the current transform for rendering */
  public setContextTransform(T: Matrix4): void {
    this.context.setTransform({
      m11: T.m00, m12: T.m01,
      m21: T.m10, m22: T.m11,
      m41: T.m30, m42: T.m31
    });
  }

  public render(): void {
    if (!this.redrawGrid) {
      this.context.putImageData(this.imageBuffer, this.opts.screen.xmin, this.opts.screen.ymin);
    } else {
      // Window
      this.context.beginPath();
      this.context.rect(this.screen.xmin, this.screen.ymin, this.width, this.height);
      this.context.fillStyle = '#111';
      this.context.strokeStyle = '#fff';
      this.context.lineWidth = 1;
      this.context.fill();
      this.context.stroke();
      // Grid
      if (this.opts.showGrid) {
        this.context.beginPath();
        for (let i = 0; i < this.gridY.length; i++) {
          for (let j = 0; j < this.gridX.length; j++) {
            if (this.isPointInside(this.gridX[j], this.gridY[i])) {
              this.context.rect(this.gridX[j] - 1, this.gridY[i] - 1, 2, 2);
            }
          }
        }
        this.context.fillStyle = '#999';
        this.context.fill();
      }
      // Axes
      if (this.opts.showAxes) {
        this.context.beginPath();
        if (this.yOrg > this.screen.ymin && this.yOrg < this.screen.ymax) {
          this.context.moveTo(this.screen.xmin, this.yOrg);
          this.context.lineTo(this.screen.xmax, this.yOrg);
        }
        if (this.xOrg > this.screen.xmin && this.xOrg < this.screen.xmax) {
          this.context.moveTo(this.xOrg, this.screen.ymin);
          this.context.lineTo(this.xOrg, this.screen.ymax);
        }
        this.context.lineWidth = 1;
        this.context.strokeStyle = 'yellowgreen';
        this.context.stroke();
      }
      this.imageBuffer = this.context.getImageData(this.screen.xmin, this.screen.ymin, this.width, this.height);
      this.redrawGrid = false;
    }
    // Scene
    this.scene.render(this);
  }
  
  /** Calculates the scale factors (from world -> screen) and returns the aspect ratio */
  private calcScaleFactors(): number {
    this.xScl = this.width / (this.world.xmax - this.world.xmin);
    this.yScl = -this.height / (this.world.ymax - this.world.ymin);
    return abs(this.xScl / this.yScl);
  }

  /** Calculates the origin for this viewport */
  private calcOrigin(): void {
    this.xOrg = this.screen.xmin - this.xScl * this.world.xmin;
    this.yOrg = this.screen.ymax - this.yScl * this.world.ymin;
  }
  
  /** Ensures that sx = sy (for an aspect ratio 1) and adjusts the world limits */
  private calcScaleAndOrigin(): void {
    const aspectRatio = this.calcScaleFactors();
    if (aspectRatio !== 1) {
      if (aspectRatio < 1) {
        // Adjust y-axis limits to match the x-axis scale
        // sx = -(opts.screen.ymax - opts.screen.ymin) / (opts.world.ymax - opts.world.ymin + 2 * h)
        const h = (this.height / this.xScl - (this.world.ymax - this.world.ymin)) / 2;
        this.world.ymin -= h;
        this.world.ymax += h;
        // console.log('Adjusted y-axis limits');
      } else {
        // Adjust x-axis limits to match the y-axis scale
        // -sy = (opts.screen.xmax - opts.screen.xmin) / ((opts.world.xmax - opts.world.xmin + 2 * h)
        const h = (-this.width / this.yScl - (this.world.xmax - this.world.xmin)) / 2;
        this.world.xmin -= h;
        this.world.xmax += h;
        // console.log('Adjusted x-axis limits');
      }
      // Re-calculate the scale factors (aspect ratio should now be 1)
      this.calcScaleFactors();
      // console.log(abs(this.xScl / this.yScl));
    }
    this.calcOrigin();
  }

  /** Generate grid points for fast rendering */
  private generateGridPoints(): void {
    const n1 = (this.world.xmin < 0) ? floor(abs(this.world.xmin) / this.opts.gridSizeX + 1) : 0;
    const n2 = (this.world.xmax > 0) ? floor(abs(this.world.xmax) / this.opts.gridSizeX + .5) : 0;
    const n3 = (this.world.ymin < 0) ? floor(abs(this.world.ymin) / this.opts.gridSizeY + 1) : 0;
    const n4 = (this.world.ymax > 0) ? floor(abs(this.world.ymax) / this.opts.gridSizeY + .5) : 0;
    const nx = n1 + n2;
    const ny = n3 + n4;
    // console.log({ n1, n2, n3, n4, nx, ny });
    this.gridX = new Array(nx).fill(0).map((_, i) => this.xOrg + this.xScl * (i + 1 - n1) * this.opts.gridSizeX);
    this.gridY = new Array(ny).fill(0).map((_, i) => this.yOrg + this.yScl * (i + 1 - n3) * this.opts.gridSizeY);
  }

  private canApplyScaleFactor(factor: number): boolean {
    if (!this.opts.showGrid) {
      return true;
    }
    const sx = this.xScl * factor;
    const sy = this.yScl * factor;
    return !(sx * this.opts.gridSizeX < Viewport.MIN_GRID_SPACING || abs(sy * this.opts.gridSizeY) < Viewport.MIN_GRID_SPACING);
  }
}
