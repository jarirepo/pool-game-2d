import { Matrix4 } from '../vector3d';
import { Viewport } from '../viewport';

export interface IShape {
  ocs: Matrix4;
  isStatic: boolean;
  modified: boolean;
  render: (vp: Viewport, transform: Matrix4) => void;
  moveTo?: (x: number, y: number, z: number) => IShape;
  rotateZ?: (angle: number) => IShape;
  clone?: () => IShape;
}