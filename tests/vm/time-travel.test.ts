import { describe, it, expect, beforeEach } from 'vitest';
import { TimeTravel } from '../../src/vm/time-travel';
import { createVM, step } from '../../src/vm/vm';
import { OP_NOP } from '../../src/vm/opcodes';

// Fill memory with NOPs so the VM can step freely without halting
function makeVMWithNOPs(memSize = 256) {
  const vm = createVM(memSize);
  vm.memory.fill(OP_NOP);
  return vm;
}

describe('TimeTravel — initial state', () => {
  it('starts with length 0', () => {
    const tt = new TimeTravel();
    expect(tt.length).toBe(0);
  });

  it('minCycle is null when history is empty', () => {
    const tt = new TimeTravel();
    expect(tt.minCycle).toBeNull();
  });

  it('stepBack returns null when no history', () => {
    const tt = new TimeTravel();
    expect(tt.stepBack()).toBeNull();
  });

  it('stepBack returns null when only one entry', () => {
    const tt = new TimeTravel();
    const vm = makeVMWithNOPs();
    tt.record(vm);
    expect(tt.stepBack()).toBeNull();
  });
});

describe('TimeTravel — record', () => {
  it('tracks length correctly after multiple records', () => {
    const tt = new TimeTravel();
    let state = makeVMWithNOPs();
    for (let i = 0; i < 5; i++) {
      tt.record(state);
      state = step(state);
    }
    expect(tt.length).toBe(5);
  });

  it('stores independent clones (mutations to source do not affect history)', () => {
    const tt = new TimeTravel();
    const vm = makeVMWithNOPs();
    tt.record(vm);           // snapshot cycle 0, R0=0
    // Mutate the source after recording
    vm.registers.R0 = 99;
    // Record a second state at cycle 1
    const vm2 = step(vm);
    tt.record(vm2);

    // Jump back to cycle 0 — should reflect R0=0, not the mutated 99
    const restored = tt.jumpTo(0)!;
    expect(restored.registers.R0).toBe(0);
    expect(tt.length).toBe(1);
  });

  it('minCycle reflects the oldest recorded state', () => {
    const tt = new TimeTravel();
    let state = makeVMWithNOPs();
    tt.record(state);         // cycle 0
    state = step(state);      // cycle 1
    tt.record(state);
    state = step(state);      // cycle 2
    tt.record(state);
    expect(tt.minCycle).toBe(0);
  });
});

describe('TimeTravel — stepBack', () => {
  it('returns the previous state and removes the current from history', () => {
    const tt = new TimeTravel();
    let state = makeVMWithNOPs();
    tt.record(state);           // record cycle 0
    state = step(state);        // advance to cycle 1
    tt.record(state);           // record cycle 1

    const prev = tt.stepBack();
    expect(prev).not.toBeNull();
    expect(prev!.cycle).toBe(0);
    expect(tt.length).toBe(1);
  });

  it('stepping back multiple times walks backwards through history', () => {
    const tt = new TimeTravel();
    let state = makeVMWithNOPs();
    for (let i = 0; i < 4; i++) {
      tt.record(state);
      state = step(state);
    }
    // history: cycles 0,1,2,3
    expect(tt.length).toBe(4);

    const s3 = tt.stepBack();
    expect(s3!.cycle).toBe(2);
    expect(tt.length).toBe(3);

    const s2 = tt.stepBack();
    expect(s2!.cycle).toBe(1);
    expect(tt.length).toBe(2);

    const s1 = tt.stepBack();
    expect(s1!.cycle).toBe(0);
    expect(tt.length).toBe(1);

    // Only one entry left — stepBack should return null
    expect(tt.stepBack()).toBeNull();
    expect(tt.length).toBe(1);
  });

  it('returned state is a clone independent from history', () => {
    const tt = new TimeTravel();
    let state = makeVMWithNOPs();
    tt.record(state);
    state = step(state);
    tt.record(state);

    const prev = tt.stepBack()!;
    prev.registers.R0 = 0xFF;

    // Step back again should not be affected (only 1 entry remains, returns null)
    expect(tt.stepBack()).toBeNull();
  });
});

describe('TimeTravel — jumpTo', () => {
  it('returns null for a cycle not in history', () => {
    const tt = new TimeTravel();
    const state = makeVMWithNOPs();
    tt.record(state);
    expect(tt.jumpTo(999)).toBeNull();
  });

  it('jumps to a specific cycle and truncates later history', () => {
    const tt = new TimeTravel();
    let state = makeVMWithNOPs();
    for (let i = 0; i < 5; i++) {
      tt.record(state);
      state = step(state);
    }
    // history: cycles 0,1,2,3,4
    expect(tt.length).toBe(5);

    const jumped = tt.jumpTo(2);
    expect(jumped).not.toBeNull();
    expect(jumped!.cycle).toBe(2);
    // History should now contain only cycles 0,1,2
    expect(tt.length).toBe(3);
  });

  it('jumping to the earliest cycle leaves only one entry', () => {
    const tt = new TimeTravel();
    let state = makeVMWithNOPs();
    for (let i = 0; i < 3; i++) {
      tt.record(state);
      state = step(state);
    }

    const jumped = tt.jumpTo(0);
    expect(jumped!.cycle).toBe(0);
    expect(tt.length).toBe(1);
    expect(tt.minCycle).toBe(0);
  });

  it('jumping to the latest cycle keeps full history', () => {
    const tt = new TimeTravel();
    let state = makeVMWithNOPs();
    for (let i = 0; i < 4; i++) {
      tt.record(state);
      state = step(state);
    }
    // history: cycles 0,1,2,3
    const jumped = tt.jumpTo(3);
    expect(jumped!.cycle).toBe(3);
    expect(tt.length).toBe(4);
  });

  it('returned state is independent from history', () => {
    const tt = new TimeTravel();
    let state = makeVMWithNOPs();
    for (let i = 0; i < 3; i++) {
      tt.record(state);
      state = step(state);
    }

    const jumped = tt.jumpTo(1)!;
    jumped.registers.R0 = 0xAB;

    // jumpTo again should return same cycle value but unaffected registers
    const jumped2 = tt.jumpTo(1)!;
    expect(jumped2.registers.R0).toBe(0);
  });
});

describe('TimeTravel — maxSize', () => {
  it('respects maxSize by evicting the oldest entry', () => {
    const tt = new TimeTravel(3);
    let state = makeVMWithNOPs();
    for (let i = 0; i < 5; i++) {
      tt.record(state);
      state = step(state);
    }
    // Only the last 3 states should remain
    expect(tt.length).toBe(3);
    // The oldest retained state should be cycle 2 (0 and 1 were evicted)
    expect(tt.minCycle).toBe(2);
  });

  it('maxSize of 1 keeps only the latest state', () => {
    const tt = new TimeTravel(1);
    let state = makeVMWithNOPs();
    for (let i = 0; i < 4; i++) {
      tt.record(state);
      state = step(state);
    }
    expect(tt.length).toBe(1);
    expect(tt.minCycle).toBe(3);
  });
});

describe('TimeTravel — reset', () => {
  it('clears all history', () => {
    const tt = new TimeTravel();
    let state = makeVMWithNOPs();
    for (let i = 0; i < 5; i++) {
      tt.record(state);
      state = step(state);
    }
    expect(tt.length).toBe(5);

    tt.reset();

    expect(tt.length).toBe(0);
    expect(tt.minCycle).toBeNull();
    expect(tt.stepBack()).toBeNull();
  });

  it('can record new states after reset', () => {
    const tt = new TimeTravel();
    let state = makeVMWithNOPs();
    tt.record(state);
    tt.reset();

    state = step(state);
    tt.record(state);
    expect(tt.length).toBe(1);
    expect(tt.minCycle).toBe(1);
  });
});
