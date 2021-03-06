import { Constants } from './constants';

const { floor, random } = Math;

interface Slot {
  u: number;
  v: number;
  ballId: number;
}

/**
 * Helper class for the shuffling and positioning of the balls in the rack
 */
export class Rack  {

  public readonly slots: Slot[] = [
    { u: 0, v: 0, ballId: NaN },
    { u: -1, v: Constants.SQRT_3, ballId: NaN },
    { u: 1, v: Constants.SQRT_3, ballId: NaN },
    { u: -2, v: 2 * Constants.SQRT_3, ballId: NaN },
    { u: 0, v: 2 * Constants.SQRT_3, ballId: NaN },
    { u: 2, v: 2 * Constants.SQRT_3, ballId: NaN },
    { u: -3, v: 3 * Constants.SQRT_3, ballId: NaN },
    { u: -1, v: 3 * Constants.SQRT_3, ballId: NaN },
    { u: 1, v: 3 * Constants.SQRT_3, ballId: NaN },
    { u: 3, v: 3 * Constants.SQRT_3, ballId: NaN },
    { u: -4, v: 4 * Constants.SQRT_3, ballId: NaN },
    { u: -2, v: 4 * Constants.SQRT_3, ballId: NaN },
    { u: 0, v: 4 * Constants.SQRT_3, ballId: NaN },
    { u: 2, v: 4 * Constants.SQRT_3, ballId: NaN },
    { u: 4, v: 4 * Constants.SQRT_3, ballId: NaN }
  ];

  constructor() { }

  setup() {
    // Shuffle ball values 1-15
    const ids = new Array(15).fill(0).map((v, i) => 1 + i); // ball values!
    for (let i = ids.length - 1; i > 0; i--) {
      const j = floor(random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    // Assign ball #1 to the apex of the rack (slot 0)
    const i1 = ids.indexOf(1);
    [ids[i1], ids[0]] = [ids[0], ids[i1]];
    // Assign ball #8 to the center of the rack (slot 4)
    const i8 = ids.indexOf(8);
    [ids[i8], ids[4]] = [ids[4], ids[i8]];
    // Assign a solid (<8) and a striped ball (>8) to the rear corners of the rack (slot 10 and 14)
    const n10 = ids[10];
    const n14 = ids[14];
    if ((n10 < 8 && n14 < 8) || (n10 > 8 && n14 > 8)) {
      for (let k of [1, 2, 3, 5, 6, 7, 8, 9, 11, 12, 13]) {
        const val = ids[k];
        if ((n14 < 8 && val > 8) || (n14 > 8 && val < 8)) {
          [ids[14], ids[k]] = [ids[k], ids[14]];
          break;
        }
      }
    }
    // Assing the ball ids to the slots
    for (let i = 0; i < 15; i++) {
      this.slots[i].ballId = ids[i];
    }
  }
}
