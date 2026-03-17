export const FIBONACCI_NAME = 'Fibonacci';
export const FIBONACCI_DESCRIPTION = 'Computes Fibonacci numbers iteratively, storing the sequence in memory.';
export const FIBONACCI_SOURCE = `; Fibonacci — stores fib sequence starting at 0x40

  MOV R0, 0
  MOV R1, 1
  MOV R4, 0x40
  MOV R5, 0x00
  MOV R6, 13

  STORE [R4], R0
  INC R4
  STORE [R4], R1
  INC R4

loop:
  MOV R2, R1
  ADD R1, R0
  MOV R0, R2
  STORE [R4], R1
  INC R4
  DEC R6
  JNZ loop
  HLT
`;
