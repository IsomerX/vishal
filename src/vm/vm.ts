import {
  VMState, RegIndex,
  getRegValue, setRegValue,
} from './types';
import {
  OP_NOP, OP_HLT,
  OP_MOV_IMM, OP_MOV_REG,
  OP_LOAD_ABS, OP_STORE_ABS, OP_LOAD_IND, OP_STORE_IND,
  OP_ADD, OP_SUB, OP_INC, OP_DEC,
  OP_CMP,
  OP_JMP, OP_JZ, OP_JNZ, OP_JG, OP_JL,
  OP_PUSH, OP_POP, OP_CALL, OP_RET,
  INSTRUCTION_SIZE,
} from './opcodes';
import { computeFlags, checkCondition } from './flags';

/**
 * Create a fresh VM state.
 */
export function createVM(memorySize = 4096): VMState {
  return {
    memory: new Uint8Array(memorySize),
    registers: {
      PC: 0,
      SP: memorySize - 1,
      R0: 0, R1: 0, R2: 0, R3: 0,
      R4: 0, R5: 0, R6: 0, R7: 0,
      FLAGS: 0,
    },
    halted: false,
    cycle: 0,
  };
}

/**
 * Deep-clone a VM state (immutable stepping).
 */
export function cloneState(state: VMState): VMState {
  return {
    memory: new Uint8Array(state.memory),
    registers: { ...state.registers },
    halted: state.halted,
    error: state.error,
    cycle: state.cycle,
  };
}

/**
 * Execute one instruction and return the new state.
 * The original state is never mutated.
 */
export function step(state: VMState): VMState {
  // If already halted, return a clone as-is
  if (state.halted) {
    return cloneState(state);
  }

  const s = cloneState(state);
  const mem = s.memory;
  const regs = s.registers;
  const memSize = mem.length;

  // --- helpers -----------------------------------------------------------
  function halt(msg: string): VMState {
    s.halted = true;
    s.error = msg;
    return s;
  }

  function checkMemAddr(addr: number): boolean {
    return addr >= 0 && addr < memSize;
  }

  // --- PC bounds check ---------------------------------------------------
  if (regs.PC < 0 || regs.PC >= memSize) {
    return halt(`PC out of bounds: ${regs.PC}`);
  }

  // --- Fetch opcode ------------------------------------------------------
  const opcode = mem[regs.PC];
  const instrSize = INSTRUCTION_SIZE[opcode];
  if (instrSize === undefined) {
    return halt(`Invalid opcode 0x${opcode.toString(16).padStart(2, '0')} at PC=${regs.PC}`);
  }

  // Convenience: read bytes relative to PC
  const byte = (offset: number) => mem[regs.PC + offset];
  const addr16 = (loOff: number, hiOff: number) => byte(loOff) | (byte(hiOff) << 8);

  // --- Decode & Execute --------------------------------------------------
  switch (opcode) {
    // ---- Control --------------------------------------------------------
    case OP_NOP:
      break;

    case OP_HLT:
      s.halted = true;
      break;

    // ---- Data Movement --------------------------------------------------
    case OP_MOV_IMM: {
      const rx = byte(1) as RegIndex;
      setRegValue(regs, rx, byte(2));
      break;
    }

    case OP_MOV_REG: {
      const rx = byte(1) as RegIndex;
      const ry = byte(2) as RegIndex;
      setRegValue(regs, rx, getRegValue(regs, ry));
      break;
    }

    case OP_LOAD_ABS: {
      const rx = byte(1) as RegIndex;
      const addr = addr16(2, 3);
      if (!checkMemAddr(addr)) return halt(`LOAD: memory address out of bounds: ${addr}`);
      setRegValue(regs, rx, mem[addr]);
      break;
    }

    case OP_STORE_ABS: {
      const rx = byte(1) as RegIndex;
      const addr = addr16(2, 3);
      if (!checkMemAddr(addr)) return halt(`STORE: memory address out of bounds: ${addr}`);
      mem[addr] = getRegValue(regs, rx);
      break;
    }

    case OP_LOAD_IND: {
      const rx = byte(1) as RegIndex;
      const ry = byte(2) as RegIndex;
      const ryNext = ((ry + 1) & 7) as RegIndex;
      const addr = getRegValue(regs, ry) | (getRegValue(regs, ryNext) << 8);
      if (!checkMemAddr(addr)) return halt(`LOAD indirect: memory address out of bounds: ${addr}`);
      setRegValue(regs, rx, mem[addr]);
      break;
    }

    case OP_STORE_IND: {
      const rx = byte(1) as RegIndex;
      const ry = byte(2) as RegIndex;
      const rxNext = ((rx + 1) & 7) as RegIndex;
      const addr = getRegValue(regs, rx) | (getRegValue(regs, rxNext) << 8);
      if (!checkMemAddr(addr)) return halt(`STORE indirect: memory address out of bounds: ${addr}`);
      mem[addr] = getRegValue(regs, ry);
      break;
    }

    // ---- Arithmetic -----------------------------------------------------
    case OP_ADD: {
      const rx = byte(1) as RegIndex;
      const ry = byte(2) as RegIndex;
      const a = getRegValue(regs, rx);
      const b = getRegValue(regs, ry);
      const result = a + b;
      setRegValue(regs, rx, result);
      regs.FLAGS = computeFlags(a, b, result, true);
      break;
    }

    case OP_SUB: {
      const rx = byte(1) as RegIndex;
      const ry = byte(2) as RegIndex;
      const a = getRegValue(regs, rx);
      const b = getRegValue(regs, ry);
      const result = a - b;
      setRegValue(regs, rx, result);
      regs.FLAGS = computeFlags(a, b, result, false);
      break;
    }

    case OP_INC: {
      const rx = byte(1) as RegIndex;
      const a = getRegValue(regs, rx);
      const result = a + 1;
      setRegValue(regs, rx, result);
      regs.FLAGS = computeFlags(a, 1, result, true);
      break;
    }

    case OP_DEC: {
      const rx = byte(1) as RegIndex;
      const a = getRegValue(regs, rx);
      const result = a - 1;
      setRegValue(regs, rx, result);
      regs.FLAGS = computeFlags(a, 1, result, false);
      break;
    }

    // ---- Compare --------------------------------------------------------
    case OP_CMP: {
      const rx = byte(1) as RegIndex;
      const ry = byte(2) as RegIndex;
      const a = getRegValue(regs, rx);
      const b = getRegValue(regs, ry);
      const result = a - b;
      regs.FLAGS = computeFlags(a, b, result, false);
      // Do NOT store result — that's the difference from SUB
      break;
    }

    // ---- Jumps ----------------------------------------------------------
    case OP_JMP: {
      regs.PC = addr16(1, 2);
      s.cycle++;
      return s; // don't advance PC
    }

    case OP_JZ:
    case OP_JNZ:
    case OP_JG:
    case OP_JL: {
      if (checkCondition(opcode, regs.FLAGS)) {
        regs.PC = addr16(1, 2);
        s.cycle++;
        return s;
      }
      // fall through — advance PC normally
      break;
    }

    // ---- Stack ----------------------------------------------------------
    case OP_PUSH: {
      const rx = byte(1) as RegIndex;
      const val = getRegValue(regs, rx);
      mem[regs.SP] = val;
      regs.SP--;
      if (regs.SP < 0) return halt('Stack overflow: SP < 0');
      break;
    }

    case OP_POP: {
      const rx = byte(1) as RegIndex;
      regs.SP++;
      if (regs.SP >= memSize) return halt('Stack underflow: SP >= memory size');
      setRegValue(regs, rx, mem[regs.SP]);
      break;
    }

    case OP_CALL: {
      const target = addr16(1, 2);
      const retAddr = regs.PC + INSTRUCTION_SIZE[OP_CALL];
      // Push return address high byte first, then low byte
      const hi = (retAddr >> 8) & 0xFF;
      const lo = retAddr & 0xFF;
      mem[regs.SP] = hi;
      regs.SP--;
      if (regs.SP < 0) return halt('Stack overflow during CALL');
      mem[regs.SP] = lo;
      regs.SP--;
      if (regs.SP < 0) return halt('Stack overflow during CALL');
      regs.PC = target;
      s.cycle++;
      return s;
    }

    case OP_RET: {
      // Pop low byte first, then high byte
      regs.SP++;
      if (regs.SP >= memSize) return halt('Stack underflow during RET');
      const lo = mem[regs.SP];
      regs.SP++;
      if (regs.SP >= memSize) return halt('Stack underflow during RET');
      const hi = mem[regs.SP];
      regs.PC = (hi << 8) | lo;
      s.cycle++;
      return s;
    }

    default:
      return halt(`Invalid opcode 0x${opcode.toString(16).padStart(2, '0')} at PC=${regs.PC}`);
  }

  // Advance PC and increment cycle
  regs.PC += instrSize;
  s.cycle++;
  return s;
}
