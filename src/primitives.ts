import { Vector3D } from './vector3d';

interface Face {
  v: number[];    // vertex indices
  n: Vector3D;    // normal vector
}

const { cos, sin, asin, atan2, PI, sqrt } = Math;
const TWO_PI = 2 * PI;
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
    const phi = j / NSIZE * TWO_PI;
    const x = sinTheta * cos(phi);
    const y = sinTheta * sin(phi);
    const z = cosTheta;
    const u = 0.5 + atan2(z, x) / TWO_PI;
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
    faces.push({
      v: [ n1, n2, n3, n4 ],
      n: w
    });
  }
}

console.log(faces);

export namespace Primitives {

  export const Sphere = {
    data: vertices,
    faces
  };
}
