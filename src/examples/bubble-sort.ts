export const BUBBLE_SORT_NAME = 'Bubble Sort';
export const BUBBLE_SORT_DESCRIPTION = 'Sorts 10 bytes in memory using bubble sort.';
export const BUBBLE_SORT_SOURCE = `; Bubble Sort — sorts 10 bytes starting at address 0x40
; R4:R5 = current pointer, R6/R7 = comparison values

  MOV R0, 0x40
  MOV R1, 0x00
  MOV R2, 9

outer:
  MOV R3, R2
  MOV R4, 0x40
  MOV R5, 0x00

inner:
  LOAD R6, [R4]
  INC R4
  LOAD R7, [R4]
  CMP R6, R7
  JL no_swap
  STORE [R4], R6
  DEC R4
  STORE [R4], R7
  INC R4

no_swap:
  DEC R3
  JNZ inner
  DEC R2
  JNZ outer
  HLT

; Padding to align data to address 0x40
  NOP
  NOP
  NOP
  NOP
  NOP
  NOP
  NOP
  NOP
  NOP
  NOP
  NOP

; Data: 10 random bytes to sort at address 0x40
data:
  DB 0x37, 0x0A, 0x73, 0x1F, 0x55, 0x02, 0x8B, 0x44, 0x19, 0x61
`;
