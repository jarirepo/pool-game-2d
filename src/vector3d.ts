const { PI, random, cos, sin } = Math;

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

export interface Matrix4 {
  m00: number; m01: number; m02: number; m03: number;
  m10: number; m11: number; m12: number; m13: number;
  m20: number; m21: number; m22: number; m23: number;
  m30: number; m31: number; m32: number; m33: number;
}

export function mmult4(a: Matrix4, b: Matrix4): Matrix4 {
  return {
    m00: a.m00 * b.m00 + a.m01 * b.m10 + a.m02 * b.m20 + a.m03 * b.m30,
    m01: a.m00 * b.m01 + a.m01 * b.m11 + a.m02 * b.m21 + a.m03 * b.m31,
    m02: a.m00 * b.m02 + a.m01 * b.m12 + a.m02 * b.m22 + a.m03 * b.m32,
    m03: a.m00 * b.m03 + a.m01 * b.m13 + a.m02 * b.m23 + a.m03 * b.m33,

    m10: a.m10 * b.m00 + a.m11 * b.m10 + a.m12 * b.m20 + a.m13 * b.m30,
    m11: a.m10 * b.m01 + a.m11 * b.m11 + a.m12 * b.m21 + a.m13 * b.m31,
    m12: a.m10 * b.m02 + a.m11 * b.m12 + a.m12 * b.m22 + a.m13 * b.m32,
    m13: a.m10 * b.m03 + a.m11 * b.m13 + a.m12 * b.m23 + a.m13 * b.m33,

    m20: a.m20 * b.m00 + a.m21 * b.m10 + a.m22 * b.m20 + a.m23 * b.m30,
    m21: a.m20 * b.m01 + a.m21 * b.m11 + a.m22 * b.m21 + a.m23 * b.m31,
    m22: a.m20 * b.m02 + a.m21 * b.m12 + a.m22 * b.m22 + a.m23 * b.m32,
    m23: a.m20 * b.m03 + a.m21 * b.m13 + a.m22 * b.m23 + a.m23 * b.m33,

    m30: a.m30 * b.m00 + a.m31 * b.m10 + a.m32 * b.m20 + a.m33 * b.m30,
    m31: a.m30 * b.m01 + a.m31 * b.m11 + a.m32 * b.m21 + a.m33 * b.m31,
    m32: a.m30 * b.m02 + a.m31 * b.m12 + a.m32 * b.m22 + a.m33 * b.m32,
    m33: a.m30 * b.m03 + a.m31 * b.m13 + a.m32 * b.m23 + a.m33 * b.m33
  };
}

export function mmult4all(matrices: Matrix4[]): Matrix4 {
  let a = matrices[0];
  for (let i = 1; i < matrices.length; i++) {
    a = mmult4(a, matrices[i]);
  }
  return a;
}

export function getRandomAxes(): Matrix4 {
  const alpha = random() * PI,
        beta = random() * PI,
        gamma = random() * PI,
        cosAlpha = cos(alpha), sinAlpha = sin(alpha),
        cosBeta = cos(beta), sinBeta = sin(beta),
        cosGamma = cos(gamma), sinGamma = sin(gamma);
  const Rx: Matrix4 = {
    m00: 1, m01: 0, m02: 0, m03: 0,
    m10: 0, m11: cosAlpha, m12: sinAlpha, m13: 0,
    m20: 0, m21: -sinAlpha, m22: cosAlpha, m23: 0,
    m30: 0, m31: 0, m32: 0, m33: 1
  };
  const Ry: Matrix4 = {
    m00: cosBeta, m01: 0, m02: -sinBeta, m03: 0,
    m10: 0, m11: 1, m12: 0, m13: 0,
    m20: sinBeta, m21: 0, m22: cosBeta, m23: 0,
    m30: 0, m31: 0, m32: 0, m33: 1
  };
  const Rz: Matrix4 = {
    m00: cosGamma, m01: sinGamma, m02: 0, m03: 0,
    m10: -sinGamma, m11: cosGamma, m12: 0, m13: 0,
    m20: 0, m21: 0, m22: 1, m23: 0,
    m30: 0, m31: 0, m32: 0, m33: 1
  };
  return mmult4all([Rx, Ry, Rz]);
}
