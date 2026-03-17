import { describe, it, expect } from 'vitest';
import { createVM, step } from '../../src/vm/vm';
import { assemble } from '../../src/assembler/parser';
import { BUBBLE_SORT_SOURCE } from '../../src/examples/bubble-sort';

describe('Bubble Sort end-to-end', () => {
  it('assembles and sorts the data correctly', () => {
    const result = assemble(BUBBLE_SORT_SOURCE);
    expect(result.errors).toHaveLength(0);

    let state = createVM(256);
    // Load bytecode
    for (let i = 0; i < result.bytecode.length; i++) {
      state.memory[i] = result.bytecode[i];
    }

    // Run until halted (max 10000 steps to prevent infinite loop)
    let steps = 0;
    while (!state.halted && steps < 10000) {
      state = step(state);
      steps++;
    }

    expect(state.halted).toBe(true);
    expect(state.error).toBeUndefined();

    // Check that data at 0x40..0x49 is sorted ascending
    const sorted = Array.from(state.memory.slice(0x40, 0x4A));
    const expected = [...sorted].sort((a, b) => a - b);
    expect(sorted).toEqual(expected);
  });
});
