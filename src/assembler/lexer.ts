import { Token } from './types';

const INSTRUCTIONS = new Set([
  'NOP', 'HLT', 'MOV', 'LOAD', 'STORE', 'ADD', 'SUB', 'INC', 'DEC',
  'AND', 'OR', 'XOR', 'SHL', 'SHR',
  'CMP', 'JMP', 'JZ', 'JNZ', 'JG', 'JL', 'PUSH', 'POP', 'CALL', 'RET',
  'VSTORE', 'VLOAD', 'VCOPY',
]);

const REGISTER_RE = /^R[0-7]$/;

function tokenizeLine(line: string, lineNum: number): Token[] {
  // Strip comment
  const commentIdx = line.indexOf(';');
  const stripped = commentIdx >= 0 ? line.slice(0, commentIdx) : line;

  const tokens: Token[] = [];
  let i = 0;

  while (i < stripped.length) {
    // Skip whitespace
    if (/\s/.test(stripped[i])) {
      i++;
      continue;
    }

    // String literal
    if (stripped[i] === '"') {
      let j = i + 1;
      let str = '';
      while (j < stripped.length && stripped[j] !== '"') {
        if (stripped[j] === '\\' && j + 1 < stripped.length) {
          const esc = stripped[j + 1];
          if (esc === 'n') str += '\n';
          else if (esc === 't') str += '\t';
          else if (esc === '\\') str += '\\';
          else if (esc === '"') str += '"';
          else str += esc;
          j += 2;
        } else {
          str += stripped[j];
          j++;
        }
      }
      // skip closing quote
      if (j < stripped.length) j++;
      tokens.push({ type: 'STRING', value: str, line: lineNum });
      i = j;
      continue;
    }

    // LBRACKET
    if (stripped[i] === '[') {
      tokens.push({ type: 'LBRACKET', value: '[', line: lineNum });
      i++;
      continue;
    }

    // RBRACKET
    if (stripped[i] === ']') {
      tokens.push({ type: 'RBRACKET', value: ']', line: lineNum });
      i++;
      continue;
    }

    // COMMA
    if (stripped[i] === ',') {
      tokens.push({ type: 'COMMA', value: ',', line: lineNum });
      i++;
      continue;
    }

    // Number: hex or decimal
    if (
      stripped[i] === '-' ||
      /\d/.test(stripped[i]) ||
      (stripped[i] === '0' && i + 1 < stripped.length && stripped[i + 1].toLowerCase() === 'x')
    ) {
      // Try to match a number
      let j = i;
      let negative = false;
      if (stripped[j] === '-') {
        negative = true;
        j++;
      }
      // hex
      if (
        j + 1 < stripped.length &&
        stripped[j] === '0' &&
        stripped[j + 1].toLowerCase() === 'x'
      ) {
        j += 2;
        while (j < stripped.length && /[0-9a-fA-F]/.test(stripped[j])) j++;
        const raw = stripped.slice(i, j);
        tokens.push({ type: 'NUMBER', value: raw, line: lineNum });
        i = j;
        continue;
      }
      // decimal
      if (/\d/.test(stripped[j])) {
        while (j < stripped.length && /\d/.test(stripped[j])) j++;
        const raw = stripped.slice(i, j);
        tokens.push({ type: 'NUMBER', value: raw, line: lineNum });
        i = j;
        continue;
      }
      // A lone '-' that wasn't followed by a digit — fall through to word
      if (negative) {
        // not a number, treat '-' as unknown — skip
        i++;
        continue;
      }
    }

    // Word (instruction, register, label def/ref, directive)
    if (/[a-zA-Z_.@]/.test(stripped[i])) {
      let j = i;
      while (j < stripped.length && /[\w.]/.test(stripped[j])) j++;
      const word = stripped.slice(i, j);

      // Check for label definition (word followed by ':')
      if (j < stripped.length && stripped[j] === ':') {
        tokens.push({ type: 'LABEL_DEF', value: word.toLowerCase(), line: lineNum });
        i = j + 1; // skip the colon
        continue;
      }

      const upper = word.toUpperCase();

      // Directive (e.g. DB)
      if (upper === 'DB') {
        tokens.push({ type: 'DIRECTIVE', value: 'DB', line: lineNum });
        i = j;
        continue;
      }

      // Instruction
      if (INSTRUCTIONS.has(upper)) {
        tokens.push({ type: 'INSTRUCTION', value: upper, line: lineNum });
        i = j;
        continue;
      }

      // Register
      if (REGISTER_RE.test(upper)) {
        tokens.push({ type: 'REGISTER', value: upper, line: lineNum });
        i = j;
        continue;
      }

      // Label reference
      tokens.push({ type: 'LABEL_REF', value: word.toLowerCase(), line: lineNum });
      i = j;
      continue;
    }

    // Unknown character — skip
    i++;
  }

  tokens.push({ type: 'NEWLINE', value: '\n', line: lineNum });
  return tokens;
}

export function tokenize(source: string): Token[] {
  const lines = source.split('\n');
  const result: Token[] = [];
  for (let i = 0; i < lines.length; i++) {
    const lineTokens = tokenizeLine(lines[i], i + 1);
    result.push(...lineTokens);
  }
  return result;
}
