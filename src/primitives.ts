import { Vector3D } from './vector3d';
import { Constants } from './constants';

interface Face {
  v: number[];    // vertex indices
  n: Vector3D;    // normal vector
  e: Vector3D[];  // edge direction vectors
}

const { cos, sin, asin, atan2, PI, sqrt, floor, pow } = Math;

const MSIZE = 12;
const NSIZE = 24;

const vertices: { x: number, y: number, z: number, u: number, v: number }[] = [];
const faces: Face[] = [];

// Compute a unit sphere sphere model used for the UV-mapping
for (let i = 0; i <= MSIZE; i++) {
  const theta = i / MSIZE * PI;
  const sinTheta = sin(theta);
  const cosTheta = cos(theta);
  for (let j = 0; j <= NSIZE; j++) {
    const phi = j / NSIZE * Constants.TWO_PI;
    const x = sinTheta * cos(phi);
    const y = sinTheta * sin(phi);
    const z = cosTheta;
    const u = 0.5 + atan2(x, z) / Constants.TWO_PI;
    const v = 0.5 - asin(y) / PI;
    vertices.push({ x, y, z, u, v });
  }
}

// Compute the sphere's F:(V)-graph and face normals
for (let i = 0; i < MSIZE; i++) {
  for (let j = 0; j < NSIZE; j++) {
    // Create quadrilateral face (the faces at the poles will degenerate into triangular faces)
    const n1 = i * (NSIZE + 1) + j,
          n2 = (i + 1) * (NSIZE + 1) + j,
          n3 = (i + 1) * (NSIZE + 1) + j + 1,
          n4 = i * (NSIZE + 1)+ j + 1;
    // Normal vector
    const u: Vector3D = {
      x: vertices[n2].x - vertices[n1].x,
      y: vertices[n2].y - vertices[n1].y,
      z: vertices[n2].z - vertices[n1].z
    };
    const v: Vector3D = {
      x: vertices[n3].x - vertices[n1].x,
      y: vertices[n3].y - vertices[n1].y,
      z: vertices[n3].z - vertices[n1].z
    };
    const w: Vector3D = {
      x: u.y * v.z - u.z * v.y,
      y: u.z * v.x - u.x * v.z,
      z: u.x * v.y - u.y * v.x
    };
    const wmag = sqrt(w.x * w.x + w.y * w.y + w.z * w.z);
    w.x /= wmag;
    w.y /= wmag;
    w.z /= wmag;
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
    faces.push({
      v: [ n1, n2, n3, n4 ],
      n: w,
      e
    });
  }
}

// console.log(faces);

/**
 * Removal of duplicate vertices and re-mapping of vertex indices.
 */
const DTOL = 1e-12;
const N = vertices.length;
const indexList = vertices.map((_, i) => i);
const newIndex = vertices.map((_, i) => i);
let k = 0;

outerLoop: for (let i = 0; i < N - 1; i++) {
  if (indexList[i] !== i) { continue outerLoop; }
  newIndex[i] = k;
  const v1 = vertices[i];
  for (let j = i + 1; j < N; j++) {
    const v2 = vertices[j];
    const d2 = pow(v1.x - v2.x, 2) + pow(v1.y - v2.y, 2) + pow(v1.z - v2.z, 2);
    if (d2 < DTOL) {
      indexList[j] = i;   // Vertex (j) is a duplicate of vertex (i)
      newIndex[j] = k;
    }
  }
  k++;
}

// Update vertex indices for the faces and reduction to triangular face if needed
faces.forEach(face => {
  face.v = face.v
    .map(val => newIndex[val])
    .filter((val, i, arr) => arr.indexOf(val) === i)
});

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

export namespace Primitives {
  export const Sphere = {
    data: vertices.filter((v, i) => indexList[i] === i),
    faces
  };
}
