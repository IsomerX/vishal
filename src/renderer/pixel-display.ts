const DISPLAY_WIDTH = 32;
const DISPLAY_HEIGHT = 32;

export class PixelDisplay {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly imageData: ImageData;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context is not available for pixel display');

    this.canvas = canvas;
    this.ctx = ctx;
    this.canvas.width = DISPLAY_WIDTH;
    this.canvas.height = DISPLAY_HEIGHT;
    this.ctx.imageSmoothingEnabled = false;
    this.imageData = this.ctx.createImageData(DISPLAY_WIDTH, DISPLAY_HEIGHT);
  }

  render(vram: Uint8Array): void {
    const data = this.imageData.data;

    for (let i = 0; i < DISPLAY_WIDTH * DISPLAY_HEIGHT; i++) {
      const value = vram[i] ?? 0;
      const offset = i * 4;

      data[offset] = Math.round(((value >> 5) & 0x07) * 255 / 7);
      data[offset + 1] = Math.round(((value >> 2) & 0x07) * 255 / 7);
      data[offset + 2] = Math.round((value & 0x03) * 255 / 3);
      data[offset + 3] = 255;
    }

    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
