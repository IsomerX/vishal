# Vishal

*Named after my late father, Vishal — his name means vast.*

A virtual computer — built entirely in the browser — that you can see, touch, and step through one clock cycle at a time.

---

## The Vision

The goal is to build a **complete computer that floats in 3D space**, where every component is a first-class object you can zoom into, orbit around, and inspect live.

```
┌─────────────────────────────────────────────────────┐
│                    3D Space                          │
│                                                      │
│   ┌───────┐    ┌───────┐    ┌───────────────────┐   │
│   │  CPU  │────│  GPU  │────│      Display      │   │
│   └───┬───┘    └───────┘    └───────────────────┘   │
│       │                                              │
│   ┌───┴───┐    ┌───────┐    ┌───────┐               │
│   │ Memory│    │  KBD  │────│ Mouse │               │
│   └───────┘    └───────┘    └───────┘               │
└─────────────────────────────────────────────────────┘
```

The full planned hardware:

- **CPU** — with visible register file, ALU, instruction pipeline, and memory bus
- **GPU** — a separate processor with its own compute units and VRAM
- **Memory** — multiple layers (registers → cache → VRAM → RAM), each visualised as a living lattice of bytes
- **Display** — a pixel framebuffer that renders in real-time inside the 3D scene
- **Keyboard** — key events that flow visibly from input controller into memory
- **Mouse** — pointer state mapped into a memory-mapped I/O region

**Every component floats in 3D space.** You zoom into any of them. You watch instructions travel from fetch → decode → execute → writeback. You watch a value propagate through the memory hierarchy. You watch a pixel get written to VRAM and appear on the display — all as a spatial, time-controllable animation.

### Time Machine

The entire machine is controlled by a **time machine**:

- Step forward one clock cycle at a time
- Step backward — full rewind, no approximation
- Run at any speed from 1 instruction/second to hundreds of thousands/second
- Scrub to any point in execution history
- Inspect the exact state of every register, every byte of memory, every flag — at any moment in time

The machine is not a black box. It is a transparent object you walk around and look inside.

---

## Current State

### What's built

#### Custom ISA (`src/vm/`)
A 30-instruction, 8-bit register architecture running natively in a `Uint8Array`:

| Category | Instructions |
|----------|-------------|
| Data move | `MOV`, `LOAD`, `STORE` (absolute + indirect) |
| Arithmetic | `ADD`, `SUB`, `INC`, `DEC` |
| Bitwise | `AND`, `OR`, `XOR`, `SHL`, `SHR` |
| Compare / branch | `CMP`, `JMP`, `JZ`, `JNZ`, `JG`, `JL` |
| Stack | `PUSH`, `POP`, `CALL`, `RET` |
| Control | `NOP`, `HLT` |
| VRAM | `VSTORE`, `VLOAD`, `VCOPY` |

- 8 general-purpose registers (R0–R7), 16-bit PC and SP
- FLAGS register (Zero, Carry, Negative, Overflow)
- Configurable main memory: 256 B → 64 KB
- Separate 1024-byte VRAM (32×32 pixels, RGB332 colour format)

#### Two-pass assembler (`src/assembler/`)
Write assembly directly in the browser:
- Labels, forward references, 16-bit address patching
- `DB` directive for inline data
- Hex and decimal literals, string literals
- Clear error messages with line numbers

#### Tiny C compiler (`src/compiler/`)
A subset of C that compiles to the custom assembly:
- Variables, arithmetic, bitwise and shift expressions
- `while` loops, `if`/`else` branches
- `poke(addr, val)` for direct memory writes
- `vstore`, `vload` builtins for VRAM access

#### Time-travel debugging (`src/vm/time-travel.ts`)
- Full VM state snapshots on every step
- Step forward and backward with no approximation
- Up to 50,000 snapshots in memory

#### 3D CPU scene (`src/renderer/cpu-space-scene.ts`)
Built with Three.js — the CPU is a spatial object, not a dashboard:

- **ALU slab** — glowing green platform at the top layer
- **Register file** — 8 amber towers whose height maps to the register's live value (0 = flat, 255 = tall)
- **Memory lattice** — 8×8 grid of cyan cubes showing the 64 bytes near the program counter; brightness and height map to byte value
- **Bus lines** — indigo lines connecting the layers
- **Camera** — full orbit (drag to rotate, scroll to zoom), all angles accessible
- **Click-to-showcase** — click any register or memory cell to fly the camera in and orbit around it; a panel shows the live value, binary representation, and decoded instruction; press Esc or click empty space to exit
- **Hover tooltips** — hover any element to see address, value, and instruction without entering showcase
- **R0–R7 labels** — projected from 3D space, follow the bars as you orbit

#### Hex memory grid (`src/renderer/hex-grid.ts`)
Switch to Memory view to see the full memory as a hex grid:
- Colour-coded regions: code, data, stack, free
- PC highlighted in real time
- Changed cells flash on write

#### Instruction narration (`src/renderer/narration.ts`)
Human-readable description of what each instruction is doing, updated every step.

#### Pixel display (`src/renderer/pixel-display.ts`)
A 32×32 canvas that renders VRAM in RGB332 colour, visible in the detail panel when a program writes to it.

#### Built-in examples
| Example | Language | Description |
|---------|----------|-------------|
| Bubble Sort | Assembly | Classic in-place sort on 10 bytes |
| Counter | Assembly | Simple increment loop |
| Fibonacci | Assembly | Sequence written to memory |
| Game of Life | Assembly | Conway's GoL on the 32×32 VRAM display |
| Pixel Test | Assembly | VRAM colour gradient |
| Tiny C Counter | Tiny C | Counter compiled from C-like source |

#### Tech stack
- TypeScript + Vite (no framework, runs in any modern browser)
- Three.js for 3D rendering
- Vitest — 203 tests across VM, assembler, compiler, and integration

### What's next

- [ ] GPU component — separate processor with its own visible compute units
- [ ] Memory hierarchy — show data moving between register → cache → RAM as a spatial animation
- [ ] Keyboard — key events that flow visibly into a memory-mapped I/O region
- [ ] Mouse — pointer state in MMIO
- [ ] Full 3D space layout — all components floating and connected, zoomable
- [ ] Pipeline visualisation — fetch/decode/execute/writeback stages as visible data flow
- [ ] Scrubable timeline — drag a playhead to any point in history
- [ ] Breakpoints and watchpoints
- [ ] More example programs — graphics demos, simple games, interrupt handlers

---

## Running locally

```bash
npm install
npm run dev        # dev server at localhost:3000
npm test           # run all tests
npm run build      # production build
```

---

## Controls

| Action | Input |
|--------|-------|
| Orbit camera | Click + drag |
| Zoom | Scroll wheel |
| Inspect element | Click register bar or memory cell |
| Exit showcase | Esc, or click empty space |
| Step forward | Step button (or keyboard shortcut) |
| Step backward | ◀ button |
| Run / Pause | Run button |
| Reset | Reset button |
| Speed | Slider (1/s → 100k+/s) |
