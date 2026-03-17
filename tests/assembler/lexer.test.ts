import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/assembler/lexer';
import { Token, TokenType } from '../../src/assembler/types';

function tokensOf(source: string): Omit<Token, 'line'>[] {
  return tokenize(source).map(({ type, value }) => ({ type, value }));
}

function types(source: string): TokenType[] {
  return tokenize(source).map(t => t.type);
}

describe('Lexer', () => {
  describe('simple instructions', () => {
    it('tokenizes NOP', () => {
      const tokens = tokensOf('NOP');
      expect(tokens).toContainEqual({ type: 'INSTRUCTION', value: 'NOP' });
    });

    it('tokenizes HLT', () => {
      const tokens = tokensOf('HLT');
      expect(tokens).toContainEqual({ type: 'INSTRUCTION', value: 'HLT' });
    });

    it('tokenizes MOV with two registers', () => {
      const tokens = tokenize('MOV R0, R1');
      expect(tokens).toEqual([
        { type: 'INSTRUCTION', value: 'MOV', line: 1 },
        { type: 'REGISTER', value: 'R0', line: 1 },
        { type: 'COMMA', value: ',', line: 1 },
        { type: 'REGISTER', value: 'R1', line: 1 },
        { type: 'NEWLINE', value: '\n', line: 1 },
      ]);
    });

    it('tokenizes all instruction names', () => {
      const instructions = [
        'NOP', 'HLT', 'MOV', 'LOAD', 'STORE', 'ADD', 'SUB', 'INC', 'DEC',
        'CMP', 'JMP', 'JZ', 'JNZ', 'JG', 'JL', 'PUSH', 'POP', 'CALL', 'RET',
      ];
      for (const instr of instructions) {
        const tokens = tokensOf(instr);
        expect(tokens[0]).toEqual({ type: 'INSTRUCTION', value: instr });
      }
    });
  });

  describe('registers', () => {
    it('tokenizes R0 through R7', () => {
      for (let i = 0; i <= 7; i++) {
        const tokens = tokensOf(`R${i}`);
        expect(tokens[0]).toEqual({ type: 'REGISTER', value: `R${i}` });
      }
    });
  });

  describe('numbers', () => {
    it('tokenizes decimal numbers', () => {
      const tokens = tokensOf('42');
      expect(tokens[0]).toEqual({ type: 'NUMBER', value: '42' });
    });

    it('tokenizes hex numbers with 0x prefix', () => {
      const tokens = tokensOf('0xFF');
      expect(tokens[0]).toEqual({ type: 'NUMBER', value: '0xFF' });
    });

    it('tokenizes lowercase hex numbers', () => {
      const tokens = tokensOf('0xdeadbeef');
      expect(tokens[0]).toEqual({ type: 'NUMBER', value: '0xdeadbeef' });
    });

    it('tokenizes zero', () => {
      const tokens = tokensOf('0');
      expect(tokens[0]).toEqual({ type: 'NUMBER', value: '0' });
    });

    it('tokenizes negative numbers', () => {
      const tokens = tokensOf('-1');
      expect(tokens[0]).toEqual({ type: 'NUMBER', value: '-1' });
    });

    it('tokenizes MOV with hex immediate', () => {
      const tokens = tokenize('MOV R0, 0x10');
      expect(tokens[0]).toEqual({ type: 'INSTRUCTION', value: 'MOV', line: 1 });
      expect(tokens[1]).toEqual({ type: 'REGISTER', value: 'R0', line: 1 });
      expect(tokens[2]).toEqual({ type: 'COMMA', value: ',', line: 1 });
      expect(tokens[3]).toEqual({ type: 'NUMBER', value: '0x10', line: 1 });
    });
  });

  describe('labels', () => {
    it('tokenizes label definition', () => {
      const tokens = tokensOf('loop:');
      expect(tokens[0]).toEqual({ type: 'LABEL_DEF', value: 'loop' });
    });

    it('normalizes label def to lowercase', () => {
      const tokens = tokensOf('LOOP:');
      expect(tokens[0]).toEqual({ type: 'LABEL_DEF', value: 'loop' });
    });

    it('tokenizes label reference', () => {
      const tokens = tokensOf('JMP loop');
      expect(tokens[0]).toEqual({ type: 'INSTRUCTION', value: 'JMP' });
      expect(tokens[1]).toEqual({ type: 'LABEL_REF', value: 'loop' });
    });

    it('normalizes label ref to lowercase', () => {
      const tokens = tokensOf('JMP LOOP');
      expect(tokens[1]).toEqual({ type: 'LABEL_REF', value: 'loop' });
    });

    it('correctly tracks line number for label def', () => {
      const tokens = tokenize('NOP\nloop:');
      const labelDef = tokens.find(t => t.type === 'LABEL_DEF');
      expect(labelDef).toEqual({ type: 'LABEL_DEF', value: 'loop', line: 2 });
    });
  });

  describe('brackets', () => {
    it('tokenizes LBRACKET and RBRACKET', () => {
      const tokens = tokensOf('[R0]');
      expect(tokens[0]).toEqual({ type: 'LBRACKET', value: '[' });
      expect(tokens[1]).toEqual({ type: 'REGISTER', value: 'R0' });
      expect(tokens[2]).toEqual({ type: 'RBRACKET', value: ']' });
    });

    it('tokenizes LOAD with bracket addressing', () => {
      const tokens = tokenize('LOAD R1, [R2]');
      expect(tokens[0]).toEqual({ type: 'INSTRUCTION', value: 'LOAD', line: 1 });
      expect(tokens[1]).toEqual({ type: 'REGISTER', value: 'R1', line: 1 });
      expect(tokens[2]).toEqual({ type: 'COMMA', value: ',', line: 1 });
      expect(tokens[3]).toEqual({ type: 'LBRACKET', value: '[', line: 1 });
      expect(tokens[4]).toEqual({ type: 'REGISTER', value: 'R2', line: 1 });
      expect(tokens[5]).toEqual({ type: 'RBRACKET', value: ']', line: 1 });
    });
  });

  describe('comments', () => {
    it('strips inline comments', () => {
      const tokens = tokensOf('NOP ; this is a comment');
      expect(tokens).not.toContainEqual({ type: 'LABEL_REF', value: 'this' });
      expect(tokens[0]).toEqual({ type: 'INSTRUCTION', value: 'NOP' });
    });

    it('strips full-line comments', () => {
      const tokens = tokensOf('; entire line is comment');
      expect(types('; entire line is comment')).toEqual(['NEWLINE']);
    });

    it('does not include comment text as tokens', () => {
      const src = 'ADD R0, R1 ; add registers';
      const toks = tokensOf(src);
      const hasComment = toks.some(t => t.value.includes('add') || t.value.includes('registers'));
      expect(hasComment).toBe(false);
    });
  });

  describe('DB directive', () => {
    it('tokenizes DB directive', () => {
      const tokens = tokensOf('DB 42');
      expect(tokens[0]).toEqual({ type: 'DIRECTIVE', value: 'DB' });
      expect(tokens[1]).toEqual({ type: 'NUMBER', value: '42' });
    });

    it('tokenizes DB with label', () => {
      const tokens = tokenize('data: DB 0xFF');
      expect(tokens[0]).toEqual({ type: 'LABEL_DEF', value: 'data', line: 1 });
      expect(tokens[1]).toEqual({ type: 'DIRECTIVE', value: 'DB', line: 1 });
      expect(tokens[2]).toEqual({ type: 'NUMBER', value: '0xFF', line: 1 });
    });
  });

  describe('string literals', () => {
    it('tokenizes a simple string', () => {
      const tokens = tokensOf('"hello"');
      expect(tokens[0]).toEqual({ type: 'STRING', value: 'hello' });
    });

    it('tokenizes DB with string', () => {
      const tokens = tokensOf('DB "world"');
      expect(tokens[0]).toEqual({ type: 'DIRECTIVE', value: 'DB' });
      expect(tokens[1]).toEqual({ type: 'STRING', value: 'world' });
    });

    it('handles escape sequences in strings', () => {
      const tokens = tokensOf('"line1\\nline2"');
      expect(tokens[0]).toEqual({ type: 'STRING', value: 'line1\nline2' });
    });

    it('handles empty string', () => {
      const tokens = tokensOf('""');
      expect(tokens[0]).toEqual({ type: 'STRING', value: '' });
    });
  });

  describe('case insensitivity', () => {
    it('normalizes lowercase instructions to uppercase', () => {
      const tokens = tokensOf('nop');
      expect(tokens[0]).toEqual({ type: 'INSTRUCTION', value: 'NOP' });
    });

    it('normalizes mixed-case instructions', () => {
      const tokens = tokensOf('Mov');
      expect(tokens[0]).toEqual({ type: 'INSTRUCTION', value: 'MOV' });
    });

    it('normalizes lowercase registers to uppercase', () => {
      const tokens = tokensOf('r3');
      expect(tokens[0]).toEqual({ type: 'REGISTER', value: 'R3' });
    });

    it('normalizes mixed-case registers', () => {
      const tokens = tokensOf('R5');
      expect(tokens[0]).toEqual({ type: 'REGISTER', value: 'R5' });
    });

    it('normalizes DB directive case-insensitively', () => {
      const tokens = tokensOf('db 1');
      expect(tokens[0]).toEqual({ type: 'DIRECTIVE', value: 'DB' });
    });
  });

  describe('NEWLINE tokens', () => {
    it('emits a NEWLINE token at end of each line', () => {
      const tokens = tokenize('NOP\nHLT');
      const newlines = tokens.filter(t => t.type === 'NEWLINE');
      expect(newlines).toHaveLength(2);
    });

    it('NEWLINE has correct line number', () => {
      const tokens = tokenize('NOP\nHLT');
      const newlines = tokens.filter(t => t.type === 'NEWLINE');
      expect(newlines[0].line).toBe(1);
      expect(newlines[1].line).toBe(2);
    });
  });

  describe('multi-line programs', () => {
    it('tokenizes a small program correctly', () => {
      const src = [
        '; init',
        'start: MOV R0, 0',
        '  ADD R0, R1',
        '  JMP start',
      ].join('\n');
      const tokens = tokenize(src);
      const instrs = tokens.filter(t => t.type === 'INSTRUCTION').map(t => t.value);
      expect(instrs).toEqual(['MOV', 'ADD', 'JMP']);
      const labelDefs = tokens.filter(t => t.type === 'LABEL_DEF').map(t => t.value);
      expect(labelDefs).toEqual(['start']);
      const labelRefs = tokens.filter(t => t.type === 'LABEL_REF').map(t => t.value);
      expect(labelRefs).toEqual(['start']);
    });
  });
});
