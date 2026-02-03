/**
 * Rule Engine for D&D Beyond OBS Automation
 *
 * Evaluates rules against character state and returns actions to execute.
 *
 * @module rules/engine
 */

import {
  RuleEngineConfig,
  EvaluationContext,
  RuleAction,
  RuleList,
  Rule,
  RuleCondition,
  Condition,
  ConditionGroup,
  ComparisonOperator,
  HpPercentageCondition,
  HpValueCondition,
  HpTempCondition,
  HpMissingCondition,
  IsDeadCondition,
  IsUnconsciousCondition,
  DeathSavesSuccessCondition,
  DeathSavesFailureCondition,
  StatValueCondition,
  AbilityScoreCondition,
  AbilityModifierCondition,
  ItemEquippedCondition,
  ItemAttunedCondition,
  ArmorEquippedCondition,
  ShieldEquippedCondition,
  SpellSlotsAvailableCondition,
  SpellSlotsUsedCondition,
  GoldAmountCondition,
  LevelCondition,
  ClassLevelCondition,
  HasClassCondition,
  AlwaysCondition,
  NeverCondition,
} from "./types.js";
import { DndBeyondCharacterResponse, ClassEntry } from "../types.js";

/**
 * Rule Engine for evaluating rules and returning actions
 *
 * Implements a flexible rule evaluation system that supports:
 * - Multiple condition types (HP, death state, equipment, stats, etc.)
 * - Nested condition groups with AND/OR logic
 * - Rule priorities and evaluation modes
 * - Comprehensive error handling and logging
 */
export class RuleEngine {
  /**
   * Evaluate all rule lists and return actions to execute
   *
   * Algorithm:
   * 1. For each enabled rule list:
   *    a. Sort rules by priority (descending - higher first)
   *    b. Evaluate each enabled rule's condition
   *    c. If mode is "first_match", stop at first match and collect its actions
   *    d. If mode is "all_matches", collect actions from all matching rules
   * 2. Return all collected actions
   *
   * @param config - The rule engine configuration
   * @param context - The character evaluation context
   * @returns Array of actions to execute
   */
  evaluate(config: RuleEngineConfig, context: EvaluationContext): RuleAction[] {
    console.log("[RULES] Evaluating rules engine");
    const actions: RuleAction[] = [];

    // Iterate through each rule list
    for (const ruleList of config.ruleLists) {
      // Skip disabled rule lists
      if (ruleList.enabled === false) {
        console.log(`[RULES] Skipping disabled rule list: ${ruleList.id}`);
        continue;
      }

      console.log(
        `[RULES] Evaluating rule list: ${ruleList.id} (mode: ${ruleList.mode})`
      );

      // Sort rules by priority (descending - higher priority first)
      const sortedRules = [...ruleList.rules].sort(
        (a, b) => (b.priority ?? 0) - (a.priority ?? 0)
      );

      // Evaluate each rule
      for (const rule of sortedRules) {
        // Skip disabled rules
        if (rule.enabled === false) {
          console.log(`[RULES] Skipping disabled rule: ${rule.id}`);
          continue;
        }

        // Evaluate the rule condition
        const conditionMet = this.evaluateCondition(rule.condition, context);

        if (conditionMet) {
          console.log(
            `[RULES] Rule matched: ${rule.id}${rule.name ? ` (${rule.name})` : ""}`
          );

          // Add actions from this rule
          actions.push(...rule.actions);

          // If first_match mode, stop evaluating this rule list
          if (ruleList.mode === "first_match") {
            console.log(
              `[RULES] First match found, stopping evaluation of rule list: ${ruleList.id}`
            );
            break;
          }
        } else {
          console.log(
            `[RULES] Rule condition not met: ${rule.id}${rule.name ? ` (${rule.name})` : ""}`
          );
        }
      }
    }

    console.log(`[RULES] Evaluation complete. Total actions: ${actions.length}`);
    return actions;
  }

  /**
   * Evaluate a rule condition
   *
   * - If condition is null, return true (always matches)
   * - If condition is a ConditionGroup, call evaluateConditionGroup
   * - Otherwise call evaluateSingleCondition
   *
   * @param condition - The condition to evaluate
   * @param context - The character evaluation context
   * @returns Whether the condition is satisfied
   */
  private evaluateCondition(
    condition: RuleCondition,
    context: EvaluationContext
  ): boolean {
    // Null condition always matches
    if (condition === null) {
      return true;
    }

    // Check if this is a condition group
    if (this.isConditionGroup(condition)) {
      return this.evaluateConditionGroup(condition, context);
    }

    // Otherwise evaluate as a single condition
    return this.evaluateSingleCondition(condition, context);
  }

  /**
   * Check if a value is a condition group
   *
   * @param value - The value to check
   * @returns Whether the value is a ConditionGroup
   */
  private isConditionGroup(value: unknown): value is ConditionGroup {
    return (
      value !== null &&
      typeof value === "object" &&
      "operator" in value &&
      "conditions" in value
    );
  }

  /**
   * Evaluate a condition group with AND/OR logic
   *
   * - For AND: return true only if ALL conditions are true
   * - For OR: return true if ANY condition is true
   * - Support recursive nesting
   *
   * @param group - The condition group to evaluate
   * @param context - The character evaluation context
   * @returns Whether the group condition is satisfied
   */
  private evaluateConditionGroup(
    group: ConditionGroup,
    context: EvaluationContext
  ): boolean {
    if (!Array.isArray(group.conditions) || group.conditions.length === 0) {
      console.warn(
        `[RULES] Invalid condition group: empty or missing conditions array`
      );
      return false;
    }

    if (group.operator === "AND") {
      return group.conditions.every((cond) =>
        this.evaluateCondition(cond, context)
      );
    } else if (group.operator === "OR") {
      return group.conditions.some((cond) =>
        this.evaluateCondition(cond, context)
      );
    } else {
      console.warn(
        `[RULES] Unknown logical operator: ${group.operator as string}`
      );
      return false;
    }
  }

  /**
   * Evaluate a single condition
   *
   * @param condition - The condition to evaluate
   * @param context - The character evaluation context
   * @returns Whether the condition is satisfied
   */
  private evaluateSingleCondition(
    condition: Condition,
    context: EvaluationContext
  ): boolean {
    const type = (condition as { type: string }).type;

    try {
      // HP Conditions
      if (type === "hp_percentage") {
        return this.evaluateHpPercentage(
          condition as HpPercentageCondition,
          context
        );
      }
      if (type === "hp_value") {
        return this.evaluateHpValue(condition as HpValueCondition, context);
      }
      if (type === "hp_temp") {
        return this.evaluateHpTemp(condition as HpTempCondition, context);
      }
      if (type === "hp_missing") {
        return this.evaluateHpMissing(condition as HpMissingCondition, context);
      }

      // Death State Conditions
      if (type === "is_dead") {
        return this.evaluateIsDead(condition as IsDeadCondition, context);
      }
      if (type === "is_unconscious") {
        return this.evaluateIsUnconscious(
          condition as IsUnconsciousCondition,
          context
        );
      }
      if (type === "death_saves_success") {
        return this.evaluateDeathSavesSuccess(
          condition as DeathSavesSuccessCondition,
          context
        );
      }
      if (type === "death_saves_failure") {
        return this.evaluateDeathSavesFailure(
          condition as DeathSavesFailureCondition,
          context
        );
      }

      // Stat Conditions
      if (type === "stat_value") {
        return this.evaluateStatValue(
          condition as StatValueCondition,
          context
        );
      }
      if (type === "ability_score") {
        return this.evaluateAbilityScore(
          condition as AbilityScoreCondition,
          context
        );
      }
      if (type === "ability_modifier") {
        return this.evaluateAbilityModifier(
          condition as AbilityModifierCondition,
          context
        );
      }

      // Equipment Conditions
      if (type === "item_equipped") {
        return this.evaluateItemEquipped(
          condition as ItemEquippedCondition,
          context
        );
      }
      if (type === "item_attuned") {
        return this.evaluateItemAttuned(
          condition as ItemAttunedCondition,
          context
        );
      }
      if (type === "armor_equipped") {
        return this.evaluateArmorEquipped(
          condition as ArmorEquippedCondition,
          context
        );
      }
      if (type === "shield_equipped") {
        return this.evaluateShieldEquipped(
          condition as ShieldEquippedCondition,
          context
        );
      }

      // Resource Conditions
      if (type === "spell_slots_available") {
        return this.evaluateSpellSlotsAvailable(
          condition as SpellSlotsAvailableCondition,
          context
        );
      }
      if (type === "spell_slots_used") {
        return this.evaluateSpellSlotsUsed(
          condition as SpellSlotsUsedCondition,
          context
        );
      }
      if (type === "gold_amount") {
        return this.evaluateGoldAmount(
          condition as GoldAmountCondition,
          context
        );
      }

      // Level Conditions
      if (type === "level") {
        return this.evaluateLevel(condition as LevelCondition, context);
      }
      if (type === "class_level") {
        return this.evaluateClassLevel(
          condition as ClassLevelCondition,
          context
        );
      }
      if (type === "has_class") {
        return this.evaluateHasClass(condition as HasClassCondition, context);
      }

      // Constant Conditions
      if (type === "always") {
        return this.evaluateAlways(condition as AlwaysCondition, context);
      }
      if (type === "never") {
        return this.evaluateNever(condition as NeverCondition, context);
      }

      console.warn(`[RULES] Unknown condition type: ${type}`);
      return false;
    } catch (error) {
      console.warn(
        `[RULES] Error evaluating condition: ${error instanceof Error ? error.message : String(error)}`
      );
      return false;
    }
  }

  /**
   * Compare two numeric values using a comparison operator
   *
   * @param actual - The actual value
   * @param operator - The comparison operator
   * @param expected - The expected value
   * @returns Whether the comparison is true
   */
  private compareNumeric(
    actual: number,
    operator: ComparisonOperator,
    expected: number
  ): boolean {
    switch (operator) {
      case ">":
        return actual > expected;
      case ">=":
        return actual >= expected;
      case "<":
        return actual < expected;
      case "<=":
        return actual <= expected;
      case "==":
        return actual === expected;
      case "!=":
        return actual !== expected;
      default:
        console.warn(`[RULES] Unknown comparison operator: ${operator}`);
        return false;
    }
  }

  // ========================================================================
  // HP Condition Evaluators
  // ========================================================================

  private evaluateHpPercentage(
    condition: HpPercentageCondition,
    context: EvaluationContext
  ): boolean {
    return this.compareNumeric(
      context.hpPercentage,
      condition.operator,
      condition.value
    );
  }

  private evaluateHpValue(
    condition: HpValueCondition,
    context: EvaluationContext
  ): boolean {
    return this.compareNumeric(
      context.currentHp,
      condition.operator,
      condition.value
    );
  }

  private evaluateHpTemp(
    condition: HpTempCondition,
    context: EvaluationContext
  ): boolean {
    return this.compareNumeric(
      context.temporaryHp,
      condition.operator,
      condition.value
    );
  }

  private evaluateHpMissing(
    condition: HpMissingCondition,
    context: EvaluationContext
  ): boolean {
    const missing = context.maxHp - context.currentHp;
    return this.compareNumeric(missing, condition.operator, condition.value);
  }

  // ========================================================================
  // Death State Condition Evaluators
  // ========================================================================

  private evaluateIsDead(
    condition: IsDeadCondition,
    context: EvaluationContext
  ): boolean {
    return context.isDead === condition.value;
  }

  private evaluateIsUnconscious(
    condition: IsUnconsciousCondition,
    context: EvaluationContext
  ): boolean {
    const isUnconscious =
      context.currentHp === 0 || context.isDead || context.deathSaves.failures > 0;
    return isUnconscious === condition.value;
  }

  private evaluateDeathSavesSuccess(
    condition: DeathSavesSuccessCondition,
    context: EvaluationContext
  ): boolean {
    return this.compareNumeric(
      context.deathSaves.successes,
      condition.operator,
      condition.value
    );
  }

  private evaluateDeathSavesFailure(
    condition: DeathSavesFailureCondition,
    context: EvaluationContext
  ): boolean {
    return this.compareNumeric(
      context.deathSaves.failures,
      condition.operator,
      condition.value
    );
  }

  // ========================================================================
  // Stat Condition Evaluators
  // ========================================================================

  private evaluateStatValue(
    condition: StatValueCondition,
    context: EvaluationContext
  ): boolean {
    // TODO: Requires StatCalculator integration
    console.warn(
      `[RULES] stat_value condition requires StatCalculator - not yet implemented`
    );
    return false;
  }

  private evaluateAbilityScore(
    condition: AbilityScoreCondition,
    context: EvaluationContext
  ): boolean {
    const abilityIndex = this.getAbilityIndex(condition.ability);
    if (abilityIndex === -1 || !context.character.stats) {
      console.warn(`[RULES] Invalid ability: ${condition.ability}`);
      return false;
    }

    const stat = context.character.stats[abilityIndex];
    if (!stat || stat.value === null) {
      console.warn(
        `[RULES] Missing ability score for: ${condition.ability}`
      );
      return false;
    }

    return this.compareNumeric(stat.value, condition.operator, condition.value);
  }

  private evaluateAbilityModifier(
    condition: AbilityModifierCondition,
    context: EvaluationContext
  ): boolean {
    const abilityIndex = this.getAbilityIndex(condition.ability);
    if (abilityIndex === -1 || !context.character.stats) {
      console.warn(`[RULES] Invalid ability: ${condition.ability}`);
      return false;
    }

    const stat = context.character.stats[abilityIndex];
    if (!stat || stat.value === null) {
      console.warn(
        `[RULES] Missing ability score for: ${condition.ability}`
      );
      return false;
    }

    const modifier = Math.floor((stat.value - 10) / 2);
    return this.compareNumeric(modifier, condition.operator, condition.value);
  }

  /**
   * Get the index of an ability in the stats array
   *
   * @param ability - The ability name
   * @returns The index (0-5) or -1 if not found
   */
  private getAbilityIndex(
    ability: string
  ): number {
    switch (ability.toLowerCase()) {
      case "strength":
        return 0;
      case "dexterity":
        return 1;
      case "constitution":
        return 2;
      case "intelligence":
        return 3;
      case "wisdom":
        return 4;
      case "charisma":
        return 5;
      default:
        return -1;
    }
  }

  // ========================================================================
  // Equipment Condition Evaluators
  // ========================================================================

  private evaluateItemEquipped(
    condition: ItemEquippedCondition,
    context: EvaluationContext
  ): boolean {
    if (!context.character.inventory) {
      return false;
    }

    return context.character.inventory.some((item) => {
      if (!item.equipped) {
        return false;
      }

      const itemName = item.definition.name;
      if (condition.matchPartial) {
        return itemName.toLowerCase().includes(condition.itemName.toLowerCase());
      } else {
        return itemName.toLowerCase() === condition.itemName.toLowerCase();
      }
    });
  }

  private evaluateItemAttuned(
    condition: ItemAttunedCondition,
    context: EvaluationContext
  ): boolean {
    if (!context.character.inventory) {
      return false;
    }

    return context.character.inventory.some((item) => {
      if (!item.isAttuned) {
        return false;
      }

      const itemName = item.definition.name;
      if (condition.matchPartial) {
        return itemName.toLowerCase().includes(condition.itemName.toLowerCase());
      } else {
        return itemName.toLowerCase() === condition.itemName.toLowerCase();
      }
    });
  }

  private evaluateArmorEquipped(
    condition: ArmorEquippedCondition,
    context: EvaluationContext
  ): boolean {
    if (!context.character.inventory) {
      return condition.value === false;
    }

    const hasArmor = context.character.inventory.some(
      (item) =>
        item.equipped && this.isArmorType(item.definition)
    );

    return hasArmor === condition.value;
  }

  private evaluateShieldEquipped(
    condition: ShieldEquippedCondition,
    context: EvaluationContext
  ): boolean {
    if (!context.character.inventory) {
      return condition.value === false;
    }

    const hasShield = context.character.inventory.some(
      (item) =>
        item.equipped &&
        item.definition.name.toLowerCase().includes("shield")
    );

    return hasShield === condition.value;
  }

  /**
   * Check if an item definition is armor type
   *
   * @param definition - The item definition
   * @returns Whether the item is armor
   */
  private isArmorType(definition: {
    [key: string]: unknown;
  }): boolean {
    // Check for common armor indicators in the definition
    return (
      (definition.type === "Armor" || definition.type === "armor") ||
      (definition.entityType === "Armor" || definition.entityType === "armor") ||
      (definition.armorClass !== undefined) ||
      (definition.armorType !== undefined)
    );
  }

  // ========================================================================
  // Resource Condition Evaluators
  // ========================================================================

  private evaluateSpellSlotsAvailable(
    condition: SpellSlotsAvailableCondition,
    context: EvaluationContext
  ): boolean {
    // TODO: Requires spell slot data from character
    console.warn(
      `[RULES] spell_slots_available condition - not yet implemented`
    );
    return false;
  }

  private evaluateSpellSlotsUsed(
    condition: SpellSlotsUsedCondition,
    context: EvaluationContext
  ): boolean {
    // TODO: Requires spell slot data from character
    console.warn(`[RULES] spell_slots_used condition - not yet implemented`);
    return false;
  }

  private evaluateGoldAmount(
    condition: GoldAmountCondition,
    context: EvaluationContext
  ): boolean {
    // TODO: Requires gold data from character
    console.warn(`[RULES] gold_amount condition - not yet implemented`);
    return false;
  }

  // ========================================================================
  // Level Condition Evaluators
  // ========================================================================

  private evaluateLevel(
    condition: LevelCondition,
    context: EvaluationContext
  ): boolean {
    const totalLevel = this.calculateTotalLevel(context.character);
    return this.compareNumeric(totalLevel, condition.operator, condition.value);
  }

  private evaluateClassLevel(
    condition: ClassLevelCondition,
    context: EvaluationContext
  ): boolean {
    const classLevel = this.getClassLevel(
      context.character,
      condition.className
    );
    if (classLevel === -1) {
      return false;
    }

    return this.compareNumeric(classLevel, condition.operator, condition.value);
  }

  private evaluateHasClass(
    condition: HasClassCondition,
    context: EvaluationContext
  ): boolean {
    const classLevel = this.getClassLevel(
      context.character,
      condition.className
    );
    const hasClass = classLevel > 0;
    return hasClass === condition.value;
  }

  /**
   * Calculate total character level from all classes
   *
   * @param character - The character data
   * @returns Total level
   */
  private calculateTotalLevel(character: DndBeyondCharacterResponse): number {
    if (!character.classes) {
      return 0;
    }

    // Handle both array and single object formats
    if (Array.isArray(character.classes)) {
      return character.classes.reduce((total, cls) => total + (cls.level || 0), 0);
    } else {
      return (character.classes as ClassEntry).level || 0;
    }
  }

  /**
   * Get the level of a specific class
   *
   * @param character - The character data
   * @param className - The class name to search for
   * @returns The class level, or -1 if not found
   */
  private getClassLevel(
    character: DndBeyondCharacterResponse,
    className: string
  ): number {
    if (!character.classes) {
      return -1;
    }

    // Handle array format
    if (Array.isArray(character.classes)) {
      // Classes array may contain entries with a 'name' or 'id' property
      // For now, we'll check if the array has only one class and match by index
      const classIndex = this.findClassIndex(character.classes, className);
      if (classIndex !== -1) {
        return character.classes[classIndex].level || 0;
      }
      return -1;
    }

    // For single object format, we cannot determine the class name
    // Return 0 to indicate class exists but cannot match by name
    return -1;
  }

  /**
   * Find the index of a class in the classes array
   *
   * @param classes - The classes array
   * @param className - The class name to search for
   * @returns The index, or -1 if not found
   */
  private findClassIndex(
    classes: ClassEntry[],
    className: string
  ): number {
    // This is a placeholder - the actual implementation depends on the character data structure
    // For now, we'll return -1 as the classes array doesn't contain explicit class names
    // in the provided interface
    console.warn(
      `[RULES] Class name matching not yet fully implemented - classes array lacks name field`
    );
    return -1;
  }

  // ========================================================================
  // Constant Condition Evaluators
  // ========================================================================

  private evaluateAlways(
    _condition: AlwaysCondition,
    _context: EvaluationContext
  ): boolean {
    return true;
  }

  private evaluateNever(
    _condition: NeverCondition,
    _context: EvaluationContext
  ): boolean {
    return false;
  }
}
