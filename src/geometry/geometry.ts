// import Delaunator from 'delaunator';
import * as seidel from 'seidel';
import { Vector3D, Matrix4, applyTransform, normalizeVector, normalVector, createVector, rotationDirectionXY, subtractVectors } from './vector3d';
import { Quaternion } from './quaternion';
import { Constants } from '../constants';

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

/** Simple triangulation for convex polygons */
function triangulatePoly(n: number, indexOffset = 0): Triangle[] {
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

    // Using Seidel's algorithm for the triangulation which produces an array of 2D-vertices
    const points = [ v.map(p => [ p.x, p.y ]) ];
    const ST: { x: number, y: number }[][] = seidel(points); // triangles
    
    // console.log('Seidel Triangulation:', ST);

    const vertices: Vertex[] = [];
    const faces: Face[] = [];
    
    const qr = Quaternion.forAxisZ(-Constants.HALF_PI);

    for (let i = 0; i < ST.length; i++) {

      // Add 3 vertices
      for (let p of ST[i]) {
        vertices.push({
          x: p.x,
          y: p.y,
          z: 0,
          u: NaN,
          v: NaN,
          n: createVector(0, 0, 1)
        });
      }

      // Vertex indices for the triangular face
      const vertexIndices =  [
        i * 3,
        i * 3 + 1,
        i * 3 + 2
      ];

      // Check if the face has a CCW orientation (swap the index of the 1st and 3rd vertex if needed).
      // This assumes that the polygon is defined on the xy-plane.
      const v0 = subtractVectors(vertices[vertexIndices[1]], vertices[vertexIndices[0]]),
            v1 = subtractVectors(vertices[vertexIndices[2]], vertices[vertexIndices[1]]);
      
      if (rotationDirectionXY(v0, v1) < 0) {
        [vertexIndices[0], vertexIndices[2]] = [vertexIndices[2], vertexIndices[0]];
      }

      const a = normalizeVector(subtractVectors(vertices[vertexIndices[1]], vertices[vertexIndices[0]])),
            b = normalizeVector(subtractVectors(vertices[vertexIndices[2]], vertices[vertexIndices[1]])),
            c = normalizeVector(subtractVectors(vertices[vertexIndices[0]], vertices[vertexIndices[2]]));

      const edgeNormals: Vector3D[] = [
        Quaternion.forVector(a).rotate(qr).toVector(),
        Quaternion.forVector(b).rotate(qr).toVector(),
        Quaternion.forVector(c).rotate(qr).toVector()  
      ];

      const face: Face = {
        index: i,
        v: vertexIndices,
        n: createVector(0, 0, 1),
        e: edgeNormals
      };

      faces.push(face);
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
