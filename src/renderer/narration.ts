import { VMState, REG_NAMES, FLAG_Z, FLAG_C } from '../vm/types';
import {
  OP_NOP, OP_HLT, OP_MOV_IMM, OP_MOV_REG,
  OP_LOAD_ABS, OP_STORE_ABS, OP_LOAD_IND, OP_STORE_IND,
  OP_ADD, OP_SUB, OP_INC, OP_DEC, OP_CMP,
  OP_JMP, OP_JZ, OP_JNZ, OP_JG, OP_JL,
  OP_PUSH, OP_POP, OP_CALL, OP_RET,
  INSTRUCTION_SIZE,
} from '../vm/opcodes';

const R = (i: number) => REG_NAMES[i] ?? `R${i}`;
const hex = (v: number) => '0x' + v.toString(16).toUpperCase().padStart(2, '0');
const hex16 = (v: number) => '0x' + v.toString(16).toUpperCase().padStart(4, '0');

/**
 * Produce a human-readable description of what the instruction at PC will do,
 * given the current register/memory state.
 */
export function describeNextInstruction(state: VMState): string {
  if (state.halted) {
    return state.error ? `Halted: ${state.error}` : 'Program has finished (HLT).';
  }

  const mem = state.memory;
  const regs = state.registers;
  const pc = regs.PC;

  if (pc >= mem.length) return 'PC is out of bounds — execution will halt.';

  const op = mem[pc];
  const size = INSTRUCTION_SIZE[op];
  if (size === undefined) return `Unknown opcode ${hex(op)} — execution will halt.`;

  const b = (off: number) => mem[pc + off];
  const addr16 = (off: number) => b(off) | (b(off + 1) << 8);
  const rx = b(1);
  const ry = b(2);

  const rxName = R(rx);
  const ryName = R(ry);
  const rxVal = regs[R(rx) as keyof typeof regs] as number;
  const ryVal = regs[R(ry) as keyof typeof regs] as number;

  switch (op) {
    case OP_NOP:
      return 'Do nothing (NOP) — just advance to the next instruction.';

    case OP_HLT:
      return 'Halt the program — execution stops here.';

    case OP_MOV_IMM:
      return `Set ${rxName} to ${b(2)} (${hex(b(2))}). Currently ${rxName} = ${rxVal}.`;

    case OP_MOV_REG:
      return `Copy ${ryName} into ${rxName}. ${ryName} is ${ryVal}, so ${rxName} becomes ${ryVal}.`;

    case OP_LOAD_ABS: {
      const a = addr16(2);
      const val = a < mem.length ? mem[a] : '??';
      return `Load the byte at address ${hex16(a)} into ${rxName}. Memory[${hex16(a)}] = ${val}, so ${rxName} becomes ${val}.`;
    }

    case OP_STORE_ABS: {
      const a = addr16(2);
      return `Store ${rxName} (${rxVal}) into memory at address ${hex16(a)}.`;
    }

    case OP_LOAD_IND: {
      const lo = regs[R(ry) as keyof typeof regs] as number;
      const hi = regs[R(ry + 1) as keyof typeof regs] as number;
      const a = (hi << 8) | lo;
      const val = a < mem.length ? mem[a] : '??';
      return `Load byte from address ${hex16(a)} (from register pair ${R(ry)}:${R(ry + 1)}) into ${rxName}. Value at that address = ${val}.`;
    }

    case OP_STORE_IND: {
      const lo = regs[R(rx) as keyof typeof regs] as number;
      const hi = regs[R(rx + 1) as keyof typeof regs] as number;
      const a = (hi << 8) | lo;
      return `Store ${ryName} (${ryVal}) to address ${hex16(a)} (from register pair ${R(rx)}:${R(rx + 1)}).`;
    }

    case OP_ADD:
      return `Add ${ryName} (${ryVal}) to ${rxName} (${rxVal}). Result: ${rxName} = ${(rxVal + ryVal) & 0xFF}.`;

    case OP_SUB:
      return `Subtract ${ryName} (${ryVal}) from ${rxName} (${rxVal}). Result: ${rxName} = ${(rxVal - ryVal) & 0xFF}.`;

    case OP_INC:
      return `Increment ${rxName} by 1. Currently ${rxVal}, will become ${(rxVal + 1) & 0xFF}.`;

    case OP_DEC:
      return `Decrement ${rxName} by 1. Currently ${rxVal}, will become ${(rxVal - 1) & 0xFF}.`;

    case OP_CMP: {
      const diff = rxVal - ryVal;
      let relation = 'equal to';
      if (diff > 0 || (rxVal > ryVal)) relation = 'greater than';
      if (rxVal < ryVal) relation = 'less than';
      return `Compare ${rxName} (${rxVal}) with ${ryName} (${ryVal}). ${rxVal} is ${relation} ${ryVal}. Flags updated.`;
    }

    case OP_JMP:
      return `Jump to address ${hex16(addr16(1))}. Execution continues there.`;

    case OP_JZ: {
      const will = (regs.FLAGS & FLAG_Z) !== 0;
      return `Jump to ${hex16(addr16(1))} if last result was zero. Zero flag is ${will ? 'SET' : 'CLEAR'} — will ${will ? 'JUMP' : 'fall through to next instruction'}.`;
    }

    case OP_JNZ: {
      const will = (regs.FLAGS & FLAG_Z) === 0;
      return `Jump to ${hex16(addr16(1))} if last result was NOT zero. Zero flag is ${!will ? 'SET' : 'CLEAR'} — will ${will ? 'JUMP' : 'fall through to next instruction'}.`;
    }

    case OP_JG: {
      const z = (regs.FLAGS & FLAG_Z) !== 0;
      const c = (regs.FLAGS & FLAG_C) !== 0;
      const will = !z && !c;
      return `Jump to ${hex16(addr16(1))} if greater (unsigned). Z=${z ? 1 : 0}, C=${c ? 1 : 0} — will ${will ? 'JUMP' : 'fall through'}.`;
    }

    case OP_JL: {
      const c = (regs.FLAGS & FLAG_C) !== 0;
      return `Jump to ${hex16(addr16(1))} if less (unsigned). Carry=${c ? 1 : 0} — will ${c ? 'JUMP' : 'fall through'}.`;
    }

    case OP_PUSH:
      return `Push ${rxName} (${rxVal}) onto the stack. SP moves from ${hex16(regs.SP)} to ${hex16(regs.SP - 1)}.`;

    case OP_POP:
      return `Pop top of stack into ${rxName}. SP moves from ${hex16(regs.SP)} to ${hex16(regs.SP + 1)}.`;

    case OP_CALL:
      return `Call subroutine at ${hex16(addr16(1))}. Pushes return address ${hex16(pc + 3)} onto the stack.`;

    case OP_RET: {
      const lo = mem[regs.SP + 1] ?? 0;
      const hi = mem[regs.SP + 2] ?? 0;
      const retAddr = (hi << 8) | lo;
      return `Return from subroutine. Popping return address ${hex16(retAddr)} from the stack.`;
    }

    default:
      return `Unknown instruction ${hex(op)}.`;
  }
}

/**
 * Compute memory usage statistics.
 */
export interface MemoryStats {
  total: number;
  nonZero: number;
  codeBytes: number;
  stackBytes: number;
  percentUsed: number;
}

export function computeMemoryStats(state: VMState, codeEnd: number): MemoryStats {
  const mem = state.memory;
  const total = mem.length;
  let nonZero = 0;
  for (let i = 0; i < total; i++) {
    if (mem[i] !== 0) nonZero++;
  }

  const codeBytes = Math.max(0, codeEnd + 1);
  const stackBytes = Math.max(0, total - 1 - state.registers.SP);
  const percentUsed = total > 0 ? (nonZero / total) * 100 : 0;

  return { total, nonZero, codeBytes, stackBytes, percentUsed };
}

/**
 * Update the narration panel DOM.
 */
export function updateNarration(container: HTMLElement, state: VMState): void {
  const text = describeNextInstruction(state);
  if (container.textContent !== text) {
    container.textContent = text;
  }
}

/**
 * Update the memory stats panel DOM.
 */
export function updateMemoryStats(container: HTMLElement, stats: MemoryStats): void {
  const html =
    `<div class="stat-row"><span class="stat-label">Total</span><span class="stat-value">${formatBytes(stats.total)}</span></div>` +
    `<div class="stat-row"><span class="stat-label">Used (non-zero)</span><span class="stat-value">${stats.nonZero} bytes (${stats.percentUsed.toFixed(1)}%)</span></div>` +
    `<div class="stat-row"><span class="stat-label">Code</span><span class="stat-value">${stats.codeBytes} bytes</span></div>` +
    `<div class="stat-row"><span class="stat-label">Stack</span><span class="stat-value">${stats.stackBytes} bytes</span></div>` +
    `<div class="stat-bar"><div class="stat-bar-fill" style="width: ${Math.min(100, stats.percentUsed)}%"></div></div>`;

  container.innerHTML = html;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}
