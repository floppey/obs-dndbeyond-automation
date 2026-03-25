use std::collections::HashSet;

use crate::types::*;

use super::types::{StatDefinition, StatValue};

/// Check if character is wearing armor
fn is_wearing_armor(data: &DndBeyondCharacterResponse) -> bool {
    if let Some(ref inventory) = data.inventory {
        for item in inventory {
            if item.equipped {
                if item.definition.armor_type_id.is_some() {
                    if let Some(ref atid) = item.definition.armor_type_id {
                        if !atid.is_null() {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

/// Get active item definition IDs
/// Items that can attune are only active when attuned, others when equipped
fn get_active_item_ids(data: &DndBeyondCharacterResponse) -> HashSet<i64> {
    let mut active_ids = HashSet::new();
    if let Some(ref inventory) = data.inventory {
        for item in inventory {
            if item.definition.is_consumable {
                continue;
            }
            if item.definition.can_attune {
                // Attuneable items only count when attuned
                if item.is_attuned {
                    active_ids.insert(item.definition.id);
                }
            } else if item.equipped {
                active_ids.insert(item.definition.id);
            }
        }
    }
    active_ids
}

/// Get filtered active item modifiers
fn get_active_item_modifiers(data: &DndBeyondCharacterResponse) -> Vec<&Modifier> {
    let active_item_ids = get_active_item_ids(data);
    data.modifiers
        .item
        .iter()
        .filter(|m| {
            if let Some(ref cid) = m.component_id {
                if let Some(id) = cid.as_i64() {
                    return active_item_ids.contains(&id);
                }
            }
            true
        })
        .collect()
}

/// Get all modifiers from all sources
fn get_all_modifiers(data: &DndBeyondCharacterResponse) -> Vec<&Modifier> {
    let active_items = get_active_item_modifiers(data);
    data.modifiers
        .race
        .iter()
        .chain(data.modifiers.class.iter())
        .chain(data.modifiers.background.iter())
        .chain(active_items.into_iter())
        .chain(data.modifiers.feat.iter())
        .chain(data.modifiers.condition.iter())
        .collect()
}

/// Check if a modifier is granted by choice
fn is_modifier_granted_by_choice(data: &DndBeyondCharacterResponse, modifier: &Modifier) -> bool {
    if modifier.is_granted != Some(false) {
        return true;
    }

    if let Some(ref choices) = data.choices {
        let modifier_id = modifier.id.as_str().map(|s| s.to_string())
            .unwrap_or_else(|| modifier.id.to_string());
        for choice in &choices.feat {
            let parts: Vec<&str> = choice.id.split('-').collect();
            if parts.len() >= 2 {
                let choice_modifier_id = parts[1..].join("-");
                if choice_modifier_id == modifier_id {
                    if let Some(option_value) = choice.option_value {
                        if choice.option_ids.contains(&option_value) {
                            return true;
                        }
                    }
                }
            }
        }
    }

    false
}

/// Get ability score (stat index: STR=0, DEX=1, CON=2, INT=3, WIS=4, CHA=5)
fn get_ability_score(data: &DndBeyondCharacterResponse, stat_index: usize) -> i64 {
    let ability_names = [
        "strength",
        "dexterity",
        "constitution",
        "intelligence",
        "wisdom",
        "charisma",
    ];
    let sub_type = format!("{}-score", ability_names[stat_index]);

    let mut score = data
        .stats
        .get(stat_index)
        .and_then(|s| s.value)
        .unwrap_or(10);

    if let Some(bonus) = data.bonus_stats.get(stat_index).and_then(|s| s.value) {
        score += bonus;
    }

    if let Some(override_val) = data.override_stats.get(stat_index).and_then(|s| s.value) {
        return override_val;
    }

    let all_modifiers = get_all_modifiers(data);

    // Add bonus modifiers
    for m in &all_modifiers {
        if m.r#type == "bonus"
            && m.sub_type == sub_type
            && (m.is_granted != Some(false) || is_modifier_granted_by_choice(data, m))
        {
            let val = m.fixed_value.or(m.value);
            if let Some(v) = val {
                score += v;
            }
        }
    }

    // Check for "set" modifiers (like Gauntlets of Ogre Power)
    for m in &all_modifiers {
        if m.r#type == "set"
            && m.sub_type == sub_type
            && (m.is_granted != Some(false) || is_modifier_granted_by_choice(data, m))
        {
            let set_value = m.fixed_value.or(m.value);
            if let Some(sv) = set_value {
                if sv > score {
                    score = sv;
                }
            }
        }
    }

    score
}

/// Calculate ability modifier from score
fn get_ability_modifier(score: i64) -> i64 {
    if score >= 10 {
        (score - 10) / 2
    } else {
        -((10 - score + 1) / 2)
    }
}

/// Sum modifiers matching type and subType
fn sum_modifiers_by_type_and_sub_type(
    data: &DndBeyondCharacterResponse,
    mod_type: &str,
    sub_type: &str,
) -> i64 {
    let all_modifiers = get_all_modifiers(data);
    let mut total = 0i64;
    for m in all_modifiers {
        if m.r#type == mod_type && m.sub_type == sub_type {
            let val = m.fixed_value.or(m.value);
            if let Some(v) = val {
                total += v;
            }
        }
    }
    total
}

/// Get total character level
fn get_total_level(data: &DndBeyondCharacterResponse) -> i64 {
    data.get_total_level()
}

/// Get proficiency bonus based on level
fn get_proficiency_bonus(level: i64) -> i64 {
    if level <= 4 {
        2
    } else if level <= 8 {
        3
    } else if level <= 12 {
        4
    } else if level <= 16 {
        5
    } else {
        6
    }
}

/// Check if proficient in a skill
fn is_proficient_in_skill(data: &DndBeyondCharacterResponse, skill_sub_type: &str) -> bool {
    let all_modifiers = get_all_modifiers(data);
    all_modifiers.iter().any(|m| {
        m.r#type == "proficiency" && m.sub_type == skill_sub_type && m.fixed_value == Some(1)
    })
}

/// Get ability index by name
fn get_ability_index(ability_name: &str) -> usize {
    match ability_name {
        "strength" => 0,
        "dexterity" => 1,
        "constitution" => 2,
        "intelligence" => 3,
        "wisdom" => 4,
        "charisma" => 5,
        _ => 0,
    }
}

/// Get spellcasting ability modifier
fn get_spellcasting_modifier(data: &DndBeyondCharacterResponse) -> i64 {
    let all_modifiers = get_all_modifiers(data);

    for ability in &["wisdom", "intelligence", "charisma"] {
        let has_ability = all_modifiers
            .iter()
            .any(|m| m.r#type == "ability" && m.sub_type == format!("{}-score", ability));
        if has_ability {
            return get_ability_modifier(get_ability_score(data, get_ability_index(ability)));
        }
    }

    // Default: prefer WIS > INT > CHA
    let wis_mod = get_ability_modifier(get_ability_score(data, 4));
    if wis_mod >= 0 {
        return wis_mod;
    }
    let int_mod = get_ability_modifier(get_ability_score(data, 3));
    if int_mod >= 0 {
        return int_mod;
    }
    get_ability_modifier(get_ability_score(data, 5))
}

/// Format modifier as +/- string
fn format_modifier(val: i64) -> String {
    if val >= 0 {
        format!("+{}", val)
    } else {
        format!("{}", val)
    }
}

/// Calculate max HP helper
fn calc_max_hp(data: &DndBeyondCharacterResponse) -> i64 {
    if let Some(override_hp) = data.override_hit_points {
        return override_hp;
    }
    let con_score = get_ability_score(data, 2);
    let con_mod = get_ability_modifier(con_score);
    let total_level = get_total_level(data);
    let hp_bonus = sum_modifiers_by_type_and_sub_type(data, "bonus", "hit-points");
    let bonus_hp = data.bonus_hit_points.unwrap_or(0);
    (data.base_hit_points + con_mod * total_level + hp_bonus + bonus_hp).max(0)
}

/// All stat definitions
pub fn get_stat_definitions() -> Vec<StatDefinition> {
    vec![
        StatDefinition {
            id: "level",
            name: "Character Level",
            description: "Total character level",
            calculate: |data| StatValue::Number(get_total_level(data)),
        },
        StatDefinition {
            id: "ac",
            name: "Armor Class",
            description: "Armor class",
            calculate: |data| {
                // Check for AC override
                if let Some(ref cvs) = data.character_values {
                    for cv in cvs {
                        if cv.type_id == 1 {
                            if let Some(v) = cv.value.as_i64() {
                                return StatValue::Number(v);
                            }
                        }
                    }
                }

                let dex_mod = get_ability_modifier(get_ability_score(data, 1));
                let mut ac = 10 + dex_mod;
                let wearing_armor = is_wearing_armor(data);
                let all_modifiers = get_all_modifiers(data);

                for m in &all_modifiers {
                    if m.r#type == "bonus"
                        && (m.sub_type == "armor-class"
                            || m.sub_type == "unarmored-armor-class"
                            || (m.sub_type == "armored-armor-class" && wearing_armor))
                        && m.is_granted != Some(false)
                    {
                        let val = m.fixed_value.or(m.value);
                        if let Some(v) = val {
                            ac += v;
                        }
                    }
                }

                // Custom AC bonuses from characterValues
                if let Some(ref cvs) = data.character_values {
                    for cv in cvs {
                        if cv.type_id == 2 || cv.type_id == 3 {
                            if let Some(v) = cv.value.as_i64() {
                                ac += v;
                            }
                        }
                    }
                }

                StatValue::Number(ac.max(10))
            },
        },
        StatDefinition {
            id: "hp_current",
            name: "Current HP",
            description: "Current hit points",
            calculate: |data| {
                let max_hp = calc_max_hp(data);
                let current = (max_hp - data.removed_hit_points).max(0);
                StatValue::Number(current)
            },
        },
        StatDefinition {
            id: "hp_max",
            name: "Max HP",
            description: "Maximum hit points",
            calculate: |data| StatValue::Number(calc_max_hp(data)),
        },
        StatDefinition {
            id: "hp_temp",
            name: "Temporary HP",
            description: "Temporary hit points",
            calculate: |data| StatValue::Number(data.temporary_hit_points),
        },
        StatDefinition {
            id: "hp_display",
            name: "HP Display",
            description: "Formatted HP display (current/max)",
            calculate: |data| {
                let max_hp = calc_max_hp(data);
                let current = (max_hp - data.removed_hit_points).max(0);
                StatValue::Text(format!("{}/{}", current, max_hp))
            },
        },
        // Ability scores and modifiers
        StatDefinition {
            id: "strength",
            name: "Strength Score",
            description: "Strength ability score",
            calculate: |data| StatValue::Number(get_ability_score(data, 0)),
        },
        StatDefinition {
            id: "strength_mod",
            name: "Strength Modifier",
            description: "Strength modifier",
            calculate: |data| {
                let score = get_ability_score(data, 0);
                StatValue::Text(format_modifier(get_ability_modifier(score)))
            },
        },
        StatDefinition {
            id: "dexterity",
            name: "Dexterity Score",
            description: "Dexterity ability score",
            calculate: |data| StatValue::Number(get_ability_score(data, 1)),
        },
        StatDefinition {
            id: "dexterity_mod",
            name: "Dexterity Modifier",
            description: "Dexterity modifier",
            calculate: |data| {
                let score = get_ability_score(data, 1);
                StatValue::Text(format_modifier(get_ability_modifier(score)))
            },
        },
        StatDefinition {
            id: "constitution",
            name: "Constitution Score",
            description: "Constitution ability score",
            calculate: |data| StatValue::Number(get_ability_score(data, 2)),
        },
        StatDefinition {
            id: "constitution_mod",
            name: "Constitution Modifier",
            description: "Constitution modifier",
            calculate: |data| {
                let score = get_ability_score(data, 2);
                StatValue::Text(format_modifier(get_ability_modifier(score)))
            },
        },
        StatDefinition {
            id: "intelligence",
            name: "Intelligence Score",
            description: "Intelligence ability score",
            calculate: |data| StatValue::Number(get_ability_score(data, 3)),
        },
        StatDefinition {
            id: "intelligence_mod",
            name: "Intelligence Modifier",
            description: "Intelligence modifier",
            calculate: |data| {
                let score = get_ability_score(data, 3);
                StatValue::Text(format_modifier(get_ability_modifier(score)))
            },
        },
        StatDefinition {
            id: "wisdom",
            name: "Wisdom Score",
            description: "Wisdom ability score",
            calculate: |data| StatValue::Number(get_ability_score(data, 4)),
        },
        StatDefinition {
            id: "wisdom_mod",
            name: "Wisdom Modifier",
            description: "Wisdom modifier",
            calculate: |data| {
                let score = get_ability_score(data, 4);
                StatValue::Text(format_modifier(get_ability_modifier(score)))
            },
        },
        StatDefinition {
            id: "charisma",
            name: "Charisma Score",
            description: "Charisma ability score",
            calculate: |data| StatValue::Number(get_ability_score(data, 5)),
        },
        StatDefinition {
            id: "charisma_mod",
            name: "Charisma Modifier",
            description: "Charisma modifier",
            calculate: |data| {
                let score = get_ability_score(data, 5);
                StatValue::Text(format_modifier(get_ability_modifier(score)))
            },
        },
        StatDefinition {
            id: "proficiency",
            name: "Proficiency Bonus",
            description: "Proficiency bonus",
            calculate: |data| {
                let level = get_total_level(data);
                StatValue::Text(format!("+{}", get_proficiency_bonus(level)))
            },
        },
        StatDefinition {
            id: "passive_perception",
            name: "Passive Perception",
            description: "Passive perception",
            calculate: |data| {
                let wis_score = get_ability_score(data, 4);
                let wis_mod = get_ability_modifier(wis_score);
                let mut pp = 10 + wis_mod;
                if is_proficient_in_skill(data, "perception") {
                    let level = get_total_level(data);
                    pp += get_proficiency_bonus(level);
                }
                pp += sum_modifiers_by_type_and_sub_type(data, "bonus", "passive-perception");
                StatValue::Number(pp)
            },
        },
        StatDefinition {
            id: "passive_investigation",
            name: "Passive Investigation",
            description: "Passive investigation",
            calculate: |data| {
                let int_score = get_ability_score(data, 3);
                let int_mod = get_ability_modifier(int_score);
                let mut pi = 10 + int_mod;
                if is_proficient_in_skill(data, "investigation") {
                    let level = get_total_level(data);
                    pi += get_proficiency_bonus(level);
                }
                pi += sum_modifiers_by_type_and_sub_type(data, "bonus", "passive-investigation");
                StatValue::Number(pi)
            },
        },
        StatDefinition {
            id: "passive_insight",
            name: "Passive Insight",
            description: "Passive insight",
            calculate: |data| {
                let wis_score = get_ability_score(data, 4);
                let wis_mod = get_ability_modifier(wis_score);
                let mut pi = 10 + wis_mod;
                if is_proficient_in_skill(data, "insight") {
                    let level = get_total_level(data);
                    pi += get_proficiency_bonus(level);
                }
                pi += sum_modifiers_by_type_and_sub_type(data, "bonus", "passive-insight");
                StatValue::Number(pi)
            },
        },
        StatDefinition {
            id: "initiative",
            name: "Initiative",
            description: "Initiative bonus",
            calculate: |data| {
                let dex_score = get_ability_score(data, 1);
                let dex_mod = get_ability_modifier(dex_score);
                let bonus = sum_modifiers_by_type_and_sub_type(data, "bonus", "initiative");
                let total = dex_mod + bonus;
                StatValue::Text(format_modifier(total))
            },
        },
        StatDefinition {
            id: "speed",
            name: "Speed",
            description: "Movement speed in feet",
            calculate: |data| {
                let mut speed = 30i64;
                speed += sum_modifiers_by_type_and_sub_type(data, "bonus", "speed");
                StatValue::Text(format!("{} ft.", speed))
            },
        },
        StatDefinition {
            id: "spell_save_dc",
            name: "Spell Save DC",
            description: "Spell save DC",
            calculate: |data| {
                let level = get_total_level(data);
                let prof = get_proficiency_bonus(level);
                let spell_mod = get_spellcasting_modifier(data);
                StatValue::Number(8 + prof + spell_mod)
            },
        },
        StatDefinition {
            id: "spell_attack",
            name: "Spell Attack",
            description: "Spell attack modifier",
            calculate: |data| {
                let level = get_total_level(data);
                let prof = get_proficiency_bonus(level);
                let spell_mod = get_spellcasting_modifier(data);
                let total = prof + spell_mod;
                StatValue::Text(format_modifier(total))
            },
        },
    ]
}
