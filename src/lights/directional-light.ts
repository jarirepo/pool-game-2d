import { ILight } from './light';
import { Vector3D, dot, subtractVectors, Matrix4, createWCS } from '../geometry/vector3d';
import { Plane } from '../geometry/geometry';

export class DirectionalLight implements ILight {

  public readonly ocs: Matrix4;
  public active = true;

  constructor(public readonly v: Vector3D) {
    this.ocs = createWCS();
  }

  public hitsPlane(plane: Plane): boolean {
    return this.active && dot(this.v, plane.n) < 0;
  }

  public castRay(p: Vector3D, plane: Plane): Vector3D {
    const d = -dot(plane.n, subtractVectors(p, plane.p)) / dot(plane.n, this.v);
    return {
      x: p.x + d * this.v.x,
      y: p.y + d * this.v.y,
      z: p.z + d * this.v.z
    };
  }
}
