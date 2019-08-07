// import Delaunator from 'delaunator';
import * as seidel from 'seidel';
import { Vector3D, Matrix4, applyTransform, normalizeVector, normalVector, createVector, rotationDirectionXY, subtractVectors } from './vector3d';

const { pow } = Math;

const DTOL = 1e-12;

export interface Face {
  v: number[];      // vertex indices
  n: Vector3D;      // normal vector
  e?: Vector3D[];   // edge direction vectors
  index: number;
}

export interface Vertex {
  x: number;
  y: number;
  z: number;
  u?: number;
  v?: number;
  n?: Vector3D;
}

export interface Plane {
  p: Vector3D;
  n: Vector3D;
  faceIndex?: number;
}

/**
 * Double-recursive algorithm to triangulate closed convex polygons:
 * https://editor.p5js.org/jarirepo76/sketches/z50JrshCU
 */
interface Triangle {
  a: number;
  b: number;
  c: number;
}

function splitPoly(vertexIndices: number[], T: Triangle[] = []) {
  const n = vertexIndices.length;
  if (n === 3) {
    T.push({ a: vertexIndices[0], b: vertexIndices[1], c: vertexIndices[2] });
  } else {
    const m = n >> 1,
          lo = vertexIndices.filter((_, i) => (i <= m)),
          hi = vertexIndices.filter((_, i) => (i >= m));
    splitPoly(lo, T);
    splitPoly([...hi, lo[0]], T);
  }
  return T;
}

function triangulatePoly(n: number, indexOffset = 0) {
  if (n < 3) {
    return [];
  }
  const vertexIndices = new Array(n).fill(0).map((_, i) => (i + indexOffset) % n);
  return splitPoly(vertexIndices);
}

export class Geometry {

  constructor(public vertices: Vertex[], public readonly faces: Face[]) {
    this.reduce();
  }

  /** Returns a Geometry object from a closed set of vertices */
  static fromVertices(v: Vector3D[]): Geometry {
    // Simple triangulation - works only for convex polygons
    /*
    const triangles = triangulatePoly(v.length);
    const faces: Face[] = triangles.map<Face>((t, i) => ({ v: [t.a, t.b, t.c], n: createVector(0, 0, 1), e: [], index: i }));
    const vertices: Vertex[] = v.map(v => ({ ...v, u: NaN, v: NaN, n: createVector(0, 0, 1) }));
    console.log('Triangles:', triangles);
    return new Geometry(vertices, faces);
    */

    /*
    // Delaunay triangulation
    // The delaunator library takes as input a set of 2D-points but will not generate a correct triangulation
    // for closed concave polygons.

    // const points = v.map(p => [ p.x, p.y ]);
    // const DT = Delaunator.from(points);
    const DT = Delaunator.from(v, p => p.x, p => p.y);

    // console.log('DT.coords', DT.coords);
    // console.log('DT.triangles:', DT.triangles);

    const vertices: Vertex[] = [];
    const faces: Face[] = [];

    for (let i = 0; i < DT.coords.length; i += 2) {
      vertices.push({
        x: DT.coords[i],
        y: DT.coords[i + 1],
        z: 0,
        u: NaN,
        v: NaN,
        n: createVector(0, 0, 1)
      })
    }

    let index = 0;
    for (let i = 0; i < DT.triangles.length; i += 3, index++) {
      faces.push({
        v: [ DT.triangles[i], DT.triangles[i + 1], DT.triangles[i + 2] ],
        n: createVector(0, 0, 1),
        e: [],
        index
      });
    }

    // Check the orientation of the faces (they should all be CCW) ...
    for (let face of faces) {
      const v0: Vector3D = {
        x: vertices[face.v[1]].x - vertices[face.v[0]].x,
        y: vertices[face.v[1]].y - vertices[face.v[0]].y,
        z: vertices[face.v[1]].z - vertices[face.v[0]].z,
      };
      const v1: Vector3D = {
        x: vertices[face.v[2]].x - vertices[face.v[1]].x,
        y: vertices[face.v[2]].y - vertices[face.v[1]].y,
        z: vertices[face.v[2]].z - vertices[face.v[1]].z,
      };
      const d = rotationDirectionXY(v0, v1);
      // console.log(d);
    }
    */

    // Using Seidel's algorithm for the triangulation which produces an array of 2D-vertices
    const points = [ v.map(p => [ p.x, p.y ]) ];
    const ST: { x: number, y: number }[][] = seidel(points); // triangles
    console.log('Seidel Triangulation:', ST);
    const vertices: Vertex[] = [];
    const faces: Face[] = [];

    for (let i = 0; i < ST.length; i++) {
      for (let p of ST[i]) {
        vertices.push({ x: p.x, y: p.y, z: 0, u: NaN, v: NaN, n: createVector(0, 0, 1) });
      }
      const face: Face = { index: i, v: [ i * 3, i * 3 + 1, i * 3 + 2], n: createVector(0, 0, 1), e: [] };
      faces.push(face);
      // Check if the face has a CCW orientation
      const v0 = subtractVectors(vertices[face.v[1]], vertices[face.v[0]]),
            v1 = subtractVectors(vertices[face.v[2]], vertices[face.v[1]]);
      if (rotationDirectionXY(v0, v1) < 0) {
        [face.v[0], face.v[2]] = [face.v[2], face.v[0]];
      }
    }

    console.log('vertices:', [...vertices.map(v => ({ ...v }))]);
    console.log('faces:', [...faces.map(v => ({ ...v }))]);
  
    return new Geometry(vertices, faces);
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
    console.log('reduce');

    const N = this.vertices.length;
    const indexList = this.vertices.map((_, i) => i);
    const newIndex = [ ...indexList ];
    let k = 0;

    for (let i = 0; i < N; i++) {
      if (indexList[i] === i) {
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
    }
  
    // console.log('Face vertex indices:', this.faces.map(face => face.v));
    
    // Remove duplicate vertices
    this.vertices = this.vertices.filter((v, i) => indexList[i] === i);

    // console.log('Index List:', indexList);
    // console.log('New Index:', newIndex);
    // console.log('Unique vertices:', this.vertices);

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
