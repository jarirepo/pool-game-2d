import { Vector3D, Matrix4 } from './vector3d';

const { sqrt } = Math;

/** Solves equation Ax=b with two unknowns */
export function solve2(A: number[][], b: number[]): number[] | null {
  if (A.length !== 2 && b.length !== 2) {
    return null;
  }
  const detA = A[0][0] * A[1][1] - A[0][1] * A[1][0];
  if (detA === 0) {
    return null;
  }
  return [
    (A[1][1] * b[0] - A[0][1] * b[1]) / detA,
    (-A[1][0] * b[0] + A[0][0] * b[1]) / detA
  ];
}

/**
 * Solves the following equation:
 *  f(u,v) = a0 + a1 * u + a2 * v + a3 * u * v = 0
 *  g(u,v) = b0 + b1 * u + b2 * v + b3 * u * v = 0
 *  0 <= u,v <= 1
 */
export function coonsSolver(a: number[], b: number[]): { u: number, v: number } | null {
  const c = [
    a[0] * b[2] - a[2] * b[0],
    a[0] * b[3] - a[3] * b[0] + a[1] * b[2] - a[2] * b[1],
    a[1] * b[3] - a[3] * b[1]
  ];

  const d0 = c[1] / (2 * c[2]);
  const d1 = d0 * d0 - c[0] / c[2];
  if (d1 < 0) {
    return null;
  }
  const d2 = sqrt(d1);
  let u = -d0 - d2;
  if (u < 0 || u > 1) {
  u = -d0 + d2;
    if (u < 0 || u > 1) {
      return null;
    }
  }
  const v = -(a[0] + a[1] * u) / (a[2] + a[3] * u);
  if (v < 0 || v > 1) {
    return null;
  }
  return { u, v };
}

/**
 * Returns the vector (u) as the vector (v) transformed to the coordinate system T by solving the equation: v = u * T
 */
export function transformVector(v: Vector3D, T: Matrix4): Vector3D | null {
  const d = T.m00 * (T.m11 * T.m22 - T.m12 * T.m21) -
            T.m01 * (T.m10 * T.m22 - T.m12 * T.m20) +
            T.m02 * (T.m10 * T.m21 - T.m11 * T.m20);
  return {
    x: (v.x * (T.m11 * T.m22 - T.m21 * T.m12) + v.y * (T.m01 * T.m22 - T.m21 * T.m02) + v.z * (T.m01 * T.m12 - T.m11 * T.m02)) / d,
    y: (v.x * (T.m10 * T.m22 - T.m20 * T.m12) + v.y * (T.m00 * T.m22 - T.m20 * T.m02) + v.z * (T.m00 * T.m12 - T.m10 * T.m02)) / d,
    z: (v.x * (T.m10 * T.m21 - T.m20 * T.m11) + v.y * (T.m00 * T.m21 - T.m20 * T.m01) + v.z * (T.m00 * T.m11 - T.m10 * T.m01)) / d
  };
}
