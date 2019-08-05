import { Matrix4, applyTransform, normalizeVector, Vector3D, applyTransformToVector } from './geometry/vector3d';
import { Geometry } from './geometry/geometry';
import { Viewport } from './viewport';
import { coonsSolver } from './solvers';
import { constrain } from './utils';

const { floor, max, min, sqrt } = Math;

export function applyTexture(vp: Viewport, G: Geometry, texture: ImageData, T: Matrix4, Tpre = (v: Vector3D) => v) {
  // T: Transformation from OCS to screen coordinates
  const pixels = vp.pixelBuffer.data;

  // Directional light source (should not be declared here...), in screen coords.!
  const L: Vector3D = normalizeVector({ x: -2, y: -1, z: 2 });

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
    
  // Scan-convert all visible faces
  faceLoop: for (let i = 0; i < G.faces.length; i++) {
    const nz = Nscr[i].z;

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

    // New scan conversion algorithm!

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
          const nz = F[4];
          pixels[destIndex] = nz * texture.data[srcIndex];
          pixels[destIndex + 1] = nz * texture.data[srcIndex + 1];
          pixels[destIndex + 2] = nz * texture.data[srcIndex + 2];
          pixels[destIndex + 3] = 255;

          /** Gouraud shading, using the interpolated average intensity */
          // pixels[destIndex] = nzi * texture.data[srcIndex];
          // pixels[destIndex + 1] = nzi * texture.data[srcIndex + 1];
          // pixels[destIndex + 2] = nzi * texture.data[srcIndex + 2];
          // pixels[destIndex + 3] = 255;

          /** Phong shading, using the interpolated vertex normal */
          // const cosa = dot(L, { x: F[2], y: F[3], z: F[4] });
          // const I = .2 + .8 * cosa;
          // pixels[destIndex] = I * texture.data[srcIndex];
          // pixels[destIndex + 1] = I * texture.data[srcIndex + 1];
          // pixels[destIndex + 2] = I * texture.data[srcIndex + 2];
          // pixels[destIndex + 3] = 255;
        }
      }
    }
  }
}
