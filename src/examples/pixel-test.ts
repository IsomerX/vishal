export const PIXEL_TEST_NAME = 'Pixel Test';
export const PIXEL_TEST_DESCRIPTION = 'Fills the 32x32 display with an RGB332 gradient.';
export const PIXEL_TEST_SOURCE = `; Pixel Test - fill a 32x32 buffer with a 0..255 gradient repeated 4x
; Buffer lives at 0x0400, then VCOPY copies it into VRAM

  MOV R0, 0         ; current gradient byte
  MOV R1, 0         ; constant zero
  MOV R2, 0x00      ; write pointer low byte
  MOV R3, 0x04      ; write pointer high byte
  MOV R4, 0         ; completed 256-byte pages
  MOV R5, 4         ; stop after 4 pages = 1024 bytes

fill:
  STORE [R2], R0
  INC R0
  INC R2
  CMP R2, R1
  JNZ fill
  INC R3
  INC R4
  CMP R4, R5
  JL fill

  MOV R0, 0x00
  MOV R1, 0x04
  VCOPY R0
  HLT
`;
