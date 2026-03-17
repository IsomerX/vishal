export const TINY_C_COUNTER_NAME = 'Tiny C Counter';
export const TINY_C_COUNTER_DESCRIPTION = 'Tiny C-like example: writes a small counter pattern into RAM.';
export const TINY_C_COUNTER_SOURCE = `// Tiny C Counter
// Writes 16 bytes to RAM starting at 0xF0.

let i = 0;
let addr = 0xF0;

while (i < 16) {
  poke(addr, i ^ 0x0F);
  addr = addr + 1;
  i = i + 1;
}

halt();
`;
