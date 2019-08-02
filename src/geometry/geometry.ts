import { Vector3D, Matrix4, applyTransform, normalizeVector, normalVector } from './vector3d';

const { pow } = Math;

const DTOL = 1e-12;

export interface Face {
  v: number[];    // vertex indices
  n: Vector3D;    // normal vector
  e?: Vector3D[];  // edge direction vectors
}

export interface Vertex {
  x: number;
  y: number;
  z: number;
  u?: number;
  v?: number;
  n?: Vector3D;
}

export class Geometry {

  constructor(public vertices: Vertex[], public readonly faces: Face[]) {
    this.reduce();
  }

  /** Applies the transform T to the vertices */
  public transform(T: Matrix4): void {
    this.vertices.forEach(v => {
      const vt = applyTransform({ x: v.x, y: v.y, z: v.z }, T);
      v.x = vt.x;
      v.y = vt.y;
      v.z = vt.z;
    });
  }

  /** Removal of duplicate vertices and re-mapping of vertex indices */
  private reduce(): void {
    const N = this.vertices.length;
    const indexList = this.vertices.map((_, i) => i);
    const newIndex = this.vertices.map((_, i) => i);
    let k = 0;

    outerLoop: for (let i = 0; i < N - 1; i++) {
      if (indexList[i] !== i) { continue outerLoop; }
      newIndex[i] = k;
      const v1 = this.vertices[i];
      for (let j = i + 1; j < N; j++) {
        const v2 = this.vertices[j];
        const d2 = pow(v1.x - v2.x, 2) + pow(v1.y - v2.y, 2) + pow(v1.z - v2.z, 2);
        if (d2 < DTOL) {
          indexList[j] = i;   // Vertex (j) is a duplicate of vertex (i)
          newIndex[j] = k;
        }
      }
      k++;
    }
    
    // console.log('Face vertex indices:', this.faces.map(face => face.v));
    
    // Remove duplicate vertices
    this.vertices = this.vertices.filter((v, i) => indexList[i] === i);

    this.faces.forEach(face => {
      // Re-mapping of face vertex indices and reduction from "quadrilateral" to triangular face (if possible)
      face.v = face.v
        .map(i => newIndex[i])
        .filter((val, i, arr) => arr.indexOf(val) === i); // Removes any duplicate indices
      // Calculate face normal vector from 3 consecutive vertices (these are needed to obtain the vertex normals in the following step)
      const p0 = this.vertices[face.v[0]],
            p1 = this.vertices[face.v[1]],
            p2 = this.vertices[face.v[2]];
      face.n = normalVector(p0, p1, p2);
    });

    // console.log('Index List:', indexList);
    // console.log('New Index:', newIndex);
    // console.log('Re-mapped face vertex indices:', this.faces.map(face => face.v));

    // Calculate the average normal vector for each (unique) vertex, used in Gouraud shading etc.
    this.vertices = this.vertices.map((v, i) => {
      const connectedFaces = this.faces.filter(face => face.v.indexOf(i) !== -1);
      const nSum = connectedFaces
        .map<Vector3D>(face => face.n)
        .reduce<Vector3D>((sum, n) => ({ x: sum.x + n.x, y: sum.y + n.y, z: sum.z + n.z }), { x: 0, y: 0, z: 0});
      const n = normalizeVector({
        x: nSum.x / connectedFaces.length,
        y: nSum.y / connectedFaces.length,
        z: nSum.z / connectedFaces.length
      });
      return { ...v, n };
    });
  }
}
