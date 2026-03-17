export type TokenType =
  | 'INSTRUCTION' | 'REGISTER' | 'NUMBER' | 'LABEL_DEF' | 'LABEL_REF'
  | 'LBRACKET' | 'RBRACKET' | 'COMMA' | 'DIRECTIVE' | 'STRING' | 'NEWLINE';

export interface Token { type: TokenType; value: string; line: number; }
export interface AssemblerError { message: string; line: number; }

export interface ProgramMetadata {
  codeStart: number;
  codeEnd: number;
  dataStart: number;
  dataEnd: number;
}

export interface AssemblerResult {
  bytecode: Uint8Array;
  metadata: ProgramMetadata;
  errors: AssemblerError[];
}
