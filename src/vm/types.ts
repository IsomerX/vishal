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
