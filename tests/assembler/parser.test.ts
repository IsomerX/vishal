import { describe, it, expect } from 'vitest';
import { assemble } from '../../src/assembler/parser';
import {
  OP_NOP, OP_HLT, OP_MOV_IMM, OP_MOV_REG,
  OP_LOAD_ABS, OP_STORE_ABS, OP_LOAD_IND, OP_STORE_IND,
  OP_ADD, OP_SUB, OP_INC, OP_DEC, OP_AND, OP_OR, OP_XOR, OP_SHL, OP_SHR, OP_CMP,
  OP_JMP, OP_JZ, OP_JNZ, OP_JG, OP_JL,
  OP_PUSH, OP_POP, OP_CALL, OP_RET, OP_VSTORE, OP_VLOAD, OP_VCOPY,
} from '../../src/vm/opcodes';

describe('Assembler Parser', () => {
  describe('simple instructions', () => {
    it('NOP assembles to [0x00]', () => {
      const result = assemble('NOP');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_NOP]);
    });

    it('HLT assembles to [0x01]', () => {
      const result = assemble('HLT');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_HLT]);
    });

    it('RET assembles to [0x53]', () => {
      const result = assemble('RET');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_RET]);
    });

    it('NOP then HLT assembles to [0x00, 0x01]', () => {
      const result = assemble('NOP\nHLT');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_NOP, OP_HLT]);
    });
  });

  describe('MOV instruction', () => {
    it('MOV Rx, imm → [0x10, reg, value]', () => {
      const result = assemble('MOV R0, 42');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_MOV_IMM, 0, 42]);
    });

    it('MOV Rx, hex imm → [0x10, reg, value]', () => {
      const result = assemble('MOV R3, 0xFF');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_MOV_IMM, 3, 0xFF]);
    });

    it('MOV Rx, Ry → [0x11, reg1, reg2]', () => {
      const result = assemble('MOV R0, R1');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_MOV_REG, 0, 1]);
    });

    it('MOV R5, R7 → [0x11, 5, 7]', () => {
      const result = assemble('MOV R5, R7');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_MOV_REG, 5, 7]);
    });
  });

  describe('LOAD instruction', () => {
    it('LOAD Rx, [addr] → [0x12, reg, addrLo, addrHi]', () => {
      const result = assemble('LOAD R1, [0x0040]');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_LOAD_ABS, 1, 0x40, 0x00]);
    });

    it('LOAD Rx, [Ry] → [0x14, reg1, reg2]', () => {
      const result = assemble('LOAD R6, [R4]');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_LOAD_IND, 6, 4]);
    });

    it('LOAD with small decimal address', () => {
      const result = assemble('LOAD R0, [16]');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_LOAD_ABS, 0, 16, 0]);
    });

    it('LOAD with label address resolves correctly', () => {
      const result = assemble('value:\nDB 0x2A\nLOAD R0, [value]');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([0x2A, OP_LOAD_ABS, 0, 0x00, 0x00]);
    });
  });

  describe('STORE instruction', () => {
    it('STORE [addr], Rx → [0x13, reg, addrLo, addrHi]', () => {
      const result = assemble('STORE [0x0100], R2');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_STORE_ABS, 2, 0x00, 0x01]);
    });

    it('STORE [Rx], Ry → [0x15, reg1, reg2]', () => {
      const result = assemble('STORE [R4], R6');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_STORE_IND, 4, 6]);
    });

    it('STORE with label address resolves correctly', () => {
      const result = assemble('slot:\nDB 0x00\nSTORE [slot], R2');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([0x00, OP_STORE_ABS, 2, 0x00, 0x00]);
    });
  });

  describe('ALU instructions', () => {
    it('ADD R0, R1 → [0x20, 0, 1]', () => {
      const result = assemble('ADD R0, R1');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_ADD, 0, 1]);
    });

    it('SUB R2, R3 → [0x21, 2, 3]', () => {
      const result = assemble('SUB R2, R3');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_SUB, 2, 3]);
    });

    it('CMP R6, R7 → [0x30, 6, 7]', () => {
      const result = assemble('CMP R6, R7');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_CMP, 6, 7]);
    });

    it('AND R0, R1 → [0x24, 0, 1]', () => {
      const result = assemble('AND R0, R1');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_AND, 0, 1]);
    });

    it('OR R2, R3 → [0x25, 2, 3]', () => {
      const result = assemble('OR R2, R3');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_OR, 2, 3]);
    });

    it('XOR R4, R5 → [0x26, 4, 5]', () => {
      const result = assemble('XOR R4, R5');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_XOR, 4, 5]);
    });

    it('SHL R6, R7 → [0x27, 6, 7]', () => {
      const result = assemble('SHL R6, R7');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_SHL, 6, 7]);
    });

    it('SHR R1, R0 → [0x28, 1, 0]', () => {
      const result = assemble('SHR R1, R0');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_SHR, 1, 0]);
    });
  });

  describe('INC/DEC instructions', () => {
    it('INC R4 → [0x22, 4]', () => {
      const result = assemble('INC R4');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_INC, 4]);
    });

    it('DEC R3 → [0x23, 3]', () => {
      const result = assemble('DEC R3');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_DEC, 3]);
    });
  });

  describe('PUSH/POP instructions', () => {
    it('PUSH R0 → [0x50, 0]', () => {
      const result = assemble('PUSH R0');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_PUSH, 0]);
    });

    it('POP R7 → [0x51, 7]', () => {
      const result = assemble('POP R7');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_POP, 7]);
    });
  });

  describe('VRAM instructions', () => {
    it('VSTORE [addr], Rx → [0x60, reg, addrLo, addrHi]', () => {
      const result = assemble('VSTORE [0x0100], R2');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_VSTORE, 2, 0x00, 0x01]);
    });

    it('VLOAD Rx, [addr] → [0x61, reg, addrLo, addrHi]', () => {
      const result = assemble('VLOAD R3, [0x001F]');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_VLOAD, 3, 0x1F, 0x00]);
    });

    it('VCOPY Rx → [0x62, reg]', () => {
      const result = assemble('VCOPY R0');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_VCOPY, 0]);
    });

    it('VLOAD with label resolves correctly', () => {
      const src = 'pixel:\nDB 0x00\nVLOAD R1, [pixel]';
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([0x00, OP_VLOAD, 1, 0x00, 0x00]);
    });

    it('VSTORE with label resolves correctly', () => {
      const src = 'target:\nDB 0x00\nVSTORE [target], R4';
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([0x00, OP_VSTORE, 4, 0x00, 0x00]);
    });
  });

  describe('jump instructions with labels', () => {
    it('JMP with label resolves correctly', () => {
      const src = 'start:\nNOP\nJMP start';
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      // start: is at address 0
      // NOP is at address 0 (1 byte)
      // JMP start is at address 1 (3 bytes): [0x40, 0x00, 0x00]
      expect([...result.bytecode]).toEqual([OP_NOP, OP_JMP, 0x00, 0x00]);
    });

    it('JMP with forward label resolves correctly', () => {
      const src = 'JMP end\nNOP\nend:\nHLT';
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      // JMP end: address 0 (3 bytes) → [0x40, lo, hi] where end is at address 4
      // NOP: address 3 (1 byte)
      // end: label at address 4
      // HLT: address 4 (1 byte)
      expect([...result.bytecode]).toEqual([OP_JMP, 0x04, 0x00, OP_NOP, OP_HLT]);
    });

    it('JZ with label', () => {
      const src = 'loop:\nJZ loop';
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_JZ, 0x00, 0x00]);
    });

    it('JNZ with label', () => {
      const src = 'loop:\nJNZ loop';
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_JNZ, 0x00, 0x00]);
    });

    it('JG with label', () => {
      const src = 'target:\nJG target';
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_JG, 0x00, 0x00]);
    });

    it('JL with label', () => {
      const src = 'target:\nJL target';
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_JL, 0x00, 0x00]);
    });

    it('JMP with numeric address', () => {
      const result = assemble('JMP 0x0010');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_JMP, 0x10, 0x00]);
    });
  });

  describe('CALL/RET instructions', () => {
    it('CALL with label', () => {
      const src = 'func:\nRET\nCALL func';
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      // func: at 0
      // RET: address 0 (1 byte)
      // CALL func: address 1 (3 bytes) → [0x52, 0x00, 0x00]
      expect([...result.bytecode]).toEqual([OP_RET, OP_CALL, 0x00, 0x00]);
    });

    it('CALL with numeric address', () => {
      const result = assemble('CALL 0x0020');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([OP_CALL, 0x20, 0x00]);
    });
  });

  describe('DB directive', () => {
    it('DB emits raw bytes', () => {
      const result = assemble('DB 0x37, 0x0A, 0x73');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([0x37, 0x0A, 0x73]);
    });

    it('DB with decimal values', () => {
      const result = assemble('DB 1, 2, 3');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([1, 2, 3]);
    });

    it('DB with string emits character codes', () => {
      const result = assemble('DB "AB"');
      expect(result.errors).toEqual([]);
      expect([...result.bytecode]).toEqual([0x41, 0x42]);
    });
  });

  describe('metadata', () => {
    it('code-only program has correct metadata', () => {
      const result = assemble('NOP\nHLT');
      expect(result.errors).toEqual([]);
      expect(result.metadata.codeStart).toBe(0);
      expect(result.metadata.codeEnd).toBe(1);
    });

    it('program with data has correct metadata', () => {
      const src = 'NOP\nHLT\ndata:\nDB 0x01, 0x02, 0x03';
      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect(result.metadata.codeStart).toBe(0);
      expect(result.metadata.codeEnd).toBe(1);
      expect(result.metadata.dataStart).toBe(2);
      expect(result.metadata.dataEnd).toBe(4);
    });
  });

  describe('error handling', () => {
    it('undefined label reports error', () => {
      const result = assemble('JMP nowhere');
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toMatch(/undefined.*label|label.*not.*found|unknown.*label/i);
    });
  });

  describe('full programs', () => {
    it('bubble sort program assembles without errors', () => {
      const src = [
        '  MOV R0, 0x40',
        '  MOV R1, 0x00',
        '  MOV R2, 9',
        'outer:',
        '  MOV R3, R2',
        '  MOV R4, 0x40',
        '  MOV R5, 0x00',
        'inner:',
        '  LOAD R6, [R4]',
        '  INC R4',
        '  LOAD R7, [R4]',
        '  CMP R6, R7',
        '  JL no_swap',
        '  STORE [R4], R6',
        '  DEC R4',
        '  STORE [R4], R7',
        '  INC R4',
        'no_swap:',
        '  DEC R3',
        '  JNZ inner',
        '  DEC R2',
        '  JNZ outer',
        '  HLT',
        'data:',
        '  DB 0x37, 0x0A, 0x73, 0x1F, 0x55, 0x02, 0x8B, 0x44, 0x19, 0x61',
      ].join('\n');

      const result = assemble(src);
      expect(result.errors).toEqual([]);
      expect(result.bytecode.length).toBeGreaterThan(0);

      // Verify some key bytes
      // First instruction: MOV R0, 0x40 → [0x10, 0, 0x40]
      expect(result.bytecode[0]).toBe(OP_MOV_IMM);
      expect(result.bytecode[1]).toBe(0);
      expect(result.bytecode[2]).toBe(0x40);

      // Last code instruction: HLT
      // Data starts after HLT
      expect(result.metadata.dataStart).toBeGreaterThan(0);
      expect(result.metadata.dataEnd).toBe(result.bytecode.length - 1);

      // Verify data bytes at the end
      const dataBytes = [...result.bytecode.slice(result.metadata.dataStart)];
      expect(dataBytes).toEqual([0x37, 0x0A, 0x73, 0x1F, 0x55, 0x02, 0x8B, 0x44, 0x19, 0x61]);
    });
  });
});
