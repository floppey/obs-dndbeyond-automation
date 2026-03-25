use crate::types::{DeathSaves, HpState};

/// Calculate HP state based on current HP and max HP
pub fn calculate_hp_state(
    current_hp: i64,
    max_hp: i64,
    is_dead: bool,
    death_saves: &DeathSaves,
) -> HpState {
    // Check if character is unconscious/dead
    if current_hp <= 0 || is_dead {
        return HpState::Unconscious;
    }

    // Check if death saves are in progress
    if death_saves.success_count > 0 || death_saves.fail_count > 0 {
        return HpState::Unconscious;
    }

    // Calculate HP percentage
    let hp_percentage = if max_hp > 0 {
        (current_hp as f64 / max_hp as f64) * 100.0
    } else {
        100.0
    };

    if hp_percentage > 75.0 {
        HpState::Healthy
    } else if hp_percentage > 50.0 {
        HpState::Scratched
    } else if hp_percentage > 25.0 {
        HpState::Bloodied
    } else {
        HpState::Dying
    }
}

/// Format HP data for logging
pub fn format_hp_info(current_hp: i64, max_hp: i64, temporary_hp: i64, state: HpState) -> String {
    let hp_percentage = if max_hp > 0 {
        ((current_hp as f64 / max_hp as f64) * 100.0) as i64
    } else {
        0
    };
    let temp_text = if temporary_hp > 0 {
        format!(" [+{} temp]", temporary_hp)
    } else {
        String::new()
    };
    format!(
        "HP {}/{} ({}%){} -> {}",
        current_hp, max_hp, hp_percentage, temp_text, state
    )
}
