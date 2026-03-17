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
