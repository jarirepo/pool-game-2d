import { Vector3D, createRotationMatrixZ, applyTransform } from './vector3d';
import { Constants } from '../constants';
import { Vertex, Face, Geometry } from '../geometry/geometry';

const { cos, sin, asin, atan2, sqrt } = Math;

const MSIZE = 12;
const NSIZE = 24;

/** Returns the F:(V)-graph, face normals */
function createFaces(M: number, N: number, V: Vertex[]): Face[] {
  const F: Face[] = [];
  let index = 0;
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < N; j++) {
      // Create quadrilateral face (the faces at the poles will degenerate into triangular faces)
      const n1 = i * (N + 1) + j,
            n2 = (i + 1) * (N + 1) + j,
            n3 = n2 + 1,
            n4 = n1 + 1;
      // const n = normalVector(V[n1], V[n2], V[n3]);
      // Edge direction vectors
      // const e: Vector3D[] = [
      //   { x: vertices[n2].x - vertices[n1].x, y: vertices[n2].y - vertices[n1].y, z: vertices[n2].z - vertices[n1].z },
      //   { x: vertices[n3].x - vertices[n2].x, y: vertices[n3].y - vertices[n2].y, z: vertices[n3].z - vertices[n2].z },
      //   { x: vertices[n4].x - vertices[n3].x, y: vertices[n4].y - vertices[n3].y, z: vertices[n4].z - vertices[n3].z },
      //   { x: vertices[n1].x - vertices[n4].x, y: vertices[n1].y - vertices[n4].y, z: vertices[n1].z - vertices[n4].z }
      // ];
      const e: Vector3D[] = [].map(v => {
        const m = sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        return { x: v.x / m, y: v.y / m, z: v.z / m };
      });
      F.push({ v: [ n1, n2, n3, n4 ], n: null, e, index });
      index++;
    }
  }
  return F;
}

/**
 * Generates a unit sphere (normalized coords.)
 */
function createSphere(): Geometry {
  console.log('createSphere');
  const vertices: Vertex[] = [];
  for (let i = 0; i <= MSIZE; i++) {
    const theta = i / MSIZE * Constants.PI,
          sinTheta = sin(theta),
          cosTheta = cos(theta);
    for (let j = 0; j <= NSIZE; j++) {
      const phi = j / NSIZE * Constants.TWO_PI,
            x = sinTheta * cos(phi),
            y = sinTheta * sin(phi),
            z = cosTheta,
            u = 0.5 + atan2(x, z) / Constants.TWO_PI,
            v = 0.5 - asin(y) / Constants.PI;
      vertices.push({ x, y, z, u, v, n: null });
    }
  }
  const faces = createFaces(MSIZE, NSIZE, vertices);
  return new Geometry(vertices, faces);
}

// const compressedVertices = vertices.map(v => ({
//   x: floor(127.5 * (1 + v.x)),
//   y: floor(127.5 * (1 + v.y)),
//   z: floor(127.5 * (1 + v.z))
// }));
// console.log({
//   originalVertextCount: vertices.length,
//   indexList,
//   newIndex,
//   faces,
//   originalVertices: compressedVertices,  
//   vertices: compressedVertices.filter((v, i) => indexList[i] === i)
// });

/**
 * Generates a truncated cone (normalized coords.) with bottom radius 1, top radius kr and height 1
 * along the local z-axis.
 * 
 * Different values for kr:
 *  * 0 - creates an apex cone
 *  * 1 - creates a cyliner
 *  * < 1 - create a truncated cone (top radius will be kr)
 */
function createCone(kr: number): Geometry {
  console.log('createCone');
  // Definition points (polyline generatriz since want faces at both ends)
  // const P: Vector3D[] = [
  //   { x: 0, y: 0, z: 0 },
  //   { x: 1, y: 0, z: 0 },
  //   // { x: (1 - kr) * (1 - .8), y: 0, z: .8 },
  //   { x: kr, y: 0, z: 1},
  //   { x: 0, y: 0, z: 1 }
  // ];

  const P: Vector3D[] = [];
  P.push({ x: 0, y: 0, z: 0 });
  P.push({ x: kr + (1 - kr) * (1 - 0), y: 0, z: 0 });
  P.push({ x: kr + (1 - kr) * (1 - .25), y: 0, z: .25 });
  P.push({ x: kr + (1 - kr) * (1 - .5), y: 0, z: .5 });
  P.push({ x: kr + (1 - kr) * (1 - .75), y: 0, z: .75 });
  P.push({ x: kr + (1 - kr) * (1 - .99), y: 0, z: .99 }); // Start of tip
  P.push({ x: kr + (1 - kr) * (1 - 1.0), y: 0, z: 1.0 });
  P.push({ x: 0, y: 0, z: 1 });

  // Generates the cone by rotating the profile about the z-axis
  const N = P.length;
  const T = createRotationMatrixZ(Constants.TWO_PI / NSIZE);
  const vertices: Vertex[] = [];

  for (let i = 0; i < N; i++) {
    const v = (() => {
      switch (i) {
        case 0: return 0;
        case 1: return .1;
        case 2: return .25;
        case 3: return .5;
        case 4: return .75;
        case 5: return .99;
        case 6: return .99;
        case 7: return 1;
      }
    })();
    
    for (let j = 0; j <= NSIZE; j++) {
      const u = j / NSIZE;
      vertices.push({ ...P[i], u, v, n: null });
      P[i] = applyTransform(P[i], T);
    }
  }

  // The faces will be ordered in strips around the cone from bottom to top
  const faces = createFaces(N-1, NSIZE, vertices);
  // console.log('Cone faces:', ...faces.map(face => face.v));

  return new Geometry(vertices, faces);
}

export namespace Primitives {
  export const Sphere = createSphere();  
  export const Cone = {
    create: (kr = 0): Geometry => createCone(kr)
  };
}
