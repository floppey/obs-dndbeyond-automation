use super::types::ParsedRoll;

/// Format a single parsed roll using a format string template
pub fn format_roll(roll: &ParsedRoll, format: &str) -> String {
    format
        .replace("{character}", &roll.character)
        .replace("{action}", &roll.action)
        .replace("{total}", &roll.total.to_string())
        .replace("{breakdown}", &roll.breakdown)
        .replace("{roll_type}", &roll.roll_type)
        .replace("{roll_kind}", &roll.roll_kind)
        .replace("{dice}", &roll.dice)
        .replace("{values}", &roll.values)
}

/// Format a list of parsed rolls into a multi-line history string
pub fn format_roll_history(rolls: &[ParsedRoll], format: &str, count: usize) -> String {
    // Skip the first roll (newest) since it's shown in "Last Roll"
    // Then take the next N rolls for history
    let history_rolls = rolls.iter().skip(1).take(count);

    history_rolls
        .map(|roll| format_roll(roll, format))
        .collect::<Vec<_>>()
        .join("\n")
}
