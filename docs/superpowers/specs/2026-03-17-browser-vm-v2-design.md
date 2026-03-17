# Browser VM v2 — Bitwise Ops, VRAM & Pixel Display

## Overview

v2 adds bitwise operations, a separate video memory (VRAM) with a pixel display renderer, and a Game of Life demo. Programs can now manipulate bits, write to a 32x32 pixel screen, and produce visible graphical output — a major step toward the long-term goal of running UI inside the VM.

**Scope note:** The v1 roadmap placed bitwise ops in v2 and the framebuffer in v4. We're collapsing these because the framebuffer is the visual payoff for the bitwise ops — shipping them together makes a more satisfying release. The v1 spec's growth path section should be considered superseded by this spec.

**What's new:**
- 5 bitwise instructions: AND, OR, XOR, SHL, SHR
- 3 VRAM instructions: VSTORE, VLOAD, VCOPY
- 1024-byte VRAM (32x32 pixels, RGB332 color)
- Pixel display canvas rendered alongside the hex grid
- Game of Life demo + pixel test demo

## New Instructions

### Bitwise Operations

| Opcode | Mnemonic | Format | Bytes | Description |
|--------|----------|--------|-------|-------------|
| `0x24` | `AND Rx, Ry` | `[24][Rx][Ry]` | 3 | Rx = Rx & Ry |
| `0x25` | `OR Rx, Ry` | `[25][Rx][Ry]` | 3 | Rx = Rx \| Ry |
| `0x26` | `XOR Rx, Ry` | `[26][Rx][Ry]` | 3 | Rx = Rx ^ Ry |
| `0x27` | `SHL Rx, Ry` | `[27][Rx][Ry]` | 3 | Rx = Rx << Ry (logical shift left) |
| `0x28` | `SHR Rx, Ry` | `[28][Rx][Ry]` | 3 | Rx = Rx >> Ry (logical shift right) |

**Flag behavior for AND, OR, XOR:**
- Z: Set if result is 0.
- N: Set if result bit 7 is 1.
- C: Cleared.
- V: Cleared.

**Flag behavior for SHL/SHR:**
- Z: Set if result is 0.
- N: Set if result bit 7 is 1.
- V: Cleared.
- C (carry) for SHL: `C = (original >> (8 - shiftAmount)) & 1` — the last bit shifted out of the high end. For shift by 0, C is cleared. For shift >= 8, C is 0.
- C (carry) for SHR: `C = (original >> (shiftAmount - 1)) & 1` — the last bit shifted out of the low end. For shift by 0, C is cleared. For shift >= 8, C is 0.
- If shift amount is 0, result equals Rx unchanged and C is cleared.
- If shift amount >= 8, result is 0 and C is 0.

**Opcode range reservation:** `0x24-0x2F` is reserved for arithmetic/bitwise extensions. `0x60-0x6F` is reserved for VRAM/display operations.

### VRAM Operations

| Opcode | Mnemonic | Format | Bytes | Description |
|--------|----------|--------|-------|-------------|
| `0x60` | `VSTORE [addr], Rx` | `[60][Rx][addrLo][addrHi]` | 4 | Write Rx to VRAM at absolute address |
| `0x61` | `VLOAD Rx, [addr]` | `[61][Rx][addrLo][addrHi]` | 4 | Read VRAM at absolute address into Rx |
| `0x62` | `VCOPY Rx` | `[62][Rx]` | 2 | Copy 1024 bytes from main memory at register pair Rx:Rx+1 into VRAM |

**VRAM addressing:** Linear, row-major. Pixel at (x, y) = VRAM address `y * 32 + x`. Valid range: 0–1023.

**VSTORE/VLOAD:** 4-byte instructions, same encoding pattern as LOAD_ABS/STORE_ABS but targeting VRAM instead of main memory. The binary encoding puts the register byte before the address bytes (matching LOAD_ABS/STORE_ABS). Assembly syntax uses bracket notation for the address: `VSTORE [addr], Rx` and `VLOAD Rx, [addr]`, consistent with the existing STORE/LOAD convention.

**Out-of-bounds:** VRAM address >= 1024 halts the VM with error. Only the low 10 bits of the 16-bit address field are meaningful.

**VCOPY:** 2-byte instruction. Copies exactly 1024 bytes from main memory starting at the address in register pair Rx:Rx+1 (Rx = low byte, Rx+1 = high byte). Rx must be even (R0, R2, R4, R6). Validation: if `addr + 1024 > memory.length`, the VM halts with error. This is the fast path for full-frame updates.

**VSTORE/VLOAD/VCOPY do not affect flags.**

**Register pair constraint (clarification for v1 and v2):** The v1 spec says indirect addressing register pairs "must be even." The v1 implementation does not enforce this — it uses `(reg + 1) & 7` which wraps R7 to R0, allowing odd registers. For v2, we formalize the implementation behavior: **odd registers are allowed for all register-pair operations**. The pair is always `Rx:R((x+1) & 7)`. This applies retroactively to LOAD_IND, STORE_IND from v1, and to VCOPY in v2.

## VMState Changes

```typescript
interface VMState {
  memory: Uint8Array;       // Main RAM (unchanged)
  vram: Uint8Array;         // NEW — 1024 bytes, 32x32 pixels
  registers: Registers;     // Unchanged
  halted: boolean;          // Unchanged
  error?: string;           // Unchanged
  cycle: number;            // Unchanged
}
```

**`createVM(memorySize)`** now also initializes `vram: new Uint8Array(1024)`.

**`cloneState(state)`** now also clones `vram: new Uint8Array(state.vram)`.

**Time-travel:** VRAM is included in snapshots automatically since cloneState copies it. Adding 1024 bytes per snapshot increases memory usage. With 4KB memory + 1KB VRAM, each snapshot is ~5.1KB. At 100,000 history entries that's ~510MB, which is too much. **Reduce default maxHistorySize to 50,000** for v2, bringing worst case to ~255MB. The deferred diff-based approach from the v1 spec remains a future optimization.

## VRAM Pixel Format — RGB332

Each byte in VRAM encodes one pixel using 8-bit RGB332:

```
Bit layout: RRRGGGBB
  Bits 7-5: Red   (3 bits, 0-7)
  Bits 4-2: Green (3 bits, 0-7)
  Bits 1-0: Blue  (2 bits, 0-3)
```

**Conversion to display RGB (0-255):**
```
R = Math.round((byte >> 5) * 255 / 7)
G = Math.round(((byte >> 2) & 0x07) * 255 / 7)
B = Math.round((byte & 0x03) * 255 / 3)
```

**Common colors:**
| Byte | Color |
|------|-------|
| `0x00` | Black |
| `0xFF` | White |
| `0xE0` | Red |
| `0x1C` | Green |
| `0x03` | Blue |
| `0xFC` | Yellow |
| `0xE3` | Magenta |
| `0x1F` | Cyan |

For Game of Life: 0x00 = dead (black), 0xFF = alive (white).

## Pixel Display Renderer

### New file: `src/renderer/pixel-display.ts`

A canvas-based renderer that reads VRAM and draws a 32x32 pixel grid.

**Rendering approach:**
1. Create an `ImageData(32, 32)` buffer
2. For each VRAM byte (0–1023), decode RGB332 to R, G, B values
3. Write into ImageData.data (4 bytes per pixel: R, G, B, 255 for alpha)
4. `putImageData` onto the canvas
5. The canvas is CSS-scaled up to display size (160x160px) with `image-rendering: pixelated` for crisp pixels

This renders the full 32x32 image in a single `putImageData` call — fast enough for 60fps.

**API:**
```typescript
export class PixelDisplay {
  constructor(canvas: HTMLCanvasElement)
  render(vram: Uint8Array): void
}
```

### Layout

The pixel display canvas sits in the top-left corner of the hex grid area, overlaying the grid:

```
┌─────────────────────────────────┬──────────────────┐
│  ┌──────────┐                   │  Registers       │
│  │  Pixel   │                   │  ...             │
│  │ Display  │  Canvas Hex Grid  │  Current Instr   │
│  │ 160x160  │                   │  What's Happening│
│  └──────────┘                   │  Memory Usage    │
│                                 │  Display Stats   │
│                                 │  Controls        │
├─────────────────────────────────┴──────────────────┤
│  Code Editor                                        │
└─────────────────────────────────────────────────────┘
```

- Positioned `absolute` inside `#grid-container`, top-left with small margin
- 160x160px (5x upscale of 32x32)
- Semi-transparent border to visually separate from hex grid
- **Visibility:** Tracked by a `vramDirty` flag on the app state, set to `true` when any VSTORE, VLOAD, or VCOPY instruction executes. The pixel display is shown when `vramDirty` is true and hidden otherwise. Reset clears the flag. This avoids confusion with intentional all-black frames.

### Detail panel addition: Display Stats

New section in the detail panel:

```
Display Stats
  Resolution: 32x32
  Active pixels: 142 / 1024
  Format: RGB332
```

## Assembler Updates

### Lexer

Add to the `INSTRUCTIONS` set: `AND`, `OR`, `XOR`, `SHL`, `SHR`, `VSTORE`, `VLOAD`, `VCOPY`.

### Parser

New instruction encoding cases:

- `AND`, `OR`, `XOR`, `SHL`, `SHR`: Same pattern as `ADD`/`SUB` — `[opcode][Rx][Ry]`, 3 bytes.
- `VSTORE [addr], Rx`: Same pattern as `STORE [addr], Rx` — `[0x60][Rx][addrLo][addrHi]`, 4 bytes. Address can be a number or label. Bracket notation on the address.
- `VLOAD Rx, [addr]`: Same pattern as `LOAD Rx, [addr]` — `[0x61][Rx][addrLo][addrHi]`, 4 bytes. Bracket notation on the address.
- `VCOPY Rx`: `[0x62][Rx]`, 2 bytes. Same pattern as `PUSH`/`POP`.

### Assembly syntax examples

```
AND R0, R1           ; R0 = R0 & R1
SHL R2, R3           ; R2 = R2 << R3
VSTORE [0x0000], R4  ; Write R4 to pixel (0,0)
VLOAD R5, [0x001F]   ; Read pixel (31,0) into R5
VCOPY R0             ; Copy 1024 bytes from addr in R0:R1 to VRAM
```

## Narration Updates

Human-readable descriptions for all 8 new instructions in `src/renderer/narration.ts`:

**Bitwise ops:**
- `"Bitwise AND: R2 (0x0F) & R3 (0xFF) = 0x0F."`
- `"Shift left: R0 (0x40) << R1 (1) = 0x80. Carry = 0."`

**VRAM ops:**
- `"Write R4 (0xFF) to VRAM address 0x0045 → pixel (5, 2). Color: white."`
- `"Read VRAM address 0x0000 → pixel (0, 0) into R5. Current color: black (0x00)."`
- `"Copy 1024 bytes from main memory at 0x0400 to VRAM. Full screen refresh."`

VRAM narration decodes the linear address to (x, y) coordinates and names the RGB332 color where possible.

## Opcode Constants

Added to `src/vm/opcodes.ts`:

```
OP_AND = 0x24       size: 3
OP_OR = 0x25        size: 3
OP_XOR = 0x26       size: 3
OP_SHL = 0x27       size: 3
OP_SHR = 0x28       size: 3
OP_VSTORE = 0x60    size: 4
OP_VLOAD = 0x61     size: 4
OP_VCOPY = 0x62     size: 2
```

## Game of Life Demo

### Algorithm

Two 1024-byte buffers in main memory:
- Buffer A at `0x0400` (current generation)
- Buffer B at `0x0800` (next generation)

Each generation:
1. For each cell (x, y) in 0..31:
   a. Count live neighbors (8-connected, edges treated as dead)
   b. Apply rules: alive if exactly 3 neighbors, or exactly 2 neighbors + currently alive
   c. Write 0xFF (alive) or 0x00 (dead) to the corresponding cell in the other buffer
2. VCOPY the new buffer to VRAM
3. Swap which buffer is "current" vs "next" (swap the register pair values)
4. Repeat

### Memory layout (4KB VM)

```
0x0000  Code region (~600-900 bytes)
0x03FE  Generation counter (16-bit, little-endian)
0x0400  Buffer A — current generation (1024 bytes)
0x0800  Buffer B — next generation (1024 bytes)
0x0C00  Free space / Stack (grows down from 0x0FFF)
```

### Register pressure and code size

With only 8 registers, no immediate-add, and no immediate-compare, the GoL inner loop requires heavy register management. Computing `y * 32 + x` for neighbor lookups requires loading 32 into a register and using SHL (shift left by 5 = multiply by 32). Comparing neighbor count against 2 and 3 requires loading those constants.

Expected code size: **600–900 bytes**. The inner loop body (8 neighbor checks with bounds checks, rule application) is ~200-300 bytes. Outer loop control, buffer swap, VCOPY, and generation counter update add ~100 bytes. Initial pattern seeding adds ~100-200 bytes.

The program will use PUSH/POP to spill registers to the stack when the inner loop needs more than 8 registers simultaneously.

**Note:** `y * 32` can be computed as `SHL Ry, R_five` where R_five holds 5 — this is a single instruction instead of a multiply loop.

### Initial pattern

The program seeds an R-pentomino pattern near the center of the grid. R-pentomino evolves for 1103 generations before stabilizing.

```
R-pentomino (centered at ~16,16):
  .##
  ##.
  .#.
```

### Edge handling

Edges are treated as dead (not wrapping). Before loading a neighbor, the program checks if x < 0, x > 31, y < 0, or y > 31 and skips the load if out of bounds.

### Generation counter

Stored as a 16-bit little-endian value at addresses `0x03FE` (low byte) and `0x03FF` (high byte). Supports up to 65,535 generations before wrapping — well beyond the R-pentomino's 1103-generation stabilization.

The narration panel can read this address to display generation context.

### Performance expectations

One generation visits 1024 cells, each requiring ~40-60 instructions for neighbor counting and rule application. That's ~40,000-60,000 instructions per generation.

At max speed slider (10,000 instructions/sec): ~4-6 seconds per generation. Reaching generation 1103 takes ~1-2 hours at max speed.

At a moderate speed: Users will see the first 10-50 generations in a sitting, which is enough to watch the R-pentomino expand and start forming patterns. The program runs indefinitely — users can leave it running or come back to it.

This is acceptable for v2. A "turbo mode" that skips rendering and runs at max JavaScript speed is a potential v3 enhancement.

## Example Programs (v2)

1. **Bubble Sort** — unchanged from v1
2. **Counter** — unchanged from v1
3. **Fibonacci** — unchanged from v1
4. **Game of Life** — NEW — headline v2 demo
5. **Pixel Test** — NEW — simple program that fills the screen with a color gradient using VSTORE. Quick visual test of the display and RGB332 palette.

## Files Changed / Created

**Modified:**
- `src/vm/types.ts` — Add `vram` to VMState
- `src/vm/opcodes.ts` — Add 8 new opcode constants, sizes, names
- `src/vm/vm.ts` — Add `vram` to createVM/cloneState, add 8 instruction cases to step()
- `src/vm/flags.ts` — Add `computeBitwiseFlags()` for AND/OR/XOR and `computeShiftFlags()` for SHL/SHR
- `src/vm/time-travel.ts` — Reduce default maxHistorySize to 50,000
- `src/assembler/lexer.ts` — Add 8 new instruction keywords
- `src/assembler/parser.ts` — Add encoding cases for 8 new instructions
- `src/renderer/narration.ts` — Add descriptions for 8 new instructions, add display stats
- `src/ui/app.ts` — Wire up pixel display, display stats, vramDirty flag
- `index.html` — Add pixel display canvas, display stats section
- `style.css` — Pixel display overlay styles, display stats styles

**Created:**
- `src/renderer/pixel-display.ts` — PixelDisplay class
- `src/examples/game-of-life.ts` — Game of Life assembly source
- `src/examples/pixel-test.ts` — Pixel gradient test assembly source

**Tests (modified/created):**
- `tests/vm/vm.test.ts` — Add tests for all 8 new instructions including VRAM ops
- `tests/vm/flags.test.ts` — Add tests for bitwise/shift flag computation
- `tests/assembler/parser.test.ts` — Add tests for assembling new instructions
- `tests/integration/game-of-life.test.ts` — End-to-end: assemble, run N generations, verify VRAM state
