import { EventEmitter } from 'events';
import { isArray } from 'util';

import { IShape } from './shapes/shape';
import { Viewport } from './viewport';
import { Matrix4, WCS, mmult4 } from './geometry/vector3d';

/**
 * Scene transform
 */
interface Transform {
  matrix: Matrix4;
  parent: Transform;
}

interface ShapeData {
  shape: IShape;
  // transform: Matrix4;   /** Transformation to world coordinates */
  transform: Transform;
}

/**
 * Holds all renderable shapes and notifies listeners when the scene is modified,
 * eg. when adding a new shape.
 */
export class Scene extends EventEmitter {

  private static readonly Tworld: Transform = {
    matrix: WCS,
    parent: null
  };

  /** A buffer to hold all transformations */
  private transforms: Transform[] = [];

  /** Current transformation */
  private Tcurrent: Transform;

  public readonly shapes: ShapeData[] = [];

  /** Image data buffer */
  private imageBuffer: ImageData;

  constructor() {
    super();
    this.transforms.push(Scene.Tworld);
    this.Tcurrent = this.transforms[0];
  }

  /** Sets the current transformation, always relative to the current coordinate system */
  public setTransform(matrix: Matrix4): Scene {
    const transform: Transform = { matrix, parent: this.Tcurrent }
    this.transforms.push(transform);
    this.Tcurrent = this.transforms[this.transforms.length - 1];
    console.log('Transforms:', this.transforms);
    return this;
  }

  /** Adds a shape to the scene, relative to the current coordinate system, 
   * and computes its transformation to world coordinates.
   * This also notifies any listeners that the scene has been modified.
   */
  public add(shape: IShape | IShape[]): Scene {
    if (isArray(shape)) {
      shape.forEach(s => {
        // Calculate the transformation from OCS to world coordinates
        const T = this.calcTransform(s.ocs);
        // this.shapes.push({ shape: s, transform: T });
        this.shapes.push({ shape: s, transform: { matrix: T, parent: this.Tcurrent } });
      })
    } else {
      const T = this.calcTransform(shape.ocs);
      // this.shapes.push({ shape, transform: T });
      this.shapes.push({ shape, transform: { matrix: T, parent: this.Tcurrent } });
    }
    this.emit('modified');
    return this;
  }

  /** Renders all shapes in the scene */
  public render(vp: Viewport): void {
    // Set viewport clipping boundary
    vp.context.beginPath();
    vp.context.rect(vp.screen.xmin, vp.screen.ymin, vp.screen.xmax - vp.screen.xmin, vp.screen.ymax - vp.screen.ymin);
    vp.context.clip();
    
    vp.initZBuffer();
    
    const Tscr = vp.getTransform();

    // Render all STATIC shapes
    this.shapes.filter(shapeData => shapeData.shape.visible && shapeData.shape.isStatic).forEach((shapeData, i) => {
      // Compute transformation from OCS to screen coordinates and applies to the graphics context
      const T = mmult4(shapeData.transform.matrix, Tscr);
      vp.context.save();
      vp.context.setTransform({
        m11: T.m00, m12: T.m01,
        m21: T.m10, m22: T.m11,
        m41: T.m30, m42: T.m31
      });
      shapeData.shape.render(vp, T);
      vp.context.restore();
    });

    // TODO: Don't re-render the static shapes until the view has changed ...

    // Render all DYNAMIC shapes, eg. objects having a time-varying OCS
    vp.save();
    this.shapes.filter(shapeData => shapeData.shape.visible && !shapeData.shape.isStatic).forEach((shapeData, i) => {
      let result = shapeData.shape.ocs;
      let current = shapeData.transform.parent;
      while (current.parent) {
        result = mmult4(result, current.matrix);
        current = current.parent;
      }
      const T = mmult4(result, Tscr);
      // vp.context.save();
      // vp.context.setTransform({
      //   m11: T.m00, m12: T.m01,
      //   m21: T.m10, m22: T.m11,
      //   m41: T.m30, m42: T.m31
      // });
      shapeData.shape.render(vp, T);
      // vp.context.restore();
    });    
    vp.restore();
  }

  /** Transform OCS -> WCS, through all of its parent coordinate systems (if any)
   *  Called every time a new shape is added to the scene to get the total
   *  transformation from the object space to the world.
   * 
   *  The total transformation is calculated as:
   *  T = OCS(1) * OCS(2) * ... * OCS(n)
   * 
   *  A local point Pocs can then be transformed to world coordinates as:
   *  Pwcs = Pocs * T
  */
  private calcTransform(ocs: Matrix4): Matrix4 { 
    // console.log('Current transform:', this.Tcurrent, ocs);
    let result = ocs;
    let current = this.Tcurrent;
    while (current.parent) {
      result = mmult4(result, current.matrix);
      current = current.parent;
    }
    return result;
  }
}
