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
 * Compute flags for bitwise operations (AND, OR, XOR).
 * Sets Z and N from the 8-bit result. Clears C and V.
 */
export function computeBitwiseFlags(result: number): number {
  const result8 = result & 0xFF;
  let flags = 0;

  if (result8 === 0) flags |= FLAG_Z;
  if (result8 & 0x80) flags |= FLAG_N;

  return flags;
}

/**
 * Compute flags for logical shifts.
 * Sets Z and N from the shifted result, sets C to the last bit shifted out,
 * and always clears V.
 */
export function computeShiftFlags(original: number, shiftAmount: number, isLeft: boolean): number {
  const value = original & 0xFF;
  const amount = shiftAmount & 0xFF;
  const result =
    amount >= 8
      ? 0
      : isLeft
        ? (value << amount) & 0xFF
        : (value >>> amount) & 0xFF;

  let flags = computeBitwiseFlags(result);

  if (amount > 0 && amount < 8) {
    const carry = isLeft
      ? (value >> (8 - amount)) & 0x01
      : (value >> (amount - 1)) & 0x01;
    if (carry !== 0) flags |= FLAG_C;
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
