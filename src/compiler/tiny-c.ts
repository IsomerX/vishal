import type { AssemblerError } from '../assembler/types';

type Keyword = 'let' | 'if' | 'else' | 'while';
interface Token {
  type: 'keyword' | 'identifier' | 'number' | 'operator' | 'symbol' | 'eof';
  value: string;
  line: number;
}

interface NumberExpr {
  type: 'number';
  value: number;
  line: number;
}

interface IdentifierExpr {
  type: 'identifier';
  name: string;
  line: number;
}

interface CallExpr {
  type: 'call';
  name: string;
  args: Expression[];
  line: number;
}

interface BinaryExpr {
  type: 'binary';
  op: '+' | '-' | '&' | '|' | '^' | '<<' | '>>';
  left: Expression;
  right: Expression;
  line: number;
}

type Expression = NumberExpr | IdentifierExpr | CallExpr | BinaryExpr;

interface Condition {
  left: Expression;
  operator?: '==' | '!=' | '<' | '>' | '<=' | '>=';
  right?: Expression;
  line: number;
}

interface LetStatement {
  type: 'let';
  name: string;
  init?: Expression;
  line: number;
}

interface AssignStatement {
  type: 'assign';
  name: string;
  expr: Expression;
  line: number;
}

interface IfStatement {
  type: 'if';
  condition: Condition;
  thenBranch: Statement[];
  elseBranch?: Statement[];
  line: number;
}

interface WhileStatement {
  type: 'while';
  condition: Condition;
  body: Statement[];
  line: number;
}

interface ExprStatement {
  type: 'expr';
  expr: CallExpr;
  line: number;
}

type Statement = LetStatement | AssignStatement | IfStatement | WhileStatement | ExprStatement;

export interface TinyCCompileResult {
  assembly: string;
  errors: AssemblerError[];
}

class TinyCCompileError extends Error {
  readonly line: number;

  constructor(line: number, message: string) {
    super(message);
    this.line = line;
  }
}

class Parser {
  private pos = 0;

  constructor(private readonly tokens: Token[]) {}

  parseProgram(): Statement[] {
    const statements: Statement[] = [];
    while (!this.is('eof')) {
      statements.push(this.parseStatement());
    }
    return statements;
  }

  private parseStatement(): Statement {
    if (this.isKeyword('let')) return this.parseLet();
    if (this.isKeyword('if')) return this.parseIf();
    if (this.isKeyword('while')) return this.parseWhile();

    if (this.is('identifier') && this.peek().type === 'operator' && this.peek().value === '=') {
      return this.parseAssignment();
    }

    const expr = this.parsePrimary();
    if (expr.type !== 'call') {
      throw new TinyCCompileError(expr.line, 'Only assignments, control flow, and function calls are allowed as statements');
    }
    this.expectSymbol(';');
    return { type: 'expr', expr, line: expr.line };
  }

  private parseLet(): LetStatement {
    const keyword = this.advance();
    const name = this.expect('identifier');
    let init: Expression | undefined;
    if (this.matchOperator('=')) {
      init = this.parseExpression();
    }
    this.expectSymbol(';');
    return { type: 'let', name: name.value, init, line: keyword.line };
  }

  private parseAssignment(): AssignStatement {
    const name = this.expect('identifier');
    this.expectOperator('=');
    const expr = this.parseExpression();
    this.expectSymbol(';');
    return { type: 'assign', name: name.value, expr, line: name.line };
  }

  private parseIf(): IfStatement {
    const keyword = this.advance();
    this.expectSymbol('(');
    const condition = this.parseCondition();
    this.expectSymbol(')');
    const thenBranch = this.parseBlock();
    let elseBranch: Statement[] | undefined;
    if (this.isKeyword('else')) {
      this.advance();
      elseBranch = this.parseBlock();
    }
    return { type: 'if', condition, thenBranch, elseBranch, line: keyword.line };
  }

  private parseWhile(): WhileStatement {
    const keyword = this.advance();
    this.expectSymbol('(');
    const condition = this.parseCondition();
    this.expectSymbol(')');
    const body = this.parseBlock();
    return { type: 'while', condition, body, line: keyword.line };
  }

  private parseBlock(): Statement[] {
    this.expectSymbol('{');
    const statements: Statement[] = [];
    while (!(this.is('symbol') && this.current().value === '}')) {
      if (this.is('eof')) {
        throw new TinyCCompileError(this.current().line, 'Unterminated block');
      }
      statements.push(this.parseStatement());
    }
    this.expectSymbol('}');
    return statements;
  }

  private parseCondition(): Condition {
    const left = this.parseExpression();
    if (this.is('operator') && isComparisonOperator(this.current().value)) {
      const operator = this.advance().value as Condition['operator'];
      const right = this.parseExpression();
      return { left, operator, right, line: left.line };
    }
    return { left, line: left.line };
  }

  private parseExpression(): Expression {
    return this.parseBitwiseOr();
  }

  private parseBitwiseOr(): Expression {
    let expr = this.parseBitwiseXor();
    while (this.matchOperator('|')) {
      const op = this.tokens[this.pos - 1].value as BinaryExpr['op'];
      const right = this.parseBitwiseXor();
      expr = { type: 'binary', op, left: expr, right, line: expr.line };
    }
    return expr;
  }

  private parseBitwiseXor(): Expression {
    let expr = this.parseBitwiseAnd();
    while (this.matchOperator('^')) {
      const op = this.tokens[this.pos - 1].value as BinaryExpr['op'];
      const right = this.parseBitwiseAnd();
      expr = { type: 'binary', op, left: expr, right, line: expr.line };
    }
    return expr;
  }

  private parseBitwiseAnd(): Expression {
    let expr = this.parseShift();
    while (this.matchOperator('&')) {
      const op = this.tokens[this.pos - 1].value as BinaryExpr['op'];
      const right = this.parseShift();
      expr = { type: 'binary', op, left: expr, right, line: expr.line };
    }
    return expr;
  }

  private parseShift(): Expression {
    let expr = this.parseAdditive();
    while (this.is('operator') && (this.current().value === '<<' || this.current().value === '>>')) {
      const op = this.advance().value as BinaryExpr['op'];
      const right = this.parseAdditive();
      expr = { type: 'binary', op, left: expr, right, line: expr.line };
    }
    return expr;
  }

  private parseAdditive(): Expression {
    let expr = this.parsePrimary();
    while (this.is('operator') && (this.current().value === '+' || this.current().value === '-')) {
      const op = this.advance().value as BinaryExpr['op'];
      const right = this.parsePrimary();
      expr = { type: 'binary', op, left: expr, right, line: expr.line };
    }
    return expr;
  }

  private parsePrimary(): Expression {
    const token = this.current();
    if (token.type === 'number') {
      this.advance();
      return { type: 'number', value: parseNumber(token.value), line: token.line };
    }

    if (token.type === 'identifier') {
      this.advance();
      if (this.is('symbol') && this.current().value === '(') {
        this.advance();
        const args: Expression[] = [];
        if (!(this.is('symbol') && this.current().value === ')')) {
          do {
            args.push(this.parseExpression());
          } while (this.matchSymbol(','));
        }
        this.expectSymbol(')');
        return { type: 'call', name: token.value, args, line: token.line };
      }
      return { type: 'identifier', name: token.value, line: token.line };
    }

    if (this.matchSymbol('(')) {
      const expr = this.parseExpression();
      this.expectSymbol(')');
      return expr;
    }

    throw new TinyCCompileError(token.line, `Unexpected token: ${token.value}`);
  }

  private current(): Token {
    return this.tokens[this.pos]!;
  }

  private peek(): Token {
    return this.tokens[this.pos + 1] ?? this.tokens[this.pos]!;
  }

  private advance(): Token {
    const token = this.current();
    this.pos++;
    return token;
  }

  private is(type: Token['type']): boolean {
    return this.current().type === type;
  }

  private isKeyword(keyword: Keyword): boolean {
    return this.current().type === 'keyword' && this.current().value === keyword;
  }

  private expect(type: Token['type']): Token {
    const token = this.current();
    if (token.type !== type) {
      throw new TinyCCompileError(token.line, `Expected ${type}, got ${token.value}`);
    }
    this.pos++;
    return token;
  }

  private expectOperator(operator: string): Token {
    const token = this.current();
    if (token.type !== 'operator' || token.value !== operator) {
      throw new TinyCCompileError(token.line, `Expected '${operator}', got ${token.value}`);
    }
    this.pos++;
    return token;
  }

  private expectSymbol(symbol: string): Token {
    const token = this.current();
    if (token.type !== 'symbol' || token.value !== symbol) {
      throw new TinyCCompileError(token.line, `Expected '${symbol}', got ${token.value}`);
    }
    this.pos++;
    return token;
  }

  private matchOperator(operator: string): boolean {
    if (this.current().type === 'operator' && this.current().value === operator) {
      this.pos++;
      return true;
    }
    return false;
  }

  private matchSymbol(symbol: string): boolean {
    if (this.current().type === 'symbol' && this.current().value === symbol) {
      this.pos++;
      return true;
    }
    return false;
  }
}

class CodegenContext {
  private readonly lines: string[] = [];
  private readonly variableLabels = new Map<string, string>();
  private readonly usedTempIndices = new Set<number>();
  private labelCounter = 0;
  private emittedHalt = false;

  emit(line: string): void {
    this.lines.push(line);
    if (line === '  HLT') this.emittedHalt = true;
  }

  emitComment(line: string): void {
    this.lines.push(line);
  }

  declareVariable(name: string, line: number): string {
    const key = name.toLowerCase();
    if (this.variableLabels.has(key)) {
      throw new TinyCCompileError(line, `Variable '${name}' is already declared`);
    }
    const sanitized = sanitizeIdentifier(key);
    const label = `__var_${sanitized}`;
    this.variableLabels.set(key, label);
    return label;
  }

  getVariableLabel(name: string, line: number): string {
    const label = this.variableLabels.get(name.toLowerCase());
    if (!label) throw new TinyCCompileError(line, `Unknown variable '${name}'`);
    return label;
  }

  useTemp(index: number): string {
    this.usedTempIndices.add(index);
    return `__tmp_${index}`;
  }

  newLabel(prefix: string): string {
    const label = `__${sanitizeIdentifier(prefix)}_${this.labelCounter}`;
    this.labelCounter++;
    return label;
  }

  buildAssembly(): string {
    const output = [...this.lines];
    if (!this.emittedHalt) output.push('  HLT');

    const dataLines: string[] = [];
    const tempIndices = [...this.usedTempIndices].sort((a, b) => a - b);
    for (const index of tempIndices) {
      dataLines.push(`${this.useTemp(index)}: DB 0`);
    }
    for (const label of this.variableLabels.values()) {
      dataLines.push(`${label}: DB 0`);
    }

    if (dataLines.length > 0) {
      output.push('');
      output.push('; Compiler scratch + variables');
      output.push(...dataLines);
    }

    return output.join('\n') + '\n';
  }
}

export function compileTinyC(source: string): TinyCCompileResult {
  try {
    const tokens = tokenize(source);
    const parser = new Parser(tokens);
    const program = parser.parseProgram();
    const context = new CodegenContext();

    context.emitComment('; Tiny C-like source compiled to Browser VM assembly');
    context.emitComment('; Generated code uses R0/R1 as expression registers');

    for (const statement of program) {
      compileStatement(statement, context);
    }

    return {
      assembly: context.buildAssembly(),
      errors: [],
    };
  } catch (error) {
    if (error instanceof TinyCCompileError) {
      return {
        assembly: '',
        errors: [{ line: error.line, message: error.message }],
      };
    }
    throw error;
  }
}

function compileStatement(statement: Statement, context: CodegenContext): void {
  switch (statement.type) {
    case 'let': {
      const label = context.declareVariable(statement.name, statement.line);
      if (statement.init) {
        compileExpression(statement.init, context, 0);
        context.emit(`  STORE [${label}], R0`);
      }
      break;
    }

    case 'assign': {
      const label = context.getVariableLabel(statement.name, statement.line);
      compileExpression(statement.expr, context, 0);
      context.emit(`  STORE [${label}], R0`);
      break;
    }

    case 'if': {
      const thenLabel = context.newLabel('if_then');
      const elseLabel = statement.elseBranch ? context.newLabel('if_else') : context.newLabel('if_end');
      const endLabel = statement.elseBranch ? context.newLabel('if_end') : elseLabel;
      emitConditionBranch(statement.condition, thenLabel, elseLabel, context);
      context.emit(`${thenLabel}:`);
      for (const nested of statement.thenBranch) compileStatement(nested, context);
      if (statement.elseBranch) {
        context.emit(`  JMP ${endLabel}`);
        context.emit(`${elseLabel}:`);
        for (const nested of statement.elseBranch) compileStatement(nested, context);
      }
      context.emit(`${endLabel}:`);
      break;
    }

    case 'while': {
      const startLabel = context.newLabel('while_start');
      const bodyLabel = context.newLabel('while_body');
      const endLabel = context.newLabel('while_end');
      context.emit(`${startLabel}:`);
      emitConditionBranch(statement.condition, bodyLabel, endLabel, context);
      context.emit(`${bodyLabel}:`);
      for (const nested of statement.body) compileStatement(nested, context);
      context.emit(`  JMP ${startLabel}`);
      context.emit(`${endLabel}:`);
      break;
    }

    case 'expr':
      compileCallStatement(statement.expr, context);
      break;
  }
}

function compileExpression(expression: Expression, context: CodegenContext, tempIndex: number): void {
  switch (expression.type) {
    case 'number': {
      if (expression.value < 0 || expression.value > 0xFF) {
        throw new TinyCCompileError(expression.line, `Value ${expression.value} is out of 8-bit range`);
      }
      context.emit(`  MOV R0, ${formatImmediate(expression.value)}`);
      return;
    }

    case 'identifier': {
      const label = context.getVariableLabel(expression.name, expression.line);
      context.emit(`  LOAD R0, [${label}]`);
      return;
    }

    case 'call':
      compileCallExpression(expression, context, tempIndex);
      return;

    case 'binary': {
      const temp = context.useTemp(tempIndex);
      compileExpression(expression.left, context, tempIndex + 1);
      context.emit(`  STORE [${temp}], R0`);
      compileExpression(expression.right, context, tempIndex + 1);
      context.emit('  MOV R1, R0');
      context.emit(`  LOAD R0, [${temp}]`);

      const opcode = expression.op === '+'
        ? 'ADD'
        : expression.op === '-'
          ? 'SUB'
          : expression.op === '&'
            ? 'AND'
            : expression.op === '|'
              ? 'OR'
              : expression.op === '^'
                ? 'XOR'
                : expression.op === '<<'
                  ? 'SHL'
                  : 'SHR';
      context.emit(`  ${opcode} R0, R1`);
      return;
    }
  }
}

function compileCallExpression(call: CallExpr, context: CodegenContext, tempIndex: number): void {
  switch (call.name) {
    case 'peek': {
      if (call.args.length !== 1) {
        throw new TinyCCompileError(call.line, 'peek() expects exactly one argument');
      }
      const constant = evaluateConstant(call.args[0]);
      if (constant !== null) {
        context.emit(`  LOAD R0, [${formatAddress(constant, call.line)}]`);
      } else {
        compileExpression(call.args[0], context, tempIndex + 1);
        context.emit('  MOV R2, R0');
        context.emit('  MOV R3, 0x00');
        context.emit('  LOAD R0, [R2]');
      }
      return;
    }

    case 'vload': {
      if (call.args.length !== 1) {
        throw new TinyCCompileError(call.line, 'vload() expects exactly one argument');
      }
      const constant = evaluateConstant(call.args[0]);
      if (constant === null) {
        throw new TinyCCompileError(call.line, 'vload() currently requires a constant address');
      }
      context.emit(`  VLOAD R0, [${formatAddress(constant, call.line)}]`);
      return;
    }

    default:
      throw new TinyCCompileError(call.line, `Unknown expression function '${call.name}'`);
  }
}

function compileCallStatement(call: CallExpr, context: CodegenContext): void {
  switch (call.name) {
    case 'halt':
      if (call.args.length !== 0) {
        throw new TinyCCompileError(call.line, 'halt() takes no arguments');
      }
      context.emit('  HLT');
      return;

    case 'poke': {
      if (call.args.length !== 2) {
        throw new TinyCCompileError(call.line, 'poke() expects address and value arguments');
      }
      const constant = evaluateConstant(call.args[0]);
      if (constant !== null) {
        compileExpression(call.args[1], context, 0);
        context.emit(`  STORE [${formatAddress(constant, call.line)}], R0`);
      } else {
        compileExpression(call.args[0], context, 1);
        context.emit('  MOV R2, R0');
        context.emit('  MOV R3, 0x00');
        compileExpression(call.args[1], context, 1);
        context.emit('  STORE [R2], R0');
      }
      return;
    }

    case 'vstore': {
      if (call.args.length !== 2) {
        throw new TinyCCompileError(call.line, 'vstore() expects address and value arguments');
      }
      const constant = evaluateConstant(call.args[0]);
      if (constant === null) {
        throw new TinyCCompileError(call.line, 'vstore() currently requires a constant address');
      }
      compileExpression(call.args[1], context, 0);
      context.emit(`  VSTORE [${formatAddress(constant, call.line)}], R0`);
      return;
    }

    case 'vcopy': {
      if (call.args.length !== 1) {
        throw new TinyCCompileError(call.line, 'vcopy() expects exactly one address argument');
      }
      const constant = evaluateConstant(call.args[0]);
      if (constant === null) {
        throw new TinyCCompileError(call.line, 'vcopy() currently requires a constant address');
      }
      context.emit(`  MOV R0, ${formatImmediate(constant & 0xFF)}`);
      context.emit(`  MOV R1, ${formatImmediate((constant >> 8) & 0xFF)}`);
      context.emit('  VCOPY R0');
      return;
    }

    default:
      throw new TinyCCompileError(call.line, `Unknown statement function '${call.name}'`);
  }
}

function emitConditionBranch(
  condition: Condition,
  trueLabel: string,
  falseLabel: string,
  context: CodegenContext,
): void {
  if (!condition.operator) {
    compileExpression(condition.left, context, 0);
    context.emit('  MOV R1, 0x00');
    context.emit('  CMP R0, R1');
    context.emit(`  JNZ ${trueLabel}`);
    context.emit(`  JMP ${falseLabel}`);
    return;
  }

  const temp = context.useTemp(0);
  compileExpression(condition.left, context, 1);
  context.emit(`  STORE [${temp}], R0`);
  compileExpression(condition.right!, context, 1);
  context.emit('  MOV R1, R0');
  context.emit(`  LOAD R0, [${temp}]`);
  context.emit('  CMP R0, R1');

  switch (condition.operator) {
    case '==':
      context.emit(`  JZ ${trueLabel}`);
      break;
    case '!=':
      context.emit(`  JNZ ${trueLabel}`);
      break;
    case '<':
      context.emit(`  JL ${trueLabel}`);
      break;
    case '>':
      context.emit(`  JG ${trueLabel}`);
      break;
    case '<=':
      context.emit(`  JL ${trueLabel}`);
      context.emit(`  JZ ${trueLabel}`);
      break;
    case '>=':
      context.emit(`  JG ${trueLabel}`);
      context.emit(`  JZ ${trueLabel}`);
      break;
  }
  context.emit(`  JMP ${falseLabel}`);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;

  while (i < source.length) {
    const ch = source[i];

    if (ch === '\n') {
      line++;
      i++;
      continue;
    }

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }

    const twoChar = source.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '<<', '>>'].includes(twoChar)) {
      tokens.push({ type: 'operator', value: twoChar, line });
      i += 2;
      continue;
    }

    if ('+-&|^=<>'.includes(ch)) {
      tokens.push({ type: 'operator', value: ch, line });
      i++;
      continue;
    }

    if ('();,{}'.includes(ch)) {
      tokens.push({ type: 'symbol', value: ch, line });
      i++;
      continue;
    }

    if (/\d/.test(ch)) {
      let j = i;
      if (source[j] === '0' && (source[j + 1] === 'x' || source[j + 1] === 'X')) {
        j += 2;
        while (j < source.length && /[0-9a-fA-F]/.test(source[j])) j++;
      } else {
        while (j < source.length && /\d/.test(source[j])) j++;
      }
      tokens.push({ type: 'number', value: source.slice(i, j), line });
      i = j;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j++;
      const value = source.slice(i, j);
      if (['let', 'if', 'else', 'while'].includes(value)) {
        tokens.push({ type: 'keyword', value, line });
      } else {
        tokens.push({ type: 'identifier', value, line });
      }
      i = j;
      continue;
    }

    throw new TinyCCompileError(line, `Unexpected character '${ch}'`);
  }

  tokens.push({ type: 'eof', value: '', line });
  return tokens;
}

function evaluateConstant(expression: Expression): number | null {
  switch (expression.type) {
    case 'number':
      return expression.value;
    case 'identifier':
    case 'call':
      return null;
    case 'binary': {
      const left = evaluateConstant(expression.left);
      const right = evaluateConstant(expression.right);
      if (left === null || right === null) return null;
      switch (expression.op) {
        case '+': return left + right;
        case '-': return left - right;
        case '&': return left & right;
        case '|': return left | right;
        case '^': return left ^ right;
        case '<<': return left << right;
        case '>>': return left >>> right;
      }
    }
  }
}

function formatImmediate(value: number): string {
  return `0x${(value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatAddress(value: number, line: number): string {
  if (value < 0 || value > 0xFFFF) {
    throw new TinyCCompileError(line, `Address ${value} is out of 16-bit range`);
  }
  return `0x${value.toString(16).toUpperCase().padStart(4, '0')}`;
}

function parseNumber(raw: string): number {
  if (raw.startsWith('0x') || raw.startsWith('0X')) {
    return parseInt(raw, 16);
  }
  return parseInt(raw, 10);
}

function sanitizeIdentifier(value: string): string {
  return value.replace(/[^a-z0-9_]/gi, '_');
}

function isComparisonOperator(value: string): value is NonNullable<Condition['operator']> {
  return ['==', '!=', '<', '>', '<=', '>='].includes(value);
}
