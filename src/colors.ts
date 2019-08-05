export namespace Colors {
  export interface Color {
    r: number,
    g: number,
    b: number
  };
  
  /**
   * Ball colors:
   * 0: white (cue-ball)
   * 1: yellow, 2: blue, 3: red, 4: purple, 5: orange, 6: green, 7: brown
   * 8: black
   * 9-15: white with color stripe
   */
  const colors: Color[] = [
    { r: 255, g: 255, b: 255 },
    { r: 255, g: 255, b: 0 },
    { r: 0, g: 0, b: 255 },
    { r: 255, g: 0, b: 0 },
    { r: 128, g: 0, b: 128 },
    { r: 255, g: 165, b: 0 },
    { r: 0, g: 128, b: 0 },
    { r: 165, g: 42, b: 42 },
    { r: 0, g: 0, b: 0 }
  ];

  export const WHITE = colors[0];
  export const YELLOW = colors[1];
  export const BLUE = colors[2];
  export const RED = colors[3];
  export const PURPLE = colors[4];
  export const ORANGE = colors[5];
  export const GREEN = colors[6];
  export const BROWN = colors[7];
  export const BLACK = colors[8];
};
