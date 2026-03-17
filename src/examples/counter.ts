export const COUNTER_NAME = 'Counter';
export const COUNTER_DESCRIPTION = 'Counts from 0 to 15, storing each value at 0x40+';
export const COUNTER_SOURCE = `; Counter — counts from 0 to 15, storing each value at 0x40+

  MOV R0, 0
  MOV R2, 0x40
  MOV R3, 0x00
  MOV R6, 16

loop:
  STORE [R2], R0
  INC R0
  INC R2
  DEC R6
  JNZ loop
  HLT
`;
