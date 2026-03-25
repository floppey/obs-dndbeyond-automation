use super::types::*;

/// Rule Engine for evaluating rules and returning actions
pub struct RuleEngine;

impl RuleEngine {
    pub fn new() -> Self {
        Self
    }

    /// Evaluate all rule lists and return actions to execute
    pub fn evaluate(
        &self,
        config: &RuleEngineConfig,
        context: &EvaluationContext,
    ) -> Vec<RuleAction> {
        println!("[RULES] Evaluating rules engine");
        let mut actions: Vec<RuleAction> = Vec::new();

        for rule_list in &config.rule_lists {
            if rule_list.enabled == Some(false) {
                println!("[RULES] Skipping disabled rule list: {}", rule_list.id);
                continue;
            }

            println!(
                "[RULES] Evaluating rule list: {} (mode: {:?})",
                rule_list.id, rule_list.mode
            );

            // Sort rules by priority descending
            let mut sorted_rules = rule_list.rules.clone();
            sorted_rules.sort_by(|a, b| {
                let pa = b.priority.unwrap_or(0);
                let pb = a.priority.unwrap_or(0);
                pa.cmp(&pb)
            });

            for rule in &sorted_rules {
                if rule.enabled == Some(false) {
                    println!("[RULES] Skipping disabled rule: {}", rule.id);
                    continue;
                }

                let condition_met = match &rule.condition {
                    None => true,
                    Some(condition) => self.evaluate_rule_condition(condition, context),
                };

                if condition_met {
                    let name = rule.name.as_deref().unwrap_or("");
                    println!("[RULES] Rule matched: {} {}", rule.id, name);
                    actions.extend(rule.actions.clone());

                    if matches!(rule_list.mode, RuleEvaluationMode::FirstMatch) {
                        println!(
                            "[RULES] First match found, stopping evaluation of rule list: {}",
                            rule_list.id
                        );
                        break;
                    }
                } else {
                    let name = rule.name.as_deref().unwrap_or("");
                    println!("[RULES] Rule condition not met: {} {}", rule.id, name);
                }
            }
        }

        println!(
            "[RULES] Evaluation complete. Total actions: {}",
            actions.len()
        );
        actions
    }

    fn evaluate_rule_condition(
        &self,
        condition: &RuleCondition,
        context: &EvaluationContext,
    ) -> bool {
        match condition {
            RuleCondition::Null => true,
            RuleCondition::Group(group) => self.evaluate_condition_group(group, context),
            RuleCondition::Single(cond) => self.evaluate_single_condition(cond, context),
        }
    }

    fn evaluate_condition_group(
        &self,
        group: &ConditionGroup,
        context: &EvaluationContext,
    ) -> bool {
        if group.conditions.is_empty() {
            eprintln!("[RULES] Invalid condition group: empty conditions array");
            return false;
        }

        match group.operator.as_str() {
            "AND" => group
                .conditions
                .iter()
                .all(|c| self.evaluate_rule_condition(c, context)),
            "OR" => group
                .conditions
                .iter()
                .any(|c| self.evaluate_rule_condition(c, context)),
            other => {
                eprintln!("[RULES] Unknown logical operator: {}", other);
                false
            }
        }
    }

    fn evaluate_single_condition(
        &self,
        condition: &Condition,
        context: &EvaluationContext,
    ) -> bool {
        match condition {
            // HP Conditions
            Condition::HpPercentage { operator, value } => {
                compare_numeric(context.hp_percentage, operator, *value)
            }
            Condition::HpValue { operator, value } => {
                compare_numeric(context.current_hp as f64, operator, *value)
            }
            Condition::HpTemp { operator, value } => {
                compare_numeric(context.temporary_hp as f64, operator, *value)
            }
            Condition::HpMissing { operator, value } => {
                let missing = (context.max_hp - context.current_hp) as f64;
                compare_numeric(missing, operator, *value)
            }

            // Death State
            Condition::IsDead { value } => context.is_dead == *value,
            Condition::IsUnconscious { value } => {
                let is_unconscious = context.current_hp == 0
                    || context.is_dead
                    || context.death_saves.fail_count > 0;
                is_unconscious == *value
            }
            Condition::DeathSavesSuccess { operator, value } => {
                compare_numeric(context.death_saves.success_count as f64, operator, *value)
            }
            Condition::DeathSavesFailure { operator, value } => {
                compare_numeric(context.death_saves.fail_count as f64, operator, *value)
            }

            // Stat Conditions
            Condition::StatValue { .. } => {
                eprintln!("[RULES] stat_value condition requires StatCalculator - not yet implemented");
                false
            }
            Condition::AbilityScore {
                ability,
                operator,
                value,
            } => {
                let ability_index = get_ability_index(ability);
                if let Some(stat) = context.character.stats.get(ability_index) {
                    if let Some(score) = stat.value {
                        return compare_numeric(score as f64, operator, *value);
                    }
                }
                false
            }
            Condition::AbilityModifier {
                ability,
                operator,
                value,
            } => {
                let ability_index = get_ability_index(ability);
                if let Some(stat) = context.character.stats.get(ability_index) {
                    if let Some(score) = stat.value {
                        let modifier = if score >= 10 {
                            (score - 10) / 2
                        } else {
                            -((10 - score + 1) / 2)
                        };
                        return compare_numeric(modifier as f64, operator, *value);
                    }
                }
                false
            }

            // Equipment Conditions
            Condition::ItemEquipped {
                item_name,
                match_partial,
            } => {
                if let Some(ref inventory) = context.character.inventory {
                    inventory.iter().any(|item| {
                        if !item.equipped {
                            return false;
                        }
                        let name = item.definition.name.to_lowercase();
                        let search = item_name.to_lowercase();
                        if match_partial.unwrap_or(false) {
                            name.contains(&search)
                        } else {
                            name == search
                        }
                    })
                } else {
                    false
                }
            }
            Condition::ItemAttuned {
                item_name,
                match_partial,
            } => {
                if let Some(ref inventory) = context.character.inventory {
                    inventory.iter().any(|item| {
                        if !item.is_attuned {
                            return false;
                        }
                        let name = item.definition.name.to_lowercase();
                        let search = item_name.to_lowercase();
                        if match_partial.unwrap_or(false) {
                            name.contains(&search)
                        } else {
                            name == search
                        }
                    })
                } else {
                    false
                }
            }
            Condition::ArmorEquipped { value } => {
                let has_armor = context
                    .character
                    .inventory
                    .as_ref()
                    .map(|inv| {
                        inv.iter().any(|item| {
                            item.equipped
                                && item
                                    .definition
                                    .armor_type_id
                                    .as_ref()
                                    .map_or(false, |v| !v.is_null())
                        })
                    })
                    .unwrap_or(false);
                has_armor == *value
            }
            Condition::ShieldEquipped { value } => {
                let has_shield = context
                    .character
                    .inventory
                    .as_ref()
                    .map(|inv| {
                        inv.iter().any(|item| {
                            item.equipped
                                && item.definition.name.to_lowercase().contains("shield")
                        })
                    })
                    .unwrap_or(false);
                has_shield == *value
            }

            // Resource Conditions (not yet implemented)
            Condition::SpellSlotsAvailable { .. } => {
                eprintln!("[RULES] spell_slots_available - not yet implemented");
                false
            }
            Condition::SpellSlotsUsed { .. } => {
                eprintln!("[RULES] spell_slots_used - not yet implemented");
                false
            }
            Condition::GoldAmount { .. } => {
                eprintln!("[RULES] gold_amount - not yet implemented");
                false
            }

            // Level Conditions
            Condition::Level { operator, value } => {
                let total_level = context.character.get_total_level() as f64;
                compare_numeric(total_level, operator, *value)
            }
            Condition::ClassLevel { .. } => {
                eprintln!("[RULES] class_level - class name matching not fully implemented");
                false
            }
            Condition::HasClass { .. } => {
                eprintln!("[RULES] has_class - class name matching not fully implemented");
                false
            }

            // Constants
            Condition::Always => true,
            Condition::Never => false,
        }
    }
}

fn compare_numeric(actual: f64, operator: &str, expected: f64) -> bool {
    match operator {
        ">" => actual > expected,
        ">=" => actual >= expected,
        "<" => actual < expected,
        "<=" => actual <= expected,
        "==" => (actual - expected).abs() < f64::EPSILON,
        "!=" => (actual - expected).abs() >= f64::EPSILON,
        _ => {
            eprintln!("[RULES] Unknown comparison operator: {}", operator);
            false
        }
    }
}

fn get_ability_index(ability: &str) -> usize {
    match ability.to_lowercase().as_str() {
        "strength" => 0,
        "dexterity" => 1,
        "constitution" => 2,
        "intelligence" => 3,
        "wisdom" => 4,
        "charisma" => 5,
        _ => 0,
    }
}
