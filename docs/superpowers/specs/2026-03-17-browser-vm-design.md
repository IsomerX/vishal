# Browser VM — Run Programs in Browser Memory

## Overview

A virtual machine that runs entirely in the browser, using JavaScript typed arrays as RAM. Users write assembly programs, load them into memory, and watch execution in real-time through a visual hex grid + detail panel. The system supports time-travel debugging (step forward, backward, breakpoints, speed control).

The project is a technical experiment pushing the limits of what can run inside browser-allocated memory, combined with an interactive playground for writing and visualizing programs.

**Long-term vision:** Eventually run UI inside the VM by mapping a memory region as a framebuffer. v1 focuses on the core VM + a sorting visualization demo.

## Architecture

Three independent layers with clean boundaries:

```
┌──────────────────┐
│   UI / Controls   │  HTML — buttons, editor, speed slider
├──────────────────┤
│   Renderer        │  Canvas hex grid + HTML detail panel
├──────────────────┤
│   VM Core         │  Pure state machine — no DOM, no side effects
└──────────────────┘
```

- **VM Core** knows nothing about rendering or the DOM. It takes state in, returns state out.
- **Renderer** observes VM state and paints it. Can be swapped (Canvas today, WebGL later).
- **UI** dispatches commands (step, run, load program) and wires everything together.

## Tech Stack

- **TypeScript** for VM core and all logic
- **Canvas** for the hex grid memory visualization
- **HTML/CSS** for detail panel, controls, code editor
- **Vite** for build tooling

## VM Core

### VMState

The entire VM state is a single serializable object:

```typescript
interface VMState {
  memory: Uint8Array        // RAM — configurable size
  registers: {
    PC: number              // Program counter (16-bit, addresses up to 64KB)
    SP: number              // Stack pointer (grows downward from top of memory)
    R0: number              // General-purpose registers (8-bit each)
    R1: number
    R2: number
    R3: number
    R4: number
    R5: number
    R6: number
    R7: number
    FLAGS: number           // Bit flags: Zero, Carry, Negative, Overflow
  }
  halted: boolean
  error?: string            // Error reason if halted due to fault (e.g., "PC out of bounds")
  cycle: number             // Total instructions executed
}
```

**Design decisions:**
- 8-bit registers match memory cell size (1 byte = 1 register value), keeping visualization intuitive.
- 16-bit PC and SP allow addressing up to 64KB.
- For 16-bit address values in indirect addressing, register pairs are used: the specified register holds the low byte, the next register holds the high byte. Pairs: R0:R1, R2:R3, R4:R5, R6:R7.

### Register Encoding

Registers are encoded as a 3-bit value (0–7) in operand bytes:

| Code | Register |
|------|----------|
| 0    | R0       |
| 1    | R1       |
| 2    | R2       |
| 3    | R3       |
| 4    | R4       |
| 5    | R5       |
| 6    | R6       |
| 7    | R7       |

PC, SP, and FLAGS are not directly addressable by instructions.

### FLAGS Register Bit Layout

```
Bit 0: Z (Zero)      — set when result is 0
Bit 1: C (Carry)     — set on unsigned overflow/underflow
Bit 2: N (Negative)  — set when result bit 7 is 1
Bit 3: V (Overflow)  — set on signed overflow
Bits 4–7: reserved (0)
```

### SP Semantics

- SP is initialized to `memorySize - 1` (last valid address).
- SP points to the next free slot (one below the top of stack). When the stack is empty, SP equals `memorySize - 1`.
- **PUSH:** `memory[SP] = val; SP--`
- **POP:** `SP++; val = memory[SP]`
- CALL pushes a 16-bit return address (2 bytes): `memory[SP] = highByte(PC+3); SP--; memory[SP] = lowByte(PC+3); SP--`
- RET pops 2 bytes: `SP++; low = memory[SP]; SP++; high = memory[SP]; PC = (high << 8) | low`

### Step Function

```typescript
function step(state: VMState): VMState
```

Fetch byte at `memory[PC]`, decode instruction, execute, update state, advance PC. Returns new state (or mutates a clone).

### Error Handling

The VM halts and sets an error status on:
- **PC out of bounds:** PC >= memorySize
- **Invalid opcode:** Unrecognized opcode byte
- **Stack overflow:** SP wraps below 0
- **Stack underflow:** SP exceeds memorySize - 1
- **Memory access out of bounds:** LOAD/STORE to address >= memorySize

The UI displays the error reason. The user can inspect state and rewind via time-travel.

### Configurable Memory

Default: 4KB. User can configure at creation time. Range: 256 bytes to 64KB.

## Instruction Set Architecture (ISA)

Minimal but sufficient for sorting. Every instruction is 1–4 bytes: `[opcode] [operand1?] [operand2?] [operand3?]`.

All multi-byte addresses are **little-endian** (low byte first, high byte second).

### Opcode Encoding Table

| Opcode | Mnemonic | Format | Description |
|--------|----------|--------|-------------|
| `0x00` | `NOP` | `[00]` | No operation |
| `0x01` | `HLT` | `[01]` | Halt execution |
| `0x10` | `MOV Rx, imm` | `[10] [Rx] [imm8]` | Load immediate into register |
| `0x11` | `MOV Rx, Ry` | `[11] [Rx] [Ry]` | Copy register to register |
| `0x12` | `LOAD Rx, [addr]` | `[12] [Rx] [addrLo] [addrHi]` | Load from absolute address (4 bytes) |
| `0x13` | `STORE [addr], Rx` | `[13] [Rx] [addrLo] [addrHi]` | Store to absolute address (4 bytes) |
| `0x14` | `LOAD Rx, [Ry]` | `[14] [Rx] [Ry]` | Load from address in register pair Ry:Ry+1 |
| `0x15` | `STORE [Rx], Ry` | `[15] [Rx] [Ry]` | Store to address in register pair Rx:Rx+1 |
| `0x20` | `ADD Rx, Ry` | `[20] [Rx] [Ry]` | Rx = Rx + Ry, sets flags |
| `0x21` | `SUB Rx, Ry` | `[21] [Rx] [Ry]` | Rx = Rx - Ry, sets flags |
| `0x22` | `INC Rx` | `[22] [Rx]` | Rx = Rx + 1, sets flags |
| `0x23` | `DEC Rx` | `[23] [Rx]` | Rx = Rx - 1, sets flags |
| `0x30` | `CMP Rx, Ry` | `[30] [Rx] [Ry]` | Sets flags from Rx - Ry (no store) |
| `0x40` | `JMP addr` | `[40] [addrLo] [addrHi]` | Unconditional jump |
| `0x41` | `JZ addr` | `[41] [addrLo] [addrHi]` | Jump if Z=1 |
| `0x42` | `JNZ addr` | `[42] [addrLo] [addrHi]` | Jump if Z=0 |
| `0x43` | `JG addr` | `[43] [addrLo] [addrHi]` | Jump if unsigned greater: Z=0 AND C=0 |
| `0x44` | `JL addr` | `[44] [addrLo] [addrHi]` | Jump if unsigned less: C=1 |
| `0x50` | `PUSH Rx` | `[50] [Rx]` | Push register onto stack |
| `0x51` | `POP Rx` | `[51] [Rx]` | Pop stack into register |
| `0x52` | `CALL addr` | `[52] [addrLo] [addrHi]` | Push 16-bit return address (PC+3), jump |
| `0x53` | `RET` | `[53]` | Pop 16-bit address, jump to it |

**Note:** `LOAD Rx, [addr]` and `STORE [addr], Rx` are 4 bytes (opcode + register + 16-bit address). All other instructions remain 1–3 bytes. Jump instructions use 16-bit addresses for full memory range.

**Flag behavior:** `ADD`, `SUB`, `INC`, `DEC`, and `CMP` all set Z, C, N, V flags. `MOV`, `LOAD`, `STORE` do not affect flags.

**Unsigned comparison (after CMP Rx, Ry):**
- `JG`: jumps when Rx > Ry (unsigned) — checks Z=0 AND C=0
- `JL`: jumps when Rx < Ry (unsigned) — checks C=1

**Indirect addressing with register pairs:**
- `LOAD Rx, [Ry]` reads the address from register pair Ry:Ry+1 where Ry = low byte, Ry+1 = high byte. Ry must be even (R0, R2, R4, R6).
- `STORE [Rx], Ry` writes to the address in register pair Rx:Rx+1. Rx must be even.
- For addresses <= 0xFF, the high register of the pair is simply 0x00.

### Growth Path

- **v2:** Bitwise ops (`AND`, `OR`, `XOR`, `SHL`, `SHR`) — unlocks Game of Life
- **v3:** `MUL`, `DIV`, interrupts
- **v4:** Framebuffer memory region (write bytes → pixels on screen)
- **v5:** Input handling (keyboard/mouse → memory-mapped region)
- **Future:** Simple C-like compiler targeting this bytecode

## Renderer

### Layout

```
┌─────────────────────────────────┬──────────────────┐
│                                 │  Registers        │
│    Canvas Hex Grid              │  PC: 0x0042       │
│                                 │  SP: 0x0FFC       │
│    Each cell = 1 byte           │  R0-R7: ...       │
│    Color-coded by region        │  FLAGS: Z=0 C=1   │
│    Highlighted cell = PC        │                    │
│    Click to inspect             │──────────────────│
│                                 │  Current Instr    │
│                                 │  CMP R2, R3       │
│                                 │──────────────────│
│                                 │  Stack (top 8)    │
│                                 │  0xFF: 0x0A       │
│                                 │  0xFE: 0x03       │
│                                 │──────────────────│
│                                 │  Controls         │
│                                 │  [Step] [Run]     │
│                                 │  [< Back] [Reset] │
│                                 │  Speed: ---o---   │
├─────────────────────────────────┴──────────────────┤
│  Code Editor / Assembler Input                      │
│  MOV R0, 5                                          │
│  [Assemble & Load]   [Examples v]                   │
└─────────────────────────────────────────────────────┘
```

### Canvas Hex Grid

- Each byte = one small rect with hex value text
- Color coding by region (see Memory Region Tracking below)
- PC cell highlighted with bright border
- Recently changed cells flash/pulse briefly
- Hover tooltip: address, decimal value, ASCII
- Click to pin in detail panel
- **Large memory (>4KB):** Only render cells visible in the current viewport. Mousewheel zooms, drag to pan. Virtualized rendering — calculate which cells are in view based on scroll offset and canvas size, only draw those.

### Memory Region Tracking

The assembler outputs metadata alongside the bytecode:

```typescript
interface ProgramMetadata {
  codeStart: number        // Always 0x0000
  codeEnd: number          // Last byte of code
  dataStart: number        // First data directive address
  dataEnd: number          // Last data directive address
}
```

The renderer derives regions:
- **Code (green):** `codeStart` to `codeEnd`
- **Data (blue):** `dataStart` to `dataEnd`
- **Stack (orange):** `SP` to `memorySize - 1` (dynamic, updates as SP moves)
- **Free (dim gray):** Everything else

### Detail Panel (HTML/CSS)

- Registers with live values, color-matched to grid regions
- Decoded current instruction in human-readable form
- Stack view: top N entries
- Transport controls: Step, Run/Pause, Step Back, Reset
- Speed slider (logarithmic: 1/sec to 10,000/sec)
- Breakpoint list

### Breakpoints

```typescript
interface Breakpoints {
  addresses: Set<number>   // Pause when PC hits any of these
}
```

Stored outside VMState (they're a debugging tool, not part of the machine). During continuous execution, the run loop checks `if (breakpoints.addresses.has(state.registers.PC))` after each step and pauses if hit. Breakpoints are toggled by clicking an address in the hex grid (visual indicator: red dot on the cell).

### Code Editor (bottom)

- Textarea for assembly input (CodeMirror integration in a later version)
- "Assemble & Load" button
- Assembly error messages with line numbers
- Example programs dropdown

### v1 MVP vs Polish

**MVP (must ship):**
- Canvas hex grid with color-coded regions
- PC highlight and changed-cell flash
- Registers, current instruction, stack view
- Step, Run/Pause, Step Back, Reset buttons
- Speed slider
- Code editor textarea with Assemble & Load

**Polish (nice to have, can defer):**
- Hover tooltip on cells
- Click to pin/inspect
- Breakpoints UI
- Zoom/pan for large memory
- Logarithmic speed slider (linear is fine for MVP)

## Time-Travel System

### Snapshot Strategy

**Small memory (<=4KB):** Full state snapshots every step. 4KB + registers ≈ 4.1KB per snapshot.

**Large memory (>4KB):** Hybrid keyframe + diff approach.

```typescript
interface TimeTravel {
  keyframes: Map<number, VMState>    // Full snapshots every N steps (e.g., 100)
  diffs: Array<{
    cycle: number
    changes: Array<{ address: number, oldValue: number, newValue: number }>
    prevRegisters: Registers
  }>
  maxHistorySize: number             // Default: 100,000 entries
}
```

### Operations

- **Step back:** Apply most recent diff in reverse
- **Jump to cycle N:** Find nearest keyframe before N, restore, replay diffs forward
- **Memory cap:** Default 100,000 history entries. When exceeded, drop the oldest keyframes and their diffs. UI shows: "History truncated — can rewind to cycle N"

### Performance

- Diff capture per step: <0.1ms (compare ~3 bytes)
- Full keyframe (4KB): ~0.01ms, (64KB): ~0.1ms
- Rewind one step: <0.1ms
- Jump to arbitrary cycle: <1ms (max 100 diff replays)

## Assembler

### Two-pass assembly

- **Pass 1:** Scan for labels, record addresses
- **Pass 2:** Emit bytes, resolve labels

### Assembly Syntax

```
; Comments start with semicolon
label:              ; Labels end with colon, occupy no bytes
  MOV R0, 0x20     ; Hex literals with 0x prefix
  MOV R1, 10       ; Decimal literals
  LOAD R2, [R0]    ; Indirect via register pair
  LOAD R3, [0x40]  ; Absolute address
  JMP label         ; Labels resolve to 16-bit addresses
  DB 0x0A, 0x05    ; Data bytes — emits raw bytes at current address
  DB "hello"       ; String literal — emits ASCII bytes
```

- Instructions are case-insensitive (`mov` = `MOV`)
- Register names are case-insensitive (`r0` = `R0`)
- Whitespace and blank lines are ignored
- `DB` (define byte) directive for embedding data

### Memory Layout Convention

```
0x0000 ┌──────────────┐
       │ Code region   │  Program loaded here
       ├──────────────┤
       │ Data region   │  Arrays, variables (DB directives)
       ├──────────────┤
       │ Free space    │
       ├──────────────┤
       │ Stack (down)  │  Grows downward from top
  max  └──────────────┘
```

SP initialized to `memorySize - 1`. Code at 0x00. Data after code (or at explicit addresses via `ORG` directive in future versions). Boundaries aren't enforced (flat memory) but color coding in the grid reflects them based on assembler metadata.

### Direct Hex Input

Power users can paste raw hex bytes directly into memory.

## v1 Demo: Bubble Sort

The shipping demo loads a bubble sort program and a random byte array. Here is the worked assembly listing proving the ISA is sufficient:

```
; Bubble Sort — sorts 10 bytes starting at address 0x40
; Uses R0:R1 as pointer (pair), R2 as outer counter,
; R3 as inner counter, R4 and R5 for comparison values

  MOV R0, 0x40      ; array base address (low byte)
  MOV R1, 0x00      ; array base address (high byte)
  MOV R2, 9         ; outer loop: length - 1

outer:
  MOV R3, R2        ; inner counter = outer counter
  MOV R4, 0x40      ; reset pointer to array start (low byte)
  MOV R5, 0x00      ; pointer high byte

inner:
  LOAD R6, [R4]     ; load element at pointer (R4:R5 pair)
  INC R4            ; advance pointer
  LOAD R7, [R4]     ; load next element
  CMP R6, R7        ; compare current vs next
  JL no_swap        ; if current < next, skip swap

  ; swap: store R7 at [R4-1], R6 at [R4]
  STORE [R4], R6    ; store larger value at next position
  DEC R4            ; point back
  STORE [R4], R7    ; store smaller value at current position
  INC R4            ; restore pointer

no_swap:
  DEC R3            ; decrement inner counter
  JNZ inner         ; continue inner loop
  DEC R2            ; decrement outer counter
  JNZ outer         ; continue outer loop
  HLT

; Data section — 10 random bytes to sort
data:
  DB 0x37, 0x0A, 0x73, 0x1F, 0x55, 0x02, 0x8B, 0x44, 0x19, 0x61
```

User hits Run and watches the array region reorganize in real-time — bytes swapping positions, cells flashing on each write, the sorted portion growing.

## Example Programs (v1)

1. **Bubble Sort** — the headline demo
2. **Counter** — simple increment loop, good for testing step/run/rewind
3. **Fibonacci** — iterative computation, demonstrates register usage
