import { Vector3D, Matrix4 } from '../geometry/vector3d';
import { Plane } from '../geometry/geometry';

export interface ILight {
  ocs: Matrix4;
  v: Vector3D;
  active: boolean;
  /** Returns true if the given plane is visible/reachable from this light source */
  hitsPlane: (plane: Plane) => boolean;
  /** Casts a ray through point p and returns its intersection with a given plane */
  castRay: (p: Vector3D, plane: Plane) => Vector3D;
}
