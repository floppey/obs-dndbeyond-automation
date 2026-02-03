/**
 * Comprehensive unit tests for the Rules Engine
 * 
 * Tests the complete rule evaluation system including:
 * - Basic rule evaluation and filtering
 * - Evaluation modes (first_match, all_matches)
 * - HP condition types
 * - Death state conditions
 * - Constant conditions
 * - Condition groups with AND/OR logic
 * - Edge cases and error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RuleEngine } from './engine.js';
import {
  RuleEngineConfig,
  EvaluationContext,
  RuleAction,
  Rule,
  RuleList,
  Condition,
  ConditionGroup,
} from './types.js';
import { DndBeyondCharacterResponse } from '../types.js';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Create a minimal mock D&D Beyond character response
 */
function createMockCharacter(
  overrides?: Partial<DndBeyondCharacterResponse>
): DndBeyondCharacterResponse {
  return {
    baseHitPoints: 100,
    bonusHitPoints: null,
    overrideHitPoints: null,
    removedHitPoints: 0,
    temporaryHitPoints: 0,
    stats: [
      { id: 1, name: 'Strength', value: 14 },
      { id: 2, name: 'Dexterity', value: 16 },
      { id: 3, name: 'Constitution', value: 13 },
      { id: 4, name: 'Intelligence', value: 10 },
      { id: 5, name: 'Wisdom', value: 12 },
      { id: 6, name: 'Charisma', value: 8 },
    ],
    bonusStats: [],
    overrideStats: [],
    classes: [
      { level: 5 },
    ],
    modifiers: {
      race: [],
      class: [],
      background: [],
      item: [],
      feat: [],
      condition: [],
    },
    deathSaves: {
      successes: 0,
      failures: 0,
    },
    isDead: false,
    inventory: [],
    ...overrides,
  };
}

/**
 * Create an evaluation context with sensible defaults
 */
function createContext(
  overrides?: Partial<EvaluationContext>
): EvaluationContext {
  return {
    character: createMockCharacter(),
    currentHp: 50,
    maxHp: 100,
    temporaryHp: 0,
    hpPercentage: 50,
    isDead: false,
    deathSaves: { successes: 0, failures: 0 },
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Create a rule engine configuration with rule lists
 */
function createConfig(ruleLists: RuleList[]): RuleEngineConfig {
  return {
    version: '1.0',
    ruleLists,
  };
}

/**
 * Create a rule list with default settings
 */
function createRuleList(
  id: string,
  mode: 'first_match' | 'all_matches',
  rules: Rule[],
  enabled = true
): RuleList {
  return {
    id,
    name: id,
    enabled,
    mode,
    rules,
  };
}

/**
 * Create a rule with default settings
 */
function createRule(
  id: string,
  condition: Condition | ConditionGroup | null,
  actions: RuleAction[] = [],
  priority = 0,
  enabled = true
): Rule {
  return {
    id,
    condition,
    actions,
    priority,
    enabled,
  };
}

/**
 * Create a mock action for testing
 */
function createMockAction(sourceName: string): RuleAction {
  return {
    type: 'set_text',
    sourceName,
    text: 'Test',
  };
}

// ============================================================================
// TEST SUITE
// ============================================================================

describe('RuleEngine', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
    // Suppress console output during tests
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  // ==========================================================================
  // BASIC RULE EVALUATION
  // ==========================================================================

  describe('evaluate() - Basic Evaluation', () => {
    it('should return empty actions for empty config', () => {
      const config = createConfig([]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toEqual([]);
    });

    it('should return empty actions when no rules match', () => {
      const rule = createRule('rule-1', { type: 'never' });
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toEqual([]);
    });

    it('should skip disabled rule lists', () => {
      const rule = createRule('rule-1', { type: 'always' }, [createMockAction('source1')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule], false);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toEqual([]);
    });

    it('should skip disabled rules', () => {
      const rule = createRule('rule-1', { type: 'always' }, [createMockAction('source1')], 0, false);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toEqual([]);
    });

    it('should return actions from matching rule', () => {
      const action = createMockAction('source1');
      const rule = createRule('rule-1', { type: 'always' }, [action]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
      expect(actions[0]).toEqual(action);
    });

    it('should sort rules by priority (higher first)', () => {
      const action1 = { type: 'set_text' as const, sourceName: 'source1', text: 'action1' };
      const action2 = { type: 'set_text' as const, sourceName: 'source2', text: 'action2' };
      const action3 = { type: 'set_text' as const, sourceName: 'source3', text: 'action3' };

      const rule1 = createRule('rule-1', { type: 'always' }, [action1], 5);
      const rule2 = createRule('rule-2', { type: 'always' }, [action2], 10);
      const rule3 = createRule('rule-3', { type: 'always' }, [action3], 1);

      const ruleList = createRuleList('list-1', 'all_matches', [rule1, rule2, rule3]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(3);
      expect((actions[0] as any).sourceName).toBe('source2');
      expect((actions[1] as any).sourceName).toBe('source1');
      expect((actions[2] as any).sourceName).toBe('source3');
    });
  });

  // ==========================================================================
  // EVALUATION MODES
  // ==========================================================================

  describe('evaluate() - Evaluation Modes', () => {
    it('should stop at first match in first_match mode', () => {
      const action1 = { type: 'set_text' as const, sourceName: 'source1', text: 'action1' };
      const action2 = { type: 'set_text' as const, sourceName: 'source2', text: 'action2' };

      const rule1 = createRule('rule-1', { type: 'always' }, [action1], 10);
      const rule2 = createRule('rule-2', { type: 'always' }, [action2], 5);

      const ruleList = createRuleList('list-1', 'first_match', [rule1, rule2]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
      expect((actions[0] as any).sourceName).toBe('source1');
    });

    it('should collect all matches in all_matches mode', () => {
      const action1 = { type: 'set_text' as const, sourceName: 'source1', text: 'action1' };
      const action2 = { type: 'set_text' as const, sourceName: 'source2', text: 'action2' };

      const rule1 = createRule('rule-1', { type: 'always' }, [action1]);
      const rule2 = createRule('rule-2', { type: 'always' }, [action2]);

      const ruleList = createRuleList('list-1', 'all_matches', [rule1, rule2]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(2);
    });

    it('should skip non-matching rules in first_match mode', () => {
      const action1 = { type: 'set_text' as const, sourceName: 'source1', text: 'action1' };
      const action2 = { type: 'set_text' as const, sourceName: 'source2', text: 'action2' };

      const rule1 = createRule('rule-1', { type: 'never' }, [action1], 10);
      const rule2 = createRule('rule-2', { type: 'always' }, [action2], 5);

      const ruleList = createRuleList('list-1', 'first_match', [rule1, rule2]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
      expect((actions[0] as any).sourceName).toBe('source2');
    });
  });

  // ==========================================================================
  // HP CONDITIONS
  // ==========================================================================

  describe('HP Conditions - hp_percentage', () => {
    it('should match HP > percentage', () => {
      const rule = createRule('rule-1', { type: 'hp_percentage', operator: '>', value: 40 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 50 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should match HP >= percentage', () => {
      const rule = createRule('rule-1', { type: 'hp_percentage', operator: '>=', value: 50 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 50 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should match HP < percentage', () => {
      const rule = createRule('rule-1', { type: 'hp_percentage', operator: '<', value: 60 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 50 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should match HP <= percentage', () => {
      const rule = createRule('rule-1', { type: 'hp_percentage', operator: '<=', value: 50 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 50 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should match HP == percentage', () => {
      const rule = createRule('rule-1', { type: 'hp_percentage', operator: '==', value: 50 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 50 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should match HP != percentage', () => {
      const rule = createRule('rule-1', { type: 'hp_percentage', operator: '!=', value: 60 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 50 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should not match when HP percentage does not satisfy condition', () => {
      const rule = createRule('rule-1', { type: 'hp_percentage', operator: '>', value: 60 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 50 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });
  });

  describe('HP Conditions - hp_value', () => {
    it('should match current HP > value', () => {
      const rule = createRule('rule-1', { type: 'hp_value', operator: '>', value: 40 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ currentHp: 50 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should match current HP <= value', () => {
      const rule = createRule('rule-1', { type: 'hp_value', operator: '<=', value: 25 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ currentHp: 20 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });
  });

  describe('HP Conditions - hp_temp', () => {
    it('should match temporary HP >= value', () => {
      const rule = createRule('rule-1', { type: 'hp_temp', operator: '>=', value: 1 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ temporaryHp: 10 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should not match when character has no temporary HP', () => {
      const rule = createRule('rule-1', { type: 'hp_temp', operator: '>=', value: 1 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ temporaryHp: 0 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });
  });

  describe('HP Conditions - hp_missing', () => {
    it('should match missing HP >= value', () => {
      const rule = createRule('rule-1', { type: 'hp_missing', operator: '>=', value: 40 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ currentHp: 60, maxHp: 100 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should calculate missing HP as maxHp - currentHp', () => {
      const rule = createRule('rule-1', { type: 'hp_missing', operator: '==', value: 30 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ currentHp: 70, maxHp: 100 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });
  });

  // ==========================================================================
  // DEATH STATE CONDITIONS
  // ==========================================================================

  describe('Death State Conditions - is_dead', () => {
    it('should match when is_dead is true', () => {
      const rule = createRule('rule-1', { type: 'is_dead', value: true }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ isDead: true });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should match when is_dead is false', () => {
      const rule = createRule('rule-1', { type: 'is_dead', value: false }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ isDead: false });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should not match when is_dead state differs', () => {
      const rule = createRule('rule-1', { type: 'is_dead', value: true }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ isDead: false });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });
  });

  describe('Death State Conditions - is_unconscious', () => {
    it('should match when at 0 HP', () => {
      const rule = createRule('rule-1', { type: 'is_unconscious', value: true }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ currentHp: 0, isDead: false, deathSaves: { successes: 0, failures: 0 } });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should match when dead', () => {
      const rule = createRule('rule-1', { type: 'is_unconscious', value: true }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ isDead: true });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should match when has death save failures', () => {
      const rule = createRule('rule-1', { type: 'is_unconscious', value: true }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ deathSaves: { successes: 0, failures: 1 } });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should not match when conscious', () => {
      const rule = createRule('rule-1', { type: 'is_unconscious', value: true }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ currentHp: 50, isDead: false, deathSaves: { successes: 0, failures: 0 } });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });
  });

  describe('Death State Conditions - death_saves_success', () => {
    it('should match death save successes >= value', () => {
      const rule = createRule('rule-1', { type: 'death_saves_success', operator: '>=', value: 2 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ deathSaves: { successes: 2, failures: 0 } });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should not match when death save successes do not satisfy condition', () => {
      const rule = createRule('rule-1', { type: 'death_saves_success', operator: '>=', value: 3 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ deathSaves: { successes: 2, failures: 0 } });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });
  });

  describe('Death State Conditions - death_saves_failure', () => {
    it('should match death save failures >= value', () => {
      const rule = createRule('rule-1', { type: 'death_saves_failure', operator: '>=', value: 2 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ deathSaves: { successes: 0, failures: 2 } });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });
  });

  // ==========================================================================
  // CONSTANT CONDITIONS
  // ==========================================================================

  describe('Constant Conditions - always', () => {
    it('should always match', () => {
      const rule = createRule('rule-1', { type: 'always' }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should match regardless of character state', () => {
      const rule = createRule('rule-1', { type: 'always' }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ isDead: true, currentHp: 0 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });
  });

  describe('Constant Conditions - never', () => {
    it('should never match', () => {
      const rule = createRule('rule-1', { type: 'never' }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });
  });

  // ==========================================================================
  // NULL CONDITION
  // ==========================================================================

  describe('Null Condition', () => {
    it('should always match when condition is null', () => {
      const rule = createRule('rule-1', null, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });
  });

  // ==========================================================================
  // CONDITION GROUPS - AND
  // ==========================================================================

  describe('Condition Groups - AND', () => {
    it('should match when all conditions are true', () => {
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [
          { type: 'hp_percentage', operator: '<=', value: 50 },
          { type: 'is_dead', value: false },
        ],
      };

      const rule = createRule('rule-1', group, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 40, isDead: false });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should not match when any condition is false', () => {
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [
          { type: 'hp_percentage', operator: '<=', value: 50 },
          { type: 'is_dead', value: false },
        ],
      };

      const rule = createRule('rule-1', group, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 40, isDead: true });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });

    it('should not match when all conditions are false', () => {
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [
          { type: 'hp_percentage', operator: '>', value: 50 },
          { type: 'is_dead', value: true },
        ],
      };

      const rule = createRule('rule-1', group, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 40, isDead: false });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });
  });

  // ==========================================================================
  // CONDITION GROUPS - OR
  // ==========================================================================

  describe('Condition Groups - OR', () => {
    it('should match when any condition is true', () => {
      const group: ConditionGroup = {
        operator: 'OR',
        conditions: [
          { type: 'hp_percentage', operator: '<=', value: 50 },
          { type: 'is_dead', value: true },
        ],
      };

      const rule = createRule('rule-1', group, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 40, isDead: false });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should match when all conditions are true', () => {
      const group: ConditionGroup = {
        operator: 'OR',
        conditions: [
          { type: 'hp_percentage', operator: '<=', value: 50 },
          { type: 'is_dead', value: true },
        ],
      };

      const rule = createRule('rule-1', group, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 40, isDead: true });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should not match when all conditions are false', () => {
      const group: ConditionGroup = {
        operator: 'OR',
        conditions: [
          { type: 'hp_percentage', operator: '>', value: 50 },
          { type: 'is_dead', value: true },
        ],
      };

      const rule = createRule('rule-1', group, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 40, isDead: false });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });
  });

  // ==========================================================================
  // NESTED CONDITION GROUPS
  // ==========================================================================

  describe('Nested Condition Groups', () => {
    it('should support AND inside OR', () => {
      const andGroup: ConditionGroup = {
        operator: 'AND',
        conditions: [
          { type: 'hp_percentage', operator: '<=', value: 50 },
          { type: 'is_dead', value: false },
        ],
      };

      const orGroup: ConditionGroup = {
        operator: 'OR',
        conditions: [
          andGroup,
          { type: 'is_unconscious', value: true },
        ],
      };

      const rule = createRule('rule-1', orGroup, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 40, isDead: false });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should support OR inside AND', () => {
      const orGroup: ConditionGroup = {
        operator: 'OR',
        conditions: [
          { type: 'hp_percentage', operator: '<=', value: 25 },
          { type: 'is_dead', value: true },
        ],
      };

      const andGroup: ConditionGroup = {
        operator: 'AND',
        conditions: [
          orGroup,
          { type: 'is_unconscious', value: true },
        ],
      };

      const rule = createRule('rule-1', andGroup, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 20, isDead: true });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should support multiple levels of nesting', () => {
      const innerAnd: ConditionGroup = {
        operator: 'AND',
        conditions: [
          { type: 'hp_percentage', operator: '<=', value: 50 },
          { type: 'is_dead', value: false },
        ],
      };

      const middleOr: ConditionGroup = {
        operator: 'OR',
        conditions: [
          innerAnd,
          { type: 'is_unconscious', value: true },
        ],
      };

      const outerAnd: ConditionGroup = {
        operator: 'AND',
        conditions: [
          middleOr,
          { type: 'hp_temp', operator: '>=', value: 1 },
        ],
      };

      const rule = createRule('rule-1', outerAnd, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ hpPercentage: 40, isDead: false, temporaryHp: 5 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    it('should handle empty condition group', () => {
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [],
      };

      const rule = createRule('rule-1', group, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });

    it('should handle unknown condition type gracefully', () => {
      const rule = createRule('rule-1', { type: 'unknown_type' } as any, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });

    it('should handle missing character data gracefully', () => {
      const rule = createRule('rule-1', { type: 'ability_score', ability: 'strength', operator: '>=', value: 10 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ character: createMockCharacter({ stats: [] }) });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });

    it('should handle 0 HP without error', () => {
      const rule = createRule('rule-1', { type: 'hp_value', operator: '==', value: 0 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ currentHp: 0 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should handle 100% HP without error', () => {
      const rule = createRule('rule-1', { type: 'hp_percentage', operator: '==', value: 100 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({ currentHp: 100, hpPercentage: 100 });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should handle multiple rule lists', () => {
      const action1 = { type: 'set_text' as const, sourceName: 'source1', text: 'action1' };
      const action2 = { type: 'set_text' as const, sourceName: 'source2', text: 'action2' };

      const rule1 = createRule('rule-1', { type: 'always' }, [action1]);
      const rule2 = createRule('rule-2', { type: 'always' }, [action2]);

      const list1 = createRuleList('list-1', 'all_matches', [rule1]);
      const list2 = createRuleList('list-2', 'all_matches', [rule2]);

      const config = createConfig([list1, list2]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(2);
    });

    it('should handle mix of enabled and disabled rule lists', () => {
      const action1 = { type: 'set_text' as const, sourceName: 'source1', text: 'action1' };
      const action2 = { type: 'set_text' as const, sourceName: 'source2', text: 'action2' };

      const rule1 = createRule('rule-1', { type: 'always' }, [action1]);
      const rule2 = createRule('rule-2', { type: 'always' }, [action2]);

      const list1 = createRuleList('list-1', 'all_matches', [rule1], true);
      const list2 = createRuleList('list-2', 'all_matches', [rule2], false);

      const config = createConfig([list1, list2]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
      expect((actions[0] as any).sourceName).toBe('source1');
    });
  });

  // ==========================================================================
  // ABILITY SCORE CONDITIONS
  // ==========================================================================

  describe('Ability Score Conditions', () => {
    it('should match ability score >= value', () => {
      const rule = createRule('rule-1', { type: 'ability_score', ability: 'strength', operator: '>=', value: 14 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          stats: [
            { id: 1, name: 'Strength', value: 14 },
            { id: 2, name: 'Dexterity', value: 16 },
            { id: 3, name: 'Constitution', value: 13 },
            { id: 4, name: 'Intelligence', value: 10 },
            { id: 5, name: 'Wisdom', value: 12 },
            { id: 6, name: 'Charisma', value: 8 },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should handle all six ability scores', () => {
      const abilities: Array<'strength' | 'dexterity' | 'constitution' | 'intelligence' | 'wisdom' | 'charisma'> = [
        'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'
      ];

      const character = createMockCharacter({
        stats: [
          { id: 1, name: 'Strength', value: 14 },
          { id: 2, name: 'Dexterity', value: 16 },
          { id: 3, name: 'Constitution', value: 13 },
          { id: 4, name: 'Intelligence', value: 10 },
          { id: 5, name: 'Wisdom', value: 12 },
          { id: 6, name: 'Charisma', value: 8 },
        ],
      });

      for (const ability of abilities) {
        const rule = createRule(`rule-${ability}`, { type: 'ability_score', ability, operator: '>=', value: 8 }, [createMockAction('source')]);
        const ruleList = createRuleList('list-1', 'all_matches', [rule]);
        const config = createConfig([ruleList]);
        const context = createContext({ character });

        const actions = engine.evaluate(config, context);

        expect(actions).toHaveLength(1);
      }
    });
  });

  describe('Ability Modifier Conditions', () => {
    it('should calculate modifier from ability score', () => {
      const rule = createRule('rule-1', { type: 'ability_modifier', ability: 'strength', operator: '>=', value: 2 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          stats: [
            { id: 1, name: 'Strength', value: 14 },
            { id: 2, name: 'Dexterity', value: 16 },
            { id: 3, name: 'Constitution', value: 13 },
            { id: 4, name: 'Intelligence', value: 10 },
            { id: 5, name: 'Wisdom', value: 12 },
            { id: 6, name: 'Charisma', value: 8 },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should handle negative modifier', () => {
      const rule = createRule('rule-1', { type: 'ability_modifier', ability: 'charisma', operator: '<', value: 0 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          stats: [
            { id: 1, name: 'Strength', value: 14 },
            { id: 2, name: 'Dexterity', value: 16 },
            { id: 3, name: 'Constitution', value: 13 },
            { id: 4, name: 'Intelligence', value: 10 },
            { id: 5, name: 'Wisdom', value: 12 },
            { id: 6, name: 'Charisma', value: 8 },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });
  });

  // ==========================================================================
  // LEVEL CONDITIONS
  // ==========================================================================

  describe('Level Conditions', () => {
    it('should match total level >= value', () => {
      const rule = createRule('rule-1', { type: 'level', operator: '>=', value: 5 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          classes: [{ level: 5 }],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should sum multiclass levels', () => {
      const rule = createRule('rule-1', { type: 'level', operator: '>=', value: 10 }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          classes: [{ level: 5 }, { level: 5 }],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });
  });

  // ==========================================================================
  // MULTIPLE ACTIONS FROM SINGLE RULE
  // ==========================================================================

  describe('Multiple Actions', () => {
    it('should execute all actions from matching rule', () => {
      const action1 = { type: 'set_text' as const, sourceName: 'source1', text: 'action1' };
      const action2 = { type: 'set_text' as const, sourceName: 'source2', text: 'action2' };
      const action3 = { type: 'set_text' as const, sourceName: 'source3', text: 'action3' };

      const rule = createRule('rule-1', { type: 'always' }, [action1, action2, action3]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(3);
    });

    it('should preserve action order', () => {
      const action1 = { type: 'set_text' as const, sourceName: 'source1', text: 'first' };
      const action2 = { type: 'set_text' as const, sourceName: 'source2', text: 'second' };

      const rule = createRule('rule-1', { type: 'always' }, [action1, action2]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext();

      const actions = engine.evaluate(config, context);

      expect((actions[0] as any).sourceName).toBe('source1');
      expect((actions[1] as any).sourceName).toBe('source2');
    });
  });

  // ==========================================================================
  // EQUIPMENT CONDITIONS
  // ==========================================================================

  describe('Equipment Conditions - item_equipped', () => {
    it('should match when item is equipped (exact match)', () => {
      const rule = createRule('rule-1', { type: 'item_equipped', itemName: 'Croc form', matchPartial: false }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: true, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Croc form', isConsumable: false, canEquip: true, canAttune: false } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should not match when item is not equipped', () => {
      const rule = createRule('rule-1', { type: 'item_equipped', itemName: 'Croc form', matchPartial: false }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: false, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Croc form', isConsumable: false, canEquip: true, canAttune: false } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });

    it('should match with partial item name when matchPartial is true', () => {
      const rule = createRule('rule-1', { type: 'item_equipped', itemName: 'Croc', matchPartial: true }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: true, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Croc form', isConsumable: false, canEquip: true, canAttune: false } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should be case-insensitive', () => {
      const rule = createRule('rule-1', { type: 'item_equipped', itemName: 'CROC FORM', matchPartial: false }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: true, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Croc form', isConsumable: false, canEquip: true, canAttune: false } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should not match when item does not exist in inventory', () => {
      const rule = createRule('rule-1', { type: 'item_equipped', itemName: 'Croc form', matchPartial: false }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: true, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Longsword', isConsumable: false, canEquip: true, canAttune: false } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });

    it('should return false when inventory is empty', () => {
      const rule = createRule('rule-1', { type: 'item_equipped', itemName: 'Croc form', matchPartial: false }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          inventory: [],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });
  });

  describe('Equipment Conditions - item_attuned', () => {
    it('should match when item is attuned', () => {
      const rule = createRule('rule-1', { type: 'item_attuned', itemName: 'Ring of Protection', matchPartial: false }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: true, isAttuned: true, quantity: 1, definition: { id: 1, name: 'Ring of Protection', isConsumable: false, canEquip: true, canAttune: true } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should not match when item is not attuned', () => {
      const rule = createRule('rule-1', { type: 'item_attuned', itemName: 'Ring of Protection', matchPartial: false }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: true, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Ring of Protection', isConsumable: false, canEquip: true, canAttune: true } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });
  });

  describe('Equipment Conditions - shield_equipped', () => {
    it('should match when shield is equipped', () => {
      const rule = createRule('rule-1', { type: 'shield_equipped', value: true }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: true, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Shield', isConsumable: false, canEquip: true, canAttune: false } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });

    it('should not match when no shield is equipped', () => {
      const rule = createRule('rule-1', { type: 'shield_equipped', value: true }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: true, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Longsword', isConsumable: false, canEquip: true, canAttune: false } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });

    it('should match value: false when no shield equipped', () => {
      const rule = createRule('rule-1', { type: 'shield_equipped', value: false }, [createMockAction('source')]);
      const ruleList = createRuleList('list-1', 'all_matches', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: true, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Longsword', isConsumable: false, canEquip: true, canAttune: false } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
    });
  });

  // ==========================================================================
  // COMBINED CONDITIONS (Real-world scenario like Croc form)
  // ==========================================================================

  describe('Real-world Scenario - Croc Form with HP', () => {
    it('should match Croc form equipped AND HP <= 25%', () => {
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [
          { type: 'item_equipped', itemName: 'Croc form', matchPartial: false },
          { type: 'hp_percentage', operator: '<=', value: 25 },
        ],
      };

      const rule = createRule('croc-bloodied', group, [createMockAction('croc_bloodied')]);
      const ruleList = createRuleList('portrait', 'first_match', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        hpPercentage: 20,
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: true, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Croc form', isConsumable: false, canEquip: true, canAttune: false } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
      expect((actions[0] as any).sourceName).toBe('croc_bloodied');
    });

    it('should NOT match when Croc form is not equipped even if HP matches', () => {
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [
          { type: 'item_equipped', itemName: 'Croc form', matchPartial: false },
          { type: 'hp_percentage', operator: '<=', value: 25 },
        ],
      };

      const rule = createRule('croc-bloodied', group, [createMockAction('croc_bloodied')]);
      const ruleList = createRuleList('portrait', 'first_match', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        hpPercentage: 20,
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: false, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Croc form', isConsumable: false, canEquip: true, canAttune: false } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });

    it('should NOT match when HP does not match even if Croc form equipped', () => {
      const group: ConditionGroup = {
        operator: 'AND',
        conditions: [
          { type: 'item_equipped', itemName: 'Croc form', matchPartial: false },
          { type: 'hp_percentage', operator: '<=', value: 25 },
        ],
      };

      const rule = createRule('croc-bloodied', group, [createMockAction('croc_bloodied')]);
      const ruleList = createRuleList('portrait', 'first_match', [rule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        hpPercentage: 80,
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: true, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Croc form', isConsumable: false, canEquip: true, canAttune: false } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(0);
    });

    it('should fall through to normal HP rule when Croc form not equipped', () => {
      const crocRule = createRule(
        'croc-bloodied',
        {
          operator: 'AND',
          conditions: [
            { type: 'item_equipped', itemName: 'Croc form', matchPartial: false },
            { type: 'hp_percentage', operator: '<=', value: 25 },
          ],
        },
        [createMockAction('croc_bloodied')],
        100
      );

      const normalRule = createRule(
        'normal-bloodied',
        { type: 'hp_percentage', operator: '<=', value: 25 },
        [createMockAction('normal_bloodied')],
        50
      );

      const ruleList = createRuleList('portrait', 'first_match', [crocRule, normalRule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        hpPercentage: 20,
        character: createMockCharacter({
          inventory: [], // No Croc form
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
      expect((actions[0] as any).sourceName).toBe('normal_bloodied');
    });

    it('should use Croc form rule when equipped (higher priority)', () => {
      const crocRule = createRule(
        'croc-bloodied',
        {
          operator: 'AND',
          conditions: [
            { type: 'item_equipped', itemName: 'Croc form', matchPartial: false },
            { type: 'hp_percentage', operator: '<=', value: 25 },
          ],
        },
        [createMockAction('croc_bloodied')],
        100
      );

      const normalRule = createRule(
        'normal-bloodied',
        { type: 'hp_percentage', operator: '<=', value: 25 },
        [createMockAction('normal_bloodied')],
        50
      );

      const ruleList = createRuleList('portrait', 'first_match', [crocRule, normalRule]);
      const config = createConfig([ruleList]);
      const context = createContext({
        hpPercentage: 20,
        character: createMockCharacter({
          inventory: [
            { id: 1, entityTypeId: 1, equipped: true, isAttuned: false, quantity: 1, definition: { id: 1, name: 'Croc form', isConsumable: false, canEquip: true, canAttune: false } },
          ],
        }),
      });

      const actions = engine.evaluate(config, context);

      expect(actions).toHaveLength(1);
      expect((actions[0] as any).sourceName).toBe('croc_bloodied');
    });
  });
});
