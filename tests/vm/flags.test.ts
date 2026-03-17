import { describe, it, expect } from 'vitest';
import {
  computeFlags,
  computeBitwiseFlags,
  computeShiftFlags,
  checkCondition,
} from '../../src/vm/flags';
import { FLAG_Z, FLAG_C, FLAG_N, FLAG_V } from '../../src/vm/types';

describe('computeFlags', () => {
  it('sets Z flag when result is zero', () => {
    const flags = computeFlags(5, 5, 5 - 5);
    expect(flags & FLAG_Z).toBeTruthy();
  });

  it('clears Z flag when result is non-zero', () => {
    const flags = computeFlags(5, 3, 5 - 3);
    expect(flags & FLAG_Z).toBeFalsy();
  });

  it('sets C flag on unsigned underflow (borrow)', () => {
    const flags = computeFlags(3, 5, 3 - 5);
    expect(flags & FLAG_C).toBeTruthy();
  });

  it('clears C flag when no borrow', () => {
    const flags = computeFlags(5, 3, 5 - 3);
    expect(flags & FLAG_C).toBeFalsy();
  });

  it('sets N flag when result bit 7 is set', () => {
    const flags = computeFlags(0, 1, (0 - 1) & 0xFF);
    expect(flags & FLAG_N).toBeTruthy();
  });

  it('sets V flag on signed overflow', () => {
    const flags = computeFlags(127, 1, 128, true);
    expect(flags & FLAG_V).toBeTruthy();
  });
});

describe('checkCondition', () => {
  it('JZ: true when Z=1', () => {
    expect(checkCondition(0x41, FLAG_Z)).toBe(true);
  });

  it('JZ: false when Z=0', () => {
    expect(checkCondition(0x41, 0)).toBe(false);
  });

  it('JNZ: true when Z=0', () => {
    expect(checkCondition(0x42, 0)).toBe(true);
  });

  it('JG: true when Z=0 and C=0', () => {
    expect(checkCondition(0x43, 0)).toBe(true);
  });

  it('JG: false when Z=1', () => {
    expect(checkCondition(0x43, FLAG_Z)).toBe(false);
  });

  it('JL: true when C=1', () => {
    expect(checkCondition(0x44, FLAG_C)).toBe(true);
  });

  it('JL: false when C=0', () => {
    expect(checkCondition(0x44, 0)).toBe(false);
  });
});

describe('computeBitwiseFlags', () => {
  it('sets Z flag when result is zero', () => {
    expect(computeBitwiseFlags(0) & FLAG_Z).toBeTruthy();
  });

  it('clears Z flag when result is non-zero', () => {
    expect(computeBitwiseFlags(0x0F) & FLAG_Z).toBeFalsy();
  });

  it('sets N flag when bit 7 is set', () => {
    expect(computeBitwiseFlags(0x80) & FLAG_N).toBeTruthy();
  });

  it('clears C and V flags always', () => {
    expect(computeBitwiseFlags(0xFF) & FLAG_C).toBeFalsy();
    expect(computeBitwiseFlags(0xFF) & FLAG_V).toBeFalsy();
  });
});

describe('computeShiftFlags', () => {
  it('SHL by 1: carry is last bit shifted out (bit 7)', () => {
    const flags = computeShiftFlags(0x80, 1, true);
    expect(flags & FLAG_C).toBeTruthy();
    expect(flags & FLAG_Z).toBeTruthy();
  });

  it('SHL by 1: no carry when bit 7 is 0', () => {
    const flags = computeShiftFlags(0x40, 1, true);
    expect(flags & FLAG_C).toBeFalsy();
    expect(flags & FLAG_N).toBeTruthy();
  });

  it('SHR by 1: carry is last bit shifted out (bit 0)', () => {
    const flags = computeShiftFlags(0x01, 1, false);
    expect(flags & FLAG_C).toBeTruthy();
    expect(flags & FLAG_Z).toBeTruthy();
  });

  it('SHR by 1: no carry when bit 0 is 0', () => {
    const flags = computeShiftFlags(0x02, 1, false);
    expect(flags & FLAG_C).toBeFalsy();
  });

  it('shift by 0: result unchanged, C cleared', () => {
    const flags = computeShiftFlags(0xFF, 0, true);
    expect(flags & FLAG_C).toBeFalsy();
    expect(flags & FLAG_Z).toBeFalsy();
  });

  it('shift >= 8: result is 0, C is 0', () => {
    const flags = computeShiftFlags(0xFF, 8, true);
    expect(flags & FLAG_Z).toBeTruthy();
    expect(flags & FLAG_C).toBeFalsy();
  });

  it('SHL by 3: carry is bit (8-3)=5 of original', () => {
    const flags = computeShiftFlags(0x20, 3, true);
    expect(flags & FLAG_C).toBeTruthy();
  });

  it('SHR by 3: carry is bit (3-1)=2 of original', () => {
    const flags = computeShiftFlags(0x04, 3, false);
    expect(flags & FLAG_C).toBeTruthy();
  });
});
