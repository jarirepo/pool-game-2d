export namespace Constants {
  export const PI = Math.PI;
  export const TWO_PI = 2 * PI;
  export const HALF_PI = PI / 2;
  export const SQRT_2 = Math.sqrt(2);
  export const SQRT_3 = Math.sqrt(3);
  export const R2D = 180 / PI;
  export const D2R = PI / 180;
}

export enum CollisionCategory {
  CUSHION = 0x0001,
  POCKET = 0x0002,
  BALL = 0x0004,
  CUEBALL = 0x0008
}

export enum ShadowCategory {
  TABLE = 0x0001,
  CUSHION = 0x0002,
  BALL = 0x0004,
  CUE = 0x0008
}
