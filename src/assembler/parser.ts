import { Token, AssemblerResult, AssemblerError, ProgramMetadata } from './types';
import { tokenize } from './lexer';
import {
  OP_NOP, OP_HLT, OP_MOV_IMM, OP_MOV_REG,
  OP_LOAD_ABS, OP_STORE_ABS, OP_LOAD_IND, OP_STORE_IND,
  OP_ADD, OP_SUB, OP_INC, OP_DEC, OP_AND, OP_OR, OP_XOR, OP_SHL, OP_SHR, OP_CMP,
  OP_JMP, OP_JZ, OP_JNZ, OP_JG, OP_JL,
  OP_PUSH, OP_POP, OP_CALL, OP_RET, OP_VSTORE, OP_VLOAD, OP_VCOPY,
} from '../vm/opcodes';

/** Map register name to number: R0=0, R1=1, ..., R7=7 */
function regNum(token: Token): number {
  return parseInt(token.value.slice(1), 10);
}

/** Parse a number token value (hex or decimal) */
function parseNum(value: string): number {
  if (value.startsWith('0x') || value.startsWith('0X')) {
    return parseInt(value, 16);
  }
  return parseInt(value, 10);
}

/** Emit a 16-bit address as two bytes in little-endian order */
function addrBytes(addr: number): [number, number] {
  return [addr & 0xFF, (addr >> 8) & 0xFF];
}

/** Map mnemonic to jump opcode */
const JUMP_OPCODES: Record<string, number> = {
  JMP: OP_JMP,
  JZ: OP_JZ,
  JNZ: OP_JNZ,
  JG: OP_JG,
  JL: OP_JL,
};

type Line = Token[];

interface LabelPatch {
  /** Byte offset where the 2-byte address placeholder starts */
  offset: number;
  /** Label name (lowercase) */
  label: string;
  /** Source line number for error reporting */
  line: number;
}

function findBracketOperand(operands: Token[]): {
  innerReg?: Token;
  innerNum?: Token;
  innerLabel?: Token;
  valid: boolean;
} {
  const lbIdx = operands.findIndex(t => t.type === 'LBRACKET');
  const rbIdx = operands.findIndex(t => t.type === 'RBRACKET');
  if (lbIdx === -1 || rbIdx === -1 || rbIdx <= lbIdx) {
    return { valid: false };
  }

  const bracketContent = operands.slice(lbIdx + 1, rbIdx);
  return {
    innerReg: bracketContent.find(t => t.type === 'REGISTER'),
    innerNum: bracketContent.find(t => t.type === 'NUMBER'),
    innerLabel: bracketContent.find(t => t.type === 'LABEL_REF'),
    valid: true,
  };
}

export function assemble(source: string): AssemblerResult {
  const tokens = tokenize(source);
  const errors: AssemblerError[] = [];

  // Group tokens by line (split on NEWLINE tokens)
  const lines: Line[] = [];
  let current: Line = [];
  for (const token of tokens) {
    if (token.type === 'NEWLINE') {
      if (current.length > 0) {
        lines.push(current);
      }
      current = [];
    } else {
      current.push(token);
    }
  }
  if (current.length > 0) {
    lines.push(current);
  }

  // First pass: emit bytes, record labels, collect patches
  const output: number[] = [];
  const labels: Record<string, number> = {};
  const patches: LabelPatch[] = [];
  let codeEnd = -1;
  let dataStart = -1;
  let dataEnd = -1;

  for (const line of lines) {
    let pos = 0;

    // Handle leading LABEL_DEF
    if (line[pos]?.type === 'LABEL_DEF') {
      labels[line[pos].value] = output.length;
      pos++;
    }

    // Skip if nothing left on the line after label
    if (pos >= line.length) continue;

    const token = line[pos];

    // Handle DB directive
    if (token.type === 'DIRECTIVE' && token.value === 'DB') {
      // Set codeEnd to the byte before this data region starts
      if (codeEnd === -1 && output.length > 0) {
        codeEnd = output.length - 1;
      }
      if (dataStart === -1) {
        dataStart = output.length;
      }

      pos++;
      while (pos < line.length) {
        const t = line[pos];
        if (t.type === 'NUMBER') {
          output.push(parseNum(t.value) & 0xFF);
        } else if (t.type === 'STRING') {
          for (let i = 0; i < t.value.length; i++) {
            output.push(t.value.charCodeAt(i) & 0xFF);
          }
        }
        // Skip commas
        pos++;
      }
      dataEnd = output.length - 1;
      continue;
    }

    // Handle instructions
    if (token.type === 'INSTRUCTION') {
      const instr = token.value;
      const lineNum = token.line;
      pos++;

      // Filter out commas, brackets from remaining tokens for easier access
      const operands = line.slice(pos);

      switch (instr) {
        case 'NOP': {
          output.push(OP_NOP);
          break;
        }
        case 'HLT': {
          output.push(OP_HLT);
          break;
        }
        case 'RET': {
          output.push(OP_RET);
          break;
        }
        case 'MOV': {
          // MOV Rx, imm | MOV Rx, Ry
          const reg = operands.find(t => t.type === 'REGISTER');
          // Find second operand after comma
          const commaIdx = operands.findIndex(t => t.type === 'COMMA');
          const afterComma = operands.slice(commaIdx + 1);
          const secondReg = afterComma.find(t => t.type === 'REGISTER');
          const secondNum = afterComma.find(t => t.type === 'NUMBER');

          if (reg && secondReg) {
            output.push(OP_MOV_REG, regNum(reg), regNum(secondReg));
          } else if (reg && secondNum) {
            output.push(OP_MOV_IMM, regNum(reg), parseNum(secondNum.value) & 0xFF);
          } else {
            errors.push({ message: `Invalid MOV operands`, line: lineNum });
          }
          break;
        }
        case 'LOAD': {
          // LOAD Rx, [addr] | LOAD Rx, [Ry]
          // Token sequence: REGISTER COMMA LBRACKET (REGISTER|NUMBER) RBRACKET
          const destReg = operands.find(t => t.type === 'REGISTER');
          const { innerReg, innerNum, innerLabel, valid } = findBracketOperand(operands);

          if (destReg && valid) {
            if (innerReg) {
              output.push(OP_LOAD_IND, regNum(destReg), regNum(innerReg));
            } else if (innerNum) {
              const addr = parseNum(innerNum.value);
              const [lo, hi] = addrBytes(addr);
              output.push(OP_LOAD_ABS, regNum(destReg), lo, hi);
            } else if (innerLabel) {
              output.push(OP_LOAD_ABS, regNum(destReg));
              patches.push({ offset: output.length, label: innerLabel.value, line: lineNum });
              output.push(0x00, 0x00);
            } else {
              errors.push({ message: `Invalid LOAD operands`, line: lineNum });
            }
          } else {
            errors.push({ message: `Invalid LOAD syntax`, line: lineNum });
          }
          break;
        }
        case 'STORE': {
          // STORE [addr], Rx | STORE [Rx], Ry
          // Token sequence: LBRACKET (REGISTER|NUMBER) RBRACKET COMMA REGISTER
          const commaIdx = operands.findIndex(t => t.type === 'COMMA');
          const { innerReg, innerNum, innerLabel, valid } = findBracketOperand(operands);

          if (valid && commaIdx !== -1) {
            const afterComma = operands.slice(commaIdx + 1);
            const srcReg = afterComma.find(t => t.type === 'REGISTER');

            if (innerReg && srcReg) {
              output.push(OP_STORE_IND, regNum(innerReg), regNum(srcReg));
            } else if (innerNum && srcReg) {
              const addr = parseNum(innerNum.value);
              const [lo, hi] = addrBytes(addr);
              output.push(OP_STORE_ABS, regNum(srcReg), lo, hi);
            } else if (innerLabel && srcReg) {
              output.push(OP_STORE_ABS, regNum(srcReg));
              patches.push({ offset: output.length, label: innerLabel.value, line: lineNum });
              output.push(0x00, 0x00);
            } else {
              errors.push({ message: `Invalid STORE operands`, line: lineNum });
            }
          } else {
            errors.push({ message: `Invalid STORE syntax`, line: lineNum });
          }
          break;
        }
        case 'ADD':
        case 'SUB':
        case 'AND':
        case 'OR':
        case 'XOR':
        case 'SHL':
        case 'SHR':
        case 'CMP': {
          // Two-register instructions: INSTR Rx, Ry
          const reg1 = operands.find(t => t.type === 'REGISTER');
          const commaIdx = operands.findIndex(t => t.type === 'COMMA');
          const afterComma = operands.slice(commaIdx + 1);
          const reg2 = afterComma.find(t => t.type === 'REGISTER');

          const opMap: Record<string, number> = {
            ADD: OP_ADD,
            SUB: OP_SUB,
            AND: OP_AND,
            OR: OP_OR,
            XOR: OP_XOR,
            SHL: OP_SHL,
            SHR: OP_SHR,
            CMP: OP_CMP,
          };

          if (reg1 && reg2) {
            output.push(opMap[instr], regNum(reg1), regNum(reg2));
          } else {
            errors.push({ message: `Invalid ${instr} operands`, line: lineNum });
          }
          break;
        }
        case 'INC':
        case 'DEC': {
          const reg = operands.find(t => t.type === 'REGISTER');
          if (reg) {
            output.push(instr === 'INC' ? OP_INC : OP_DEC, regNum(reg));
          } else {
            errors.push({ message: `Invalid ${instr} operands`, line: lineNum });
          }
          break;
        }
        case 'PUSH':
        case 'POP': {
          const reg = operands.find(t => t.type === 'REGISTER');
          if (reg) {
            output.push(instr === 'PUSH' ? OP_PUSH : OP_POP, regNum(reg));
          } else {
            errors.push({ message: `Invalid ${instr} operands`, line: lineNum });
          }
          break;
        }
        case 'VCOPY': {
          const reg = operands.find(t => t.type === 'REGISTER');
          if (reg) {
            output.push(OP_VCOPY, regNum(reg));
          } else {
            errors.push({ message: `Invalid VCOPY operand`, line: lineNum });
          }
          break;
        }
        case 'VLOAD': {
          const destReg = operands.find(t => t.type === 'REGISTER');
          const { innerNum, innerLabel, valid } = findBracketOperand(operands);

          if (destReg && valid) {
            output.push(OP_VLOAD, regNum(destReg));
            if (innerLabel) {
              patches.push({ offset: output.length, label: innerLabel.value, line: lineNum });
              output.push(0x00, 0x00);
            } else if (innerNum) {
              const addr = parseNum(innerNum.value);
              const [lo, hi] = addrBytes(addr);
              output.push(lo, hi);
            } else {
              errors.push({ message: `Invalid VLOAD operands`, line: lineNum });
              output.push(0x00, 0x00);
            }
          } else {
            errors.push({ message: `Invalid VLOAD syntax`, line: lineNum });
          }
          break;
        }
        case 'VSTORE': {
          const commaIdx = operands.findIndex(t => t.type === 'COMMA');
          const { innerNum, innerLabel, valid } = findBracketOperand(operands);

          if (valid && commaIdx !== -1) {
            const afterComma = operands.slice(commaIdx + 1);
            const srcReg = afterComma.find(t => t.type === 'REGISTER');

            if (!srcReg) {
              errors.push({ message: `Invalid VSTORE operands`, line: lineNum });
              break;
            }

            output.push(OP_VSTORE, regNum(srcReg));
            if (innerLabel) {
              patches.push({ offset: output.length, label: innerLabel.value, line: lineNum });
              output.push(0x00, 0x00);
            } else if (innerNum) {
              const addr = parseNum(innerNum.value);
              const [lo, hi] = addrBytes(addr);
              output.push(lo, hi);
            } else {
              errors.push({ message: `Invalid VSTORE operands`, line: lineNum });
              output.push(0x00, 0x00);
            }
          } else {
            errors.push({ message: `Invalid VSTORE syntax`, line: lineNum });
          }
          break;
        }
        case 'JMP':
        case 'JZ':
        case 'JNZ':
        case 'JG':
        case 'JL': {
          const opcode = JUMP_OPCODES[instr];
          const labelRef = operands.find(t => t.type === 'LABEL_REF');
          const numOp = operands.find(t => t.type === 'NUMBER');

          output.push(opcode);
          if (labelRef) {
            // Defer resolution — record patch location
            patches.push({ offset: output.length, label: labelRef.value, line: lineNum });
            output.push(0x00, 0x00); // placeholder
          } else if (numOp) {
            const addr = parseNum(numOp.value);
            const [lo, hi] = addrBytes(addr);
            output.push(lo, hi);
          } else {
            errors.push({ message: `Invalid ${instr} operand`, line: lineNum });
            output.push(0x00, 0x00);
          }
          break;
        }
        case 'CALL': {
          const labelRef = operands.find(t => t.type === 'LABEL_REF');
          const numOp = operands.find(t => t.type === 'NUMBER');

          output.push(OP_CALL);
          if (labelRef) {
            patches.push({ offset: output.length, label: labelRef.value, line: lineNum });
            output.push(0x00, 0x00);
          } else if (numOp) {
            const addr = parseNum(numOp.value);
            const [lo, hi] = addrBytes(addr);
            output.push(lo, hi);
          } else {
            errors.push({ message: `Invalid CALL operand`, line: lineNum });
            output.push(0x00, 0x00);
          }
          break;
        }
        default: {
          errors.push({ message: `Unknown instruction: ${instr}`, line: lineNum });
        }
      }
    }
  }

  // Second pass: resolve label patches
  for (const patch of patches) {
    const addr = labels[patch.label];
    if (addr === undefined) {
      errors.push({ message: `Undefined label: ${patch.label}`, line: patch.line });
    } else {
      const [lo, hi] = addrBytes(addr);
      output[patch.offset] = lo;
      output[patch.offset + 1] = hi;
    }
  }

  // Build metadata
  const totalLen = output.length;
  const metadata: ProgramMetadata = {
    codeStart: 0,
    codeEnd: codeEnd === -1 ? (totalLen > 0 ? totalLen - 1 : 0) : codeEnd,
    dataStart: dataStart === -1 ? 0 : dataStart,
    dataEnd: dataEnd === -1 ? 0 : dataEnd,
  };

  return {
    bytecode: new Uint8Array(output),
    metadata,
    errors,
  };
}
