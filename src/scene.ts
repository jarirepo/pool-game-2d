import { EventEmitter } from 'events';
import { isArray } from 'util';
import { IShape, Transform } from './shapes/shape';
import { Viewport } from './viewport';
import { Matrix4, createWCS, mmult4, applyTransform, applyTransformToVector, normalizeVector } from './geometry/vector3d';
import { ILight } from './lights/light';
import { Plane } from './geometry/geometry';
import { scanConvertProjectedPolygon } from './shader';

/**
 * Holds all renderable shapes and notifies listeners when the scene is modified,
 * eg. when adding a new shape.
 */
export class Scene extends EventEmitter {

  private static readonly Tworld: Transform = {
    matrix: createWCS(),
    parent: null
  };

  /** A buffer to hold all transformations */
  private transforms: Transform[] = [];

  /** Current transformation */
  private Tcurrent: Transform;

  public readonly shapes: IShape[] = [];

  /** Image data buffer */
  // private imageBuffer: ImageData;

  /** Light sources */
  public readonly lights: ILight[] = [];

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
  
  /** Adds shape(s) to the scene, relative to the current coordinate system, 
   * and computes its transformation to world coordinates.
   * This also notifies any listeners that the scene has been modified.
   */
  public addShape(shape: IShape | IShape[]): Scene {
    if (isArray(shape)) {
      shape.forEach(s => {
        // Calculate the transformation from OCS to world coordinates
        const T = this.calcTransform(s.ocs);
        s.transform = { matrix: T, parent: this.Tcurrent };
        s.T = null;
        this.shapes.push(s);
      })
    } else {
      const T = this.calcTransform(shape.ocs);
      shape.transform = { matrix: T, parent: this.Tcurrent };
      shape.T = null;
      this.shapes.push(shape);
    }
    this.emit('modified');
    return this;
  }

  /** Adds light source(s) to the scene */
  public addLight(light: ILight | ILight[]): Scene {
    if (isArray(light)) {
      light.forEach(l => this.lights.push(l));
    } else {
      this.lights.push(light);
    }
    this.emit('modified');
    return this;
  }
  
  /** Renders all shapes in the scene */
  public render(vp: Viewport): void {
    // Set viewport clipping boundary
    vp.context.beginPath();
    vp.context.rect(vp.screen.xmin, vp.screen.ymin, vp.width, vp.height);
    vp.context.clip();

    vp.initZBuffer();
    
    const Tscr = vp.getTransform();

    // Compute the total transformation from OCS to screen coordinates for all visible shapes
    this.shapes
      .filter(shape => shape.visible)
      .forEach(shape => {
        if (shape.isStatic) {
          shape.T = mmult4(shape.transform.matrix, Tscr);
        } else {
          let result = shape.ocs;
          let current = shape.transform.parent;
          while (current.parent) {
            result = mmult4(result, current.matrix);
            current = current.parent;
          }
          shape.T = mmult4(result, Tscr);  
        }
        // Transformation vertices and vectors to screen coords.
        const G = shape.geometry;
        if (G) {
          if (shape.pretransform) {
            const T = mmult4(shape.pretransform, shape.T);
            shape.Pscr = G.vertices.map(v => applyTransform(v, T));
          } else {
            shape.Pscr = G.vertices.map(v => applyTransform(v, shape.T));
          }
          shape.Vscr = G.vertices.map(v => applyTransformToVector(v, shape.T)).map(normalizeVector);
          shape.Nscr = G.faces.map(face => applyTransformToVector(face.n, shape.T)).map(normalizeVector);
        }
      });

    // Render all static shapes ...
    this.shapes
      .filter(shape => shape.visible && shape.isStatic)
      .forEach((shape, i) => {
        // Compute transformation from OCS to screen coordinates and applies to the graphics context
        // const T = mmult4(shapeData.transform.matrix, Tscr);
        const T = shape.T;
        vp.context.save();
        vp.context.setTransform({
          m11: T.m00, m12: T.m01,
          m21: T.m10, m22: T.m11,
          m41: T.m30, m42: T.m31
        });
        shape.render(vp);
        vp.context.restore();
      });

    // Save the "background" graphics to the pixel buffer
    vp.save();

    // Compute the shadow map ...
    //  No light => No shadows
    //  Both static and dynamics shapes can receive shadows

    // Limited to the 1st light for now ...
    const activeLights = this.lights.filter((light, i) => light.active);

    if (activeLights.length > 0) {
      srcLoop: for (let i = 0; i < this.shapes.length; i++) {  // source shape
        if (!(this.shapes[i].visible && this.shapes[i].canCastShadow)) { continue srcLoop; }

        const srcShape = this.shapes[i];

        if (!srcShape.geometry) { continue srcLoop; }
        
        const srcShadowCategory = srcShape.shadowFilter.category;

        // Select source faces inside the viewport
        const srcFaces = srcShape.geometry.faces.filter(face => {
          const p = face.v.map(pindex => srcShape.Pscr[pindex]);
          return vp.isPolygonInside(p);
        });

        targetLoop: for (let j = 0; j < this.shapes.length; j++) {  // target shape
          if (!this.shapes[j].visible) { continue targetLoop; }
          
          // Don't allow an object to cast shadow onto itself...Our objects are either flat or convex ...
          if (i === j) { continue targetLoop; }
          
          const targetShape = this.shapes[j];

          if (!targetShape.geometry) { continue targetLoop; }

          // Use the shadow filter to test if shape (j) can receive shadow from shape (i)
          const targetShadowMask = targetShape.shadowFilter.mask;
          const canReceiveShadow = (srcShadowCategory & targetShadowMask) !== 0;

          if (canReceiveShadow) {
            // Shape (j) can receive shadow from shape (i) ...
            // Process all light sources against shape (j) ...

            // Select target faces inside the viewport
            const targetFaces = targetShape.geometry.faces.filter(face => {
              const p = face.v.map(pindex => targetShape.Pscr[pindex]);
              return vp.isPolygonInside(p);              
            });

            // console.log(targetFaces);
    
            lightLoop: for (let k = 0; k < activeLights.length; k++) {  // light source L(k)
              const light = activeLights[k];   // For now, the light position or direction vector is given in screen coords.
              
              // Select all faces of the source shape which are visible from L(k)
              const projectFaces = srcFaces.filter(face => {
                const plane: Plane = {
                  p: srcShape.Pscr[face.v[0]],
                  n: srcShape.Nscr[face.index]
                };
                return light.hitsPlane(plane);
              });

              // console.log(projectFaces);

              if (projectFaces.length === 0) { continue lightLoop; }

              // Projection of the source face vertices to the target faces ...

              targetFaces.forEach(tface => {                
                const targetPlane: Plane = {
                  p: targetShape.Pscr[tface.v[0]],
                  n: targetShape.Nscr[tface.index]
                };
                // console.log(targetPlane);

                // Get the target polygon
                const targetPoly = tface.v.map(pindex => targetShape.Pscr[pindex]);

                projectFaces.forEach(pface => {
                  // Projected source face onto the target plane
                  const projectedPoly = pface.v
                    .map(pindex => srcShape.Pscr[pindex])
                    .map(p => light.castRay(p, targetPlane));

                  // Scan convert the projected polygon to find pixels inside the target polygon ...
                  scanConvertProjectedPolygon(vp, projectedPoly, targetPoly, targetShape.Nscr[tface.index]);

                  /*
                  vp.context.beginPath();
                  vp.context.moveTo(projectedPoly[0].x, projectedPoly[0].y);
                  for (let ii = 1; ii < projectedPoly.length; ii++) {
                    vp.context.lineTo(projectedPoly[ii].x, projectedPoly[ii].y);
                  }
                  vp.context.strokeStyle = '#fff';
                  vp.context.lineWidth = 1;
                  vp.context.stroke();
                 */

                  /*
                  vp.context.beginPath();
                  vp.context.moveTo(targetPoly[0].x, targetPoly[0].y);
                  for (let ii = 1; ii < targetPoly.length; ii++) {
                    vp.context.lineTo(targetPoly[ii].x, targetPoly[ii].y);
                  }
                  vp.context.strokeStyle = '#fff';
                  vp.context.lineWidth = 1;
                  vp.context.stroke();
                  */
                 
                  // Test writing to the pixel buffer ...
                  /*
                  for (let ppp of pp) {
                    const x = floor(ppp.x), y = floor(ppp.y);
                    for (let ii = -1; ii <= 1; ii++) {
                      for (let jj = -1; jj <=1; jj++) {
                        if (vp.isPointInside(x + jj, y + ii)) {
                          const destIndex = (x + jj - vp.screen.xmin + (y + ii - vp.screen.ymin) * vp.pixelBuffer.width)<<2;
                          vp.pixelBuffer.data[destIndex] = 255;
                          vp.pixelBuffer.data[destIndex + 1] = 255;
                          vp.pixelBuffer.data[destIndex + 2] = 255;
                          vp.pixelBuffer.data[destIndex + 3] = 255;
                        }    
                      }
                    }
                  }
                  */
                });
              });
            }
          }
        }
      }
    }

    // vp.save();

    // Render all dynamic shapes (these normally have a time-varying OCS) ...
    // These are renderered into the viewport's pixel buffer
    this.shapes
      .filter(shape => shape.visible && !shape.isStatic)
      .forEach(shape => shape.render(vp));

    // Restores updated pixel buffer
    vp.restore();
  }
  
  /** Transform OCS -> WCS, through all of its parent coordinate systems (if any)
   *  Called every time a new shape is added to the scene to get the total
   *  transformation from the object space to world coords.
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
