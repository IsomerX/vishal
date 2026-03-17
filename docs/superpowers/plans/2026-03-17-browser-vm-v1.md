# Browser VM v1 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-based virtual machine with a custom ISA, two-pass assembler, time-travel debugging, and a visual Canvas hex grid + detail panel UI, shipping with a bubble sort demo.

**Architecture:** Three-layer separation: VM Core (pure state machine), Renderer (Canvas hex grid + HTML detail panel), UI (controls, editor, wiring). The VM is fully testable without a DOM. Time-travel is implemented via state snapshots/diffs.

**Tech Stack:** TypeScript, Vite, HTML Canvas, Vitest for testing

**Spec:** `docs/superpowers/specs/2026-03-17-browser-vm-design.md`

---

## File Structure

```
src/
  vm/
    types.ts          — VMState, Registers, Opcodes, ProgramMetadata interfaces
    opcodes.ts        — Opcode constants and instruction metadata (sizes, names)
    vm.ts             — createVM(), step(), cloneState() — the core execution engine
    flags.ts          — Flag computation helpers (setFlags, checkCondition)
    time-travel.ts    — TimeTravel class: snapshot, stepBack, jumpTo
  assembler/
    types.ts          — Token, AssemblerResult, AssemblerError interfaces
    lexer.ts          — Tokenize assembly source into tokens
    parser.ts         — Two-pass assembly: labels → bytecode + metadata
  renderer/
    hex-grid.ts       — Canvas hex grid rendering (draw cells, highlights, flash)
    detail-panel.ts   — Update HTML detail panel (registers, instruction, stack)
    colors.ts         — Region color scheme constants and cell color resolver
  ui/
    controls.ts       — Wire up buttons (step, run, pause, back, reset, speed)
    editor.ts         — Code editor textarea, assemble & load, examples dropdown
    app.ts            — Main entry: create VM, assembler, renderer, wire everything
  examples/
    bubble-sort.ts    — Bubble sort assembly source string
    counter.ts        — Counter assembly source string
    fibonacci.ts      — Fibonacci assembly source string
index.html            — Main HTML shell with layout containers
style.css             — Layout CSS (grid, detail panel, editor, controls)
tests/
  vm/
    vm.test.ts        — VM step function tests (all instructions)
    flags.test.ts     — Flag computation tests
    time-travel.test.ts — Snapshot/rewind tests
  assembler/
    lexer.test.ts     — Tokenizer tests
    parser.test.ts    — Assembly → bytecode tests
  integration/
    bubble-sort.test.ts — End-to-end bubble sort demo test
```

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/vm/types.ts`

- [ ] **Step 1: Initialize project with Vite**

```bash
cd /Users/dhruvbakshi/Desktop/code/garbage/program-in-browser-memory
npm create vite@latest . -- --template vanilla-ts
```

Select "vanilla-ts" if prompted. This gives us `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, basic `src/` structure.

- [ ] **Step 2: Install dev dependencies**

```bash
npm install
npm install -D vitest
```

- [ ] **Step 3: Add test script to package.json**

Add to `"scripts"` in `package.json`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Clean up Vite scaffolding**

Remove the default `src/main.ts`, `src/counter.ts`, `src/style.css`, `src/vite-env.d.ts`, and `src/typescript.svg` that Vite generates. We'll create our own files.

- [ ] **Step 5: Create core type definitions**

Create `src/vm/types.ts`:

```typescript
export interface Registers {
  PC: number;
  SP: number;
  R0: number;
  R1: number;
  R2: number;
  R3: number;
  R4: number;
  R5: number;
  R6: number;
  R7: number;
  FLAGS: number;
}

export interface VMState {
  memory: Uint8Array;
  registers: Registers;
  halted: boolean;
  error?: string;
  cycle: number;
}

// FLAGS bit positions
export const FLAG_Z = 0b0001; // Zero
export const FLAG_C = 0b0010; // Carry
export const FLAG_N = 0b0100; // Negative
export const FLAG_V = 0b1000; // Overflow

// Register index helpers
export const REG_NAMES = ['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7'] as const;
export type RegIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export function getRegValue(regs: Registers, index: RegIndex): number {
  return regs[REG_NAMES[index]];
}

export function setRegValue(regs: Registers, index: RegIndex, value: number): void {
  regs[REG_NAMES[index]] = value & 0xFF;
}
```

- [ ] **Step 6: Verify project builds and tests run**

```bash
npm run build
npm run test
```

Expected: Build succeeds (empty project). Tests pass (no tests yet, vitest exits 0 or reports 0 tests).

- [ ] **Step 7: Commit**

```bash
git init
echo "node_modules/\ndist/\n.superpowers/" > .gitignore
git add .
git commit -m "feat: scaffold project with Vite, TypeScript, Vitest, and VM type definitions"
```

---

## Task 2: Opcode Constants and Instruction Metadata

**Files:**
- Create: `src/vm/opcodes.ts`
- Test: `tests/vm/opcodes.test.ts` (optional — constants are self-verifying)

- [ ] **Step 1: Create opcode constants**

Create `src/vm/opcodes.ts`:

```typescript
// Opcode byte values
export const OP_NOP   = 0x00;
export const OP_HLT   = 0x01;
export const OP_MOV_IMM = 0x10;  // MOV Rx, imm
export const OP_MOV_REG = 0x11;  // MOV Rx, Ry
export const OP_LOAD_ABS = 0x12; // LOAD Rx, [addr]
export const OP_STORE_ABS = 0x13;// STORE [addr], Rx
export const OP_LOAD_IND = 0x14; // LOAD Rx, [Ry]  (register pair)
export const OP_STORE_IND = 0x15;// STORE [Rx], Ry  (register pair)
export const OP_ADD   = 0x20;
export const OP_SUB   = 0x21;
export const OP_INC   = 0x22;
export const OP_DEC   = 0x23;
export const OP_CMP   = 0x30;
export const OP_JMP   = 0x40;
export const OP_JZ    = 0x41;
export const OP_JNZ   = 0x42;
export const OP_JG    = 0x43;
export const OP_JL    = 0x44;
export const OP_PUSH  = 0x50;
export const OP_POP   = 0x51;
export const OP_CALL  = 0x52;
export const OP_RET   = 0x53;

// Instruction sizes in bytes
export const INSTRUCTION_SIZE: Record<number, number> = {
  [OP_NOP]: 1,
  [OP_HLT]: 1,
  [OP_MOV_IMM]: 3,
  [OP_MOV_REG]: 3,
  [OP_LOAD_ABS]: 4,
  [OP_STORE_ABS]: 4,
  [OP_LOAD_IND]: 3,
  [OP_STORE_IND]: 3,
  [OP_ADD]: 3,
  [OP_SUB]: 3,
  [OP_INC]: 2,
  [OP_DEC]: 2,
  [OP_CMP]: 3,
  [OP_JMP]: 3,
  [OP_JZ]: 3,
  [OP_JNZ]: 3,
  [OP_JG]: 3,
  [OP_JL]: 3,
  [OP_PUSH]: 2,
  [OP_POP]: 2,
  [OP_CALL]: 3,
  [OP_RET]: 1,
};

// Human-readable mnemonic names (for disassembly in the detail panel)
export const OPCODE_NAMES: Record<number, string> = {
  [OP_NOP]: 'NOP',
  [OP_HLT]: 'HLT',
  [OP_MOV_IMM]: 'MOV',
  [OP_MOV_REG]: 'MOV',
  [OP_LOAD_ABS]: 'LOAD',
  [OP_STORE_ABS]: 'STORE',
  [OP_LOAD_IND]: 'LOAD',
  [OP_STORE_IND]: 'STORE',
  [OP_ADD]: 'ADD',
  [OP_SUB]: 'SUB',
  [OP_INC]: 'INC',
  [OP_DEC]: 'DEC',
  [OP_CMP]: 'CMP',
  [OP_JMP]: 'JMP',
  [OP_JZ]: 'JZ',
  [OP_JNZ]: 'JNZ',
  [OP_JG]: 'JG',
  [OP_JL]: 'JL',
  [OP_PUSH]: 'PUSH',
  [OP_POP]: 'POP',
  [OP_CALL]: 'CALL',
  [OP_RET]: 'RET',
};
```

- [ ] **Step 2: Commit**

```bash
git add src/vm/opcodes.ts
git commit -m "feat: add opcode constants and instruction metadata"
```

---

## Task 3: Flag Computation Helpers

**Files:**
- Create: `src/vm/flags.ts`, `tests/vm/flags.test.ts`

- [ ] **Step 1: Write failing tests for flag helpers**

Create `tests/vm/flags.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeFlags, checkCondition } from '../../src/vm/flags';
import { FLAG_Z, FLAG_C, FLAG_N, FLAG_V } from '../../src/vm/types';

describe('computeFlags', () => {
  it('sets Z flag when result is zero', () => {
    const flags = computeFlags(5, 5, 5 - 5);
    expect(flags & FLAG_Z).toBeTruthy();
  });

  it('clears Z flag when result is non-zero', () => {
    const flags = computeFlags(5, 3, 5 - 3);
    expect(flags & FLAG_Z).toBeFalsy();
  });

  it('sets C flag on unsigned underflow (borrow)', () => {
    // 3 - 5 = underflow in unsigned
    const flags = computeFlags(3, 5, 3 - 5);
    expect(flags & FLAG_C).toBeTruthy();
  });

  it('clears C flag when no borrow', () => {
    const flags = computeFlags(5, 3, 5 - 3);
    expect(flags & FLAG_C).toBeFalsy();
  });

  it('sets N flag when result bit 7 is set', () => {
    const flags = computeFlags(0, 1, (0 - 1) & 0xFF);
    expect(flags & FLAG_N).toBeTruthy();
  });

  it('sets V flag on signed overflow', () => {
    // 127 + 1 = 128, which overflows signed 8-bit
    const flags = computeFlags(127, 1, 128, true);
    expect(flags & FLAG_V).toBeTruthy();
  });
});

describe('checkCondition', () => {
  it('JZ: true when Z=1', () => {
    expect(checkCondition(0x41, FLAG_Z)).toBe(true);
  });

  it('JZ: false when Z=0', () => {
    expect(checkCondition(0x41, 0)).toBe(false);
  });

  it('JNZ: true when Z=0', () => {
    expect(checkCondition(0x42, 0)).toBe(true);
  });

  it('JG: true when Z=0 and C=0', () => {
    expect(checkCondition(0x43, 0)).toBe(true);
  });

  it('JG: false when Z=1', () => {
    expect(checkCondition(0x43, FLAG_Z)).toBe(false);
  });

  it('JL: true when C=1', () => {
    expect(checkCondition(0x44, FLAG_C)).toBe(true);
  });

  it('JL: false when C=0', () => {
    expect(checkCondition(0x44, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/vm/flags.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement flag helpers**

Create `src/vm/flags.ts`:

```typescript
import { FLAG_Z, FLAG_C, FLAG_N, FLAG_V } from './types';
import { OP_JZ, OP_JNZ, OP_JG, OP_JL } from './opcodes';

/**
 * Compute flags for an arithmetic operation.
 * @param a - First operand (8-bit)
 * @param b - Second operand (8-bit)
 * @param result - The raw result (may exceed 8 bits)
 * @param isAddition - true for ADD/INC, false for SUB/DEC/CMP
 */
export function computeFlags(a: number, b: number, result: number, isAddition = false): number {
  const result8 = result & 0xFF;
  let flags = 0;

  // Zero
  if (result8 === 0) flags |= FLAG_Z;

  // Carry (unsigned overflow/underflow)
  if (isAddition) {
    if (result > 0xFF) flags |= FLAG_C;
  } else {
    if (a < b) flags |= FLAG_C;
  }

  // Negative (bit 7)
  if (result8 & 0x80) flags |= FLAG_N;

  // Overflow (signed)
  if (isAddition) {
    if ((~(a ^ b) & (a ^ result8)) & 0x80) flags |= FLAG_V;
  } else {
    if (((a ^ b) & (a ^ result8)) & 0x80) flags |= FLAG_V;
  }

  return flags;
}

/**
 * Check if a conditional jump should be taken given the current flags.
 */
export function checkCondition(opcode: number, flags: number): boolean {
  switch (opcode) {
    case OP_JZ:  return (flags & FLAG_Z) !== 0;
    case OP_JNZ: return (flags & FLAG_Z) === 0;
    case OP_JG:  return (flags & FLAG_Z) === 0 && (flags & FLAG_C) === 0;
    case OP_JL:  return (flags & FLAG_C) !== 0;
    default:     return false;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/vm/flags.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vm/flags.ts tests/vm/flags.test.ts
git commit -m "feat: add flag computation and condition checking helpers"
```

---

## Task 4: VM Core — createVM and step function

**Files:**
- Create: `src/vm/vm.ts`, `tests/vm/vm.test.ts`

- [ ] **Step 1: Write failing tests for VM creation and basic instructions**

Create `tests/vm/vm.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createVM, step } from '../../src/vm/vm';

describe('createVM', () => {
  it('creates a VM with specified memory size', () => {
    const state = createVM(256);
    expect(state.memory.length).toBe(256);
    expect(state.registers.PC).toBe(0);
    expect(state.registers.SP).toBe(255);
    expect(state.halted).toBe(false);
    expect(state.cycle).toBe(0);
  });

  it('defaults to 4KB memory', () => {
    const state = createVM();
    expect(state.memory.length).toBe(4096);
    expect(state.registers.SP).toBe(4095);
  });
});

describe('step - NOP and HLT', () => {
  it('NOP advances PC by 1', () => {
    const state = createVM(256);
    state.memory[0] = 0x00; // NOP
    const next = step(state);
    expect(next.registers.PC).toBe(1);
    expect(next.cycle).toBe(1);
  });

  it('HLT sets halted flag', () => {
    const state = createVM(256);
    state.memory[0] = 0x01; // HLT
    const next = step(state);
    expect(next.halted).toBe(true);
  });
});

describe('step - MOV', () => {
  it('MOV Rx, imm loads immediate value', () => {
    const state = createVM(256);
    state.memory[0] = 0x10; // MOV_IMM
    state.memory[1] = 0;    // R0
    state.memory[2] = 42;   // imm = 42
    const next = step(state);
    expect(next.registers.R0).toBe(42);
    expect(next.registers.PC).toBe(3);
  });

  it('MOV Rx, Ry copies register', () => {
    const state = createVM(256);
    state.registers.R1 = 99;
    state.memory[0] = 0x11; // MOV_REG
    state.memory[1] = 0;    // R0 (dest)
    state.memory[2] = 1;    // R1 (src)
    const next = step(state);
    expect(next.registers.R0).toBe(99);
  });
});

describe('step - LOAD/STORE', () => {
  it('LOAD Rx, [addr] loads from absolute address', () => {
    const state = createVM(256);
    state.memory[0x40] = 0xAB;
    state.memory[0] = 0x12; // LOAD_ABS
    state.memory[1] = 0;    // R0
    state.memory[2] = 0x40; // addrLo
    state.memory[3] = 0x00; // addrHi
    const next = step(state);
    expect(next.registers.R0).toBe(0xAB);
    expect(next.registers.PC).toBe(4);
  });

  it('STORE [addr], Rx stores to absolute address', () => {
    const state = createVM(256);
    state.registers.R0 = 0xCD;
    state.memory[0] = 0x13; // STORE_ABS
    state.memory[1] = 0;    // R0
    state.memory[2] = 0x50; // addrLo
    state.memory[3] = 0x00; // addrHi
    const next = step(state);
    expect(next.memory[0x50]).toBe(0xCD);
  });

  it('LOAD Rx, [Ry] indirect via register pair', () => {
    const state = createVM(256);
    state.registers.R2 = 0x40; // low byte of address
    state.registers.R3 = 0x00; // high byte of address
    state.memory[0x40] = 0xEF;
    state.memory[0] = 0x14; // LOAD_IND
    state.memory[1] = 0;    // R0 (dest)
    state.memory[2] = 2;    // R2 (pair R2:R3)
    const next = step(state);
    expect(next.registers.R0).toBe(0xEF);
  });

  it('STORE [Rx], Ry indirect via register pair', () => {
    const state = createVM(256);
    state.registers.R0 = 0x60; // low byte of address
    state.registers.R1 = 0x00; // high byte
    state.registers.R4 = 0x77;
    state.memory[0] = 0x15; // STORE_IND
    state.memory[1] = 0;    // R0 (pair R0:R1)
    state.memory[2] = 4;    // R4 (source)
    const next = step(state);
    expect(next.memory[0x60]).toBe(0x77);
  });
});

describe('step - arithmetic', () => {
  it('ADD sets result and flags', () => {
    const state = createVM(256);
    state.registers.R0 = 10;
    state.registers.R1 = 20;
    state.memory[0] = 0x20; // ADD
    state.memory[1] = 0;    // R0
    state.memory[2] = 1;    // R1
    const next = step(state);
    expect(next.registers.R0).toBe(30);
  });

  it('SUB sets result and flags', () => {
    const state = createVM(256);
    state.registers.R0 = 20;
    state.registers.R1 = 5;
    state.memory[0] = 0x21; // SUB
    state.memory[1] = 0;    // R0
    state.memory[2] = 1;    // R1
    const next = step(state);
    expect(next.registers.R0).toBe(15);
  });

  it('INC increments register', () => {
    const state = createVM(256);
    state.registers.R0 = 9;
    state.memory[0] = 0x22; // INC
    state.memory[1] = 0;    // R0
    const next = step(state);
    expect(next.registers.R0).toBe(10);
  });

  it('DEC decrements register and sets zero flag', () => {
    const state = createVM(256);
    state.registers.R0 = 1;
    state.memory[0] = 0x23; // DEC
    state.memory[1] = 0;    // R0
    const next = step(state);
    expect(next.registers.R0).toBe(0);
    expect(next.registers.FLAGS & 0b0001).toBeTruthy(); // Z flag
  });
});

describe('step - jumps', () => {
  it('JMP sets PC to address', () => {
    const state = createVM(256);
    state.memory[0] = 0x40; // JMP
    state.memory[1] = 0x20; // addrLo
    state.memory[2] = 0x00; // addrHi
    const next = step(state);
    expect(next.registers.PC).toBe(0x20);
  });

  it('JZ jumps when zero flag set', () => {
    const state = createVM(256);
    state.registers.FLAGS = 0b0001; // Z flag
    state.memory[0] = 0x41; // JZ
    state.memory[1] = 0x10;
    state.memory[2] = 0x00;
    const next = step(state);
    expect(next.registers.PC).toBe(0x10);
  });

  it('JZ falls through when zero flag clear', () => {
    const state = createVM(256);
    state.registers.FLAGS = 0;
    state.memory[0] = 0x41; // JZ
    state.memory[1] = 0x10;
    state.memory[2] = 0x00;
    const next = step(state);
    expect(next.registers.PC).toBe(3);
  });

  it('JNZ jumps when zero flag clear', () => {
    const state = createVM(256);
    state.registers.FLAGS = 0;
    state.memory[0] = 0x42; // JNZ
    state.memory[1] = 0x30;
    state.memory[2] = 0x00;
    const next = step(state);
    expect(next.registers.PC).toBe(0x30);
  });

  it('JG jumps when unsigned greater (Z=0, C=0)', () => {
    const state = createVM(256);
    state.registers.FLAGS = 0; // Z=0, C=0
    state.memory[0] = 0x43; // JG
    state.memory[1] = 0x20;
    state.memory[2] = 0x00;
    const next = step(state);
    expect(next.registers.PC).toBe(0x20);
  });

  it('JG does not jump when Z=1', () => {
    const state = createVM(256);
    state.registers.FLAGS = 0b0001; // Z=1
    state.memory[0] = 0x43; // JG
    state.memory[1] = 0x20;
    state.memory[2] = 0x00;
    const next = step(state);
    expect(next.registers.PC).toBe(3);
  });

  it('JL jumps when C=1', () => {
    const state = createVM(256);
    state.registers.FLAGS = 0b0010; // C=1
    state.memory[0] = 0x44; // JL
    state.memory[1] = 0x20;
    state.memory[2] = 0x00;
    const next = step(state);
    expect(next.registers.PC).toBe(0x20);
  });

  it('JL does not jump when C=0', () => {
    const state = createVM(256);
    state.registers.FLAGS = 0;
    state.memory[0] = 0x44; // JL
    state.memory[1] = 0x20;
    state.memory[2] = 0x00;
    const next = step(state);
    expect(next.registers.PC).toBe(3);
  });
});

describe('step - CMP', () => {
  it('CMP sets flags without modifying registers', () => {
    const state = createVM(256);
    state.registers.R0 = 5;
    state.registers.R1 = 3;
    state.memory[0] = 0x30; // CMP
    state.memory[1] = 0;    // R0
    state.memory[2] = 1;    // R1
    const next = step(state);
    expect(next.registers.R0).toBe(5); // unchanged
    expect(next.registers.R1).toBe(3); // unchanged
    expect(next.registers.FLAGS & 0b0001).toBeFalsy(); // Z=0 (5-3 != 0)
    expect(next.registers.FLAGS & 0b0010).toBeFalsy(); // C=0 (no borrow)
  });

  it('CMP sets Z flag when equal', () => {
    const state = createVM(256);
    state.registers.R0 = 7;
    state.registers.R1 = 7;
    state.memory[0] = 0x30;
    state.memory[1] = 0;
    state.memory[2] = 1;
    const next = step(state);
    expect(next.registers.FLAGS & 0b0001).toBeTruthy(); // Z=1
  });

  it('CMP sets C flag when less than', () => {
    const state = createVM(256);
    state.registers.R0 = 3;
    state.registers.R1 = 10;
    state.memory[0] = 0x30;
    state.memory[1] = 0;
    state.memory[2] = 1;
    const next = step(state);
    expect(next.registers.FLAGS & 0b0010).toBeTruthy(); // C=1 (borrow)
  });
});

describe('step - stack', () => {
  it('PUSH decrements SP and stores value', () => {
    const state = createVM(256);
    state.registers.R0 = 0x42;
    state.memory[0] = 0x50; // PUSH
    state.memory[1] = 0;    // R0
    const next = step(state);
    expect(next.memory[255]).toBe(0x42);
    expect(next.registers.SP).toBe(254);
  });

  it('POP increments SP and loads value', () => {
    const state = createVM(256);
    state.registers.SP = 254;
    state.memory[255] = 0x42;
    state.memory[0] = 0x51; // POP
    state.memory[1] = 0;    // R0
    const next = step(state);
    expect(next.registers.R0).toBe(0x42);
    expect(next.registers.SP).toBe(255);
  });

  it('CALL pushes return address and jumps', () => {
    const state = createVM(256);
    state.memory[0] = 0x52; // CALL
    state.memory[1] = 0x20; // addrLo
    state.memory[2] = 0x00; // addrHi
    const next = step(state);
    expect(next.registers.PC).toBe(0x20);
    // Return address 0x0003 pushed as 2 bytes (hi then lo)
    expect(next.memory[255]).toBe(0x00); // high byte
    expect(next.memory[254]).toBe(0x03); // low byte
    expect(next.registers.SP).toBe(253);
  });

  it('RET pops return address and jumps', () => {
    const state = createVM(256);
    state.registers.SP = 253;
    state.memory[254] = 0x03; // low byte
    state.memory[255] = 0x00; // high byte
    state.memory[0] = 0x53;   // RET
    const next = step(state);
    expect(next.registers.PC).toBe(0x03);
    expect(next.registers.SP).toBe(255);
  });
});

describe('step - error handling', () => {
  it('halts on invalid opcode', () => {
    const state = createVM(256);
    state.memory[0] = 0xFF; // invalid
    const next = step(state);
    expect(next.halted).toBe(true);
    expect(next.error).toContain('Invalid opcode');
  });

  it('halts on PC out of bounds', () => {
    const state = createVM(256);
    state.registers.PC = 256;
    const next = step(state);
    expect(next.halted).toBe(true);
    expect(next.error).toContain('out of bounds');
  });

  it('does nothing when already halted', () => {
    const state = createVM(256);
    state.halted = true;
    const next = step(state);
    expect(next.halted).toBe(true);
    expect(next.cycle).toBe(0);
  });

  it('halts on memory access out of bounds', () => {
    const state = createVM(256);
    state.memory[0] = 0x12; // LOAD_ABS
    state.memory[1] = 0;    // R0
    state.memory[2] = 0x00; // addrLo
    state.memory[3] = 0xFF; // addrHi = 0xFF00, way out of bounds
    const next = step(state);
    expect(next.halted).toBe(true);
    expect(next.error).toContain('out of bounds');
  });

  it('halts on stack overflow (SP wraps below 0)', () => {
    const state = createVM(16); // tiny memory
    state.registers.SP = 0;    // almost full
    state.registers.R0 = 0x42;
    state.memory[0] = 0x50; // PUSH
    state.memory[1] = 0;    // R0
    const next = step(state);
    // SP goes from 0 to -1, which is overflow
    expect(next.halted).toBe(true);
    expect(next.error).toContain('Stack overflow');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/vm/vm.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement createVM and step**

Create `src/vm/vm.ts`:

```typescript
import { VMState, Registers, RegIndex, getRegValue, setRegValue } from './types';
import {
  OP_NOP, OP_HLT, OP_MOV_IMM, OP_MOV_REG,
  OP_LOAD_ABS, OP_STORE_ABS, OP_LOAD_IND, OP_STORE_IND,
  OP_ADD, OP_SUB, OP_INC, OP_DEC, OP_CMP,
  OP_JMP, OP_JZ, OP_JNZ, OP_JG, OP_JL,
  OP_PUSH, OP_POP, OP_CALL, OP_RET,
  INSTRUCTION_SIZE,
} from './opcodes';
import { computeFlags, checkCondition } from './flags';

export function createVM(memorySize = 4096): VMState {
  return {
    memory: new Uint8Array(memorySize),
    registers: {
      PC: 0, SP: memorySize - 1,
      R0: 0, R1: 0, R2: 0, R3: 0,
      R4: 0, R5: 0, R6: 0, R7: 0,
      FLAGS: 0,
    },
    halted: false,
    cycle: 0,
  };
}

export function cloneState(state: VMState): VMState {
  return {
    memory: new Uint8Array(state.memory),
    registers: { ...state.registers },
    halted: state.halted,
    error: state.error,
    cycle: state.cycle,
  };
}

export function step(state: VMState): VMState {
  if (state.halted) return state;

  const s = cloneState(state);
  const mem = s.memory;
  const regs = s.registers;
  const size = mem.length;

  // PC bounds check
  if (regs.PC >= size) {
    s.halted = true;
    s.error = `PC out of bounds: ${regs.PC}`;
    return s;
  }

  const opcode = mem[regs.PC];
  const instrSize = INSTRUCTION_SIZE[opcode];

  if (instrSize === undefined) {
    s.halted = true;
    s.error = `Invalid opcode: 0x${opcode.toString(16).padStart(2, '0')} at PC=${regs.PC}`;
    return s;
  }

  // Helper to read operand bytes
  const byte = (offset: number) => mem[regs.PC + offset];
  const addr16 = (offset: number) => byte(offset) | (byte(offset + 1) << 8);
  const rx = () => byte(1) as RegIndex;
  const ry = () => byte(2) as RegIndex;

  // Helper for bounds-checked memory access
  const memRead = (address: number): number | null => {
    if (address < 0 || address >= size) {
      s.halted = true;
      s.error = `Memory access out of bounds: 0x${address.toString(16)}`;
      return null;
    }
    return mem[address];
  };

  const memWrite = (address: number, value: number): boolean => {
    if (address < 0 || address >= size) {
      s.halted = true;
      s.error = `Memory access out of bounds: 0x${address.toString(16)}`;
      return false;
    }
    mem[address] = value & 0xFF;
    return true;
  };

  // Helper for register pair address
  const regPairAddr = (regIdx: RegIndex): number => {
    const lo = getRegValue(regs, regIdx);
    const hi = getRegValue(regs, (regIdx + 1) as RegIndex);
    return (hi << 8) | lo;
  };

  switch (opcode) {
    case OP_NOP:
      break;

    case OP_HLT:
      s.halted = true;
      break;

    case OP_MOV_IMM:
      setRegValue(regs, rx(), byte(2));
      break;

    case OP_MOV_REG:
      setRegValue(regs, rx(), getRegValue(regs, ry()));
      break;

    case OP_LOAD_ABS: {
      const val = memRead(addr16(2));
      if (val === null) return s;
      setRegValue(regs, rx(), val);
      break;
    }

    case OP_STORE_ABS: {
      if (!memWrite(addr16(2), getRegValue(regs, rx()))) return s;
      break;
    }

    case OP_LOAD_IND: {
      const address = regPairAddr(ry());
      const val = memRead(address);
      if (val === null) return s;
      setRegValue(regs, rx(), val);
      break;
    }

    case OP_STORE_IND: {
      const address = regPairAddr(rx());
      if (!memWrite(address, getRegValue(regs, ry()))) return s;
      break;
    }

    case OP_ADD: {
      const a = getRegValue(regs, rx());
      const b = getRegValue(regs, ry());
      const result = a + b;
      setRegValue(regs, rx(), result);
      regs.FLAGS = computeFlags(a, b, result, true);
      break;
    }

    case OP_SUB: {
      const a = getRegValue(regs, rx());
      const b = getRegValue(regs, ry());
      const result = a - b;
      setRegValue(regs, rx(), result);
      regs.FLAGS = computeFlags(a, b, result, false);
      break;
    }

    case OP_INC: {
      const a = getRegValue(regs, rx());
      const result = a + 1;
      setRegValue(regs, rx(), result);
      regs.FLAGS = computeFlags(a, 1, result, true);
      break;
    }

    case OP_DEC: {
      const a = getRegValue(regs, rx());
      const result = a - 1;
      setRegValue(regs, rx(), result);
      regs.FLAGS = computeFlags(a, 1, result, false);
      break;
    }

    case OP_CMP: {
      const a = getRegValue(regs, rx());
      const b = getRegValue(regs, ry());
      regs.FLAGS = computeFlags(a, b, a - b, false);
      break;
    }

    case OP_JMP:
      regs.PC = addr16(1);
      s.cycle++;
      return s; // Don't advance PC normally

    case OP_JZ:
    case OP_JNZ:
    case OP_JG:
    case OP_JL:
      if (checkCondition(opcode, regs.FLAGS)) {
        regs.PC = addr16(1);
        s.cycle++;
        return s;
      }
      break;

    case OP_PUSH: {
      if (!memWrite(regs.SP, getRegValue(regs, rx()))) return s;
      regs.SP--;
      if (regs.SP < 0) {
        s.halted = true;
        s.error = 'Stack overflow';
        return s;
      }
      break;
    }

    case OP_POP: {
      regs.SP++;
      if (regs.SP >= size) {
        s.halted = true;
        s.error = 'Stack underflow';
        return s;
      }
      const val = memRead(regs.SP);
      if (val === null) return s;
      setRegValue(regs, rx(), val);
      break;
    }

    case OP_CALL: {
      const returnAddr = regs.PC + 3;
      const hi = (returnAddr >> 8) & 0xFF;
      const lo = returnAddr & 0xFF;
      if (!memWrite(regs.SP, hi)) return s;
      regs.SP--;
      if (!memWrite(regs.SP, lo)) return s;
      regs.SP--;
      regs.PC = addr16(1);
      s.cycle++;
      return s;
    }

    case OP_RET: {
      regs.SP++;
      const lo = memRead(regs.SP);
      if (lo === null) return s;
      regs.SP++;
      const hi = memRead(regs.SP);
      if (hi === null) return s;
      regs.PC = (hi << 8) | lo;
      s.cycle++;
      return s;
    }
  }

  regs.PC += instrSize;
  s.cycle++;
  return s;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/vm/vm.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vm/vm.ts tests/vm/vm.test.ts
git commit -m "feat: implement VM core with createVM, step, and all v1 instructions"
```

---

## Task 5: Time-Travel System

**Files:**
- Create: `src/vm/time-travel.ts`, `tests/vm/time-travel.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/vm/time-travel.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { TimeTravel } from '../../src/vm/time-travel';
import { createVM, step } from '../../src/vm/vm';

describe('TimeTravel', () => {
  it('records state and allows step back', () => {
    let state = createVM(256);
    state.memory[0] = 0x10; // MOV R0, 42
    state.memory[1] = 0;
    state.memory[2] = 42;
    state.memory[3] = 0x01; // HLT

    const tt = new TimeTravel();
    tt.record(state);
    state = step(state);
    tt.record(state);

    expect(state.registers.R0).toBe(42);

    const prev = tt.stepBack();
    expect(prev).not.toBeNull();
    expect(prev!.registers.R0).toBe(0);
    expect(prev!.registers.PC).toBe(0);
  });

  it('returns null when no history to step back to', () => {
    const tt = new TimeTravel();
    expect(tt.stepBack()).toBeNull();
  });

  it('tracks history length', () => {
    const tt = new TimeTravel();
    let state = createVM(256);
    state.memory[0] = 0x00; // NOP
    state.memory[1] = 0x00; // NOP
    state.memory[2] = 0x01; // HLT

    tt.record(state);
    state = step(state);
    tt.record(state);
    state = step(state);
    tt.record(state);

    expect(tt.length).toBe(3);
  });

  it('respects max history size', () => {
    const tt = new TimeTravel(5);
    let state = createVM(256);
    // Fill memory with NOPs
    for (let i = 0; i < 10; i++) state.memory[i] = 0x00;
    state.memory[10] = 0x01; // HLT

    for (let i = 0; i < 8; i++) {
      tt.record(state);
      state = step(state);
    }

    expect(tt.length).toBeLessThanOrEqual(5);
  });

  it('can jump to a specific cycle', () => {
    const tt = new TimeTravel();
    let state = createVM(256);
    for (let i = 0; i < 20; i++) state.memory[i] = 0x00; // NOPs
    state.memory[20] = 0x01; // HLT

    for (let i = 0; i < 6; i++) {
      tt.record(state);
      state = step(state);
    }

    const target = tt.jumpTo(2);
    expect(target).not.toBeNull();
    expect(target!.cycle).toBe(2);
    expect(target!.registers.PC).toBe(2);
  });

  it('reset clears all history', () => {
    const tt = new TimeTravel();
    const state = createVM(256);
    tt.record(state);
    tt.record(step(state));
    tt.reset();
    expect(tt.length).toBe(0);
    expect(tt.stepBack()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/vm/time-travel.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement TimeTravel class**

Create `src/vm/time-travel.ts`:

```typescript
import { VMState } from './types';
import { cloneState } from './vm';

export class TimeTravel {
  private history: VMState[] = [];
  private maxSize: number;

  constructor(maxSize = 100_000) {
    this.maxSize = maxSize;
  }

  get length(): number {
    return this.history.length;
  }

  get minCycle(): number | null {
    return this.history.length > 0 ? this.history[0].cycle : null;
  }

  record(state: VMState): void {
    this.history.push(cloneState(state));
    if (this.history.length > this.maxSize) {
      this.history.shift();
    }
  }

  stepBack(): VMState | null {
    if (this.history.length < 2) return null;
    this.history.pop(); // Remove current state
    const prev = this.history[this.history.length - 1];
    return cloneState(prev);
  }

  jumpTo(cycle: number): VMState | null {
    const entry = this.history.find(s => s.cycle === cycle);
    if (!entry) return null;
    // Trim history to that point
    const idx = this.history.indexOf(entry);
    this.history = this.history.slice(0, idx + 1);
    return cloneState(entry);
  }

  reset(): void {
    this.history = [];
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/vm/time-travel.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/vm/time-travel.ts tests/vm/time-travel.test.ts
git commit -m "feat: implement time-travel debugging with snapshot history"
```

---

## Task 6: Assembler — Lexer

**Files:**
- Create: `src/assembler/types.ts`, `src/assembler/lexer.ts`, `tests/assembler/lexer.test.ts`

- [ ] **Step 1: Create assembler types**

Create `src/assembler/types.ts`:

```typescript
export type TokenType =
  | 'INSTRUCTION'
  | 'REGISTER'
  | 'NUMBER'
  | 'LABEL_DEF'    // "foo:"
  | 'LABEL_REF'    // "foo" used as operand
  | 'LBRACKET'     // "["
  | 'RBRACKET'     // "]"
  | 'COMMA'
  | 'DIRECTIVE'    // "DB"
  | 'STRING'
  | 'NEWLINE';

export interface Token {
  type: TokenType;
  value: string;
  line: number;
}

export interface AssemblerError {
  message: string;
  line: number;
}

export interface ProgramMetadata {
  codeStart: number;
  codeEnd: number;
  dataStart: number;
  dataEnd: number;
}

export interface AssemblerResult {
  bytecode: Uint8Array;
  metadata: ProgramMetadata;
  errors: AssemblerError[];
}
```

- [ ] **Step 2: Write failing tests for the lexer**

Create `tests/assembler/lexer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/assembler/lexer';

describe('tokenize', () => {
  it('tokenizes a simple instruction', () => {
    const tokens = tokenize('MOV R0, 42');
    expect(tokens).toEqual([
      { type: 'INSTRUCTION', value: 'MOV', line: 1 },
      { type: 'REGISTER', value: 'R0', line: 1 },
      { type: 'COMMA', value: ',', line: 1 },
      { type: 'NUMBER', value: '42', line: 1 },
      { type: 'NEWLINE', value: '\n', line: 1 },
    ]);
  });

  it('tokenizes hex numbers', () => {
    const tokens = tokenize('MOV R0, 0x40');
    const numToken = tokens.find(t => t.type === 'NUMBER');
    expect(numToken!.value).toBe('0x40');
  });

  it('tokenizes labels', () => {
    const tokens = tokenize('loop:\n  JMP loop');
    expect(tokens[0]).toEqual({ type: 'LABEL_DEF', value: 'loop', line: 1 });
    expect(tokens[tokens.length - 2]).toEqual({ type: 'LABEL_REF', value: 'loop', line: 2 });
  });

  it('tokenizes brackets for indirect addressing', () => {
    const tokens = tokenize('LOAD R0, [R2]');
    expect(tokens.map(t => t.type)).toContain('LBRACKET');
    expect(tokens.map(t => t.type)).toContain('RBRACKET');
  });

  it('strips comments', () => {
    const tokens = tokenize('NOP ; this is a comment');
    expect(tokens.filter(t => t.type === 'INSTRUCTION')).toHaveLength(1);
    expect(tokens.find(t => t.value.includes('comment'))).toBeUndefined();
  });

  it('tokenizes DB directive', () => {
    const tokens = tokenize('DB 0x0A, 0x05');
    expect(tokens[0]).toEqual({ type: 'DIRECTIVE', value: 'DB', line: 1 });
  });

  it('tokenizes string literals in DB', () => {
    const tokens = tokenize('DB "hello"');
    expect(tokens[1]).toEqual({ type: 'STRING', value: 'hello', line: 1 });
  });

  it('is case-insensitive for instructions and registers', () => {
    const tokens = tokenize('mov r0, 5');
    expect(tokens[0].value).toBe('MOV');
    expect(tokens[1].value).toBe('R0');
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/assembler/lexer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the lexer**

Create `src/assembler/lexer.ts`:

```typescript
import { Token, TokenType } from './types';

const INSTRUCTIONS = new Set([
  'NOP', 'HLT', 'MOV', 'LOAD', 'STORE',
  'ADD', 'SUB', 'INC', 'DEC', 'CMP',
  'JMP', 'JZ', 'JNZ', 'JG', 'JL',
  'PUSH', 'POP', 'CALL', 'RET',
]);

const REGISTERS = new Set(['R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7']);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const lines = source.split('\n');

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const lineNum = lineIdx + 1;
    let line = lines[lineIdx];

    // Strip comments
    const commentIdx = line.indexOf(';');
    if (commentIdx !== -1) line = line.substring(0, commentIdx);

    line = line.trim();
    if (line.length === 0) {
      tokens.push({ type: 'NEWLINE', value: '\n', line: lineNum });
      continue;
    }

    let i = 0;
    while (i < line.length) {
      // Skip whitespace
      if (line[i] === ' ' || line[i] === '\t') {
        i++;
        continue;
      }

      // Comma
      if (line[i] === ',') {
        tokens.push({ type: 'COMMA', value: ',', line: lineNum });
        i++;
        continue;
      }

      // Brackets
      if (line[i] === '[') {
        tokens.push({ type: 'LBRACKET', value: '[', line: lineNum });
        i++;
        continue;
      }
      if (line[i] === ']') {
        tokens.push({ type: 'RBRACKET', value: ']', line: lineNum });
        i++;
        continue;
      }

      // String literal
      if (line[i] === '"') {
        const end = line.indexOf('"', i + 1);
        const str = line.substring(i + 1, end === -1 ? line.length : end);
        tokens.push({ type: 'STRING', value: str, line: lineNum });
        i = end === -1 ? line.length : end + 1;
        continue;
      }

      // Number (hex or decimal)
      if (line[i] >= '0' && line[i] <= '9') {
        let num = '';
        if (line[i] === '0' && (line[i + 1] === 'x' || line[i + 1] === 'X')) {
          num = '0x';
          i += 2;
          while (i < line.length && /[0-9a-fA-F]/.test(line[i])) {
            num += line[i++];
          }
        } else {
          while (i < line.length && line[i] >= '0' && line[i] <= '9') {
            num += line[i++];
          }
        }
        tokens.push({ type: 'NUMBER', value: num, line: lineNum });
        continue;
      }

      // Word (instruction, register, label, directive)
      if (/[a-zA-Z_]/.test(line[i])) {
        let word = '';
        while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
          word += line[i++];
        }

        // Check for label definition (word followed by colon)
        if (i < line.length && line[i] === ':') {
          tokens.push({ type: 'LABEL_DEF', value: word.toLowerCase(), line: lineNum });
          i++; // skip colon
          continue;
        }

        const upper = word.toUpperCase();

        if (upper === 'DB') {
          tokens.push({ type: 'DIRECTIVE', value: 'DB', line: lineNum });
        } else if (INSTRUCTIONS.has(upper)) {
          tokens.push({ type: 'INSTRUCTION', value: upper, line: lineNum });
        } else if (REGISTERS.has(upper)) {
          tokens.push({ type: 'REGISTER', value: upper, line: lineNum });
        } else {
          // Must be a label reference
          tokens.push({ type: 'LABEL_REF', value: word.toLowerCase(), line: lineNum });
        }
        continue;
      }

      // Skip unknown characters
      i++;
    }

    tokens.push({ type: 'NEWLINE', value: '\n', line: lineNum });
  }

  return tokens;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/assembler/lexer.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/assembler/types.ts src/assembler/lexer.ts tests/assembler/lexer.test.ts
git commit -m "feat: implement assembler lexer with tokenization for all syntax forms"
```

---

## Task 7: Assembler — Parser (two-pass)

**Files:**
- Create: `src/assembler/parser.ts`, `tests/assembler/parser.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/assembler/parser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { assemble } from '../../src/assembler/parser';

describe('assemble', () => {
  it('assembles NOP', () => {
    const result = assemble('NOP');
    expect(result.errors).toHaveLength(0);
    expect(result.bytecode[0]).toBe(0x00);
  });

  it('assembles HLT', () => {
    const result = assemble('HLT');
    expect(result.bytecode[0]).toBe(0x01);
  });

  it('assembles MOV Rx, imm', () => {
    const result = assemble('MOV R0, 42');
    expect(result.errors).toHaveLength(0);
    expect(result.bytecode[0]).toBe(0x10);
    expect(result.bytecode[1]).toBe(0);    // R0
    expect(result.bytecode[2]).toBe(42);
  });

  it('assembles MOV Rx, Ry', () => {
    const result = assemble('MOV R0, R1');
    expect(result.bytecode[0]).toBe(0x11);
    expect(result.bytecode[1]).toBe(0);
    expect(result.bytecode[2]).toBe(1);
  });

  it('assembles LOAD Rx, [addr]', () => {
    const result = assemble('LOAD R0, [0x0040]');
    expect(result.bytecode[0]).toBe(0x12);
    expect(result.bytecode[1]).toBe(0);
    expect(result.bytecode[2]).toBe(0x40); // lo
    expect(result.bytecode[3]).toBe(0x00); // hi
  });

  it('assembles LOAD Rx, [Ry] indirect', () => {
    const result = assemble('LOAD R0, [R2]');
    expect(result.bytecode[0]).toBe(0x14);
    expect(result.bytecode[1]).toBe(0);    // R0
    expect(result.bytecode[2]).toBe(2);    // R2
  });

  it('assembles JMP with label', () => {
    const result = assemble('loop:\n  NOP\n  JMP loop');
    expect(result.errors).toHaveLength(0);
    // NOP at 0x00 (1 byte), JMP at 0x01
    expect(result.bytecode[1]).toBe(0x40); // JMP
    expect(result.bytecode[2]).toBe(0x00); // addrLo = 0
    expect(result.bytecode[3]).toBe(0x00); // addrHi = 0
  });

  it('assembles DB directive', () => {
    const result = assemble('NOP\nDB 0x0A, 0x05, 0xFF');
    expect(result.bytecode[1]).toBe(0x0A);
    expect(result.bytecode[2]).toBe(0x05);
    expect(result.bytecode[3]).toBe(0xFF);
  });

  it('assembles PUSH and POP', () => {
    const result = assemble('PUSH R3\nPOP R4');
    expect(result.bytecode[0]).toBe(0x50);
    expect(result.bytecode[1]).toBe(3);
    expect(result.bytecode[2]).toBe(0x51);
    expect(result.bytecode[3]).toBe(4);
  });

  it('assembles CALL and RET', () => {
    const result = assemble('CALL 0x0020\nRET');
    expect(result.bytecode[0]).toBe(0x52);
    expect(result.bytecode[1]).toBe(0x20);
    expect(result.bytecode[2]).toBe(0x00);
    expect(result.bytecode[3]).toBe(0x53);
  });

  it('sets metadata for code and data regions', () => {
    const result = assemble('MOV R0, 5\nHLT\nDB 0x0A');
    expect(result.metadata.codeStart).toBe(0);
    expect(result.metadata.codeEnd).toBeGreaterThan(0);
    expect(result.metadata.dataStart).toBeGreaterThan(result.metadata.codeEnd);
  });

  it('reports error for undefined label', () => {
    const result = assemble('JMP nowhere');
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].message).toContain('nowhere');
  });

  it('assembles the full bubble sort program without errors', () => {
    const src = `
      MOV R0, 0x40
      MOV R1, 0x00
      MOV R2, 9
    outer:
      MOV R3, R2
      MOV R4, 0x40
      MOV R5, 0x00
    inner:
      LOAD R6, [R4]
      INC R4
      LOAD R7, [R4]
      CMP R6, R7
      JL no_swap
      STORE [R4], R6
      DEC R4
      STORE [R4], R7
      INC R4
    no_swap:
      DEC R3
      JNZ inner
      DEC R2
      JNZ outer
      HLT
    data:
      DB 0x37, 0x0A, 0x73, 0x1F, 0x55, 0x02, 0x8B, 0x44, 0x19, 0x61
    `;
    const result = assemble(src);
    expect(result.errors).toHaveLength(0);
    expect(result.bytecode.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/assembler/parser.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

Create `src/assembler/parser.ts`:

```typescript
import { Token, AssemblerResult, AssemblerError, ProgramMetadata } from './types';
import { tokenize } from './lexer';
import {
  OP_NOP, OP_HLT, OP_MOV_IMM, OP_MOV_REG,
  OP_LOAD_ABS, OP_STORE_ABS, OP_LOAD_IND, OP_STORE_IND,
  OP_ADD, OP_SUB, OP_INC, OP_DEC, OP_CMP,
  OP_JMP, OP_JZ, OP_JNZ, OP_JG, OP_JL,
  OP_PUSH, OP_POP, OP_CALL, OP_RET,
  INSTRUCTION_SIZE,
} from '../vm/opcodes';

const REG_MAP: Record<string, number> = {
  R0: 0, R1: 1, R2: 2, R3: 3, R4: 4, R5: 5, R6: 6, R7: 7,
};

function parseNumber(value: string): number {
  if (value.startsWith('0x') || value.startsWith('0X')) {
    return parseInt(value, 16);
  }
  return parseInt(value, 10);
}

export function assemble(source: string): AssemblerResult {
  const tokens = tokenize(source);
  const errors: AssemblerError[] = [];
  const output: number[] = [];
  const labels: Record<string, number> = {};
  const labelRefs: Array<{ name: string; offset: number; line: number }> = [];

  let codeEnd = -1;
  let dataStart = -1;
  let dataEnd = -1;
  let inData = false;

  // Group tokens by line
  const lines: Token[][] = [];
  let currentLine: Token[] = [];
  for (const token of tokens) {
    if (token.type === 'NEWLINE') {
      if (currentLine.length > 0) lines.push(currentLine);
      currentLine = [];
    } else {
      currentLine.push(token);
    }
  }
  if (currentLine.length > 0) lines.push(currentLine);

  // Pass 1 & 2 combined: emit bytes, record labels, defer label resolution
  for (const line of lines) {
    let i = 0;

    // Handle label definition
    if (line[0]?.type === 'LABEL_DEF') {
      labels[line[0].value] = output.length;
      i = 1;
    }

    if (i >= line.length) continue;
    const first = line[i];

    // Handle DB directive
    if (first.type === 'DIRECTIVE' && first.value === 'DB') {
      if (!inData && codeEnd === -1) codeEnd = output.length > 0 ? output.length - 1 : 0;
      if (dataStart === -1) dataStart = output.length;
      inData = true;

      for (let j = i + 1; j < line.length; j++) {
        const t = line[j];
        if (t.type === 'COMMA') continue;
        if (t.type === 'NUMBER') {
          output.push(parseNumber(t.value) & 0xFF);
        } else if (t.type === 'STRING') {
          for (const ch of t.value) {
            output.push(ch.charCodeAt(0) & 0xFF);
          }
        }
      }
      dataEnd = output.length - 1;
      continue;
    }

    if (first.type !== 'INSTRUCTION') continue;
    inData = false;

    // Collect operand tokens (skip commas, brackets)
    const operands: Token[] = [];
    let hasBrackets = false;
    let bracketContent: Token | null = null;

    for (let j = i + 1; j < line.length; j++) {
      const t = line[j];
      if (t.type === 'COMMA') continue;
      if (t.type === 'LBRACKET') {
        hasBrackets = true;
        // Next non-bracket token is the bracket content
        j++;
        if (j < line.length && line[j].type !== 'RBRACKET') {
          bracketContent = line[j];
          j++; // skip past the bracket content to RBRACKET
        }
        continue;
      }
      if (t.type === 'RBRACKET') continue;
      operands.push(t);
    }

    const instr = first.value;
    const lineNum = first.line;

    switch (instr) {
      case 'NOP':
        output.push(OP_NOP);
        break;

      case 'HLT':
        output.push(OP_HLT);
        break;

      case 'RET':
        output.push(OP_RET);
        break;

      case 'MOV': {
        const dest = operands[0];
        const src = hasBrackets ? bracketContent! : operands[1];
        if (src?.type === 'REGISTER') {
          output.push(OP_MOV_REG, REG_MAP[dest.value], REG_MAP[src.value]);
        } else if (src?.type === 'NUMBER') {
          output.push(OP_MOV_IMM, REG_MAP[dest.value], parseNumber(src.value) & 0xFF);
        } else {
          errors.push({ message: `Invalid operand for MOV`, line: lineNum });
        }
        break;
      }

      case 'LOAD': {
        const dest = operands[0];
        if (bracketContent?.type === 'REGISTER') {
          output.push(OP_LOAD_IND, REG_MAP[dest.value], REG_MAP[bracketContent.value]);
        } else if (bracketContent?.type === 'NUMBER') {
          const addr = parseNumber(bracketContent.value);
          output.push(OP_LOAD_ABS, REG_MAP[dest.value], addr & 0xFF, (addr >> 8) & 0xFF);
        } else if (bracketContent?.type === 'LABEL_REF') {
          const offset = output.length;
          output.push(OP_LOAD_ABS, REG_MAP[dest.value], 0, 0);
          labelRefs.push({ name: bracketContent.value, offset: offset + 2, line: lineNum });
        } else {
          errors.push({ message: `Invalid operand for LOAD`, line: lineNum });
        }
        break;
      }

      case 'STORE': {
        // STORE [addr/Rx], Ry — the first operand is in brackets, second is a register
        const src = operands[0]; // register after the brackets
        if (bracketContent?.type === 'REGISTER') {
          output.push(OP_STORE_IND, REG_MAP[bracketContent.value], REG_MAP[src.value]);
        } else if (bracketContent?.type === 'NUMBER') {
          const addr = parseNumber(bracketContent.value);
          output.push(OP_STORE_ABS, REG_MAP[src.value], addr & 0xFF, (addr >> 8) & 0xFF);
        } else {
          errors.push({ message: `Invalid operand for STORE`, line: lineNum });
        }
        break;
      }

      case 'ADD':
        output.push(OP_ADD, REG_MAP[operands[0].value], REG_MAP[operands[1].value]);
        break;

      case 'SUB':
        output.push(OP_SUB, REG_MAP[operands[0].value], REG_MAP[operands[1].value]);
        break;

      case 'INC':
        output.push(OP_INC, REG_MAP[operands[0].value]);
        break;

      case 'DEC':
        output.push(OP_DEC, REG_MAP[operands[0].value]);
        break;

      case 'CMP':
        output.push(OP_CMP, REG_MAP[operands[0].value], REG_MAP[operands[1].value]);
        break;

      case 'JMP':
      case 'JZ':
      case 'JNZ':
      case 'JG':
      case 'JL': {
        const opcodeMap: Record<string, number> = {
          JMP: OP_JMP, JZ: OP_JZ, JNZ: OP_JNZ, JG: OP_JG, JL: OP_JL,
        };
        const target = operands[0];
        const offset = output.length;
        output.push(opcodeMap[instr]);
        if (target?.type === 'NUMBER') {
          const addr = parseNumber(target.value);
          output.push(addr & 0xFF, (addr >> 8) & 0xFF);
        } else if (target?.type === 'LABEL_REF') {
          output.push(0, 0); // placeholder
          labelRefs.push({ name: target.value, offset: offset + 1, line: lineNum });
        } else {
          errors.push({ message: `Invalid target for ${instr}`, line: lineNum });
          output.push(0, 0);
        }
        break;
      }

      case 'PUSH':
        output.push(OP_PUSH, REG_MAP[operands[0].value]);
        break;

      case 'POP':
        output.push(OP_POP, REG_MAP[operands[0].value]);
        break;

      case 'CALL': {
        const target = operands[0];
        const offset = output.length;
        output.push(OP_CALL);
        if (target?.type === 'NUMBER') {
          const addr = parseNumber(target.value);
          output.push(addr & 0xFF, (addr >> 8) & 0xFF);
        } else if (target?.type === 'LABEL_REF') {
          output.push(0, 0);
          labelRefs.push({ name: target.value, offset: offset + 1, line: lineNum });
        } else {
          errors.push({ message: `Invalid target for CALL`, line: lineNum });
          output.push(0, 0);
        }
        break;
      }

      default:
        errors.push({ message: `Unknown instruction: ${instr}`, line: lineNum });
    }
  }

  // Resolve label references
  for (const ref of labelRefs) {
    const addr = labels[ref.name];
    if (addr === undefined) {
      errors.push({ message: `Undefined label: ${ref.name}`, line: ref.line });
    } else {
      output[ref.offset] = addr & 0xFF;
      output[ref.offset + 1] = (addr >> 8) & 0xFF;
    }
  }

  // Compute metadata
  if (codeEnd === -1) codeEnd = dataStart === -1 ? output.length - 1 : dataStart - 1;
  if (dataStart === -1) dataStart = output.length;
  if (dataEnd === -1) dataEnd = dataStart;

  const metadata: ProgramMetadata = {
    codeStart: 0,
    codeEnd: Math.max(0, codeEnd),
    dataStart,
    dataEnd: Math.max(dataStart, dataEnd),
  };

  return {
    bytecode: new Uint8Array(output),
    metadata,
    errors,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/assembler/parser.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/assembler/parser.ts tests/assembler/parser.test.ts
git commit -m "feat: implement two-pass assembler with label resolution and DB directives"
```

---

## Task 8: Example Programs

**Files:**
- Create: `src/examples/bubble-sort.ts`, `src/examples/counter.ts`, `src/examples/fibonacci.ts`

- [ ] **Step 1: Create example program source strings**

Create `src/examples/bubble-sort.ts`:

```typescript
export const BUBBLE_SORT_NAME = 'Bubble Sort';
export const BUBBLE_SORT_DESCRIPTION = 'Sorts 10 bytes in memory using bubble sort. Watch the data region reorganize in real-time.';
export const BUBBLE_SORT_SOURCE = `; Bubble Sort — sorts 10 bytes starting at address 0x40
; R0:R1 = base pointer, R2 = outer counter, R3 = inner counter
; R4:R5 = current pointer, R6/R7 = comparison values

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

  ; swap
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

; Padding to align data to address 0x40 (code ends at ~0x35, need 11 NOPs)
  NOP
  NOP
  NOP
  NOP
  NOP
  NOP
  NOP
  NOP
  NOP
  NOP
  NOP

; Data: 10 random bytes to sort at address 0x40
data:
  DB 0x37, 0x0A, 0x73, 0x1F, 0x55, 0x02, 0x8B, 0x44, 0x19, 0x61
`;
```

Create `src/examples/counter.ts`:

```typescript
export const COUNTER_NAME = 'Counter';
export const COUNTER_DESCRIPTION = 'Counts from 0 to 255, storing each value in memory. Good for testing step and rewind.';
export const COUNTER_SOURCE = `; Counter — counts from 0 to 15, storing each value at 0x40+
; Starting at address 0x40

  MOV R0, 0         ; counter value
  MOV R2, 0x40      ; write pointer (low byte)
  MOV R3, 0x00      ; write pointer (high byte)
  MOV R6, 16        ; loop limit

loop:
  STORE [R2], R0    ; store counter value at pointer
  INC R0            ; increment counter
  INC R2            ; advance pointer
  DEC R6            ; decrement remaining count
  JNZ loop          ; loop if count > 0
  HLT
`;
```

Create `src/examples/fibonacci.ts`:

```typescript
export const FIBONACCI_NAME = 'Fibonacci';
export const FIBONACCI_DESCRIPTION = 'Computes Fibonacci numbers iteratively, storing the sequence in memory.';
export const FIBONACCI_SOURCE = `; Fibonacci — computes fib sequence, stores results starting at 0x40
; R0 = prev, R1 = curr, R2 = temp, R4:R5 = write pointer

  MOV R0, 0         ; fib(0) = 0
  MOV R1, 1         ; fib(1) = 1
  MOV R4, 0x40      ; write pointer (low byte)
  MOV R5, 0x00      ; write pointer (high byte)
  MOV R6, 13        ; compute 13 fibonacci numbers

  ; Store first two values
  STORE [R4], R0
  INC R4
  STORE [R4], R1
  INC R4

loop:
  MOV R2, R1        ; temp = curr
  ADD R1, R0        ; curr = curr + prev
  MOV R0, R2        ; prev = temp
  STORE [R4], R1    ; store current fib number
  INC R4
  DEC R6
  JNZ loop
  HLT
`;
```

- [ ] **Step 2: Commit**

```bash
git add src/examples/
git commit -m "feat: add example programs (bubble sort, counter, fibonacci)"
```

---

## Task 9: HTML Shell and CSS Layout

**Files:**
- Create: `index.html`, `style.css`

- [ ] **Step 1: Create the HTML shell**

Write `index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Browser VM</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div id="app">
    <header>
      <h1>Browser VM</h1>
      <div id="memory-config">
        <label>Memory:
          <select id="memory-size">
            <option value="256">256 B</option>
            <option value="1024">1 KB</option>
            <option value="4096" selected>4 KB</option>
            <option value="16384">16 KB</option>
            <option value="65536">64 KB</option>
          </select>
        </label>
      </div>
    </header>

    <main>
      <div id="grid-container">
        <canvas id="hex-grid"></canvas>
      </div>

      <aside id="detail-panel">
        <section id="registers-section">
          <h3>Registers</h3>
          <div id="registers"></div>
        </section>

        <section id="instruction-section">
          <h3>Current Instruction</h3>
          <div id="current-instruction">—</div>
        </section>

        <section id="stack-section">
          <h3>Stack</h3>
          <div id="stack-view"></div>
        </section>

        <section id="controls-section">
          <div id="transport">
            <button id="btn-step-back" title="Step Back">&#9664;</button>
            <button id="btn-step" title="Step">Step</button>
            <button id="btn-run" title="Run/Pause">Run</button>
            <button id="btn-reset" title="Reset">Reset</button>
          </div>
          <div id="speed-control">
            <label>Speed: <input type="range" id="speed-slider" min="0" max="100" value="50"></label>
            <span id="speed-display">100/s</span>
          </div>
          <div id="cycle-display">Cycle: <span id="cycle-count">0</span></div>
        </section>

        <section id="error-section" hidden>
          <div id="error-message"></div>
        </section>
      </aside>
    </main>

    <footer>
      <div id="editor-container">
        <div id="editor-header">
          <label>Examples:
            <select id="examples-dropdown">
              <option value="">— Select —</option>
              <option value="bubble-sort">Bubble Sort</option>
              <option value="counter">Counter</option>
              <option value="fibonacci">Fibonacci</option>
            </select>
          </label>
          <button id="btn-assemble">Assemble &amp; Load</button>
        </div>
        <textarea id="code-editor" spellcheck="false" placeholder="Write assembly here..."></textarea>
        <div id="assembler-errors"></div>
      </div>
    </footer>
  </div>

  <script type="module" src="/src/ui/app.ts"></script>
</body>
</html>
```

- [ ] **Step 2: Create the CSS layout**

Write `style.css`:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

:root {
  --bg: #0d1117;
  --panel-bg: #161b22;
  --border: #30363d;
  --text: #c9d1d9;
  --text-dim: #8b949e;
  --accent: #58a6ff;
  --green: #3fb950;
  --red: #f85149;
  --orange: #d29922;
  --blue: #58a6ff;
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 13px;
  height: 100vh;
  overflow: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--panel-bg);
}

header h1 {
  font-size: 16px;
  font-weight: 600;
}

main {
  display: flex;
  flex: 1;
  min-height: 0;
}

#grid-container {
  flex: 1;
  padding: 8px;
  overflow: hidden;
  position: relative;
}

#hex-grid {
  width: 100%;
  height: 100%;
  display: block;
}

#detail-panel {
  width: 280px;
  border-left: 1px solid var(--border);
  background: var(--panel-bg);
  overflow-y: auto;
  flex-shrink: 0;
}

#detail-panel section {
  padding: 12px;
  border-bottom: 1px solid var(--border);
}

#detail-panel h3 {
  font-size: 11px;
  text-transform: uppercase;
  color: var(--text-dim);
  margin-bottom: 8px;
  letter-spacing: 0.5px;
}

#registers {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  font-size: 12px;
}

.reg-entry {
  display: flex;
  justify-content: space-between;
}

.reg-name { color: var(--text-dim); }
.reg-value { color: var(--accent); }

#current-instruction {
  font-size: 14px;
  color: var(--green);
  padding: 4px 0;
}

#stack-view {
  font-size: 12px;
  max-height: 120px;
  overflow-y: auto;
}

.stack-entry {
  display: flex;
  justify-content: space-between;
  padding: 1px 0;
}

.stack-addr { color: var(--text-dim); }
.stack-val { color: var(--orange); }

#transport {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

#transport button {
  flex: 1;
  padding: 6px 0;
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
}

#transport button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

#speed-control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
  font-size: 11px;
  color: var(--text-dim);
}

#speed-slider {
  flex: 1;
  accent-color: var(--accent);
}

#cycle-display {
  font-size: 11px;
  color: var(--text-dim);
}

#error-section {
  background: #2d1b1b;
}

#error-message {
  color: var(--red);
  font-size: 12px;
}

footer {
  border-top: 1px solid var(--border);
  background: var(--panel-bg);
  height: 200px;
  flex-shrink: 0;
}

#editor-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

#editor-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border);
}

#editor-header button {
  padding: 4px 12px;
  background: var(--accent);
  color: #0d1117;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
}

#editor-header select,
#memory-config select {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
  padding: 4px 8px;
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
}

#editor-header label,
#memory-config label {
  font-size: 12px;
  color: var(--text-dim);
}

#code-editor {
  flex: 1;
  padding: 8px 12px;
  background: var(--bg);
  color: var(--text);
  border: none;
  resize: none;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  tab-size: 2;
  outline: none;
}

#assembler-errors {
  padding: 4px 12px;
  color: var(--red);
  font-size: 11px;
  min-height: 20px;
}
```

- [ ] **Step 3: Commit**

```bash
git add index.html style.css
git commit -m "feat: add HTML shell and CSS layout for VM interface"
```

---

## Task 10: Canvas Hex Grid Renderer

**Files:**
- Create: `src/renderer/colors.ts`, `src/renderer/hex-grid.ts`

- [ ] **Step 1: Create color scheme constants**

Create `src/renderer/colors.ts`:

```typescript
import { ProgramMetadata } from '../assembler/types';

export const COLORS = {
  code:     { bg: '#1a2e1a', text: '#7fff7f', label: 'Code' },
  data:     { bg: '#1a1a2e', text: '#7f7fff', label: 'Data' },
  stack:    { bg: '#2e2a1a', text: '#ffcf7f', label: 'Stack' },
  free:     { bg: '#12151a', text: '#4a5568', label: 'Free' },
  pcHighlight:    '#4ade80',
  changedFlash:   '#ffffff',
  cellBorder:     '#1e2530',
};

export type CellRegion = 'code' | 'data' | 'stack' | 'free';

export function getCellRegion(
  address: number,
  metadata: ProgramMetadata | null,
  sp: number,
  memorySize: number,
): CellRegion {
  if (metadata) {
    if (address >= metadata.codeStart && address <= metadata.codeEnd) return 'code';
    if (address >= metadata.dataStart && address <= metadata.dataEnd) return 'data';
  }
  if (address > sp && address < memorySize) return 'stack';
  return 'free';
}
```

- [ ] **Step 2: Implement the hex grid renderer**

Create `src/renderer/hex-grid.ts`:

```typescript
import { VMState } from '../vm/types';
import { ProgramMetadata } from '../assembler/types';
import { COLORS, getCellRegion } from './colors';

export interface GridConfig {
  cellWidth: number;
  cellHeight: number;
  cols: number;
  fontSize: number;
  padding: number;
}

const DEFAULT_CONFIG: GridConfig = {
  cellWidth: 32,
  cellHeight: 20,
  cols: 16,
  fontSize: 10,
  padding: 8,
};

export class HexGridRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: GridConfig;
  private changedCells: Set<number> = new Set();
  private flashTimer = 0;
  private metadata: ProgramMetadata | null = null;
  private prevMemory: Uint8Array | null = null;

  constructor(canvas: HTMLCanvasElement, config: Partial<GridConfig> = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  setMetadata(metadata: ProgramMetadata): void {
    this.metadata = metadata;
  }

  render(state: VMState): void {
    const { canvas, ctx, config } = this;
    const dpr = window.devicePixelRatio || 1;

    // Resize canvas to container
    const rect = canvas.parentElement!.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, rect.width, rect.height);

    // Detect changed cells
    if (this.prevMemory) {
      this.changedCells.clear();
      for (let i = 0; i < state.memory.length; i++) {
        if (state.memory[i] !== this.prevMemory[i]) {
          this.changedCells.add(i);
        }
      }
    }
    this.prevMemory = new Uint8Array(state.memory);

    const { cellWidth, cellHeight, cols, fontSize, padding } = config;
    const totalCells = state.memory.length;
    const rows = Math.ceil(totalCells / cols);

    // Calculate visible rows based on canvas height
    const headerHeight = 20;
    const visibleRows = Math.ceil((rect.height - headerHeight) / cellHeight);

    // Address label width
    const addrWidth = 50;

    ctx.font = `${fontSize}px 'SF Mono', 'Fira Code', monospace`;

    // Draw column headers
    ctx.fillStyle = '#4a5568';
    for (let c = 0; c < cols; c++) {
      const x = addrWidth + padding + c * cellWidth;
      ctx.fillText(c.toString(16).toUpperCase().padStart(2, '0'), x + 6, 14);
    }

    // Draw cells
    for (let row = 0; row < Math.min(rows, visibleRows); row++) {
      const y = headerHeight + row * cellHeight;

      // Row address label
      const rowAddr = row * cols;
      ctx.fillStyle = '#4a5568';
      ctx.fillText(
        '0x' + rowAddr.toString(16).toUpperCase().padStart(4, '0'),
        4, y + cellHeight - 5
      );

      for (let col = 0; col < cols; col++) {
        const addr = row * cols + col;
        if (addr >= totalCells) break;

        const x = addrWidth + padding + col * cellWidth;
        const value = state.memory[addr];
        const region = getCellRegion(addr, this.metadata, state.registers.SP, state.memory.length);
        const color = COLORS[region];

        // Cell background
        ctx.fillStyle = color.bg;
        if (this.changedCells.has(addr)) {
          ctx.fillStyle = '#2a2a3a'; // flash highlight
        }
        ctx.fillRect(x, y, cellWidth - 1, cellHeight - 1);

        // PC highlight border
        if (addr === state.registers.PC) {
          ctx.strokeStyle = COLORS.pcHighlight;
          ctx.lineWidth = 2;
          ctx.strokeRect(x, y, cellWidth - 1, cellHeight - 1);
        }

        // Cell value text
        ctx.fillStyle = color.text;
        if (this.changedCells.has(addr)) {
          ctx.fillStyle = COLORS.changedFlash;
        }
        ctx.fillText(
          value.toString(16).toUpperCase().padStart(2, '0'),
          x + 6, y + cellHeight - 5
        );
      }
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/colors.ts src/renderer/hex-grid.ts
git commit -m "feat: implement Canvas hex grid renderer with color-coded regions and PC highlight"
```

---

## Task 11: Detail Panel Renderer

**Files:**
- Create: `src/renderer/detail-panel.ts`

- [ ] **Step 1: Implement detail panel updater**

Create `src/renderer/detail-panel.ts`:

```typescript
import { VMState, REG_NAMES, FLAG_Z, FLAG_C, FLAG_N, FLAG_V } from '../vm/types';
import { OPCODE_NAMES, INSTRUCTION_SIZE } from '../vm/opcodes';

export function updateRegisters(container: HTMLElement, state: VMState): void {
  const regs = state.registers;
  const entries = [
    { name: 'PC', value: regs.PC, format: '04' },
    { name: 'SP', value: regs.SP, format: '04' },
    ...REG_NAMES.map(name => ({
      name,
      value: regs[name],
      format: '02' as const,
    })),
  ];

  container.innerHTML = entries.map(({ name, value, format }) => {
    const hex = value.toString(16).toUpperCase().padStart(format === '04' ? 4 : 2, '0');
    return `<div class="reg-entry"><span class="reg-name">${name}</span><span class="reg-value">0x${hex}</span></div>`;
  }).join('');

  // Flags
  const f = regs.FLAGS;
  const flagStr = [
    f & FLAG_Z ? 'Z' : '-',
    f & FLAG_C ? 'C' : '-',
    f & FLAG_N ? 'N' : '-',
    f & FLAG_V ? 'V' : '-',
  ].join('');
  container.innerHTML += `<div class="reg-entry"><span class="reg-name">FLAGS</span><span class="reg-value">${flagStr}</span></div>`;
}

export function updateCurrentInstruction(container: HTMLElement, state: VMState): void {
  if (state.halted) {
    container.textContent = state.error || 'HALTED';
    container.style.color = state.error ? '#f85149' : '#8b949e';
    return;
  }

  const pc = state.registers.PC;
  const opcode = state.memory[pc];
  const name = OPCODE_NAMES[opcode];
  const size = INSTRUCTION_SIZE[opcode];

  if (!name) {
    container.textContent = `??? (0x${opcode.toString(16).padStart(2, '0')})`;
    container.style.color = '#f85149';
    return;
  }

  const bytes = Array.from(state.memory.slice(pc, pc + (size || 1)))
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');

  container.textContent = `${name}  [${bytes}]`;
  container.style.color = '#3fb950';
}

export function updateStackView(container: HTMLElement, state: VMState, maxEntries = 8): void {
  const { SP } = state.registers;
  const memSize = state.memory.length;
  const entries: string[] = [];

  for (let addr = SP + 1; addr < memSize && entries.length < maxEntries; addr++) {
    const hexAddr = addr.toString(16).toUpperCase().padStart(4, '0');
    const hexVal = state.memory[addr].toString(16).toUpperCase().padStart(2, '0');
    entries.push(
      `<div class="stack-entry"><span class="stack-addr">0x${hexAddr}</span><span class="stack-val">0x${hexVal}</span></div>`
    );
  }

  container.innerHTML = entries.length > 0 ? entries.join('') : '<span style="color:#4a5568">Empty</span>';
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/detail-panel.ts
git commit -m "feat: implement detail panel for registers, instruction, and stack display"
```

---

## Task 12: UI Controls Wiring

**Files:**
- Create: `src/ui/controls.ts`, `src/ui/editor.ts`

- [ ] **Step 1: Implement controls module**

Create `src/ui/controls.ts`:

```typescript
import { VMState } from '../vm/types';
import { step } from '../vm/vm';
import { TimeTravel } from '../vm/time-travel';

export interface VMController {
  getState(): VMState;
  setState(state: VMState): void;
  step(): void;
  stepBack(): void;
  run(): void;
  pause(): void;
  reset(): void;
  isRunning(): boolean;
  onStateChange(callback: (state: VMState) => void): void;
  setSpeed(instructionsPerSecond: number): void;
}

export function createController(
  initialState: VMState,
  timeTravel: TimeTravel,
): VMController {
  let state = initialState;
  let running = false;
  let animFrameId: number | null = null;
  let speed = 100; // instructions per second
  let lastStepTime = 0;
  const listeners: Array<(state: VMState) => void> = [];

  function notify() {
    for (const cb of listeners) cb(state);
  }

  function doStep() {
    if (state.halted) return;
    timeTravel.record(state);
    state = step(state);
    notify();
  }

  function runLoop(timestamp: number) {
    if (!running) return;

    const interval = 1000 / speed;
    const elapsed = timestamp - lastStepTime;
    const stepsThisFrame = Math.min(Math.floor(elapsed / interval), 100);

    for (let i = 0; i < stepsThisFrame; i++) {
      if (state.halted) {
        running = false;
        notify();
        return;
      }
      doStep();
    }

    if (stepsThisFrame > 0) lastStepTime = timestamp;
    animFrameId = requestAnimationFrame(runLoop);
  }

  return {
    getState: () => state,
    setState: (s) => { state = s; notify(); },

    step: () => doStep(),

    stepBack: () => {
      const prev = timeTravel.stepBack();
      if (prev) {
        state = prev;
        notify();
      }
    },

    run: () => {
      if (running || state.halted) return;
      running = true;
      lastStepTime = performance.now();
      animFrameId = requestAnimationFrame(runLoop);
      notify();
    },

    pause: () => {
      running = false;
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      notify();
    },

    reset: () => {
      running = false;
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
      timeTravel.reset();
      // Will be set by the caller via setState with a fresh VM
    },

    isRunning: () => running,

    onStateChange: (cb) => { listeners.push(cb); },

    setSpeed: (ips) => { speed = Math.max(1, ips); },
  };
}
```

- [ ] **Step 2: Implement editor module**

Create `src/ui/editor.ts`:

```typescript
import { assemble } from '../assembler/parser';
import { AssemblerResult } from '../assembler/types';
import { BUBBLE_SORT_SOURCE } from '../examples/bubble-sort';
import { COUNTER_SOURCE } from '../examples/counter';
import { FIBONACCI_SOURCE } from '../examples/fibonacci';

const EXAMPLES: Record<string, string> = {
  'bubble-sort': BUBBLE_SORT_SOURCE,
  'counter': COUNTER_SOURCE,
  'fibonacci': FIBONACCI_SOURCE,
};

export function setupEditor(
  editorEl: HTMLTextAreaElement,
  dropdownEl: HTMLSelectElement,
  assembleBtn: HTMLButtonElement,
  errorsEl: HTMLElement,
  onAssemble: (result: AssemblerResult) => void,
): void {
  // Example dropdown
  dropdownEl.addEventListener('change', () => {
    const key = dropdownEl.value;
    if (key && EXAMPLES[key]) {
      editorEl.value = EXAMPLES[key];
      dropdownEl.value = '';
    }
  });

  // Assemble button
  assembleBtn.addEventListener('click', () => {
    const source = editorEl.value;
    const result = assemble(source);

    if (result.errors.length > 0) {
      errorsEl.textContent = result.errors
        .map(e => `Line ${e.line}: ${e.message}`)
        .join('\n');
      return;
    }

    errorsEl.textContent = '';
    onAssemble(result);
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add src/ui/controls.ts src/ui/editor.ts
git commit -m "feat: implement VM controller with run loop and editor wiring"
```

---

## Task 13: Main App Entry Point — Wire Everything Together

**Files:**
- Create: `src/ui/app.ts`

- [ ] **Step 1: Implement the main app module**

Create `src/ui/app.ts`:

```typescript
import { createVM } from '../vm/vm';
import { TimeTravel } from '../vm/time-travel';
import { HexGridRenderer } from '../renderer/hex-grid';
import { updateRegisters, updateCurrentInstruction, updateStackView } from '../renderer/detail-panel';
import { createController } from './controls';
import { setupEditor } from './editor';
import { AssemblerResult } from '../assembler/types';
import { BUBBLE_SORT_SOURCE } from '../examples/bubble-sort';

function init() {
  // DOM elements
  const canvas = document.getElementById('hex-grid') as HTMLCanvasElement;
  const registersEl = document.getElementById('registers')!;
  const instrEl = document.getElementById('current-instruction')!;
  const stackEl = document.getElementById('stack-view')!;
  const cycleEl = document.getElementById('cycle-count')!;
  const errorSection = document.getElementById('error-section')!;
  const errorMsg = document.getElementById('error-message')!;
  const memorySizeEl = document.getElementById('memory-size') as HTMLSelectElement;
  const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
  const speedDisplay = document.getElementById('speed-display')!;

  // Buttons
  const btnStep = document.getElementById('btn-step') as HTMLButtonElement;
  const btnStepBack = document.getElementById('btn-step-back') as HTMLButtonElement;
  const btnRun = document.getElementById('btn-run') as HTMLButtonElement;
  const btnReset = document.getElementById('btn-reset') as HTMLButtonElement;

  // Editor
  const editorEl = document.getElementById('code-editor') as HTMLTextAreaElement;
  const dropdownEl = document.getElementById('examples-dropdown') as HTMLSelectElement;
  const assembleBtn = document.getElementById('btn-assemble') as HTMLButtonElement;
  const errorsEl = document.getElementById('assembler-errors')!;

  // State
  let memorySize = parseInt(memorySizeEl.value);
  let vm = createVM(memorySize);
  const timeTravel = new TimeTravel();
  const grid = new HexGridRenderer(canvas);
  const controller = createController(vm, timeTravel);

  // Render callback
  function render(state: typeof vm) {
    grid.render(state);
    updateRegisters(registersEl, state);
    updateCurrentInstruction(instrEl, state);
    updateStackView(stackEl, state);
    cycleEl.textContent = state.cycle.toString();
    btnRun.textContent = controller.isRunning() ? 'Pause' : 'Run';

    // Error display
    if (state.error) {
      errorSection.hidden = false;
      errorMsg.textContent = state.error;
    } else {
      errorSection.hidden = true;
    }
  }

  controller.onStateChange(render);

  // Button handlers
  btnStep.addEventListener('click', () => controller.step());
  btnStepBack.addEventListener('click', () => controller.stepBack());
  btnRun.addEventListener('click', () => {
    if (controller.isRunning()) {
      controller.pause();
    } else {
      controller.run();
    }
  });
  btnReset.addEventListener('click', () => {
    controller.reset();
    vm = createVM(memorySize);
    controller.setState(vm);
  });

  // Speed slider
  speedSlider.addEventListener('input', () => {
    const val = parseInt(speedSlider.value);
    // Map 0-100 to 1-10000
    const speed = Math.round(Math.pow(10, val / 25));
    controller.setSpeed(speed);
    speedDisplay.textContent = `${speed}/s`;
  });

  // Memory size change
  memorySizeEl.addEventListener('change', () => {
    controller.pause();
    controller.reset();
    memorySize = parseInt(memorySizeEl.value);
    vm = createVM(memorySize);
    timeTravel.reset();
    controller.setState(vm);
  });

  // Editor setup
  setupEditor(editorEl, dropdownEl, assembleBtn, errorsEl, (result: AssemblerResult) => {
    controller.pause();
    controller.reset();
    vm = createVM(memorySize);
    timeTravel.reset();

    // Load bytecode into memory
    for (let i = 0; i < result.bytecode.length && i < vm.memory.length; i++) {
      vm.memory[i] = result.bytecode[i];
    }

    grid.setMetadata(result.metadata);
    controller.setState(vm);
  });

  // Load default example
  editorEl.value = BUBBLE_SORT_SOURCE;

  // Initial render
  render(vm);

  // Handle canvas resize
  window.addEventListener('resize', () => render(controller.getState()));
}

// Start
init();
```

- [ ] **Step 2: Verify the app builds and runs**

```bash
npm run dev
```

Expected: Opens in browser, shows the hex grid, detail panel, and editor. The bubble sort example is loaded in the editor. Clicking "Assemble & Load" loads the program, then Step/Run executes it.

- [ ] **Step 3: Commit**

```bash
git add src/ui/app.ts
git commit -m "feat: wire up main app entry point connecting VM, renderer, and UI"
```

---

## Task 14: Integration Test — Bubble Sort End-to-End

**Files:**
- Create: `tests/integration/bubble-sort.test.ts`

- [ ] **Step 1: Write the integration test**

Create `tests/integration/bubble-sort.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createVM, step } from '../../src/vm/vm';
import { assemble } from '../../src/assembler/parser';
import { BUBBLE_SORT_SOURCE } from '../../src/examples/bubble-sort';

describe('Bubble Sort end-to-end', () => {
  it('assembles and sorts the data correctly', () => {
    const result = assemble(BUBBLE_SORT_SOURCE);
    expect(result.errors).toHaveLength(0);

    let state = createVM(256);
    // Load bytecode
    for (let i = 0; i < result.bytecode.length; i++) {
      state.memory[i] = result.bytecode[i];
    }

    // Run until halted (max 10000 steps to prevent infinite loop)
    let steps = 0;
    while (!state.halted && steps < 10000) {
      state = step(state);
      steps++;
    }

    expect(state.halted).toBe(true);
    expect(state.error).toBeUndefined();

    // Check that data at 0x40..0x49 is sorted ascending
    const sorted = Array.from(state.memory.slice(0x40, 0x4A));
    const expected = [...sorted].sort((a, b) => a - b);
    expect(sorted).toEqual(expected);
  });
});
```

- [ ] **Step 2: Run the integration test**

```bash
npx vitest run tests/integration/bubble-sort.test.ts
```

Expected: PASS — the bubble sort program assembles, runs, and produces sorted output.

- [ ] **Step 3: Run all tests**

```bash
npm run test
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/bubble-sort.test.ts
git commit -m "test: add end-to-end integration test for bubble sort demo"
```

---

## Task 15: Final Polish and Build Verification

**Files:**
- Verify all existing files

- [ ] **Step 1: Run the full build**

```bash
npm run build
```

Expected: Clean build, no errors.

- [ ] **Step 2: Run all tests**

```bash
npm run test
```

Expected: All tests PASS.

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Open in browser. Verify:
1. Hex grid renders with dim gray cells
2. Load bubble sort example, click Assemble & Load
3. Grid shows green (code) and blue (data) regions
4. Click Step — PC advances, instruction decodes in panel
5. Click Run — sorting animates, data region rearranges
6. Click Step Back — rewinds one step
7. Click Reset — returns to initial state
8. Try Counter and Fibonacci examples

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Browser VM v1 complete — VM, assembler, renderer, time-travel, sorting demo"
```
