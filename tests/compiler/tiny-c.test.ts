import { describe, expect, it } from 'vitest';
import { assemble } from '../../src/assembler/parser';
import { compileTinyC } from '../../src/compiler/tiny-c';
import { createVM, step } from '../../src/vm/vm';

function runTinyC(source: string, memorySize = 512) {
  const compiled = compileTinyC(source);
  expect(compiled.errors).toEqual([]);

  const assembled = assemble(compiled.assembly);
  expect(assembled.errors).toEqual([]);

  let state = createVM(memorySize);
  state.memory.set(assembled.bytecode);

  let steps = 0;
  while (!state.halted && steps < 10000) {
    state = step(state);
    steps++;
  }

  return { compiled, assembled, state, steps };
}

describe('Tiny C compiler', () => {
  it('compiles variable declarations and arithmetic assignments', () => {
    const { state } = runTinyC(`
      let x = 2;
      let y = 3;
      let z = x + y;
      poke(0x40, z);
      halt();
    `);

    expect(state.halted).toBe(true);
    expect(state.error).toBeUndefined();
    expect(state.memory[0x40]).toBe(5);
  });

  it('compiles while loops and dynamic poke addresses', () => {
    const { state } = runTinyC(`
      let i = 0;
      let addr = 0x80;
      while (i < 4) {
        poke(addr, i);
        addr = addr + 1;
        i = i + 1;
      }
      halt();
    `);

    expect(Array.from(state.memory.slice(0x80, 0x84))).toEqual([0, 1, 2, 3]);
  });

  it('compiles if/else branches', () => {
    const { state } = runTinyC(`
      let x = 1;
      let y = 2;
      if (x < y) {
        poke(0x41, 0xAA);
      } else {
        poke(0x41, 0xBB);
      }
      halt();
    `);

    expect(state.memory[0x41]).toBe(0xAA);
  });

  it('compiles bitwise and shift expressions', () => {
    const { state } = runTinyC(`
      let x = 0xF0;
      let y = 0x0F;
      let z = (x | y) ^ 0x0F;
      let s = z >> 4;
      poke(0x42, s);
      halt();
    `);

    expect(state.memory[0x42]).toBe(0x0F);
  });

  it('supports VRAM builtins', () => {
    const { state } = runTinyC(`
      let color = 0xFF;
      vstore(0x0000, color);
      halt();
    `, 1024);

    expect(state.vram[0]).toBe(0xFF);
  });

  it('returns compiler errors for unknown variables', () => {
    const compiled = compileTinyC(`
      foo = 1;
      halt();
    `);

    expect(compiled.errors).toHaveLength(1);
    expect(compiled.errors[0].message).toMatch(/unknown variable/i);
  });
});
