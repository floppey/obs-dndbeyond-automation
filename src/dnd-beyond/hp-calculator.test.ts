/**
 * Tests for HP state calculation logic
 */

import { describe, it, expect } from 'vitest';
import { calculateHpState, formatHpInfo } from '../dnd-beyond/hp-calculator.js';
import { HpState } from '../types.js';

describe('calculateHpState', () => {
  it('should return Unconscious when currentHp is 0', () => {
    const state = calculateHpState(0, 100, false);
    expect(state).toBe(HpState.Unconscious);
  });

  it('should return Unconscious when isDead is true', () => {
    const state = calculateHpState(50, 100, true);
    expect(state).toBe(HpState.Unconscious);
  });

  it('should return Unconscious when deathSaves has successes', () => {
    const state = calculateHpState(50, 100, false, { successes: 1, failures: 0 });
    expect(state).toBe(HpState.Unconscious);
  });

  it('should return Unconscious when deathSaves has failures', () => {
    const state = calculateHpState(50, 100, false, { successes: 0, failures: 1 });
    expect(state).toBe(HpState.Unconscious);
  });

  it('should return Healthy when HP is 76% (76/100)', () => {
    const state = calculateHpState(76, 100, false);
    expect(state).toBe(HpState.Healthy);
  });

  it('should return Scratched at boundary 75% (75/100)', () => {
    const state = calculateHpState(75, 100, false);
    expect(state).toBe(HpState.Scratched);
  });

  it('should return Scratched when HP is 51% (51/100)', () => {
    const state = calculateHpState(51, 100, false);
    expect(state).toBe(HpState.Scratched);
  });

  it('should return Bloodied at boundary 50% (50/100)', () => {
    const state = calculateHpState(50, 100, false);
    expect(state).toBe(HpState.Bloodied);
  });

  it('should return Bloodied when HP is 26% (26/100)', () => {
    const state = calculateHpState(26, 100, false);
    expect(state).toBe(HpState.Bloodied);
  });

  it('should return Dying at boundary 25% (25/100)', () => {
    const state = calculateHpState(25, 100, false);
    expect(state).toBe(HpState.Dying);
  });

  it('should return Dying when HP is 1% (1/100)', () => {
    const state = calculateHpState(1, 100, false);
    expect(state).toBe(HpState.Dying);
  });

  it('should handle maxHp=0 gracefully (division by zero edge case)', () => {
    const state = calculateHpState(0, 0, false);
    expect(state).toBe(HpState.Unconscious);
  });

  it('should handle positive currentHp with maxHp=0 edge case', () => {
    // When maxHp is 0 but currentHp > 0, hpPercentage becomes 100
    const state = calculateHpState(5, 0, false);
    expect(state).toBe(HpState.Healthy);
  });
});

describe('formatHpInfo', () => {
  it('should format normal HP without temp HP', () => {
    const formatted = formatHpInfo(50, 100, 0, HpState.Bloodied);
    expect(formatted).toBe('HP 50/100 (50%) → bloodied');
  });

  it('should format HP with temp HP > 0', () => {
    const formatted = formatHpInfo(50, 100, 10, HpState.Bloodied);
    expect(formatted).toBe('HP 50/100 (50%) [+10 temp] → bloodied');
  });

  it('should round percentage correctly', () => {
    const formatted = formatHpInfo(33, 100, 0, HpState.Bloodied);
    expect(formatted).toContain('(33%)');
  });

  it('should handle different HP states', () => {
    const formatted = formatHpInfo(90, 100, 0, HpState.Healthy);
    expect(formatted).toContain('healthy');
  });

  it('should format zero HP as unconscious state', () => {
    const formatted = formatHpInfo(0, 100, 0, HpState.Unconscious);
    expect(formatted).toBe('HP 0/100 (0%) → unconscious');
  });
});
