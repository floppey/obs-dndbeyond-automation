/**
 * Type definitions for the Rules Engine
 *
 * This module provides comprehensive type definitions for a flexible rule system
 * that can evaluate conditions based on character data and execute actions in OBS.
 *
 * @module rules/types
 */

import { DndBeyondCharacterResponse } from "../types.js";

/**
 * Comparison operators for evaluating numeric conditions
 *
 * - `>`: Greater than
 * - `>=`: Greater than or equal to
 * - `<`: Less than
 * - `<=`: Less than or equal to
 * - `==`: Equal to
 * - `!=`: Not equal to
 */
export type ComparisonOperator = ">" | ">=" | "<" | "<=" | "==" | "!=";

/**
 * Logical operators for combining multiple conditions
 *
 * - `AND`: All conditions must be true
 * - `OR`: At least one condition must be true
 */
export type LogicalOperator = "AND" | "OR";

// ============================================================================
// CONDITION TYPES - HP CONDITIONS
// ============================================================================

/**
 * HP percentage condition
 *
 * Evaluates the current HP as a percentage of maximum HP (0-100).
 *
 * Example: `{ type: "hp_percentage", operator: "<=", value: 25 }` means <= 25% HP
 */
export interface HpPercentageCondition {
  type: "hp_percentage";
  operator: ComparisonOperator;
  /** Percentage value (0-100) */
  value: number;
}

/**
 * Absolute HP value condition
 *
 * Evaluates the current absolute HP value.
 *
 * Example: `{ type: "hp_value", operator: "<=", value: 10 }` means <= 10 current HP
 */
export interface HpValueCondition {
  type: "hp_value";
  operator: ComparisonOperator;
  /** Absolute HP value */
  value: number;
}

/**
 * Temporary HP condition
 *
 * Evaluates the temporary HP amount.
 *
 * Example: `{ type: "hp_temp", operator: ">=", value: 1 }` means has temporary HP
 */
export interface HpTempCondition {
  type: "hp_temp";
  operator: ComparisonOperator;
  /** Temporary HP value */
  value: number;
}

/**
 * Missing HP condition
 *
 * Evaluates the amount of HP lost from maximum (maxHp - currentHp).
 *
 * Example: `{ type: "hp_missing", operator: ">=", value: 20 }` means missing >= 20 HP
 */
export interface HpMissingCondition {
  type: "hp_missing";
  operator: ComparisonOperator;
  /** Amount of HP missing from max */
  value: number;
}

export type HpCondition = HpPercentageCondition | HpValueCondition | HpTempCondition | HpMissingCondition;

// ============================================================================
// CONDITION TYPES - DEATH STATE CONDITIONS
// ============================================================================

/**
 * Death state condition
 *
 * Boolean check: is the character dead?
 *
 * Example: `{ type: "is_dead", value: true }` matches only dead characters
 */
export interface IsDeadCondition {
  type: "is_dead";
  value: boolean;
}

/**
 * Unconscious state condition
 *
 * Boolean check: is the character unconscious? (0 HP or in death saves)
 *
 * Example: `{ type: "is_unconscious", value: true }` matches unconscious characters
 */
export interface IsUnconsciousCondition {
  type: "is_unconscious";
  value: boolean;
}

/**
 * Death save successes condition
 *
 * Evaluates the number of successful death saves (0-3).
 *
 * Example: `{ type: "death_saves_success", operator: ">=", value: 2 }` means 2+ successes
 */
export interface DeathSavesSuccessCondition {
  type: "death_saves_success";
  operator: ComparisonOperator;
  /** Number of successful death saves (0-3) */
  value: number;
}

/**
 * Death save failures condition
 *
 * Evaluates the number of failed death saves (0-3).
 *
 * Example: `{ type: "death_saves_failure", operator: ">=", value: 2 }` means 2+ failures
 */
export interface DeathSavesFailureCondition {
  type: "death_saves_failure";
  operator: ComparisonOperator;
  /** Number of failed death saves (0-3) */
  value: number;
}

export type DeathStateCondition =
  | IsDeadCondition
  | IsUnconsciousCondition
  | DeathSavesSuccessCondition
  | DeathSavesFailureCondition;

// ============================================================================
// CONDITION TYPES - STAT CONDITIONS
// ============================================================================

/**
 * Stat value condition
 *
 * Evaluates any calculated stat value (AC, initiative, speed, etc).
 *
 * @example
 * { type: "stat_value", statName: "ac", operator: ">=", value: 15 } // AC >= 15
 * { type: "stat_value", statName: "initiative", operator: ">", value: 2 } // Initiative > 2
 */
export interface StatValueCondition {
  type: "stat_value";
  /** Name of the stat to evaluate (e.g., "ac", "initiative", "speed") */
  statName: string;
  operator: ComparisonOperator;
  value: number;
}

/**
 * Ability score condition
 *
 * Evaluates raw ability scores before modifiers.
 *
 * @example
 * { type: "ability_score", ability: "strength", operator: ">=", value: 16 } // Strength >= 16
 */
export interface AbilityScoreCondition {
  type: "ability_score";
  /** Ability name: strength, dexterity, constitution, intelligence, wisdom, charisma */
  ability: "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
  operator: ComparisonOperator;
  value: number;
}

/**
 * Ability modifier condition
 *
 * Evaluates ability modifiers derived from scores.
 *
 * @example
 * { type: "ability_modifier", ability: "wisdom", operator: ">=", value: 3 } // Wisdom modifier >= +3
 */
export interface AbilityModifierCondition {
  type: "ability_modifier";
  /** Ability name: strength, dexterity, constitution, intelligence, wisdom, charisma */
  ability: "strength" | "dexterity" | "constitution" | "intelligence" | "wisdom" | "charisma";
  operator: ComparisonOperator;
  value: number;
}

export type StatCondition = StatValueCondition | AbilityScoreCondition | AbilityModifierCondition;

// ============================================================================
// CONDITION TYPES - EQUIPMENT CONDITIONS
// ============================================================================

/**
 * Item equipped condition
 *
 * Checks if a specific item (by name) is currently equipped.
 *
 * @example
 * { type: "item_equipped", itemName: "Longsword", matchPartial: false } // Exact match
 * { type: "item_equipped", itemName: "Cloak", matchPartial: true } // Partial match
 */
export interface ItemEquippedCondition {
  type: "item_equipped";
  /** Name of the item to check */
  itemName: string;
  /** If true, matches items whose name contains itemName; if false, requires exact match */
  matchPartial?: boolean;
}

/**
 * Item attuned condition
 *
 * Checks if a specific item (by name) is currently attuned.
 *
 * @example
 * { type: "item_attuned", itemName: "Ring of Protection" }
 */
export interface ItemAttunedCondition {
  type: "item_attuned";
  /** Name of the item to check */
  itemName: string;
  /** If true, matches items whose name contains itemName; if false, requires exact match */
  matchPartial?: boolean;
}

/**
 * Armor equipped condition
 *
 * Boolean check: is any armor currently equipped?
 *
 * @example
 * { type: "armor_equipped", value: true } // Has some armor equipped
 */
export interface ArmorEquippedCondition {
  type: "armor_equipped";
  value: boolean;
}

/**
 * Shield equipped condition
 *
 * Boolean check: is a shield currently equipped?
 *
 * @example
 * { type: "shield_equipped", value: true } // Has shield equipped
 */
export interface ShieldEquippedCondition {
  type: "shield_equipped";
  value: boolean;
}

export type EquipmentCondition =
  | ItemEquippedCondition
  | ItemAttunedCondition
  | ArmorEquippedCondition
  | ShieldEquippedCondition;

// ============================================================================
// CONDITION TYPES - RESOURCE CONDITIONS
// ============================================================================

/**
 * Spell slots available condition
 *
 * Checks how many spell slots are remaining at a given spell level.
 *
 * @example
 * { type: "spell_slots_available", spellLevel: 1, operator: ">", value: 0 } // Has level 1 slots
 */
export interface SpellSlotsAvailableCondition {
  type: "spell_slots_available";
  /** Spell level (1-9 for spell slots, 0 for cantrips if applicable) */
  spellLevel: number;
  operator: ComparisonOperator;
  value: number;
}

/**
 * Spell slots used condition
 *
 * Checks how many spell slots have been used at a given spell level.
 *
 * @example
 * { type: "spell_slots_used", spellLevel: 2, operator: ">=", value: 1 } // Used at least 1 level 2 slot
 */
export interface SpellSlotsUsedCondition {
  type: "spell_slots_used";
  /** Spell level (1-9) */
  spellLevel: number;
  operator: ComparisonOperator;
  value: number;
}

/**
 * Gold amount condition
 *
 * Evaluates the character's current gold pieces.
 *
 * @example
 * { type: "gold_amount", operator: ">=", value: 100 } // Has 100+ gold
 */
export interface GoldAmountCondition {
  type: "gold_amount";
  operator: ComparisonOperator;
  /** Gold pieces amount */
  value: number;
}

export type ResourceCondition = SpellSlotsAvailableCondition | SpellSlotsUsedCondition | GoldAmountCondition;

// ============================================================================
// CONDITION TYPES - LEVEL CONDITIONS
// ============================================================================

/**
 * Character level condition
 *
 * Evaluates total character level (sum of all class levels).
 *
 * @example
 * { type: "level", operator: ">=", value: 10 } // Level 10 or higher
 */
export interface LevelCondition {
  type: "level";
  operator: ComparisonOperator;
  value: number;
}

/**
 * Class level condition
 *
 * Evaluates level in a specific class.
 *
 * @example
 * { type: "class_level", className: "Wizard", operator: ">=", value: 5 } // 5+ levels in Wizard
 */
export interface ClassLevelCondition {
  type: "class_level";
  /** Class name (e.g., "Wizard", "Fighter", "Rogue") */
  className: string;
  operator: ComparisonOperator;
  value: number;
}

/**
 * Has class condition
 *
 * Boolean check: does the character have a specific class?
 *
 * @example
 * { type: "has_class", className: "Barbarian", value: true }
 */
export interface HasClassCondition {
  type: "has_class";
  /** Class name (e.g., "Wizard", "Fighter", "Rogue") */
  className: string;
  value: boolean;
}

export type LevelCondition_Type = LevelCondition | ClassLevelCondition | HasClassCondition;

// ============================================================================
// CONDITION TYPES - CONSTANT CONDITIONS
// ============================================================================

/**
 * Always true condition
 *
 * Evaluates to true regardless of character state. Useful as a default/fallback rule.
 *
 * @example
 * { type: "always" }
 */
export interface AlwaysCondition {
  type: "always";
}

/**
 * Always false condition
 *
 * Evaluates to false regardless of character state. Useful for testing.
 *
 * @example
 * { type: "never" }
 */
export interface NeverCondition {
  type: "never";
}

export type ConstantCondition = AlwaysCondition | NeverCondition;

// ============================================================================
// CONDITION UNION AND GROUPING
// ============================================================================

/**
 * All supported condition types (discriminated union)
 */
export type Condition =
  | HpCondition
  | DeathStateCondition
  | StatCondition
  | EquipmentCondition
  | ResourceCondition
  | LevelCondition_Type
  | ConstantCondition;

/**
 * Compound condition group
 *
 * Allows combining multiple conditions using logical operators (AND/OR).
 * Supports nesting for complex boolean logic.
 *
 * @example
 * // HP <= 50% OR has no armor equipped
 * {
 *   operator: "OR",
 *   conditions: [
 *     { type: "hp_percentage", operator: "<=", value: 50 },
 *     { type: "armor_equipped", value: false }
 *   ]
 * }
 */
export interface ConditionGroup {
  operator: LogicalOperator;
  /** Nested conditions (can be Condition or ConditionGroup for nesting) */
  conditions: (Condition | ConditionGroup)[];
}

/**
 * A rule's condition: can be a single condition, a group of conditions, or null (always matches)
 *
 * - `Condition`: Single condition to evaluate
 * - `ConditionGroup`: Multiple conditions combined with AND/OR logic
 * - `null`: No condition (always matches, useful for unconditional actions)
 */
export type RuleCondition = Condition | ConditionGroup | null;

// ============================================================================
// ACTION TYPES
// ============================================================================

/**
 * Set image source action
 *
 * Changes the image displayed by an OBS image source.
 *
 * @example
 * { type: "set_image", sourceName: "Character HP", imagePath: "/images/bloodied.png" }
 */
export interface SetImageAction {
  type: "set_image";
  /** Name of the OBS image source to update */
  sourceName: string;
  /** File path to the new image */
  imagePath: string;
}

/**
 * Set visibility action
 *
 * Shows or hides a scene item in OBS.
 *
 * @example
 * { type: "set_visibility", sceneName: "Gameplay", itemName: "Unconscious Overlay", visible: true }
 */
export interface SetVisibilityAction {
  type: "set_visibility";
  /** Name of the OBS scene containing the item */
  sceneName: string;
  /** Name of the scene item to toggle */
  itemName: string;
  /** If true, show the item; if false, hide it */
  visible: boolean;
}

/**
 * Set text source action
 *
 * Updates the text content of an OBS text source.
 * Supports variable substitution using {variable} syntax.
 *
 * Supported variables:
 * - {currentHp}: Current HP value
 * - {maxHp}: Maximum HP value
 * - {temporaryHp}: Temporary HP value
 * - {hpPercentage}: HP as percentage (0-100)
 * - {isDead}: "true" or "false"
 * - {deathSuccesses}: Number of successful death saves
 * - {deathFailures}: Number of failed death saves
 *
 * @example
 * { type: "set_text", sourceName: "HP Display", text: "{currentHp}/{maxHp} HP ({hpPercentage}%)" }
 */
export interface SetTextAction {
  type: "set_text";
  /** Name of the OBS text source to update */
  sourceName: string;
  /** Text content (supports {variable} placeholders) */
  text: string;
}

/**
 * Set filter visibility action
 *
 * Enables or disables a filter on an OBS source.
 *
 * @example
 * { type: "set_filter_visibility", sourceName: "Character", filterName: "Red Tint", visible: true }
 */
export interface SetFilterVisibilityAction {
  type: "set_filter_visibility";
  /** Name of the OBS source containing the filter */
  sourceName: string;
  /** Name of the filter to enable/disable */
  filterName: string;
  /** If true, enable the filter; if false, disable it */
  visible: boolean;
}

/**
 * Set input settings action
 *
 * Sets arbitrary input settings on an OBS input/source.
 * Allows fine-grained control over OBS properties.
 *
 * @example
 * { type: "set_input_settings", inputName: "Character HP", settings: { "text": "50/100" } }
 */
export interface SetInputSettingsAction {
  type: "set_input_settings";
  /** Name of the OBS input/source */
  inputName: string;
  /** Object containing the settings to apply */
  settings: Record<string, unknown>;
}

/**
 * All supported action types (discriminated union)
 */
export type RuleAction =
  | SetImageAction
  | SetVisibilityAction
  | SetTextAction
  | SetFilterVisibilityAction
  | SetInputSettingsAction;

// ============================================================================
// RULE AND RULE LIST
// ============================================================================

/**
 * A single rule: condition(s) + actions
 *
 * When the condition(s) evaluate to true, all actions are executed.
 *
 * @example
 * {
 *   id: "rule-hp-bloodied",
 *   name: "Show bloodied state when HP <= 50%",
 *   enabled: true,
 *   condition: { type: "hp_percentage", operator: "<=", value: 50 },
 *   actions: [
 *     { type: "set_image", sourceName: "Character HP", imagePath: "/images/bloodied.png" }
 *   ],
 *   priority: 10
 * }
 */
export interface Rule {
  /** Unique identifier for this rule */
  id: string;

  /** Human-readable name for the rule (optional) */
  name?: string;

  /** If false, this rule will be skipped during evaluation (default: true) */
  enabled?: boolean;

  /** Condition(s) to evaluate. If null, always matches. */
  condition: RuleCondition;

  /** Actions to execute when condition is true */
  actions: RuleAction[];

  /** Priority for evaluation order (higher = evaluated first, default: 0) */
  priority?: number;
}

/**
 * Rule evaluation mode
 *
 * - `first_match`: Stop after the first rule that matches
 * - `all_matches`: Execute all rules that match
 */
export type RuleEvaluationMode = "first_match" | "all_matches";

/**
 * A collection of related rules
 *
 * RuleLists allow organizing rules into logical groups and control how they're evaluated.
 *
 * @example
 * {
 *   id: "hp-states",
 *   name: "HP State Rules",
 *   enabled: true,
 *   mode: "first_match",
 *   rules: [
 *     // rule definitions...
 *   ]
 * }
 */
export interface RuleList {
  /** Unique identifier for this rule list */
  id: string;

  /** Human-readable name for this rule list */
  name: string;

  /** If false, all rules in this list are skipped (default: true) */
  enabled?: boolean;

  /** Rule evaluation mode */
  mode: RuleEvaluationMode;

  /** Array of rules in this list */
  rules: Rule[];
}

/**
 * Complete rules engine configuration
 *
 * Contains all rule lists and configuration for the engine.
 *
 * @example
 * {
 *   version: "1.0.0",
 *   ruleLists: [
 *     // rule list definitions...
 *   ]
 * }
 */
export interface RuleEngineConfig {
  /** Version of the rules engine configuration format */
  version: string;

  /** Array of rule lists */
  ruleLists: RuleList[];
}

// ============================================================================
// EVALUATION CONTEXT
// ============================================================================

/**
 * Complete context passed to the rule engine for condition evaluation
 *
 * Contains both raw character data from D&D Beyond and pre-calculated derived values
 * for efficient condition evaluation.
 *
 * @example
 * {
 *   character: { ... full character response ... },
 *   currentHp: 45,
 *   maxHp: 100,
 *   temporaryHp: 0,
 *   hpPercentage: 45,
 *   isDead: false,
 *   deathSaves: { successes: 0, failures: 0 },
 *   timestamp: Date.now()
 * }
 */
export interface EvaluationContext {
  /** Raw character data from D&D Beyond API */
  character: DndBeyondCharacterResponse;

  /** Current HP value */
  currentHp: number;

  /** Maximum HP value */
  maxHp: number;

  /** Temporary HP value */
  temporaryHp: number;

  /** HP as percentage of max (0-100) */
  hpPercentage: number;

  /** Whether the character is dead */
  isDead: boolean;

  /** Current death saves count */
  deathSaves: {
    successes: number;
    failures: number;
  };

  /** Timestamp when context was created (milliseconds since epoch) */
  timestamp: number;
}
