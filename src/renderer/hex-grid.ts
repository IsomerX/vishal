import { VMState } from '../vm/types';
import { ProgramMetadata } from '../assembler/types';
import { COLORS, getCellRegion } from './colors';

const CELL_WIDTH  = 32;
const CELL_HEIGHT = 20;
const COLS        = 16;
const FONT_SIZE   = 10;

// Padding/offsets for the grid layout
const ADDR_LABEL_WIDTH = 52; // width reserved for the row address label on the left
const COL_HEADER_HEIGHT = 18; // height reserved for the column header row at top

export class HexGridRenderer {
  private canvas: HTMLCanvasElement;
  private metadata: ProgramMetadata | null = null;
  private prevMemory: Uint8Array | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  setMetadata(metadata: ProgramMetadata | null): void {
    this.metadata = metadata;
  }

  render(state: VMState): void {
    const container = this.canvas.parentElement ?? this.canvas;
    const dpr = window.devicePixelRatio || 1;

    // Size the canvas to fill its container
    const cssWidth  = container.clientWidth  || 800;
    const memorySize = state.memory.length;
    const rows = Math.ceil(memorySize / COLS);
    const cssHeight = COL_HEADER_HEIGHT + rows * CELL_HEIGHT;

    this.canvas.style.width  = cssWidth + 'px';
    this.canvas.style.height = cssHeight + 'px';
    this.canvas.width  = Math.round(cssWidth  * dpr);
    this.canvas.height = Math.round(cssHeight * dpr);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);

    // Detect changed cells vs previous snapshot
    const changed = new Set<number>();
    if (this.prevMemory) {
      for (let i = 0; i < memorySize; i++) {
        if (this.prevMemory[i] !== state.memory[i]) changed.add(i);
      }
    }
    // Save snapshot for next render
    this.prevMemory = new Uint8Array(state.memory);

    const pc = state.registers.PC;
    const sp = state.registers.SP;

    // --- Background ---
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    // --- Column headers (00 - 0F) ---
    ctx.font = `bold ${FONT_SIZE}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6b7280';
    for (let col = 0; col < COLS; col++) {
      const x = ADDR_LABEL_WIDTH + col * CELL_WIDTH + CELL_WIDTH / 2;
      const y = COL_HEADER_HEIGHT / 2;
      ctx.fillText(col.toString(16).toUpperCase().padStart(2, '0'), x, y);
    }

    // --- Cells ---
    ctx.font = `${FONT_SIZE}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let addr = 0; addr < memorySize; addr++) {
      const row = Math.floor(addr / COLS);
      const col = addr % COLS;

      const x = ADDR_LABEL_WIDTH + col * CELL_WIDTH;
      const y = COL_HEADER_HEIGHT + row * CELL_HEIGHT;

      const region = getCellRegion(addr, this.metadata, sp, memorySize);
      const isPC      = addr === pc;
      const isChanged = changed.has(addr);

      // Cell background
      let bgColor   = COLORS[region].bg;
      let textColor = COLORS[region].text;

      if (isChanged) {
        bgColor   = '#2a3a2a'; // slightly brighter flash bg
        textColor = COLORS.changedFlash;
      }

      ctx.fillStyle = bgColor;
      ctx.fillRect(x, y, CELL_WIDTH, CELL_HEIGHT);

      // Cell border
      ctx.strokeStyle = COLORS.cellBorder;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 0.25, y + 0.25, CELL_WIDTH - 0.5, CELL_HEIGHT - 0.5);

      // PC highlight: bright green border
      if (isPC) {
        ctx.strokeStyle = COLORS.pcHighlight;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x + 0.75, y + 0.75, CELL_WIDTH - 1.5, CELL_HEIGHT - 1.5);
      }

      // Cell text
      const byte = state.memory[addr];
      ctx.fillStyle = textColor;
      ctx.fillText(byte.toString(16).toUpperCase().padStart(2, '0'), x + CELL_WIDTH / 2, y + CELL_HEIGHT / 2);
    }

    // --- Row address labels ---
    ctx.font = `${FONT_SIZE}px monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#6b7280';

    for (let row = 0; row < rows; row++) {
      const addr = row * COLS;
      const y = COL_HEADER_HEIGHT + row * CELL_HEIGHT + CELL_HEIGHT / 2;
      ctx.fillText('0x' + addr.toString(16).toUpperCase().padStart(4, '0'), ADDR_LABEL_WIDTH - 4, y);
    }
  }
}
