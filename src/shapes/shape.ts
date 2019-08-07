import { Matrix4, Vector3D } from '../geometry/vector3d';
import { Viewport } from '../viewport';
import { Geometry } from '../geometry/geometry';

export interface ShadowFilter {
  category: number;
  mask: number;
}

export interface Transform {
  matrix: Matrix4;
  parent: Transform;
}

export interface IShape {
  ocs: Matrix4;
  isStatic: boolean;
  modified: boolean;
  visible: boolean;
  canCastShadow: boolean;
  shadowFilter: ShadowFilter;
  geometry?: Geometry;
  pretransform?: Matrix4;
  texture?: ImageData;
  render: (vp: Viewport) => void;
  moveTo?: (x: number, y: number, z: number) => IShape;
  rotateZ?: (angle: number) => IShape;
  clone?: () => IShape;

  // Attributes set when rendering the scene
  transform?: Transform;
  /** Total transformation to screen coords. */
  T?: Matrix4;
  /** Transformed vertices to screen coords. */
  Pscr?: Vector3D[];
  /** Transformed face normals to screen coords. */
  Nscr?: Vector3D[];
  /** Transformed vertex normals to screen coords. */
  Vscr?: Vector3D[];
}
