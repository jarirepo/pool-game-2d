import { Constants } from './constants';
import { Colors } from './colors';

interface BallTextureData {
  x: number;
  y: number;
  color: Colors.Color;
};

export class PoolGameTextures {
  
  public readonly dom: HTMLCanvasElement;
  public readonly context: CanvasRenderingContext2D;

  public readonly ballTextureWidth = 256;
  public readonly ballTextureHeight = 128;
  public readonly cueTextureWidth = 16;
  public readonly cueTextureHeight = 256;
    
  /*
  * Ball colors for eight-ball game:
  *    0: white (cue-ball)
  *    1: yellow, 2: blue, 3: red, 4: purple, 5: orange, 6: green, 7: brown
  *    8: black
  * 9-15: white with color stripe
  */
  public readonly ballData: { [key: number]: BallTextureData } = {
    0: { x: 0, y: 0, color: Colors.WHITE },
    1: { x: 256, y: 0, color: Colors.YELLOW },
    2: { x: 512, y: 0, color: Colors.BLUE },
    3: { x: 768, y: 0, color: Colors.RED },
    4: { x: 0, y: 128, color: Colors.PURPLE },
    5: { x: 256, y: 128, color: Colors.ORANGE },
    6: { x: 512, y: 128, color: Colors.GREEN },
    7: { x: 768, y: 128, color: Colors.BROWN },
    8: { x: 0, y: 256, color: Colors.BLACK },
    9: { x: 256, y: 256, color: Colors.YELLOW },
    10: { x: 512, y: 256, color: Colors.BLUE },
    11: { x: 768, y: 256, color: Colors.RED },
    12: { x: 0, y: 384, color: Colors.PURPLE },
    13: { x: 256, y: 384, color: Colors.ORANGE },
    14: { x: 512, y: 384, color: Colors.GREEN },
    15: { x: 768, y: 384, color: Colors.BROWN }
  };

  constructor(public readonly el = document.body) {
    this.dom = document.createElement('canvas') as HTMLCanvasElement;
    this.dom.setAttribute('position', 'relative');
    this.dom.setAttribute('width', '1024px');
    this.dom.setAttribute('height', '1024px');
    this.el.appendChild(this.dom);
    this.context = this.dom.getContext('2d') as CanvasRenderingContext2D;

    console.log('Creating textures...');
    for (let i = 0; i < 16; i++) {
      this.createBallTexture(i);
    }
    this.createCueTexture();
  }

  public getBallTexture(value: number): ImageData {
    return this.context.getImageData(this.ballData[value].x, this.ballData[value].y, this.ballTextureWidth, this.ballTextureHeight);
  }

  public getCueTexture(): ImageData {
    return this.context.getImageData(0, 512, this.cueTextureWidth, this.cueTextureHeight);
  }
  
  private createBallTexture(value: number): void {
    const color = this.ballData[value].color;
    const c = `rgb(${color.r},${color.g},${color.b})`;
    const r = this.ballTextureHeight / 6;
    const hy = (value < 9) ? 0 : this.ballTextureHeight / 6;

    const drawText = (x: number) => {
      this.context.beginPath();
      this.context.arc(x, this.ballTextureHeight / 2, r, 0, Constants.TWO_PI);
      this.context.fillStyle = '#fff';
      this.context.fill();
      this.context.font = '24pt Trebuchet MS';
      this.context.textAlign = 'center';
      this.context.textBaseline = 'middle';
      this.context.fillStyle = '#000';
      this.context.fillText(value.toString(), x, this.ballTextureHeight / 2 + 4);    
    };

    this.context.save();
    this.context.translate(this.ballData[value].x, this.ballData[value].y);

    this.context.clearRect(0, 0, this.ballTextureWidth, this.ballTextureHeight);
    this.context.fillStyle = '#fff';
    this.context.fillRect(0, 0, this.ballTextureWidth, this.ballTextureHeight);
    this.context.fillStyle = c;
    this.context.fillRect(0, hy, this.ballTextureWidth, this.ballTextureHeight - 2 * hy);

    if (value > 0) {
      drawText(0.75 * this.ballTextureWidth);
      drawText(0.25 * this.ballTextureWidth);
    } else {
      this.context.beginPath();
      this.context.arc(0.25 * this.ballTextureWidth, this.ballTextureHeight / 2, r / 2, 0, Constants.TWO_PI);
      this.context.fillStyle = '#ffc0cb';  // pink
      this.context.fill();
    }

    this.context.restore();
  }
  
  private createCueTexture(): void {
    this.context.save();
    this.context.translate(0, 512);
    this.context.clearRect(0, 0, this.cueTextureWidth, this.cueTextureHeight);
    // Handle
    this.context.fillStyle = 'rgb(0,0,0)'; // black
    this.context.fillRect(0, 0, this.cueTextureWidth, 30);
    this.context.fillStyle = 'rgb(128,0,0)'; // maroon
    this.context.fillRect(0, 30, this.cueTextureWidth, this.cueTextureHeight / 2 - 30);
    // Shaft
    this.context.fillStyle = 'rgb(245,245,220)'; // beige
    this.context.fillRect(0, this.cueTextureHeight / 2, this.cueTextureWidth, this.cueTextureHeight / 2);
    // Tip
    this.context.fillStyle = 'rgb(0,206,209)'; // dark turquoise    
    this.context.fillRect(0, this.cueTextureHeight - 2.56, this.cueTextureWidth, 2.56);
    this.context.restore();
  }
}
