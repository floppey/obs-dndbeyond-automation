use serde::{Deserialize, Serialize};

/// Game log message from D&D Beyond API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLogMessage {
    pub id: String,
    pub date_time: String,
    pub game_id: String,
    pub user_id: String,
    pub data: GameLogRollData,
    pub entity_id: String,
    pub entity_type: Option<String>,
    pub event_type: String,
}

/// Roll data contained in a game log message
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLogRollData {
    pub action: String,
    pub rolls: Vec<DiceRoll>,
    pub context: RollContext,
    pub roll_id: Option<String>,
    pub set_id: Option<String>,
}

/// Individual dice roll result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiceRoll {
    pub dice_notation: DiceNotation,
    pub roll_type: String,
    pub roll_kind: String,
    pub result: RollResult,
}

/// Dice notation metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiceNotation {
    pub set: Vec<DiceSet>,
    pub constant: i64,
}

/// Set of dice in notation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiceSet {
    pub count: i64,
    pub die_type: String,
    #[serde(default)]
    pub dice: Vec<serde_json::Value>,
    #[serde(default)]
    pub operation: i64,
    pub operand: Option<i64>,
}

/// Result of a dice roll
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RollResult {
    pub constant: i64,
    pub values: Vec<i64>,
    pub total: i64,
    pub text: String,
}

/// Context information about who made the roll
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RollContext {
    pub entity_id: String,
    pub entity_type: String,
    pub name: String,
    pub avatar_url: Option<String>,
    pub user_id: String,
}

/// Response from game log API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameLogResponse {
    pub data: Vec<GameLogMessage>,
    pub last_key: Option<GameLogLastKey>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameLogLastKey {
    #[serde(rename = "gameId")]
    pub game_id: String,
    #[serde(rename = "dateTime_eventType_userId")]
    pub date_time_event_type_user_id: String,
}

/// Parsed roll for display in OBS
#[derive(Debug, Clone)]
pub struct ParsedRoll {
    pub id: String,
    pub timestamp: i64,
    pub character: String,
    pub action: String,
    pub total: i64,
    pub breakdown: String,
    pub roll_type: String,
    pub roll_kind: String,
    pub dice: String,
    pub values: String,
}

/// Game log configuration
#[derive(Debug, Clone)]
pub struct GameLogConfig {
    pub enabled: bool,
    pub game_id: String,
    pub user_id: String,
    pub cobalt_session: String,
    pub poll_interval_ms: u64,
    pub last_roll: Option<LastRollConfig>,
    pub roll_history: Option<RollHistoryConfig>,
}

#[derive(Debug, Clone)]
pub struct LastRollConfig {
    pub source_name: String,
    pub format: String,
}

#[derive(Debug, Clone)]
pub struct RollHistoryConfig {
    pub source_name: String,
    pub format: String,
    pub count: usize,
}
