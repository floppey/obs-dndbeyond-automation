/**
 * Tests for StatCalculator class
 */

import { describe, it, expect } from 'vitest';
import { StatCalculator } from '../stats/calculator.js';
import { createMockCharacterData } from '../__fixtures__/character-data.js';

describe('StatCalculator', () => {
  const calculator = new StatCalculator();

  describe('calculateStat', () => {
    it('should throw error for unknown stat', () => {
      const data = createMockCharacterData();
      // @ts-ignore - intentionally passing invalid stat ID
      expect(() => calculator.calculateStat('unknown_stat', data)).toThrow(
        'Unknown stat: unknown_stat'
      );
    });

    it('should calculate valid stats', () => {
      const data = createMockCharacterData();
      const level = calculator.calculateStat('level', data);
      expect(level).toBe(5);
    });

    it('should handle calculation errors gracefully', () => {
      const data = createMockCharacterData();
      // Data is valid, so this should not throw
      const ac = calculator.calculateStat('ac', data);
      expect(typeof ac).toBe('number');
    });
  });

  describe('calculateMappings', () => {
    it('should return formatted values with change detection', () => {
      const data = createMockCharacterData();
      const mappings = [
        { statId: 'level' as const, obsSourceName: 'level_text' },
        { statId: 'ac' as const, obsSourceName: 'ac_text' },
      ];

      const results = calculator.calculateMappings(mappings, data);

      expect(results).toHaveLength(2);
      expect(results[0].obsSourceName).toBe('level_text');
      expect(results[0].value).toBe('5');
      expect(results[0].changed).toBe(true);
      expect(results[1].obsSourceName).toBe('ac_text');
      expect(typeof results[1].value).toBe('string');
    });

    it('should apply format strings', () => {
      const data = createMockCharacterData();
      const mappings = [
        { statId: 'ac' as const, obsSourceName: 'ac_text', format: 'AC: {value}' },
      ];

      const results = calculator.calculateMappings(mappings, data);

      expect(results[0].value).toMatch(/^AC: \d+$/);
    });

    it('should detect value changes from previous values', () => {
      const data = createMockCharacterData();
      const mappings = [
        { statId: 'level' as const, obsSourceName: 'level_text' },
      ];
      const previousValues = new Map([['level_text', '5']]);

      const results = calculator.calculateMappings(mappings, data, previousValues);

      expect(results[0].changed).toBe(false);
    });

    it('should detect when value has changed', () => {
      const data = createMockCharacterData();
      const mappings = [
        { statId: 'level' as const, obsSourceName: 'level_text' },
      ];
      const previousValues = new Map([['level_text', '4']]);

      const results = calculator.calculateMappings(mappings, data, previousValues);

      expect(results[0].changed).toBe(true);
      expect(results[0].value).toBe('5');
      expect(results[0].previousValue).toBe('4');
    });

    it('should handle calculation errors in mappings gracefully', () => {
      const data = createMockCharacterData();
      const mappings = [
        { statId: 'level' as const, obsSourceName: 'level_text' },
        { statId: 'invalid_stat', obsSourceName: 'invalid_text' },
      ] as any;

      const results = calculator.calculateMappings(mappings, data);

      expect(results).toHaveLength(2);
      expect(results[1].value).toBe('ERROR');
      expect(results[1].changed).toBe(true);
    });
  });

  describe('getAvailableStats', () => {
    it('should return all stat IDs', () => {
      const stats = calculator.getAvailableStats();

      expect(Array.isArray(stats)).toBe(true);
      expect(stats.length).toBeGreaterThan(0);
      expect(stats).toContain('level');
      expect(stats).toContain('ac');
      expect(stats).toContain('hp_current');
      expect(stats).toContain('hp_max');
    });

    it('should return expected count of stats', () => {
      const stats = calculator.getAvailableStats();
      // We expect at least 20+ stats based on the definitions
      expect(stats.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe('getStatDefinition', () => {
    it('should return stat definition for valid stat', () => {
      const def = calculator.getStatDefinition('level');
      expect(def).toBeDefined();
      expect(def?.id).toBe('level');
      expect(def?.name).toBe('Character Level');
    });

    it('should return undefined for invalid stat', () => {
      // @ts-ignore
      const def = calculator.getStatDefinition('invalid_stat');
      expect(def).toBeUndefined();
    });
  });
});
