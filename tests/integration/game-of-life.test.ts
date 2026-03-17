import { describe, it, expect } from 'vitest';
import { assemble } from '../../src/assembler/parser';
import { createVM, step } from '../../src/vm/vm';
import { OP_VCOPY } from '../../src/vm/opcodes';
import { GAME_OF_LIFE_SOURCE } from '../../src/examples/game-of-life';
import { PIXEL_TEST_SOURCE } from '../../src/examples/pixel-test';

function loadProgram(memorySize: number, source: string) {
  const result = assemble(source);
  expect(result.errors).toHaveLength(0);

  let state = createVM(memorySize);
  state.memory.set(result.bytecode);
  return { result, state };
}

describe('Pixel Test end-to-end', () => {
  it('assembles and fills VRAM with a gradient', () => {
    const { state: initialState } = loadProgram(2048, PIXEL_TEST_SOURCE);

    let state = initialState;
    let steps = 0;
    while (!state.halted && steps < 500000) {
      state = step(state);
      steps++;
    }

    expect(state.halted).toBe(true);
    expect(state.error).toBeUndefined();

    let nonZero = 0;
    for (let i = 0; i < state.vram.length; i++) {
      if (state.vram[i] !== 0) nonZero++;
    }

    expect(nonZero).toBeGreaterThan(0);
  });
});

describe('Game of Life end-to-end', () => {
  it('assembles and produces visible VRAM output across two frame copies', () => {
    const { result, state: initialState } = loadProgram(4096, GAME_OF_LIFE_SOURCE);
    expect(result.bytecode.length).toBeGreaterThan(0);

    let state = initialState;
    let steps = 0;
    let vcopyCount = 0;

    while (vcopyCount < 2 && steps < 300000 && !state.error) {
      const opcode = state.memory[state.registers.PC];
      state = step(state);
      steps++;
      if (opcode === OP_VCOPY) vcopyCount++;
    }

    expect(state.error).toBeUndefined();
    expect(vcopyCount).toBeGreaterThanOrEqual(2);

    let aliveCount = 0;
    for (let i = 0; i < state.vram.length; i++) {
      if (state.vram[i] !== 0) aliveCount++;
    }

    expect(aliveCount).toBeGreaterThanOrEqual(5);
  });
});
