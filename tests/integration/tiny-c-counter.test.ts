import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/assembler/parser';
import { compileTinyC } from '../../src/compiler/tiny-c';
import { TINY_C_COUNTER_SOURCE } from '../../src/examples/tiny-c-counter';
import { createVM, step } from '../../src/vm/vm';

describe('Tiny C Counter end-to-end', () => {
  it('compiles, assembles, and writes the expected pattern to RAM', () => {
    const compiled = compileTinyC(TINY_C_COUNTER_SOURCE);
    expect(compiled.errors).toEqual([]);

    const assembled = assemble(compiled.assembly);
    expect(assembled.errors).toEqual([]);

    let state = createVM(1024);
    state.memory.set(assembled.bytecode);

    let steps = 0;
    while (!state.halted && steps < 20000) {
      state = step(state);
      steps++;
    }

    expect(state.halted).toBe(true);
    expect(state.error).toBeUndefined();
    expect(Array.from(state.memory.slice(0xF0, 0x100))).toEqual([
      0x0F, 0x0E, 0x0D, 0x0C,
      0x0B, 0x0A, 0x09, 0x08,
      0x07, 0x06, 0x05, 0x04,
      0x03, 0x02, 0x01, 0x00,
    ]);
  });
});
