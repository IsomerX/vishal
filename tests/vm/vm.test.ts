import { describe, it, expect } from 'vitest';
import { createVM, cloneState, step } from '../../src/vm/vm';
import { VMState, FLAG_Z, FLAG_C, FLAG_N, getRegValue, setRegValue } from '../../src/vm/types';
import {
  OP_NOP, OP_HLT,
  OP_MOV_IMM, OP_MOV_REG,
  OP_LOAD_ABS, OP_STORE_ABS, OP_LOAD_IND, OP_STORE_IND,
  OP_ADD, OP_SUB, OP_INC, OP_DEC,
  OP_CMP,
  OP_JMP, OP_JZ, OP_JNZ, OP_JG, OP_JL,
  OP_PUSH, OP_POP, OP_CALL, OP_RET,
  INSTRUCTION_SIZE,
} from '../../src/vm/opcodes';

// Helper: write bytes into VM memory at a given offset
function writeBytes(state: VMState, offset: number, bytes: number[]): void {
  for (let i = 0; i < bytes.length; i++) {
    state.memory[offset + i] = bytes[i];
  }
}

describe('createVM', () => {
  it('creates a VM with default memory size 4096', () => {
    const vm = createVM();
    expect(vm.memory.length).toBe(4096);
  });

  it('creates a VM with custom memory size', () => {
    const vm = createVM(256);
    expect(vm.memory.length).toBe(256);
  });

  it('initializes PC to 0', () => {
    const vm = createVM();
    expect(vm.registers.PC).toBe(0);
  });

  it('initializes SP to memorySize - 1', () => {
    const vm = createVM(256);
    expect(vm.registers.SP).toBe(255);
  });

  it('initializes all general registers to 0', () => {
    const vm = createVM();
    for (let i = 0; i < 8; i++) {
      expect(getRegValue(vm.registers, i as 0|1|2|3|4|5|6|7)).toBe(0);
    }
  });

  it('initializes FLAGS to 0', () => {
    const vm = createVM();
    expect(vm.registers.FLAGS).toBe(0);
  });

  it('is not halted and has cycle=0', () => {
    const vm = createVM();
    expect(vm.halted).toBe(false);
    expect(vm.cycle).toBe(0);
  });

  it('memory is zeroed', () => {
    const vm = createVM(64);
    for (let i = 0; i < 64; i++) {
      expect(vm.memory[i]).toBe(0);
    }
  });
});

describe('cloneState', () => {
  it('returns a deep copy with independent memory', () => {
    const vm = createVM(64);
    vm.memory[0] = 0xAA;
    const clone = cloneState(vm);
    clone.memory[0] = 0xBB;
    expect(vm.memory[0]).toBe(0xAA);
    expect(clone.memory[0]).toBe(0xBB);
  });

  it('returns a deep copy with independent registers', () => {
    const vm = createVM();
    vm.registers.R0 = 42;
    const clone = cloneState(vm);
    clone.registers.R0 = 99;
    expect(vm.registers.R0).toBe(42);
    expect(clone.registers.R0).toBe(99);
  });
});

describe('step — NOP', () => {
  it('advances PC by 1 and increments cycle', () => {
    const vm = createVM();
    writeBytes(vm, 0, [OP_NOP]);
    const next = step(vm);
    expect(next.registers.PC).toBe(INSTRUCTION_SIZE[OP_NOP]);
    expect(next.cycle).toBe(1);
    expect(next.halted).toBe(false);
  });
});

describe('step — HLT', () => {
  it('sets halted to true', () => {
    const vm = createVM();
    writeBytes(vm, 0, [OP_HLT]);
    const next = step(vm);
    expect(next.halted).toBe(true);
  });

  it('does not execute when already halted', () => {
    const vm = createVM();
    vm.halted = true;
    const next = step(vm);
    expect(next.halted).toBe(true);
    expect(next.cycle).toBe(0); // cycle unchanged
  });
});

describe('step — MOV', () => {
  it('MOV Rx, imm loads immediate value into register', () => {
    const vm = createVM();
    // MOV R0, 42
    writeBytes(vm, 0, [OP_MOV_IMM, 0, 42]);
    const next = step(vm);
    expect(next.registers.R0).toBe(42);
    expect(next.registers.PC).toBe(3);
  });

  it('MOV Rx, Ry copies register value', () => {
    const vm = createVM();
    vm.registers.R1 = 99;
    // MOV R0, R1
    writeBytes(vm, 0, [OP_MOV_REG, 0, 1]);
    const next = step(vm);
    expect(next.registers.R0).toBe(99);
    expect(next.registers.PC).toBe(3);
  });
});

describe('step — LOAD/STORE absolute', () => {
  it('STORE then LOAD round-trips a value at absolute address', () => {
    const vm = createVM();
    vm.registers.R0 = 0xAB;
    // STORE [0x0100], R0 — addr little-endian: lo=0x00, hi=0x01
    writeBytes(vm, 0, [OP_STORE_ABS, 0, 0x00, 0x01]);
    const s1 = step(vm);
    expect(s1.memory[0x0100]).toBe(0xAB);

    // Now LOAD R1, [0x0100]
    writeBytes(s1, s1.registers.PC, [OP_LOAD_ABS, 1, 0x00, 0x01]);
    const s2 = step(s1);
    expect(s2.registers.R1).toBe(0xAB);
  });

  it('LOAD from absolute address', () => {
    const vm = createVM();
    vm.memory[0x0080] = 0x77;
    // LOAD R2, [0x0080] — lo=0x80, hi=0x00
    writeBytes(vm, 0, [OP_LOAD_ABS, 2, 0x80, 0x00]);
    const next = step(vm);
    expect(next.registers.R2).toBe(0x77);
    expect(next.registers.PC).toBe(4);
  });
});

describe('step — LOAD/STORE indirect', () => {
  it('STORE indirect then LOAD indirect round-trips a value', () => {
    const vm = createVM();
    // Set R2=0x00 (low), R3=0x02 (high) => address 0x0200
    vm.registers.R2 = 0x00;
    vm.registers.R3 = 0x02;
    vm.registers.R5 = 0xCD;
    // STORE [R2], R5 — address from register pair R2(lo),R3(hi) = 0x0200
    writeBytes(vm, 0, [OP_STORE_IND, 2, 5]);
    const s1 = step(vm);
    expect(s1.memory[0x0200]).toBe(0xCD);

    // LOAD R7, [R2] — same address pair
    writeBytes(s1, s1.registers.PC, [OP_LOAD_IND, 7, 2]);
    const s2 = step(s1);
    expect(s2.registers.R7).toBe(0xCD);
  });
});

describe('step — ADD', () => {
  it('adds Ry to Rx and stores in Rx', () => {
    const vm = createVM();
    vm.registers.R0 = 10;
    vm.registers.R1 = 20;
    // ADD R0, R1
    writeBytes(vm, 0, [OP_ADD, 0, 1]);
    const next = step(vm);
    expect(next.registers.R0).toBe(30);
    expect(next.registers.PC).toBe(3);
  });

  it('sets Z flag when result wraps to zero', () => {
    const vm = createVM();
    vm.registers.R0 = 0x80;
    vm.registers.R1 = 0x80;
    writeBytes(vm, 0, [OP_ADD, 0, 1]);
    const next = step(vm);
    expect(next.registers.R0).toBe(0);
    expect(next.registers.FLAGS & FLAG_Z).toBeTruthy();
  });

  it('wraps at 8-bit boundary', () => {
    const vm = createVM();
    vm.registers.R0 = 200;
    vm.registers.R1 = 100;
    writeBytes(vm, 0, [OP_ADD, 0, 1]);
    const next = step(vm);
    expect(next.registers.R0).toBe((200 + 100) & 0xFF); // 44
  });
});

describe('step — SUB', () => {
  it('subtracts Ry from Rx', () => {
    const vm = createVM();
    vm.registers.R0 = 30;
    vm.registers.R1 = 10;
    writeBytes(vm, 0, [OP_SUB, 0, 1]);
    const next = step(vm);
    expect(next.registers.R0).toBe(20);
  });

  it('sets C flag on underflow', () => {
    const vm = createVM();
    vm.registers.R0 = 3;
    vm.registers.R1 = 5;
    writeBytes(vm, 0, [OP_SUB, 0, 1]);
    const next = step(vm);
    expect(next.registers.FLAGS & FLAG_C).toBeTruthy();
  });

  it('sets Z flag when equal', () => {
    const vm = createVM();
    vm.registers.R0 = 7;
    vm.registers.R1 = 7;
    writeBytes(vm, 0, [OP_SUB, 0, 1]);
    const next = step(vm);
    expect(next.registers.R0).toBe(0);
    expect(next.registers.FLAGS & FLAG_Z).toBeTruthy();
  });
});

describe('step — INC', () => {
  it('increments register by 1', () => {
    const vm = createVM();
    vm.registers.R3 = 41;
    writeBytes(vm, 0, [OP_INC, 3]);
    const next = step(vm);
    expect(next.registers.R3).toBe(42);
    expect(next.registers.PC).toBe(2);
  });

  it('wraps from 255 to 0 and sets Z flag', () => {
    const vm = createVM();
    vm.registers.R0 = 255;
    writeBytes(vm, 0, [OP_INC, 0]);
    const next = step(vm);
    expect(next.registers.R0).toBe(0);
    expect(next.registers.FLAGS & FLAG_Z).toBeTruthy();
  });
});

describe('step — DEC', () => {
  it('decrements register by 1', () => {
    const vm = createVM();
    vm.registers.R0 = 10;
    writeBytes(vm, 0, [OP_DEC, 0]);
    const next = step(vm);
    expect(next.registers.R0).toBe(9);
    expect(next.registers.PC).toBe(2);
  });

  it('wraps from 0 to 255 and sets N and C flags', () => {
    const vm = createVM();
    vm.registers.R0 = 0;
    writeBytes(vm, 0, [OP_DEC, 0]);
    const next = step(vm);
    expect(next.registers.R0).toBe(255);
    expect(next.registers.FLAGS & FLAG_N).toBeTruthy();
    expect(next.registers.FLAGS & FLAG_C).toBeTruthy();
  });
});

describe('step — CMP', () => {
  it('sets Z flag when registers are equal without modifying them', () => {
    const vm = createVM();
    vm.registers.R0 = 42;
    vm.registers.R1 = 42;
    writeBytes(vm, 0, [OP_CMP, 0, 1]);
    const next = step(vm);
    expect(next.registers.FLAGS & FLAG_Z).toBeTruthy();
    // Registers must remain unchanged
    expect(next.registers.R0).toBe(42);
    expect(next.registers.R1).toBe(42);
  });

  it('sets C flag when Rx < Ry (unsigned)', () => {
    const vm = createVM();
    vm.registers.R0 = 3;
    vm.registers.R1 = 10;
    writeBytes(vm, 0, [OP_CMP, 0, 1]);
    const next = step(vm);
    expect(next.registers.FLAGS & FLAG_C).toBeTruthy();
    expect(next.registers.FLAGS & FLAG_Z).toBeFalsy();
  });

  it('clears C and Z flags when Rx > Ry', () => {
    const vm = createVM();
    vm.registers.R0 = 10;
    vm.registers.R1 = 3;
    writeBytes(vm, 0, [OP_CMP, 0, 1]);
    const next = step(vm);
    expect(next.registers.FLAGS & FLAG_C).toBeFalsy();
    expect(next.registers.FLAGS & FLAG_Z).toBeFalsy();
  });
});

describe('step — JMP', () => {
  it('sets PC to target address', () => {
    const vm = createVM();
    // JMP 0x0010 — lo=0x10, hi=0x00
    writeBytes(vm, 0, [OP_JMP, 0x10, 0x00]);
    const next = step(vm);
    expect(next.registers.PC).toBe(0x0010);
    expect(next.cycle).toBe(1);
  });
});

describe('step — JZ', () => {
  it('jumps when Z flag is set', () => {
    const vm = createVM();
    vm.registers.FLAGS = FLAG_Z;
    writeBytes(vm, 0, [OP_JZ, 0x20, 0x00]);
    const next = step(vm);
    expect(next.registers.PC).toBe(0x0020);
  });

  it('falls through when Z flag is clear', () => {
    const vm = createVM();
    vm.registers.FLAGS = 0;
    writeBytes(vm, 0, [OP_JZ, 0x20, 0x00]);
    const next = step(vm);
    expect(next.registers.PC).toBe(3); // instruction size
  });
});

describe('step — JNZ', () => {
  it('jumps when Z flag is clear', () => {
    const vm = createVM();
    vm.registers.FLAGS = 0;
    writeBytes(vm, 0, [OP_JNZ, 0x30, 0x00]);
    const next = step(vm);
    expect(next.registers.PC).toBe(0x0030);
  });

  it('falls through when Z flag is set', () => {
    const vm = createVM();
    vm.registers.FLAGS = FLAG_Z;
    writeBytes(vm, 0, [OP_JNZ, 0x30, 0x00]);
    const next = step(vm);
    expect(next.registers.PC).toBe(3);
  });
});

describe('step — JG', () => {
  it('jumps when Z=0 and C=0 (greater)', () => {
    const vm = createVM();
    vm.registers.FLAGS = 0; // no flags
    writeBytes(vm, 0, [OP_JG, 0x40, 0x00]);
    const next = step(vm);
    expect(next.registers.PC).toBe(0x0040);
  });

  it('falls through when Z=1', () => {
    const vm = createVM();
    vm.registers.FLAGS = FLAG_Z;
    writeBytes(vm, 0, [OP_JG, 0x40, 0x00]);
    const next = step(vm);
    expect(next.registers.PC).toBe(3);
  });

  it('falls through when C=1', () => {
    const vm = createVM();
    vm.registers.FLAGS = FLAG_C;
    writeBytes(vm, 0, [OP_JG, 0x40, 0x00]);
    const next = step(vm);
    expect(next.registers.PC).toBe(3);
  });
});

describe('step — JL', () => {
  it('jumps when C=1 (less than)', () => {
    const vm = createVM();
    vm.registers.FLAGS = FLAG_C;
    writeBytes(vm, 0, [OP_JL, 0x50, 0x00]);
    const next = step(vm);
    expect(next.registers.PC).toBe(0x0050);
  });

  it('falls through when C=0', () => {
    const vm = createVM();
    vm.registers.FLAGS = 0;
    writeBytes(vm, 0, [OP_JL, 0x50, 0x00]);
    const next = step(vm);
    expect(next.registers.PC).toBe(3);
  });
});

describe('step — PUSH and POP', () => {
  it('PUSH writes value to stack and decrements SP', () => {
    const vm = createVM(256);
    vm.registers.R0 = 0xAB;
    const origSP = vm.registers.SP; // 255
    writeBytes(vm, 0, [OP_PUSH, 0]);
    const next = step(vm);
    expect(next.memory[origSP]).toBe(0xAB);
    expect(next.registers.SP).toBe(origSP - 1);
    expect(next.registers.PC).toBe(2);
  });

  it('POP reads value from stack and increments SP', () => {
    const vm = createVM(256);
    // Simulate a previously pushed value
    vm.registers.SP = 253;
    vm.memory[254] = 0xCD;
    writeBytes(vm, 0, [OP_POP, 1]);
    const next = step(vm);
    expect(next.registers.R1).toBe(0xCD);
    expect(next.registers.SP).toBe(254);
    expect(next.registers.PC).toBe(2);
  });

  it('PUSH then POP round-trips a value', () => {
    const vm = createVM(256);
    vm.registers.R0 = 0x42;
    writeBytes(vm, 0, [OP_PUSH, 0, OP_POP, 1]);
    const s1 = step(vm);
    const s2 = step(s1);
    expect(s2.registers.R1).toBe(0x42);
    expect(s2.registers.SP).toBe(vm.registers.SP); // back to original
  });
});

describe('step — CALL and RET', () => {
  it('CALL pushes return address and jumps', () => {
    const vm = createVM(256);
    // CALL 0x0050 at PC=0; return addr = PC+3 = 3
    writeBytes(vm, 0, [OP_CALL, 0x50, 0x00]);
    const next = step(vm);
    expect(next.registers.PC).toBe(0x0050);
    // Return address (3 = 0x0003) pushed to stack as two bytes
    // SP should have decreased by 2
    expect(next.registers.SP).toBe(vm.registers.SP - 2);
  });

  it('RET pops return address and jumps back', () => {
    const vm = createVM(256);
    // CALL 0x0080 at PC=0
    writeBytes(vm, 0, [OP_CALL, 0x80, 0x00]);
    // Put RET at 0x0080
    writeBytes(vm, 0x0080, [OP_RET]);
    const afterCall = step(vm);
    expect(afterCall.registers.PC).toBe(0x0080);

    const afterRet = step(afterCall);
    expect(afterRet.registers.PC).toBe(3); // returned to address after CALL
  });

  it('CALL from non-zero PC pushes correct return address', () => {
    const vm = createVM(256);
    // NOP at 0, then CALL at 1
    writeBytes(vm, 0, [OP_NOP, OP_CALL, 0x40, 0x00]);
    const s1 = step(vm); // NOP, PC -> 1
    const s2 = step(s1); // CALL, return addr = 1+3 = 4
    expect(s2.registers.PC).toBe(0x0040);

    // RET at 0x0040
    writeBytes(s2, 0x0040, [OP_RET]);
    const s3 = step(s2);
    expect(s3.registers.PC).toBe(4);
  });
});

describe('step — error handling', () => {
  it('halts with error on invalid opcode', () => {
    const vm = createVM();
    writeBytes(vm, 0, [0xFF]); // invalid opcode
    const next = step(vm);
    expect(next.halted).toBe(true);
    expect(next.error).toBeDefined();
    expect(next.error).toContain('opcode');
  });

  it('halts with error when PC is out of bounds', () => {
    const vm = createVM(16);
    vm.registers.PC = 20; // beyond memory
    const next = step(vm);
    expect(next.halted).toBe(true);
    expect(next.error).toBeDefined();
  });

  it('returns same state when already halted', () => {
    const vm = createVM();
    vm.halted = true;
    vm.cycle = 5;
    const next = step(vm);
    expect(next.halted).toBe(true);
    expect(next.cycle).toBe(5);
  });

  it('halts with error on memory out of bounds (LOAD absolute)', () => {
    const vm = createVM(256);
    // LOAD R0, [0xFFFF] — way beyond 256 bytes
    writeBytes(vm, 0, [OP_LOAD_ABS, 0, 0xFF, 0xFF]);
    const next = step(vm);
    expect(next.halted).toBe(true);
    expect(next.error).toBeDefined();
    expect(next.error).toContain('memory');
  });

  it('halts with error on memory out of bounds (STORE absolute)', () => {
    const vm = createVM(256);
    vm.registers.R0 = 1;
    writeBytes(vm, 0, [OP_STORE_ABS, 0, 0xFF, 0xFF]);
    const next = step(vm);
    expect(next.halted).toBe(true);
    expect(next.error).toBeDefined();
  });

  it('halts with error on stack overflow (PUSH when SP < 0)', () => {
    const vm = createVM(256);
    vm.registers.SP = 0; // next push will underflow SP to -1
    vm.registers.R0 = 1;
    writeBytes(vm, 4, [OP_PUSH, 0]); // put instruction safely away from SP=0 area
    vm.registers.PC = 4;
    const next = step(vm);
    expect(next.halted).toBe(true);
    expect(next.error).toBeDefined();
    expect(next.error).toMatch(/stack|overflow/i);
  });

  it('halts with error on stack underflow (POP when SP at top)', () => {
    const vm = createVM(256);
    vm.registers.SP = 255; // stack is empty (SP at initial position)
    writeBytes(vm, 0, [OP_POP, 0]);
    const next = step(vm);
    expect(next.halted).toBe(true);
    expect(next.error).toBeDefined();
    expect(next.error).toMatch(/stack|underflow/i);
  });
});
