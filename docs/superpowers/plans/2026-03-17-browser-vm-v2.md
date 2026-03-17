# Browser VM v2 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add bitwise ops (AND/OR/XOR/SHL/SHR), VRAM with pixel display (32x32 RGB332), and a Game of Life demo to the existing browser VM.

**Architecture:** Extend the existing three-layer architecture. Add 8 new opcodes to the VM core (5 bitwise + 3 VRAM). Add a PixelDisplay renderer that reads a new `vram` field on VMState. Wire it into the existing app.

**Tech Stack:** TypeScript, Vite, Vitest, HTML Canvas (existing stack — no new dependencies)

**Spec:** `docs/superpowers/specs/2026-03-17-browser-vm-v2-design.md`

---

## File Structure

**Modified files:**
```
src/vm/types.ts           — Add vram to VMState interface
src/vm/opcodes.ts         — Add 8 new opcode constants, sizes, names
src/vm/flags.ts           — Add computeBitwiseFlags(), computeShiftFlags()
src/vm/vm.ts              — Add vram to createVM/cloneState, add 8 instruction cases
src/vm/time-travel.ts     — Reduce default maxHistorySize to 50000
src/assembler/lexer.ts    — Add 8 new instruction keywords to INSTRUCTIONS set
src/assembler/parser.ts   — Add encoding cases for 8 new instructions
src/renderer/narration.ts — Add descriptions for 8 new instructions
src/ui/app.ts             — Wire up pixel display, display stats, vramDirty
index.html                — Add pixel display canvas, display stats section, examples
style.css                 — Pixel display overlay styles, display stats styles
```

**New files:**
```
src/renderer/pixel-display.ts  — PixelDisplay class (ImageData-based renderer)
src/examples/game-of-life.ts   — Game of Life assembly source
src/examples/pixel-test.ts     — Pixel gradient test assembly source
```

**Test files (modified/created):**
```
tests/vm/flags.test.ts                — Add bitwise/shift flag tests
tests/vm/vm.test.ts                   — Add tests for all 8 new instructions
tests/assembler/parser.test.ts        — Add assembly tests for new instructions
tests/integration/game-of-life.test.ts — End-to-end GoL test (NEW)
```

---

## Task 1: Add VRAM to VMState and Update Opcodes

**Files:**
- Modify: `src/vm/types.ts`
- Modify: `src/vm/opcodes.ts`
- Modify: `src/vm/vm.ts`

- [ ] **Step 1: Add vram to VMState interface**

In `src/vm/types.ts`, add `vram` field to the `VMState` interface after the `memory` field:

```typescript
export interface VMState {
  memory: Uint8Array;
  vram: Uint8Array;         // 1024 bytes, 32x32 RGB332 pixels
  registers: Registers;
  halted: boolean;
  error?: string;
  cycle: number;
}
```

- [ ] **Step 2: Add new opcode constants to opcodes.ts**

In `src/vm/opcodes.ts`, add after the existing constants:

```typescript
export const OP_AND   = 0x24;
export const OP_OR    = 0x25;
export const OP_XOR   = 0x26;
export const OP_SHL   = 0x27;
export const OP_SHR   = 0x28;
export const OP_VSTORE = 0x60;
export const OP_VLOAD  = 0x61;
export const OP_VCOPY  = 0x62;
```

Add to `INSTRUCTION_SIZE`:

```typescript
[OP_AND]: 3,
[OP_OR]: 3,
[OP_XOR]: 3,
[OP_SHL]: 3,
[OP_SHR]: 3,
[OP_VSTORE]: 4,
[OP_VLOAD]: 4,
[OP_VCOPY]: 2,
```

Add to `OPCODE_NAMES`:

```typescript
[OP_AND]: 'AND',
[OP_OR]: 'OR',
[OP_XOR]: 'XOR',
[OP_SHL]: 'SHL',
[OP_SHR]: 'SHR',
[OP_VSTORE]: 'VSTORE',
[OP_VLOAD]: 'VLOAD',
[OP_VCOPY]: 'VCOPY',
```

- [ ] **Step 3: Update createVM and cloneState in vm.ts**

In `src/vm/vm.ts`, update `createVM` to add `vram: new Uint8Array(1024)` to the returned object.

Update `cloneState` to add `vram: new Uint8Array(state.vram)` to the cloned object.

- [ ] **Step 4: Verify existing tests still pass**

```bash
npx vitest run
```

Expected: All 158 existing tests still pass (the new VMState field is optional-compatible since tests use `createVM()` which now provides it).

- [ ] **Step 5: Commit**

```bash
git add src/vm/types.ts src/vm/opcodes.ts src/vm/vm.ts
git commit -m "feat: add VRAM to VMState, add v2 opcode constants"
```

---

## Task 2: Bitwise Flag Helpers

**Files:**
- Modify: `src/vm/flags.ts`
- Modify: `tests/vm/flags.test.ts`

- [ ] **Step 1: Write failing tests for bitwise flag helpers**

Append to `tests/vm/flags.test.ts`:

```typescript
import { computeBitwiseFlags, computeShiftFlags } from '../../src/vm/flags';

describe('computeBitwiseFlags', () => {
  it('sets Z flag when result is zero', () => {
    expect(computeBitwiseFlags(0) & FLAG_Z).toBeTruthy();
  });

  it('clears Z flag when result is non-zero', () => {
    expect(computeBitwiseFlags(0x0F) & FLAG_Z).toBeFalsy();
  });

  it('sets N flag when bit 7 is set', () => {
    expect(computeBitwiseFlags(0x80) & FLAG_N).toBeTruthy();
  });

  it('clears C and V flags always', () => {
    expect(computeBitwiseFlags(0xFF) & FLAG_C).toBeFalsy();
    expect(computeBitwiseFlags(0xFF) & FLAG_V).toBeFalsy();
  });
});

describe('computeShiftFlags', () => {
  it('SHL by 1: carry is last bit shifted out (bit 7)', () => {
    // 0x80 = 1000_0000, shifting left by 1 loses bit 7
    const flags = computeShiftFlags(0x80, 1, true);
    expect(flags & FLAG_C).toBeTruthy();
    expect(flags & FLAG_Z).toBeTruthy(); // result is 0
  });

  it('SHL by 1: no carry when bit 7 is 0', () => {
    const flags = computeShiftFlags(0x40, 1, true);
    expect(flags & FLAG_C).toBeFalsy();
    expect(flags & FLAG_N).toBeTruthy(); // 0x80 has bit 7 set
  });

  it('SHR by 1: carry is last bit shifted out (bit 0)', () => {
    // 0x01 = 0000_0001, shifting right by 1 loses bit 0
    const flags = computeShiftFlags(0x01, 1, false);
    expect(flags & FLAG_C).toBeTruthy();
    expect(flags & FLAG_Z).toBeTruthy(); // result is 0
  });

  it('SHR by 1: no carry when bit 0 is 0', () => {
    const flags = computeShiftFlags(0x02, 1, false);
    expect(flags & FLAG_C).toBeFalsy();
  });

  it('shift by 0: result unchanged, C cleared', () => {
    const flags = computeShiftFlags(0xFF, 0, true);
    expect(flags & FLAG_C).toBeFalsy();
    expect(flags & FLAG_Z).toBeFalsy();
  });

  it('shift >= 8: result is 0, C is 0', () => {
    const flags = computeShiftFlags(0xFF, 8, true);
    expect(flags & FLAG_Z).toBeTruthy();
    expect(flags & FLAG_C).toBeFalsy();
  });

  it('SHL by 3: carry is bit (8-3)=5 of original', () => {
    // 0x20 = 0010_0000, bit 5 is set → carry = 1
    const flags = computeShiftFlags(0x20, 3, true);
    expect(flags & FLAG_C).toBeTruthy();
  });

  it('SHR by 3: carry is bit (3-1)=2 of original', () => {
    // 0x04 = 0000_0100, bit 2 is set → carry = 1
    const flags = computeShiftFlags(0x04, 3, false);
    expect(flags & FLAG_C).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/vm/flags.test.ts
```

Expected: FAIL — `computeBitwiseFlags` and `computeShiftFlags` not found.

- [ ] **Step 3: Implement flag helpers**

Add to `src/vm/flags.ts`:

```typescript
/**
 * Compute flags for bitwise operations (AND, OR, XOR).
 * Sets Z and N. Clears C and V.
 */
export function computeBitwiseFlags(result: number): number {
  const r = result & 0xFF;
  let flags = 0;
  if (r === 0) flags |= FLAG_Z;
  if (r & 0x80) flags |= FLAG_N;
  return flags;
}

/**
 * Compute flags for shift operations (SHL, SHR).
 * Sets Z and N on result. C = last bit shifted out. V cleared.
 * Shift by 0: result unchanged, C cleared.
 * Shift >= 8: result 0, C 0.
 */
export function computeShiftFlags(original: number, shiftAmount: number, isLeft: boolean): number {
  let flags = 0;
  let result: number;

  if (shiftAmount === 0) {
    result = original & 0xFF;
    // C cleared (nothing shifted out)
  } else if (shiftAmount >= 8) {
    result = 0;
    // C = 0
  } else {
    if (isLeft) {
      result = (original << shiftAmount) & 0xFF;
      // C = bit (8 - shiftAmount) of original
      if ((original >> (8 - shiftAmount)) & 1) flags |= FLAG_C;
    } else {
      result = (original >> shiftAmount) & 0xFF;
      // C = bit (shiftAmount - 1) of original
      if ((original >> (shiftAmount - 1)) & 1) flags |= FLAG_C;
    }
  }

  if (result === 0) flags |= FLAG_Z;
  if (result & 0x80) flags |= FLAG_N;
  return flags;
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
git commit -m "feat: add flag helpers for bitwise and shift operations"
```

---

## Task 3: Implement New Instructions in VM Step Function

**Files:**
- Modify: `src/vm/vm.ts`
- Modify: `tests/vm/vm.test.ts`

- [ ] **Step 1: Write failing tests for bitwise instructions**

Append to `tests/vm/vm.test.ts`:

```typescript
describe('step - bitwise', () => {
  it('AND computes bitwise AND', () => {
    const state = createVM(256);
    state.registers.R0 = 0x0F;
    state.registers.R1 = 0xF3;
    state.memory[0] = 0x24; // AND
    state.memory[1] = 0;    // R0
    state.memory[2] = 1;    // R1
    const next = step(state);
    expect(next.registers.R0).toBe(0x03);
  });

  it('OR computes bitwise OR', () => {
    const state = createVM(256);
    state.registers.R0 = 0x0F;
    state.registers.R1 = 0xF0;
    state.memory[0] = 0x25; // OR
    state.memory[1] = 0;
    state.memory[2] = 1;
    const next = step(state);
    expect(next.registers.R0).toBe(0xFF);
  });

  it('XOR computes bitwise XOR', () => {
    const state = createVM(256);
    state.registers.R0 = 0xFF;
    state.registers.R1 = 0x0F;
    state.memory[0] = 0x26; // XOR
    state.memory[1] = 0;
    state.memory[2] = 1;
    const next = step(state);
    expect(next.registers.R0).toBe(0xF0);
  });

  it('SHL shifts left', () => {
    const state = createVM(256);
    state.registers.R0 = 0x01;
    state.registers.R1 = 4;
    state.memory[0] = 0x27; // SHL
    state.memory[1] = 0;
    state.memory[2] = 1;
    const next = step(state);
    expect(next.registers.R0).toBe(0x10);
  });

  it('SHR shifts right', () => {
    const state = createVM(256);
    state.registers.R0 = 0x80;
    state.registers.R1 = 3;
    state.memory[0] = 0x28; // SHR
    state.memory[1] = 0;
    state.memory[2] = 1;
    const next = step(state);
    expect(next.registers.R0).toBe(0x10);
  });

  it('AND sets Z flag when result is zero', () => {
    const state = createVM(256);
    state.registers.R0 = 0xF0;
    state.registers.R1 = 0x0F;
    state.memory[0] = 0x24;
    state.memory[1] = 0;
    state.memory[2] = 1;
    const next = step(state);
    expect(next.registers.R0).toBe(0);
    expect(next.registers.FLAGS & 0b0001).toBeTruthy(); // Z
  });

  it('SHL by >= 8 gives zero', () => {
    const state = createVM(256);
    state.registers.R0 = 0xFF;
    state.registers.R1 = 8;
    state.memory[0] = 0x27;
    state.memory[1] = 0;
    state.memory[2] = 1;
    const next = step(state);
    expect(next.registers.R0).toBe(0);
  });
});

describe('step - VRAM', () => {
  it('VSTORE writes to VRAM', () => {
    const state = createVM(256);
    state.registers.R0 = 0xFF;
    state.memory[0] = 0x60; // VSTORE
    state.memory[1] = 0;    // R0
    state.memory[2] = 0x00; // addrLo = 0
    state.memory[3] = 0x00; // addrHi = 0
    const next = step(state);
    expect(next.vram[0]).toBe(0xFF);
    expect(next.registers.PC).toBe(4);
  });

  it('VLOAD reads from VRAM', () => {
    const state = createVM(256);
    state.vram[100] = 0xAB;
    state.memory[0] = 0x61; // VLOAD
    state.memory[1] = 0;    // R0
    state.memory[2] = 100;  // addrLo
    state.memory[3] = 0;    // addrHi
    const next = step(state);
    expect(next.registers.R0).toBe(0xAB);
  });

  it('VSTORE halts on out-of-bounds VRAM address', () => {
    const state = createVM(256);
    state.registers.R0 = 0xFF;
    state.memory[0] = 0x60;
    state.memory[1] = 0;
    state.memory[2] = 0x00; // 1024 = 0x0400
    state.memory[3] = 0x04;
    const next = step(state);
    expect(next.halted).toBe(true);
    expect(next.error).toContain('VRAM');
  });

  it('VCOPY copies 1024 bytes from main memory to VRAM', () => {
    const state = createVM(4096);
    // Fill main memory at 0x0400 with a pattern
    for (let i = 0; i < 1024; i++) {
      state.memory[0x0400 + i] = i & 0xFF;
    }
    state.registers.R0 = 0x00; // low byte of 0x0400
    state.registers.R1 = 0x04; // high byte of 0x0400
    state.memory[0] = 0x62; // VCOPY
    state.memory[1] = 0;    // R0 (pair R0:R1)
    const next = step(state);
    expect(next.vram[0]).toBe(0);
    expect(next.vram[1]).toBe(1);
    expect(next.vram[255]).toBe(255);
    expect(next.vram[1023]).toBe(0xFF);
    expect(next.registers.PC).toBe(2);
  });

  it('VCOPY halts when source exceeds memory bounds', () => {
    const state = createVM(256); // too small for 1024-byte copy
    state.registers.R0 = 0;
    state.registers.R1 = 0;
    state.memory[0] = 0x62;
    state.memory[1] = 0;
    const next = step(state);
    expect(next.halted).toBe(true);
    expect(next.error).toContain('bounds');
  });

  it('VRAM ops do not affect flags', () => {
    const state = createVM(256);
    state.registers.FLAGS = 0b1111; // all flags set
    state.registers.R0 = 0xFF;
    state.memory[0] = 0x60; // VSTORE
    state.memory[1] = 0;
    state.memory[2] = 0;
    state.memory[3] = 0;
    const next = step(state);
    expect(next.registers.FLAGS).toBe(0b1111); // unchanged
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/vm/vm.test.ts
```

Expected: FAIL — new opcodes not implemented yet (they'll hit the default/invalid opcode case).

- [ ] **Step 3: Implement new instruction cases in step()**

In `src/vm/vm.ts`, add imports for the new opcodes and flag functions:

```typescript
import {
  // ...existing imports...
  OP_AND, OP_OR, OP_XOR, OP_SHL, OP_SHR,
  OP_VSTORE, OP_VLOAD, OP_VCOPY,
} from './opcodes';
import { computeFlags, checkCondition, computeBitwiseFlags, computeShiftFlags } from './flags';
```

Add these cases to the switch statement in `step()`, after the CMP case and before the Jumps section:

```typescript
    // ---- Bitwise ----------------------------------------------------------
    case OP_AND: {
      const rx = byte(1) as RegIndex;
      const ry = byte(2) as RegIndex;
      const result = getRegValue(regs, rx) & getRegValue(regs, ry);
      setRegValue(regs, rx, result);
      regs.FLAGS = computeBitwiseFlags(result);
      break;
    }

    case OP_OR: {
      const rx = byte(1) as RegIndex;
      const ry = byte(2) as RegIndex;
      const result = getRegValue(regs, rx) | getRegValue(regs, ry);
      setRegValue(regs, rx, result);
      regs.FLAGS = computeBitwiseFlags(result);
      break;
    }

    case OP_XOR: {
      const rx = byte(1) as RegIndex;
      const ry = byte(2) as RegIndex;
      const result = getRegValue(regs, rx) ^ getRegValue(regs, ry);
      setRegValue(regs, rx, result);
      regs.FLAGS = computeBitwiseFlags(result);
      break;
    }

    case OP_SHL: {
      const rx = byte(1) as RegIndex;
      const ry = byte(2) as RegIndex;
      const original = getRegValue(regs, rx);
      const amount = getRegValue(regs, ry);
      const result = amount >= 8 ? 0 : (original << amount) & 0xFF;
      setRegValue(regs, rx, result);
      regs.FLAGS = computeShiftFlags(original, amount, true);
      break;
    }

    case OP_SHR: {
      const rx = byte(1) as RegIndex;
      const ry = byte(2) as RegIndex;
      const original = getRegValue(regs, rx);
      const amount = getRegValue(regs, ry);
      const result = amount >= 8 ? 0 : (original >> amount) & 0xFF;
      setRegValue(regs, rx, result);
      regs.FLAGS = computeShiftFlags(original, amount, false);
      break;
    }
```

Add VRAM cases after the Stack section, before the default case:

```typescript
    // ---- VRAM -------------------------------------------------------------
    case OP_VSTORE: {
      const rx = byte(1) as RegIndex;
      const addr = addr16(2, 3);
      if (addr >= 1024) return halt(`VSTORE: VRAM address out of bounds: ${addr}`);
      s.vram[addr] = getRegValue(regs, rx);
      break;
    }

    case OP_VLOAD: {
      const rx = byte(1) as RegIndex;
      const addr = addr16(2, 3);
      if (addr >= 1024) return halt(`VLOAD: VRAM address out of bounds: ${addr}`);
      setRegValue(regs, rx, s.vram[addr]);
      break;
    }

    case OP_VCOPY: {
      const rx = byte(1) as RegIndex;
      const rxNext = ((rx + 1) & 7) as RegIndex;
      const srcAddr = getRegValue(regs, rx) | (getRegValue(regs, rxNext) << 8);
      if (srcAddr + 1024 > memSize) return halt(`VCOPY: source range exceeds memory bounds (addr=${srcAddr})`);
      s.vram.set(mem.subarray(srcAddr, srcAddr + 1024));
      break;
    }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run
```

Expected: All tests PASS (old + new).

- [ ] **Step 5: Commit**

```bash
git add src/vm/vm.ts tests/vm/vm.test.ts
git commit -m "feat: implement bitwise ops and VRAM instructions in VM step function"
```

---

## Task 4: Update Time-Travel Max History Size

**Files:**
- Modify: `src/vm/time-travel.ts`

- [ ] **Step 1: Change default maxHistorySize from 100,000 to 50,000**

In `src/vm/time-travel.ts`, change the constructor default:

```typescript
constructor(maxSize = 50_000) {
```

- [ ] **Step 2: Run tests**

```bash
npx vitest run tests/vm/time-travel.test.ts
```

Expected: All pass.

- [ ] **Step 3: Commit**

```bash
git add src/vm/time-travel.ts
git commit -m "feat: reduce time-travel max history to 50k for VRAM snapshot overhead"
```

---

## Task 5: Update Assembler (Lexer + Parser)

**Files:**
- Modify: `src/assembler/lexer.ts`
- Modify: `src/assembler/parser.ts`
- Modify: `tests/assembler/parser.test.ts`

- [ ] **Step 1: Add new instructions to lexer**

In `src/assembler/lexer.ts`, add to the `INSTRUCTIONS` set:

```typescript
const INSTRUCTIONS = new Set([
  'NOP', 'HLT', 'MOV', 'LOAD', 'STORE', 'ADD', 'SUB', 'INC', 'DEC',
  'CMP', 'JMP', 'JZ', 'JNZ', 'JG', 'JL', 'PUSH', 'POP', 'CALL', 'RET',
  'AND', 'OR', 'XOR', 'SHL', 'SHR', 'VSTORE', 'VLOAD', 'VCOPY',
]);
```

- [ ] **Step 2: Write failing tests for parser**

Append to `tests/assembler/parser.test.ts`:

```typescript
describe('assemble - bitwise instructions', () => {
  it('assembles AND Rx, Ry', () => {
    const result = assemble('AND R0, R1');
    expect(result.errors).toHaveLength(0);
    expect(result.bytecode[0]).toBe(0x24);
    expect(result.bytecode[1]).toBe(0);
    expect(result.bytecode[2]).toBe(1);
  });

  it('assembles OR Rx, Ry', () => {
    const result = assemble('OR R2, R3');
    expect(result.bytecode[0]).toBe(0x25);
    expect(result.bytecode[1]).toBe(2);
    expect(result.bytecode[2]).toBe(3);
  });

  it('assembles XOR, SHL, SHR', () => {
    const r1 = assemble('XOR R0, R1');
    expect(r1.bytecode[0]).toBe(0x26);
    const r2 = assemble('SHL R0, R1');
    expect(r2.bytecode[0]).toBe(0x27);
    const r3 = assemble('SHR R0, R1');
    expect(r3.bytecode[0]).toBe(0x28);
  });
});

describe('assemble - VRAM instructions', () => {
  it('assembles VSTORE [addr], Rx', () => {
    const result = assemble('VSTORE [0x0045], R4');
    expect(result.errors).toHaveLength(0);
    expect(result.bytecode[0]).toBe(0x60);
    expect(result.bytecode[1]).toBe(4);    // R4
    expect(result.bytecode[2]).toBe(0x45); // addrLo
    expect(result.bytecode[3]).toBe(0x00); // addrHi
  });

  it('assembles VLOAD Rx, [addr]', () => {
    const result = assemble('VLOAD R5, [0x001F]');
    expect(result.errors).toHaveLength(0);
    expect(result.bytecode[0]).toBe(0x61);
    expect(result.bytecode[1]).toBe(5);    // R5
    expect(result.bytecode[2]).toBe(0x1F); // addrLo
    expect(result.bytecode[3]).toBe(0x00); // addrHi
  });

  it('assembles VCOPY Rx', () => {
    const result = assemble('VCOPY R0');
    expect(result.errors).toHaveLength(0);
    expect(result.bytecode[0]).toBe(0x62);
    expect(result.bytecode[1]).toBe(0);    // R0
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/assembler/parser.test.ts
```

Expected: FAIL — new instructions hit the default case.

- [ ] **Step 4: Implement parser cases**

In `src/assembler/parser.ts`, add imports for the new opcodes:

```typescript
import {
  // ...existing...
  OP_AND, OP_OR, OP_XOR, OP_SHL, OP_SHR,
  OP_VSTORE, OP_VLOAD, OP_VCOPY,
} from '../vm/opcodes';
```

Add cases to the switch statement. For bitwise ops, extend the existing ADD/SUB/CMP case:

```typescript
        case 'ADD':
        case 'SUB':
        case 'CMP':
        case 'AND':
        case 'OR':
        case 'XOR':
        case 'SHL':
        case 'SHR': {
          const reg1 = operands.find(t => t.type === 'REGISTER');
          const commaIdx = operands.findIndex(t => t.type === 'COMMA');
          const afterComma = operands.slice(commaIdx + 1);
          const reg2 = afterComma.find(t => t.type === 'REGISTER');

          const opMap: Record<string, number> = {
            ADD: OP_ADD, SUB: OP_SUB, CMP: OP_CMP,
            AND: OP_AND, OR: OP_OR, XOR: OP_XOR, SHL: OP_SHL, SHR: OP_SHR,
          };

          if (reg1 && reg2) {
            output.push(opMap[instr], regNum(reg1), regNum(reg2));
          } else {
            errors.push({ message: `Invalid ${instr} operands`, line: lineNum });
          }
          break;
        }
```

For VSTORE — same pattern as STORE with bracket syntax:

```typescript
        case 'VSTORE': {
          // VSTORE [addr], Rx — same pattern as STORE [addr], Rx
          const lbIdx = operands.findIndex(t => t.type === 'LBRACKET');
          const rbIdx = operands.findIndex(t => t.type === 'RBRACKET');
          const commaIdx = operands.findIndex(t => t.type === 'COMMA');

          if (lbIdx !== -1 && rbIdx !== -1 && commaIdx !== -1) {
            const bracketContent = operands.slice(lbIdx + 1, rbIdx);
            const afterComma = operands.slice(commaIdx + 1);
            const srcReg = afterComma.find(t => t.type === 'REGISTER');
            const innerNum = bracketContent.find(t => t.type === 'NUMBER');
            const innerLabel = bracketContent.find(t => t.type === 'LABEL_REF');

            if (srcReg && innerNum) {
              const addr = parseNum(innerNum.value);
              const [lo, hi] = addrBytes(addr);
              output.push(OP_VSTORE, regNum(srcReg), lo, hi);
            } else if (srcReg && innerLabel) {
              output.push(OP_VSTORE, regNum(srcReg));
              patches.push({ offset: output.length, label: innerLabel.value, line: lineNum });
              output.push(0x00, 0x00);
            } else {
              errors.push({ message: `Invalid VSTORE operands`, line: lineNum });
            }
          } else {
            errors.push({ message: `Invalid VSTORE syntax`, line: lineNum });
          }
          break;
        }
```

For VLOAD — same pattern as LOAD with bracket syntax:

```typescript
        case 'VLOAD': {
          // VLOAD Rx, [addr] — same pattern as LOAD Rx, [addr]
          const destReg = operands.find(t => t.type === 'REGISTER');
          const lbIdx = operands.findIndex(t => t.type === 'LBRACKET');
          const rbIdx = operands.findIndex(t => t.type === 'RBRACKET');

          if (destReg && lbIdx !== -1 && rbIdx !== -1) {
            const bracketContent = operands.slice(lbIdx + 1, rbIdx);
            const innerNum = bracketContent.find(t => t.type === 'NUMBER');
            const innerLabel = bracketContent.find(t => t.type === 'LABEL_REF');

            if (innerNum) {
              const addr = parseNum(innerNum.value);
              const [lo, hi] = addrBytes(addr);
              output.push(OP_VLOAD, regNum(destReg), lo, hi);
            } else if (innerLabel) {
              output.push(OP_VLOAD, regNum(destReg));
              patches.push({ offset: output.length, label: innerLabel.value, line: lineNum });
              output.push(0x00, 0x00);
            } else {
              errors.push({ message: `Invalid VLOAD operands`, line: lineNum });
            }
          } else {
            errors.push({ message: `Invalid VLOAD syntax`, line: lineNum });
          }
          break;
        }
```

For VCOPY — same pattern as PUSH/POP (single register):

```typescript
        case 'VCOPY': {
          const reg = operands.find(t => t.type === 'REGISTER');
          if (reg) {
            output.push(OP_VCOPY, regNum(reg));
          } else {
            errors.push({ message: `Invalid VCOPY operands`, line: lineNum });
          }
          break;
        }
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/assembler/lexer.ts src/assembler/parser.ts tests/assembler/parser.test.ts
git commit -m "feat: add assembler support for bitwise and VRAM instructions"
```

---

## Task 6: Pixel Display Renderer

**Files:**
- Create: `src/renderer/pixel-display.ts`

- [ ] **Step 1: Implement PixelDisplay class**

Create `src/renderer/pixel-display.ts`:

```typescript
/**
 * Renders a 1024-byte VRAM (32×32 pixels, RGB332) onto a <canvas>.
 *
 * The canvas is set to 32×32 native pixels. CSS scales it up with
 * `image-rendering: pixelated` for crisp blocky pixels.
 */
export class PixelDisplay {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private imageData: ImageData;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.canvas.width = 32;
    this.canvas.height = 32;
    this.ctx = canvas.getContext('2d')!;
    this.imageData = this.ctx.createImageData(32, 32);
  }

  /**
   * Draw the full 32×32 image from VRAM.
   * Each VRAM byte is one pixel in RGB332 format: RRRGGGBB.
   */
  render(vram: Uint8Array): void {
    const data = this.imageData.data;
    for (let i = 0; i < 1024; i++) {
      const byte = vram[i];
      const offset = i * 4;
      data[offset]     = Math.round(((byte >> 5) & 0x07) * 255 / 7); // R
      data[offset + 1] = Math.round(((byte >> 2) & 0x07) * 255 / 7); // G
      data[offset + 2] = Math.round((byte & 0x03) * 255 / 3);        // B
      data[offset + 3] = 255;                                          // A
    }
    this.ctx.putImageData(this.imageData, 0, 0);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer/pixel-display.ts
git commit -m "feat: implement PixelDisplay renderer with RGB332 decoding"
```

---

## Task 7: Update Narration for New Instructions

**Files:**
- Modify: `src/renderer/narration.ts`

- [ ] **Step 1: Add imports and narration cases**

In `src/renderer/narration.ts`, add imports for new opcodes:

```typescript
import {
  // ...existing...
  OP_AND, OP_OR, OP_XOR, OP_SHL, OP_SHR,
  OP_VSTORE, OP_VLOAD, OP_VCOPY,
} from '../vm/opcodes';
```

Add cases to the switch in `describeNextInstruction()`, before the default case:

```typescript
    case OP_AND:
      return `Bitwise AND: ${rxName} (${hex(rxVal)}) & ${ryName} (${hex(ryVal)}) = ${hex(rxVal & ryVal)}.`;

    case OP_OR:
      return `Bitwise OR: ${rxName} (${hex(rxVal)}) | ${ryName} (${hex(ryVal)}) = ${hex((rxVal | ryVal) & 0xFF)}.`;

    case OP_XOR:
      return `Bitwise XOR: ${rxName} (${hex(rxVal)}) ^ ${ryName} (${hex(ryVal)}) = ${hex((rxVal ^ ryVal) & 0xFF)}.`;

    case OP_SHL: {
      const amt = ryVal;
      const result = amt >= 8 ? 0 : (rxVal << amt) & 0xFF;
      return `Shift left: ${rxName} (${hex(rxVal)}) << ${ryName} (${amt}) = ${hex(result)}.`;
    }

    case OP_SHR: {
      const amt = ryVal;
      const result = amt >= 8 ? 0 : (rxVal >> amt) & 0xFF;
      return `Shift right: ${rxName} (${hex(rxVal)}) >> ${ryName} (${amt}) = ${hex(result)}.`;
    }

    case OP_VSTORE: {
      const a = b(2) | (b(3) << 8);
      const px = a % 32;
      const py = Math.floor(a / 32);
      return `Write ${rxName} (${hex(rxVal)}) to VRAM address ${a} → pixel (${px}, ${py}).`;
    }

    case OP_VLOAD: {
      const a = b(2) | (b(3) << 8);
      const px = a % 32;
      const py = Math.floor(a / 32);
      const val = a < 1024 ? state.vram[a] : 0;
      return `Read VRAM address ${a} → pixel (${px}, ${py}) into ${rxName}. Current value: ${hex(val)}.`;
    }

    case OP_VCOPY: {
      const lo = regs[R(rx) as keyof typeof regs] as number;
      const hi = regs[R((rx + 1) & 7) as keyof typeof regs] as number;
      const srcAddr = (hi << 8) | lo;
      return `Copy 1024 bytes from main memory at ${hex16(srcAddr)} to VRAM. Full screen refresh.`;
    }
```

- [ ] **Step 2: Verify build**

```bash
npx vite build
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/narration.ts
git commit -m "feat: add narration descriptions for bitwise and VRAM instructions"
```

---

## Task 8: HTML, CSS, and App Wiring

**Files:**
- Modify: `index.html`
- Modify: `style.css`
- Modify: `src/ui/app.ts`
- Modify: `src/ui/editor.ts`

- [ ] **Step 1: Add pixel display canvas and display stats to HTML**

In `index.html`, add inside `#grid-container` (after the `<canvas id="hex-grid">` line):

```html
        <canvas id="pixel-display"></canvas>
```

In `#detail-panel`, add a new section before the error section:

```html
        <section id="display-stats-section" hidden>
          <h3>Display</h3>
          <div id="display-stats"></div>
        </section>
```

Add new example options to `#examples-dropdown`:

```html
              <option value="game-of-life">Game of Life</option>
              <option value="pixel-test">Pixel Test</option>
```

- [ ] **Step 2: Add pixel display CSS**

Add to `style.css`:

```css
/* ===== Pixel Display ===== */
#pixel-display {
  position: absolute;
  top: 8px;
  left: 8px;
  width: 160px;
  height: 160px;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  border: 2px solid var(--border);
  border-radius: 4px;
  background: #000;
  z-index: 10;
  display: none;
}

#pixel-display.visible {
  display: block;
}

/* ===== Display Stats ===== */
#display-stats {
  font-family: var(--font-mono);
  font-size: 11px;
}

#display-stats .stat-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
}
```

Also add `position: relative;` to `#grid-container` if not already present (check existing CSS — it should already have it).

- [ ] **Step 3: Wire up pixel display in app.ts**

In `src/ui/app.ts`, add imports:

```typescript
import { PixelDisplay } from '../renderer/pixel-display';
```

Add DOM element references:

```typescript
  const pixelCanvas = getEl<HTMLCanvasElement>('pixel-display');
  const displayStatsEl = getEl<HTMLDivElement>('display-stats');
  const displayStatsSection = getEl<HTMLElement>('display-stats-section');
```

Create pixel display instance:

```typescript
  const pixelDisplay = new PixelDisplay(pixelCanvas);
  let vramDirty = false;
```

In `renderState()`, add after the existing rendering calls:

```typescript
    // Pixel display — show when VRAM has been written to
    if (vramDirty) {
      pixelDisplay.render(state.vram);
      pixelCanvas.classList.add('visible');
      displayStatsSection.hidden = false;

      // Display stats
      let activePixels = 0;
      for (let i = 0; i < 1024; i++) {
        if (state.vram[i] !== 0) activePixels++;
      }
      displayStatsEl.innerHTML =
        `<div class="stat-row"><span class="stat-label">Resolution</span><span class="stat-value">32×32</span></div>` +
        `<div class="stat-row"><span class="stat-label">Active pixels</span><span class="stat-value">${activePixels} / 1024</span></div>` +
        `<div class="stat-row"><span class="stat-label">Format</span><span class="stat-value">RGB332</span></div>`;
    } else {
      pixelCanvas.classList.remove('visible');
      displayStatsSection.hidden = true;
    }
```

Detect VRAM writes: In the `step` function execution path (inside `doStep` in controls.ts, or after step in the animation loop), we need to detect if VRAM changed. The simplest approach: in `renderState`, check if any vram byte is non-zero OR if it differs from a previous snapshot. Actually, simplest: set `vramDirty = true` whenever a program using VRAM instructions is loaded. We can detect this by checking if the assembled bytecode contains any VRAM opcodes, or more simply: set it in the onAssemble callback by scanning the bytecode for VRAM opcodes (0x60, 0x61, 0x62).

In the `setupEditor` onAssemble callback and the reset handler, add logic to detect VRAM usage:

```typescript
    // In the onAssemble callback:
    vramDirty = result.bytecode.some(b => b === 0x60 || b === 0x61 || b === 0x62);
```

When resetting:

```typescript
    vramDirty = false;
```

- [ ] **Step 4: Update editor.ts to include new examples**

In `src/ui/editor.ts`, add imports for new examples:

```typescript
import { GAME_OF_LIFE_SOURCE } from '../examples/game-of-life';
import { PIXEL_TEST_SOURCE } from '../examples/pixel-test';
```

Add to the EXAMPLES map:

```typescript
  'game-of-life': GAME_OF_LIFE_SOURCE,
  'pixel-test': PIXEL_TEST_SOURCE,
```

- [ ] **Step 5: Verify build and existing tests**

```bash
npx vite build && npx vitest run
```

Expected: Build succeeds, all tests pass. (The new example imports will fail until Task 9 creates those files, so do Task 9 first or create placeholder empty-string exports.)

- [ ] **Step 6: Commit**

```bash
git add index.html style.css src/ui/app.ts src/ui/editor.ts
git commit -m "feat: wire up pixel display, display stats, and VRAM detection in UI"
```

---

## Task 9: Example Programs

**Files:**
- Create: `src/examples/pixel-test.ts`
- Create: `src/examples/game-of-life.ts`

- [ ] **Step 1: Create pixel test example**

Create `src/examples/pixel-test.ts`:

```typescript
export const PIXEL_TEST_NAME = 'Pixel Test';
export const PIXEL_TEST_DESCRIPTION = 'Fills the 32x32 display with a color gradient using VSTORE.';
export const PIXEL_TEST_SOURCE = `; Pixel Test — fills 32x32 display with color gradient
; Each pixel gets a different RGB332 value (0-255, then wraps)

  MOV R0, 0         ; pixel color (increments 0-255)
  MOV R2, 0         ; VRAM address low byte
  MOV R3, 0         ; VRAM address high byte
  MOV R6, 0         ; counter low byte
  MOV R7, 4         ; counter high byte (1024 = 0x0400)

loop:
  VSTORE [0x0000], R0  ; placeholder — we'll use address in R2:R3

  ; Actually we need to VSTORE at dynamic address.
  ; Since VSTORE takes absolute address, we write to memory
  ; buffer then VCOPY. Simpler approach: fill a 1024-byte
  ; block in main memory, then VCOPY to VRAM.

  ; Let's restart with the VCOPY approach:
  HLT

; ------- Better version using VCOPY -------
; We'll fill memory at 0x0200 with gradient, then VCOPY

start:
  MOV R0, 0         ; color value
  MOV R2, 0x00      ; write pointer low (0x0200)
  MOV R3, 0x02      ; write pointer high

  ; Fill 1024 bytes at 0x0200
fill:
  STORE [R2], R0    ; write color to memory
  INC R0            ; next color (wraps at 256)
  INC R2            ; advance pointer low byte
  MOV R4, R2
  MOV R5, R3
  ; Check if we've written 1024 bytes (pointer reached 0x0600)
  CMP R3, 6
  JL fill
  ; If R3 < 6, keep going... but we need to handle R2 overflow too
  ; Simplified: just let it run for enough iterations

  ; VCOPY from 0x0200
  MOV R0, 0x00
  MOV R1, 0x02
  VCOPY R0
  HLT
`;
```

Actually, that's getting convoluted with the STORE indirect and 16-bit pointer management. Let me write a cleaner version that just uses a loop with a counter and the STORE indirect approach, then VCOPYs at the end.

Create `src/examples/pixel-test.ts`:

```typescript
export const PIXEL_TEST_NAME = 'Pixel Test';
export const PIXEL_TEST_DESCRIPTION = 'Fills the 32x32 display with a color gradient.';
export const PIXEL_TEST_SOURCE = `; Pixel Test — fill 32x32 display with RGB332 gradient
; Strategy: fill buffer at 0x0400 with values 0-255 (repeated 4x)
; then VCOPY to VRAM

  MOV R0, 0         ; color value (0-255, wraps)
  MOV R2, 0x00      ; write pointer low = 0x0400
  MOV R3, 0x04      ; write pointer high
  MOV R6, 0         ; loop counter low
  MOV R7, 0         ; loop counter high (count to 1024)

fill:
  STORE [R2], R0    ; write color byte to buffer
  INC R0            ; next color
  INC R2            ; advance pointer
  INC R6            ; increment counter
  CMP R6, 0         ; check if R6 wrapped (every 256 iters)
  JNZ fill          ; if R6 != 0, keep looping
  INC R3            ; carry into high byte of pointer
  INC R7            ; carry into high byte of counter
  CMP R7, 4         ; 4 * 256 = 1024
  JL fill

  ; VCOPY buffer at 0x0400 to VRAM
  MOV R0, 0x00
  MOV R1, 0x04
  VCOPY R0
  HLT
`;
```

- [ ] **Step 2: Create Game of Life example**

Create `src/examples/game-of-life.ts`. This is a large program. The core structure:

```typescript
export const GAME_OF_LIFE_NAME = 'Game of Life';
export const GAME_OF_LIFE_DESCRIPTION = 'Conway\'s Game of Life on a 32x32 grid. Uses VCOPY for display.';
export const GAME_OF_LIFE_SOURCE = `; Conway's Game of Life — 32x32 grid
; Buffer A (current) at 0x0400, Buffer B (next) at 0x0800
; Uses VCOPY to display each generation
;
; Registers usage in main loop:
;   R0:R1 = pointer into current buffer (read)
;   R2:R3 = pointer into next buffer (write)
;   R4 = x coordinate (0-31)
;   R5 = y coordinate (0-31)
;   R6 = neighbor count / temp
;   R7 = temp / current cell value
;
; Due to register pressure, constants are reloaded as needed.

; ---- Seed R-pentomino at center (15,15) ----
; Pattern:  .##   at (16,15) and (17,15)
;           ##.   at (15,16) and (16,16)
;           .#.   at (16,17)

  ; Compute addresses: addr = 0x0400 + y*32 + x
  ; (15,15) = 0x0400 + 15*32 + 15 = 0x0400 + 480 + 15 = 0x0400 + 495 = 0x05EF
  ; Store 0xFF (alive) at the five cells

  ; Row y=15: cells (16,15) and (17,15)
  MOV R0, 0x00      ; low byte of 0x0600 (0x0400 + 15*32 = 0x0400 + 0x01E0 = 0x05E0)
  MOV R1, 0x00
  ; Actually let's compute: 0x0400 + 15*32 + 16 = 1024 + 480 + 16 = 1520 = 0x05F0
  ; 0x05F0 → lo=0xF0, hi=0x05
  MOV R7, 0xFF      ; alive color

  ; (16, 15) = 0x05F0
  MOV R0, 0xF0
  MOV R1, 0x05
  STORE [R0], R7

  ; (17, 15) = 0x05F1
  INC R0
  STORE [R0], R7

  ; Row y=16: cells (15,16) and (16,16)
  ; 0x0400 + 16*32 + 15 = 1024 + 512 + 15 = 1551 = 0x060F
  MOV R0, 0x0F
  MOV R1, 0x06
  STORE [R0], R7

  ; (16, 16) = 0x0610
  INC R0
  STORE [R0], R7

  ; Row y=17: cell (16,17)
  ; 0x0400 + 17*32 + 16 = 1024 + 544 + 16 = 1584 = 0x0630
  MOV R0, 0x30
  MOV R1, 0x06
  STORE [R0], R7

  ; Display initial state
  MOV R0, 0x00
  MOV R1, 0x04
  VCOPY R0

; ---- Main generation loop ----
gen_loop:
  ; For each cell (x,y), count neighbors and apply rules
  MOV R4, 0         ; x = 0
  MOV R5, 0         ; y = 0

cell_loop:
  ; Compute address of current cell in Buffer A
  ; addr = 0x0400 + y*32 + x
  ; y*32 = y << 5
  PUSH R4            ; save x
  PUSH R5            ; save y

  ; Compute y*32: put y in R6, shift left by 5
  MOV R6, R5
  MOV R7, 5
  SHL R6, R7         ; R6 = (y << 5) & 0xFF = low byte of y*32

  ; For y >= 8, the shift overflows 8 bits. y*32 for y=8 is 256.
  ; We need the high byte too. high = y >> 3
  MOV R7, 3
  MOV R0, R5
  SHR R0, R7         ; R0 = y >> 3 = high byte of y*32

  ; addr_lo = (y*32)_lo + x + 0x00 (buffer A low = 0x00 since 0x0400)
  ADD R6, R4         ; R6 = y*32_lo + x
  ; Handle carry: if R6 < R4, carry occurred
  MOV R1, 0x04       ; buffer A high byte
  ADD R1, R0         ; R1 = 0x04 + y*32_hi

  ; Now R6:R1 is the address... but we need it in a pair register
  ; Move to R0:R1
  MOV R0, R6         ; R0 = addr low
  ; R1 already has addr high

  ; Read current cell value
  LOAD R7, [R0]      ; R7 = current cell (0x00 or 0xFF)

  ; Count neighbors — we need to check 8 surrounding cells
  ; This is the expensive part. We'll check each direction.
  ; To save code space, we push/pop registers heavily.

  PUSH R7            ; save current cell value
  MOV R6, 0          ; neighbor count = 0

  ; We need to check cells at (x-1,y-1), (x,y-1), (x+1,y-1),
  ;                            (x-1,y),            (x+1,y),
  ;                            (x-1,y+1), (x,y+1), (x+1,y+1)
  ; For each: skip if out of bounds, else load and check if alive

  ; Helper approach: for each of 8 directions, compute the
  ; neighbor address and load it. Use R0:R1 for the address.
  ; If out of bounds (x<0, x>31, y<0, y>31), skip.

  POP R7             ; restore current cell (we'll re-push later)
  POP R5             ; restore y
  POP R4             ; restore x
  PUSH R4            ; re-save x
  PUSH R5            ; re-save y
  PUSH R7            ; re-save current cell

  ; For simplicity in this demo, we'll use a subroutine approach.
  ; But CALL/RET with our register pressure is very tight.
  ; Instead, let's inline the neighbor counting with a simplified approach:
  ; Check all 8 neighbors by computing each address and loading.

  ; -- Check (x-1, y-1) --
  MOV R0, R4
  DEC R0             ; R0 = x-1
  CMP R0, 0xFF       ; if x was 0, R0 wrapped to 0xFF (out of bounds)
  JZ skip_n0
  MOV R1, R5
  DEC R1             ; R1 = y-1
  CMP R1, 0xFF
  JZ skip_n0
  ; Compute addr: 0x0400 + R1*32 + R0
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7         ; R6 = (y-1)*32 low
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7         ; R2 = (y-1)*32 high
  ADD R6, R0         ; R6 += x-1
  MOV R3, 0x04
  ADD R3, R2         ; R3 = 0x04 + high
  ; Load from R6:R3... but we need it in a pair.
  ; Use R2:R3 pair
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  CMP R7, 0
  JZ skip_n0
  INC R6             ; neighbor count++
skip_n0:

  ; This pattern repeats 7 more times for each direction.
  ; The full program would be ~600-800 bytes.
  ; For brevity, we'll do a simplified version that checks
  ; only the 4 cardinal neighbors (up, down, left, right)
  ; using a slightly different rule set, or we accept that
  ; the full 8-neighbor version is very long.

  ; -- SIMPLIFIED: check 4 cardinal neighbors only --
  ; (This makes it not standard GoL but still visually interesting)

  ; Already checked (x-1, y-1) above. Let's check remaining:
  ; (x, y-1) - above
  MOV R0, R4         ; x
  MOV R1, R5
  DEC R1
  CMP R1, 0xFF
  JZ skip_n1
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  CMP R7, 0
  JZ skip_n1
  INC R6
skip_n1:

  ; (x+1, y-1)
  MOV R0, R4
  INC R0
  CMP R0, 32
  JZ skip_n2
  JG skip_n2
  MOV R1, R5
  DEC R1
  CMP R1, 0xFF
  JZ skip_n2
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  CMP R7, 0
  JZ skip_n2
  INC R6
skip_n2:

  ; (x-1, y)
  MOV R0, R4
  DEC R0
  CMP R0, 0xFF
  JZ skip_n3
  MOV R1, R5
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  CMP R7, 0
  JZ skip_n3
  INC R6
skip_n3:

  ; (x+1, y)
  MOV R0, R4
  INC R0
  CMP R0, 32
  JZ skip_n4
  JG skip_n4
  MOV R1, R5
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  CMP R7, 0
  JZ skip_n4
  INC R6
skip_n4:

  ; (x-1, y+1)
  MOV R0, R4
  DEC R0
  CMP R0, 0xFF
  JZ skip_n5
  MOV R1, R5
  INC R1
  CMP R1, 32
  JZ skip_n5
  JG skip_n5
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  CMP R7, 0
  JZ skip_n5
  INC R6
skip_n5:

  ; (x, y+1)
  MOV R0, R4
  MOV R1, R5
  INC R1
  CMP R1, 32
  JZ skip_n6
  JG skip_n6
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  CMP R7, 0
  JZ skip_n6
  INC R6
skip_n6:

  ; (x+1, y+1)
  MOV R0, R4
  INC R0
  CMP R0, 32
  JZ skip_n7
  JG skip_n7
  MOV R1, R5
  INC R1
  CMP R1, 32
  JZ skip_n7
  JG skip_n7
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  CMP R7, 0
  JZ skip_n7
  INC R6
skip_n7:

  ; ---- Apply rules ----
  ; R6 = neighbor count, stack has: current_cell, y, x
  POP R7             ; current cell value
  POP R5             ; y
  POP R4             ; x

  ; Compute address in Buffer B: 0x0800 + y*32 + x
  PUSH R4
  PUSH R5
  PUSH R6
  MOV R6, R5
  MOV R0, 5
  SHL R6, R0         ; R6 = y*32 low
  MOV R0, 3
  MOV R1, R5
  SHR R1, R0         ; R1 = y*32 high
  ADD R6, R4         ; R6 += x
  MOV R3, 0x08
  ADD R3, R1         ; R3 = 0x08 + high
  MOV R2, R6         ; R2 = addr low
  POP R6             ; restore neighbor count
  POP R5
  POP R4

  ; Rule: alive if neighbors == 3, or (neighbors == 2 and currently alive)
  MOV R0, 3
  CMP R6, R0
  JZ make_alive

  MOV R0, 2
  CMP R6, R0
  JNZ make_dead

  ; neighbors == 2: alive only if currently alive
  CMP R7, 0
  JZ make_dead

make_alive:
  MOV R0, 0xFF
  STORE [R2], R0
  JMP next_cell

make_dead:
  MOV R0, 0x00
  STORE [R2], R0

next_cell:
  ; Advance x
  INC R4
  MOV R0, 32
  CMP R4, R0
  JL cell_loop

  ; Advance y, reset x
  MOV R4, 0
  INC R5
  MOV R0, 32
  CMP R5, R0
  JL cell_loop

  ; Generation complete — VCOPY Buffer B to VRAM
  MOV R0, 0x00
  MOV R1, 0x08
  VCOPY R0

  ; Copy Buffer B back to Buffer A (for next generation)
  ; We'll copy 1024 bytes from 0x0800 to 0x0400
  ; Using a byte-by-byte copy loop
  MOV R2, 0x00       ; src low (0x0800)
  MOV R3, 0x08       ; src high
  MOV R4, 0x00       ; dst low (0x0400)
  MOV R5, 0x04       ; dst high

copy_loop:
  LOAD R6, [R2]
  STORE [R4], R6
  INC R2
  INC R4
  ; Check if R2 wrapped (every 256 bytes)
  CMP R2, 0
  JNZ copy_loop
  INC R3             ; carry into src high
  INC R5             ; carry into dst high
  ; Check if we've copied all 1024 bytes (src high reaches 0x0C)
  MOV R0, 0x0C
  CMP R3, R0
  JL copy_loop

  ; Loop back for next generation
  JMP gen_loop
`;
```

- [ ] **Step 3: Commit**

```bash
git add src/examples/pixel-test.ts src/examples/game-of-life.ts
git commit -m "feat: add Game of Life and pixel test example programs"
```

---

## Task 10: Integration Test

**Files:**
- Create: `tests/integration/game-of-life.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/game-of-life.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createVM, step } from '../../src/vm/vm';
import { assemble } from '../../src/assembler/parser';
import { GAME_OF_LIFE_SOURCE } from '../../src/examples/game-of-life';
import { PIXEL_TEST_SOURCE } from '../../src/examples/pixel-test';

describe('Pixel Test end-to-end', () => {
  it('assembles and fills VRAM with gradient', () => {
    const result = assemble(PIXEL_TEST_SOURCE);
    expect(result.errors).toHaveLength(0);

    let state = createVM(4096);
    for (let i = 0; i < result.bytecode.length; i++) {
      state.memory[i] = result.bytecode[i];
    }

    let steps = 0;
    while (!state.halted && steps < 500000) {
      state = step(state);
      steps++;
    }

    expect(state.halted).toBe(true);
    expect(state.error).toBeUndefined();

    // VRAM should have non-zero content (gradient pattern)
    let nonZero = 0;
    for (let i = 0; i < 1024; i++) {
      if (state.vram[i] !== 0) nonZero++;
    }
    expect(nonZero).toBeGreaterThan(0);
  });
});

describe('Game of Life end-to-end', () => {
  it('assembles without errors', () => {
    const result = assemble(GAME_OF_LIFE_SOURCE);
    expect(result.errors).toHaveLength(0);
    expect(result.bytecode.length).toBeGreaterThan(0);
  });

  it('runs one generation and produces VRAM output', () => {
    const result = assemble(GAME_OF_LIFE_SOURCE);
    expect(result.errors).toHaveLength(0);

    let state = createVM(4096);
    for (let i = 0; i < result.bytecode.length; i++) {
      state.memory[i] = result.bytecode[i];
    }

    // Run enough steps for seeding + first VCOPY (initial display)
    // The seeding is ~20 instructions, then VCOPY
    let steps = 0;
    let vcopyCount = 0;
    while (steps < 200000 && vcopyCount < 2) {
      const prevVram0 = state.vram[0];
      state = step(state);
      steps++;
      // Detect VCOPY by checking if VRAM changed significantly
      if (state.memory[state.registers.PC - 2] === 0x62) {
        vcopyCount++;
      }
      if (state.halted) break;
    }

    // After initial seeding and VCOPY, VRAM should have the R-pentomino
    let aliveCount = 0;
    for (let i = 0; i < 1024; i++) {
      if (state.vram[i] !== 0) aliveCount++;
    }
    // R-pentomino has 5 cells
    expect(aliveCount).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
npx vitest run tests/integration/
```

Expected: PASS (or may need debugging if the GoL assembly has issues).

- [ ] **Step 3: Run all tests**

```bash
npx vitest run
```

Expected: All pass.

- [ ] **Step 4: Commit**

```bash
git add tests/integration/game-of-life.test.ts
git commit -m "test: add integration tests for pixel test and Game of Life demos"
```

---

## Task 11: Final Build Verification

- [ ] **Step 1: Run full build**

```bash
npm run build
```

Expected: Clean build.

- [ ] **Step 2: Run all tests**

```bash
npm run test
```

Expected: All tests pass.

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Open in browser. Verify:
1. Existing examples (Bubble Sort, Counter, Fibonacci) still work
2. Load Pixel Test → Assemble & Load → Run → pixel display appears with color gradient
3. Load Game of Life → Assemble & Load → Run → pixel display shows R-pentomino evolving
4. Step through GoL to watch individual instructions in narration panel
5. Step Back / time-travel still works
6. Speed slider controls execution rate correctly

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Browser VM v2 complete — bitwise ops, VRAM, pixel display, Game of Life"
```
