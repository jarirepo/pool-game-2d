import { ILight } from './light';
import { Vector3D, dot, subtractVectors, normalizeVector, Matrix4, createWCS } from '../geometry/vector3d';
import { Plane } from '../geometry/geometry';

export class PointLight implements ILight {

  public readonly ocs: Matrix4;
  public active = true;

  constructor(public readonly v: Vector3D) {
    this.ocs = createWCS();
  }
  
  public hitsPlane(plane: Plane): boolean {
    return this.active && dot(plane.n, subtractVectors(this.v, plane.p)) > 0;
  }
  
  /**
   * p = [x, y, z]
   * nx * (x - x0) + ny * (y - y0) + nz * (z - z0) = 0
   * p' = [x', y', z'] = p + d * v = [x + d * vx, y + d * vy, z + d * vz]
   * d = - (n . (p - p0)) / (n . v)
   */
  public castRay(p: Vector3D, plane: Plane): Vector3D {
    const v = normalizeVector(subtractVectors(p, this.v));
    const d = -dot(plane.n, subtractVectors(p, plane.p)) / dot(plane.n, v);
    return {
      x: p.x + d * v.x,
      y: p.y + d * v.y,
      z: p.z + d * v.z
    };
  }
}
