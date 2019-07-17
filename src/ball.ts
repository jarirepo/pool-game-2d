export class Ball {

  constructor(
    public readonly id: number,
    public readonly radius: number,
    public readonly body: Matter.Body
  ) { }
}
