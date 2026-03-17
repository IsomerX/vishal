export const GAME_OF_LIFE_NAME = 'Game of Life';
export const GAME_OF_LIFE_DESCRIPTION = 'Conway\'s Game of Life on a 32x32 grid. Uses VCOPY for display.';
export const GAME_OF_LIFE_SOURCE = `; Conway's Game of Life - 32x32 grid
; Buffer A (current) at 0x0400, Buffer B (next) at 0x0800
; Seed: R-pentomino near the center

  MOV R7, 0xFF

  ; (16, 15) and (17, 15)
  MOV R0, 0xF0
  MOV R1, 0x05
  STORE [R0], R7
  INC R0
  STORE [R0], R7

  ; (15, 16) and (16, 16)
  MOV R0, 0x0F
  MOV R1, 0x06
  STORE [R0], R7
  INC R0
  STORE [R0], R7

  ; (16, 17)
  MOV R0, 0x30
  MOV R1, 0x06
  STORE [R0], R7

  ; Display initial seed from Buffer A
  MOV R0, 0x00
  MOV R1, 0x04
  VCOPY R0

gen_loop:
  MOV R4, 0         ; x
  MOV R5, 0         ; y

cell_loop:
  ; Load current cell from Buffer A into R7
  PUSH R4
  PUSH R5
  MOV R6, R5
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R0, R5
  SHR R0, R7
  ADD R6, R4
  MOV R1, 0x04
  ADD R1, R0
  MOV R0, R6
  LOAD R7, [R0]
  POP R5
  POP R4

  PUSH R4
  PUSH R5
  PUSH R7
  MOV R6, 0         ; neighbor count

  ; (x-1, y-1)
  MOV R0, R4
  DEC R0
  MOV R1, 0xFF
  CMP R0, R1
  JZ skip_n0
  MOV R1, R5
  DEC R1
  MOV R2, 0xFF
  CMP R1, R2
  JZ skip_n0
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  MOV R0, 0
  CMP R7, R0
  JZ skip_n0
  INC R6
skip_n0:

  ; (x, y-1)
  MOV R0, R4
  MOV R1, R5
  DEC R1
  MOV R2, 0xFF
  CMP R1, R2
  JZ skip_n1
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  MOV R0, 0
  CMP R7, R0
  JZ skip_n1
  INC R6
skip_n1:

  ; (x+1, y-1)
  MOV R0, R4
  INC R0
  MOV R1, 32
  CMP R0, R1
  JZ skip_n2
  MOV R1, R5
  DEC R1
  MOV R2, 0xFF
  CMP R1, R2
  JZ skip_n2
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  MOV R0, 0
  CMP R7, R0
  JZ skip_n2
  INC R6
skip_n2:

  ; (x-1, y)
  MOV R0, R4
  DEC R0
  MOV R1, 0xFF
  CMP R0, R1
  JZ skip_n3
  MOV R1, R5
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  MOV R0, 0
  CMP R7, R0
  JZ skip_n3
  INC R6
skip_n3:

  ; (x+1, y)
  MOV R0, R4
  INC R0
  MOV R1, 32
  CMP R0, R1
  JZ skip_n4
  MOV R1, R5
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  MOV R0, 0
  CMP R7, R0
  JZ skip_n4
  INC R6
skip_n4:

  ; (x-1, y+1)
  MOV R0, R4
  DEC R0
  MOV R1, 0xFF
  CMP R0, R1
  JZ skip_n5
  MOV R1, R5
  INC R1
  MOV R2, 32
  CMP R1, R2
  JZ skip_n5
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  MOV R0, 0
  CMP R7, R0
  JZ skip_n5
  INC R6
skip_n5:

  ; (x, y+1)
  MOV R0, R4
  MOV R1, R5
  INC R1
  MOV R2, 32
  CMP R1, R2
  JZ skip_n6
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  MOV R0, 0
  CMP R7, R0
  JZ skip_n6
  INC R6
skip_n6:

  ; (x+1, y+1)
  MOV R0, R4
  INC R0
  MOV R1, 32
  CMP R0, R1
  JZ skip_n7
  MOV R1, R5
  INC R1
  MOV R2, 32
  CMP R1, R2
  JZ skip_n7
  PUSH R6
  MOV R6, R1
  MOV R7, 5
  SHL R6, R7
  MOV R7, 3
  MOV R2, R1
  SHR R2, R7
  ADD R6, R0
  MOV R3, 0x04
  ADD R3, R2
  MOV R2, R6
  LOAD R7, [R2]
  POP R6
  MOV R0, 0
  CMP R7, R0
  JZ skip_n7
  INC R6
skip_n7:

  ; Restore current cell, y, x
  POP R7
  POP R5
  POP R4

  ; Compute destination address in Buffer B into R2:R3
  PUSH R4
  PUSH R5
  PUSH R6
  MOV R6, R5
  MOV R0, 5
  SHL R6, R0
  MOV R0, 3
  MOV R1, R5
  SHR R1, R0
  ADD R6, R4
  MOV R3, 0x08
  ADD R3, R1
  MOV R2, R6
  POP R6
  POP R5
  POP R4

  ; Alive if neighbors == 3, or neighbors == 2 and currently alive
  MOV R0, 3
  CMP R6, R0
  JZ make_alive

  MOV R0, 2
  CMP R6, R0
  JNZ make_dead

  MOV R0, 0
  CMP R7, R0
  JZ make_dead

make_alive:
  MOV R0, 0xFF
  STORE [R2], R0
  JMP next_cell

make_dead:
  MOV R0, 0x00
  STORE [R2], R0

next_cell:
  INC R4
  MOV R0, 32
  CMP R4, R0
  JL cell_loop

  MOV R4, 0
  INC R5
  MOV R0, 32
  CMP R5, R0
  JL cell_loop

  ; Show Buffer B
  MOV R0, 0x00
  MOV R1, 0x08
  VCOPY R0

  ; Copy Buffer B back into Buffer A for the next generation
  MOV R2, 0x00
  MOV R3, 0x08
  MOV R4, 0x00
  MOV R5, 0x04

copy_loop:
  LOAD R6, [R2]
  STORE [R4], R6
  INC R2
  INC R4
  MOV R0, 0
  CMP R2, R0
  JNZ copy_loop
  INC R3
  INC R5
  MOV R0, 0x0C
  CMP R3, R0
  JL copy_loop

  JMP gen_loop
`;
