import { Matrix4, applyTransform, normalizeVector, Vector3D, applyTransformToVector, dot, createVector } from './geometry/vector3d';
import { Geometry, Vertex } from './geometry/geometry';
import { Viewport } from './viewport';
import { coonsSolver } from './solvers';
import { constrain, bitmask } from './utils';
import { IShape } from './shapes/shape';
import { ILight } from './lights/light';
import { Quaternion } from './geometry/quaternion';
import { Constants } from './constants';

const { abs, floor, max, min, sqrt, pow } = Math;

function getInterpolationConstants(p: Vector3D[]): number[][] {
  switch (p.length) {
    case 3:          
      return [
        [ NaN, p[1].x - p[0].x, p[2].x - p[0].x, p[0].x - p[2].x ],
        [ NaN, p[1].y - p[0].y, p[2].y - p[0].y, p[0].y - p[2].y ]
      ];
    case 4:
      return [
        [ NaN, p[1].x - p[0].x, p[3].x - p[0].x, p[0].x - p[1].x + p[2].x - p[3].x ],
        [ NaN, p[1].y - p[0].y, p[3].y - p[0].y, p[0].y - p[1].y + p[2].y - p[3].y ]
      ];
    default:
      console.log('Invalid polygon');
      return null;
  }
}

export function applyTexture(vp: Viewport, shape: IShape) {
  const pixels = vp.pixelBuffer.data;

  /*
  // Transform the vertices to the screen
  // This also applies a pre-transformation to the vertices (used for scaling of the unit sphere for example)
  const Pscr = G.vertices
    .map(Tpre)
    .map(v => applyTransform(v, T));

  // Transform the normal vectors of the faces to the screen (same as applyTransform but we don't want to add the origin)
  const Nscr = G.faces
    .map(face => face.n)
    .map(v => applyTransformToVector(v, T))
    .map(normalizeVector);

  // Transform the average normal vectors of the vertices to the screen
  // (The x and y components are not needed for Gouraud shading)
  const vertexNormals = G.vertices
    .map(v => v.n)
    .map(v => applyTransformToVector(v, T))
    .map(normalizeVector);
  */

  const Pscr = shape.Pscr;
  const Nscr = shape.Nscr;
  const vertexNormals = shape.Vscr;
  const texture = shape.texture;
  const G = shape.geometry;
  
  /**
   * Generate shadow
   * Based on the projective shadow algorithm - all visible faces to the light source will cast a shadow to the plane z = 0
   */
  /*
  // Directional light source (should not be declared here...), in screen coords.!
  // const L1: Vector3D = normalizeVector({ x: -2, y: -1, z: 10 });
  // Point light source (screen coords.)
  const L2 = createVector(500, 500, 2000);
  
  faceLoop1: for (let i = 0; i < G.faces.length; i++) {
    // Check if face is visible from directional light source (L1)
    // const a = dot(Nscr[i], L1);
    // if (a < 0) { continue faceLoop1; }

    // Check if face is visible from point light source (L2)
    const face = G.faces[i];
    const p = face.v.map(v => Pscr[v]);
    
    // const a = Nscr[i].x * (p[0].x - L2.x) + Nscr[i].y * (p[0].y - L2.y) + Nscr[i].z * (p[0].z - L2.z);
    const a = dot(Nscr[i], { x: p[0].x - L2.x, y: p[0].y - L2.y, z: p[0].z - L2.z });
    if (a < 0) { continue faceLoop1; }
  
    // Project the vertices in p to the plane z = 0

    // For directional light source (L1) ...
    // const pp = p.map<Vector3D>(v => ({ x: v.x - v.z * L1.x / L1.z, y: v.y - v.z * L1.y / L1.z, z: 0 }));

    // For point light source (L2) ...
    const pp = p.map(point => {
      const v = normalizeVector(createVector(point.x - L2.x, point.y - L2.y, point.z - L2.z));
      return {
        x: point.x - point.z * v.x / v.z,
        y: point.y - point.z * v.y / v.z,
        z: 0
      };
    });

    const sxmin = floor(min(...pp.map(v => v.x)) - .5),
          sxmax = floor(max(...pp.map(v => v.x)) + .5),
          symin = floor(min(...pp.map(v => v.y)) - .5),
          symax = floor(max(...pp.map(v => v.y)) + .5);

    if (sxmin > vp.screen.xmax || sxmax < vp.screen.xmin || symin > vp.screen.ymax || symax < vp.screen.ymin) { continue faceLoop1; }
    
    // Interpolation constants
    let A: number[][];
    switch (face.v.length) {
      case 3:          
        A = [
          [ NaN, pp[1].x - pp[0].x, pp[2].x - pp[0].x, pp[0].x - pp[2].x ],
          [ NaN, pp[1].y - pp[0].y, pp[2].y - pp[0].y, pp[0].y - pp[2].y ]
        ];
        break;
      case 4:
        A = [
          [ NaN, pp[1].x - pp[0].x, pp[3].x - pp[0].x, pp[0].x - pp[1].x + pp[2].x - pp[3].x ],
          [ NaN, pp[1].y - pp[0].y, pp[3].y - pp[0].y, pp[0].y - pp[1].y + pp[2].y - pp[3].y ]
        ];
    }

    yloop1: for (let sy = symin; sy <= symax; sy++) {
      if (sy - vp.screen.ymin < 0 || sy - vp.screen.ymin > vp.pixelBuffer.height - 1) { continue yloop1; }
      A[1][0] = pp[0].y - sy;
      xloop1: for (let sx = sxmin; sx <= sxmax; sx++) {
        if (sx - vp.screen.xmin < 0 || sx - vp.screen.xmin > vp.pixelBuffer.width - 1) { continue xloop1; }
        A[0][0] = pp[0].x - sx;
        const params = coonsSolver(A[0], A[1]);
        if (!params) { continue xloop1; }
        const zBufferIndex = sx - vp.screen.xmin + (sy - vp.screen.ymin) * vp.pixelBuffer.width;
        if (vp.zBuffer[zBufferIndex] < 0) {
          vp.zBuffer[zBufferIndex] = 0;
          const destIndex = zBufferIndex << 2;
          pixels[destIndex] = 0;
          pixels[destIndex + 1] = 70;
          pixels[destIndex + 2] = 0;
          pixels[destIndex + 3] = 255;
        }
      }
    }
  }
  */

  /**
   * Scan convert all visible faces ...
   */
  faceLoop: for (let i = 0; i < G.faces.length; i++) {
    const nz = Nscr[i].z;

    // Back-face culling
    if (nz < 0) {
      continue faceLoop;
    }

    const face = G.faces[i];
    const p = face.v.map(v => Pscr[v]);
    const sxmin = floor(min(...p.map(v => v.x)) - .5),
          sxmax = floor(max(...p.map(v => v.x)) + .5),
          symin = floor(min(...p.map(v => v.y)) - .5),
          symax = floor(max(...p.map(v => v.y)) + .5);

    if (sxmin > vp.screen.xmax || sxmax < vp.screen.xmin || symin > vp.screen.ymax || symax < vp.screen.ymin) {
      continue faceLoop;
    }

    /**
     * New scan conversion algorithm (based on Coon's linear surface) 
     * - It has a relatively good performance for small triangular or quadrilateral faces.
     * However, long slender diagonally aligned objects should be sliced into smaller pieces.
     */

    // Polygon vertices and texture coords.
    const P = face.v.map(i => Pscr[i]);
    const T = face.v.map(i => ({ u: G.vertices[i].u, v: G.vertices[i].v }));
    const N = face.v.map(i => vertexNormals[i]);
    // const Nz = face.v.map(i => vertexNormalsZ[i]);

    // Interpolation constants
    let A: number[][];
    const F = [0, 0, 0, 0, 0, 0];

    switch (face.v.length) {
      case 3:          
        A = [
          [ NaN, P[1].x - P[0].x, P[2].x - P[0].x, P[0].x - P[2].x ],
          [ NaN, P[1].y - P[0].y, P[2].y - P[0].y, P[0].y - P[2].y ],                        
          [ T[0].u, T[1].u - T[0].u, T[2].u - T[0].u, T[0].u - T[2].u ],
          [ T[0].v, T[1].v - T[0].v, T[2].v - T[0].v, T[0].v - T[2].v ],
          [ N[0].x, N[1].x - N[0].x, N[2].x - N[0].x, N[0].x - N[2].x ],
          [ N[0].y, N[1].y - N[0].y, N[2].y - N[0].y, N[0].y - N[2].y ],
          [ N[0].z, N[1].z - N[0].z, N[2].z - N[0].z, N[0].z - N[2].z ],
          [ P[0].z, P[1].z - P[0].z, P[2].z - P[0].z, P[0].z - P[2].z ]
        ];
        break;
      case 4:
        A = [
          [ NaN, P[1].x - P[0].x, P[3].x - P[0].x, P[0].x - P[1].x + P[2].x - P[3].x ],
          [ NaN, P[1].y - P[0].y, P[3].y - P[0].y, P[0].y - P[1].y + P[2].y - P[3].y ],
          [ T[0].u, T[1].u - T[0].u, T[3].u - T[0].u, T[0].u - T[1].u + T[2].u - T[3].u ],
          [ T[0].v, T[1].v - T[0].v, T[3].v - T[0].v, T[0].v - T[1].v + T[2].v - T[3].v ],
          [ N[0].x, N[1].x - N[0].x, N[3].x - N[0].x, N[0].x - N[1].x + N[2].x - N[3].x ],
          [ N[0].y, N[1].y - N[0].y, N[3].y - N[0].y, N[0].y - N[1].y + N[2].y - N[3].y ],
          [ N[0].z, N[1].z - N[0].z, N[3].z - N[0].z, N[0].z - N[1].z + N[2].z - N[3].z ],
          [ P[0].z, P[1].z - P[0].z, P[3].z - P[0].z, P[0].z - P[1].z + P[2].z - P[3].z ]
        ];
        break;
      default:
        console.log('Scan converter supports only triangular and quadrilateral faces');
        return;
    }

    let u: number, v: number, uv: number;
    let ix: number, iy: number;
    let srcIndex: number, destIndex: number;

    yloop: for (let sy = symin; sy <= symax; sy++) {
      if (sy - vp.screen.ymin < 0 || sy - vp.screen.ymin > vp.pixelBuffer.height - 1) {
        continue yloop;
      }
      A[1][0] = P[0].y - sy;
      xloop: for (let sx = sxmin; sx <= sxmax; sx++) {
        if (sx - vp.screen.xmin < 0 || sx - vp.screen.xmin > vp.pixelBuffer.width - 1) {
          continue xloop;
        }
        A[0][0] = P[0].x - sx;
        // Solve for parameters (u,v) on Coon's linear surface, 0 <= u,v <= 1
        const params = coonsSolver(A[0], A[1]);
        if (!params) {
          continue xloop;
        }
        u = params.u;
        v = params.v;
        uv = u * v;

        /**
         * Interpolation
         * F(u,v) = A * [u, v, u * v]
         */

        // Interpolate texture coordinates and vertex normal
        // for (let i = 2; i < A.length; i++) {
        //   F[i - 2] = A[i][0] + A[i][1] * u + A[i][2] * v + A[i][3] * u * v;
        // }

        // face z
        F[5] = A[7][0] + A[7][1] * u + A[7][2] * v + A[7][3] * uv;
        
        // destIndex = (sx - vp.screen.xmin + (sy - vp.screen.ymin) * vp.pixelBuffer.width)<<2;

        const zBufferIndex = sx - vp.screen.xmin + (sy - vp.screen.ymin) * vp.pixelBuffer.width;
                
        if (F[5] > vp.zBuffer[zBufferIndex]) {
          vp.zBuffer[zBufferIndex] = F[5];

          // tu,tv
          F[0] = constrain(A[2][0] + A[2][1] * u + A[2][2] * v + A[2][3] * uv, 0, 1);
          F[1] = constrain(A[3][0] + A[3][1] * u + A[3][2] * v + A[3][3] * uv, 0, 1);
          // vertex normal
          F[2] = A[4][0] + A[4][1] * u + A[4][2] * v + A[4][3] * uv;
          F[3] = A[5][0] + A[5][1] * u + A[5][2] * v + A[5][3] * uv;
          F[4] = A[6][0] + A[6][1] * u + A[6][2] * v + A[6][3] * uv;

          ix = constrain(floor(F[0] * texture.width), 0, texture.width - 1);
          iy = constrain(floor(F[1] * texture.height), 0, texture.height - 1);

          const mag = sqrt(F[2] * F[2] + F[3] * F[3] + F[4] * F[4]);

          F[2] /= mag;
          F[3] /= mag;
          F[4] /= mag;

          /**
           * Pixel shading
           * Uses the z-component (0<=nz<=1) of the face's normal vector (n) to adjust the shade of the texture color value at (ix,iy).
           * Assumes that there is a directional light above the pool table.
           */

          srcIndex = (ix + iy * texture.width) << 2;
          destIndex = zBufferIndex << 2;

          /** Flat shading */
          pixels[destIndex] = nz * texture.data[srcIndex];
          pixels[destIndex + 1] = nz * texture.data[srcIndex + 1];
          pixels[destIndex + 2] = nz * texture.data[srcIndex + 2];
          pixels[destIndex + 3] = 255;

          /** Gouraud shading, using the interpolated average intensity */
          /*
          pixels[destIndex] = nzi * texture.data[srcIndex];
          pixels[destIndex + 1] = nzi * texture.data[srcIndex + 1];
          pixels[destIndex + 2] = nzi * texture.data[srcIndex + 2];
          pixels[destIndex + 3] = 255;
          */

          /** Phong shading, using the interpolated vertex normal */
          // const cosa = dot(L, { x: F[2], y: F[3], z: F[4] });
          /*
          const nzi = abs(F[4]);
          const I = nzi;
          pixels[destIndex] = I * texture.data[srcIndex];
          pixels[destIndex + 1] = I * texture.data[srcIndex + 1];
          pixels[destIndex + 2] = I * texture.data[srcIndex + 2];
          pixels[destIndex + 3] = 255;
          */
        }
      }
    }
  }
}

/**
 * Scan-converts a projected polygon
 * 
 * @param vp current viewport
 * @param pp projected (shadow) face
 * @param p target face
 * @param n target face normal
 */
 export function scanConvertProjectedPolygon(vp: Viewport, projectedPoly: Vector3D[], targetPoly: Vector3D[], n: Vector3D) {

  /**
   * Create a rotation quaternion to be used when creating the outward target polygon edge normals
   */
  // const qr = Quaternion.forAxis(n, -Constants.HALF_PI);
  // const qr = Quaternion.forAxis({ ...n, z: -1 }, -Constants.HALF_PI);
  const qr = Quaternion.forAxisZ(Constants.HALF_PI);  // why not neg. angle ???

  /**
   * create the target polygon edge vectors pointing out from the polygon interior
   */
  const N = targetPoly.length;
  const e: Vector3D[] = [];

  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const v: Vector3D = normalizeVector({
      x: targetPoly[j].x - targetPoly[i].x,
      y: targetPoly[j].y - targetPoly[i].y,
      // z: targetPoly[j].z - targetPoly[i].z,
      z: 0
    });
    e.push(Quaternion.forVector(v).rotate(qr).toVector());
  }

  /**
   * Test if projected polygon has some vertex inside or is completely outside the target polygon.
   * For an N-sided polygon, an N-digit binary code is generated for each vertex of the projected polygon.
   */
  let inside = false;
  let result = bitmask(N);

  for (let pp of projectedPoly) {
    const code = targetPoly
      .map<number>((p, i) => (dot(e[i], { x: pp.x - p.x, y: pp.y - p.y, z: pp.z - p.z }) > 0) ? 1 : 0)  // bit value 1 if outside and 0 if inside
      .reduce((result, val, i) => result | (val << i), 0);
    inside = (code === 0);
    if (inside) { break; }
    result &= code;
  }
  
  if (!inside) {
    const outside = (result !== 0);
    if (outside) {
      return; // Outside target polygon, aborting scan conversion ...
    }
  }

  // Inside (or crossing) the target polygon, continuing with the scan conversion ...

  const sxmin = floor(min(...projectedPoly.map(v => v.x)) - .5),
        sxmax = floor(max(...projectedPoly.map(v => v.x)) + .5),
        symin = floor(min(...projectedPoly.map(v => v.y)) - .5),
        symax = floor(max(...projectedPoly.map(v => v.y)) + .5);
        
  // if (sxmin > vp.screen.xmax || sxmax < vp.screen.xmin || symin > vp.screen.ymax || symax < vp.screen.ymin) {
  //   return;
  // }

  // const A = getInterpolationConstants(projectedPoly);

  // Obtain the edge normals for the projected polygon
  const M = projectedPoly.length;
  const f: Vector3D[] = [];

  for (let i = 0; i < M; i++) {
    const j = (i + 1) % M;
    const v: Vector3D = normalizeVector({
      x: projectedPoly[j].x - projectedPoly[i].x,
      y: projectedPoly[j].y - projectedPoly[i].y,
      // z: projectedPoly[j].z - projectedPoly[i].z,
      z: 0
    });
    f.push(Quaternion.forVector(v).rotate(qr).toVector());
  }

  const isPointOutsideTargetPolygon = (x: number, y: number): boolean => {
    for (let i = 0; i < targetPoly.length; i++) {
      const outside = dot(e[i], { x: x - targetPoly[i].x, y: y - targetPoly[i].y, z: 0 }) > 0;
      if (outside) {
        return true;
      }
    }
    return false;
  };

  const isPointOutsideProjectedPolygon = (x: number, y: number): boolean => {
    for (let i = 0; i < projectedPoly.length; i++) {
      const outside = dot(f[i], { x: x - projectedPoly[i].x, y: y - projectedPoly[i].y, z: 0 }) < 0;  // why < 0 ???
      if (outside) {
        return true;
      }
    }
    return false;
  };

  const pixels = vp.pixelBuffer.data;

  yloop: for (let sy = symin; sy <= symax; sy++) {
    if (sy - vp.screen.ymin < 0 || sy - vp.screen.ymin > vp.pixelBuffer.height - 1) {
      continue yloop;
    }
    // A[1][0] = projectedPoly[0].y - sy;
    
    xloop: for (let sx = sxmin; sx <= sxmax; sx++) {
      /*
      if ((sx - vp.screen.xmin < 0) || (sx - vp.screen.xmin > vp.pixelBuffer.width - 1) ||
        isPointOutsideTargetPolygon(sx, sy)) {
          continue xloop;
      }
      */
      if ((sx - vp.screen.xmin < 0) || (sx - vp.screen.xmin > vp.pixelBuffer.width - 1) ||
        isPointOutsideTargetPolygon(sx, sy) || isPointOutsideProjectedPolygon(sx, sy)) {
          continue xloop;
      }
      /*
      if ((sx - vp.screen.xmin < 0) || (sx - vp.screen.xmin > vp.pixelBuffer.width - 1)) { continue xloop; }
      */
      // A[0][0] = projectedPoly[0].x - sx;

      const zBufferIndex = sx - vp.screen.xmin + (sy - vp.screen.ymin) * vp.pixelBuffer.width;

      const destIndex = zBufferIndex << 2;
      pixels[destIndex] = 0;
      pixels[destIndex + 1] = 70;
      pixels[destIndex + 2] = 0;
      pixels[destIndex + 3] = 255;

      // if (vp.zBuffer[zBufferIndex] < 0) {
      //   vp.zBuffer[zBufferIndex] = 0;
      //   const destIndex = zBufferIndex << 2;
      //   pixels[destIndex] = 0;
      //   pixels[destIndex + 1] = 70;
      //   pixels[destIndex + 2] = 0;
      //   pixels[destIndex + 3] = 255;
      // }
    }
  }
}
