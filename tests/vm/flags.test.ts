import { describe, it, expect } from 'vitest';
import { computeFlags, checkCondition } from '../../src/vm/flags';
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
