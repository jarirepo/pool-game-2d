
export class Polyline {

  public readonly p: number[][] = [];

  constructor(x: number, y: number) {
    this.p.push([x, y, 1]);
  }

  public lineTo(x: number, y: number): Polyline {
    this.p.push([x, y, 1]);
    return this;
  }
}
