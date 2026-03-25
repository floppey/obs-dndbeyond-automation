use serde::{Deserialize, Serialize};

/// D&D Beyond configuration section
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonConfigDndBeyond {
    pub character_id: String,
    pub cobalt_session: String,
}

/// Image paths for image_swap mode
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JsonConfigImages {
    pub healthy: String,
    pub scratched: String,
    pub bloodied: String,
    pub dying: String,
    pub unconscious: String,
}

/// OBS configuration section
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonConfigObs {
    pub websocket_url: String,
    pub websocket_password: Option<String>,
    pub mode: String,
    pub scene_name: Option<String>,
    pub source_name: Option<String>,
    pub images: Option<JsonConfigImages>,
}

/// Polling configuration section
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonConfigPolling {
    pub interval_ms: u64,
}

/// Stat mapping configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonConfigStatMapping {
    pub stat_id: String,
    pub obs_source_name: String,
    pub format: Option<String>,
}

/// Last roll configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonConfigLastRoll {
    pub source_name: String,
    pub format: Option<String>,
}

/// Roll history configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonConfigRollHistory {
    pub source_name: String,
    pub format: Option<String>,
    pub count: Option<usize>,
}

/// Game log configuration section
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonConfigGameLog {
    pub enabled: bool,
    pub game_id: Option<String>,
    pub user_id: Option<String>,
    pub poll_interval_ms: Option<u64>,
    pub last_roll: Option<JsonConfigLastRoll>,
    pub roll_history: Option<JsonConfigRollHistory>,
}

/// Debug configuration section
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonConfigDebug {
    pub save_api_response: Option<bool>,
}

/// Complete JSON configuration structure
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JsonConfig {
    pub dnd_beyond: JsonConfigDndBeyond,
    pub obs: JsonConfigObs,
    pub polling: JsonConfigPolling,
    pub stat_mappings: Option<Vec<JsonConfigStatMapping>>,
    pub game_log: Option<JsonConfigGameLog>,
    pub debug: Option<JsonConfigDebug>,
    pub rules: Option<serde_json::Value>,
}
