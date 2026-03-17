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
