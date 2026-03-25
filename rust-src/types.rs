use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fmt;

use crate::game_log::types::GameLogConfig;
use crate::rules::types::RuleEngineConfig;
use crate::stats::types::StatMapping;

/// HP health states mapped from percentage
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum HpState {
    Healthy,
    Scratched,
    Bloodied,
    Dying,
    Unconscious,
}

impl fmt::Display for HpState {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HpState::Healthy => write!(f, "healthy"),
            HpState::Scratched => write!(f, "scratched"),
            HpState::Bloodied => write!(f, "bloodied"),
            HpState::Dying => write!(f, "dying"),
            HpState::Unconscious => write!(f, "unconscious"),
        }
    }
}

impl HpState {
    pub fn all() -> &'static [HpState] {
        &[
            HpState::Healthy,
            HpState::Scratched,
            HpState::Bloodied,
            HpState::Dying,
            HpState::Unconscious,
        ]
    }
}

/// Stat entry in D&D Beyond API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatEntry {
    pub id: i64,
    pub name: Option<String>,
    pub value: Option<i64>,
}

/// Modifier from D&D Beyond API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Modifier {
    pub fixed_value: Option<i64>,
    pub id: serde_json::Value, // Can be string or number
    pub r#type: String,
    pub sub_type: String,
    pub value: Option<i64>,
    #[serde(default)]
    pub is_granted: Option<bool>,
    pub restriction: Option<String>,
    pub dice: Option<serde_json::Value>,
    #[serde(default)]
    pub component_id: Option<serde_json::Value>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Character value override from D&D Beyond API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterValue {
    pub type_id: i64,
    pub value: serde_json::Value, // Can be number or string
    pub notes: Option<String>,
    pub value_id: Option<String>,
    pub value_type_id: Option<String>,
    pub context_id: Option<String>,
    pub context_type_id: Option<String>,
}

/// Class entry in D&D Beyond API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClassEntry {
    pub level: i64,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Inventory item from D&D Beyond API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryItem {
    pub id: i64,
    pub entity_type_id: Option<i64>,
    pub definition: ItemDefinition,
    pub quantity: i64,
    pub is_attuned: bool,
    pub equipped: bool,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemDefinition {
    pub id: i64,
    pub name: String,
    #[serde(default)]
    pub is_consumable: bool,
    #[serde(default)]
    pub can_equip: bool,
    #[serde(default)]
    pub can_attune: bool,
    #[serde(default)]
    pub armor_type_id: Option<serde_json::Value>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Choice entry from D&D Beyond API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Choice {
    pub component_id: i64,
    pub component_type_id: Option<i64>,
    pub id: String,
    pub parent_choice_id: Option<String>,
    pub r#type: i64,
    pub sub_type: Option<i64>,
    pub option_value: Option<i64>,
    pub label: Option<String>,
    #[serde(default)]
    pub is_optional: bool,
    #[serde(default)]
    pub is_infinite: bool,
    #[serde(default)]
    pub option_ids: Vec<i64>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Modifier categories from D&D Beyond API
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModifierCategories {
    pub race: Vec<Modifier>,
    pub class: Vec<Modifier>,
    pub background: Vec<Modifier>,
    pub item: Vec<Modifier>,
    pub feat: Vec<Modifier>,
    pub condition: Vec<Modifier>,
}

/// Choice categories from D&D Beyond API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChoiceCategories {
    #[serde(default)]
    pub race: Vec<Choice>,
    #[serde(default)]
    pub class: Vec<Choice>,
    pub background: Option<Vec<Choice>>,
    pub item: Option<Vec<Choice>>,
    #[serde(default)]
    pub feat: Vec<Choice>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Death saves data
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeathSaves {
    pub success_count: i64,
    pub fail_count: i64,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

/// Response from D&D Beyond character API
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DndBeyondCharacterResponse {
    pub base_hit_points: i64,
    pub bonus_hit_points: Option<i64>,
    pub override_hit_points: Option<i64>,
    pub removed_hit_points: i64,
    pub temporary_hit_points: i64,
    pub stats: Vec<StatEntry>,
    pub bonus_stats: Vec<StatEntry>,
    pub override_stats: Vec<StatEntry>,
    pub classes: serde_json::Value, // Can be array or object
    pub modifiers: ModifierCategories,
    pub choices: Option<ChoiceCategories>,
    pub death_saves: DeathSaves,
    #[serde(default)]
    pub is_dead: bool,
    pub character_values: Option<Vec<CharacterValue>>,
    pub inventory: Option<Vec<InventoryItem>>,
    #[serde(flatten)]
    pub extra: HashMap<String, serde_json::Value>,
}

impl DndBeyondCharacterResponse {
    /// Get classes as a vector of ClassEntry
    pub fn get_classes(&self) -> Vec<ClassEntry> {
        if let Ok(classes) = serde_json::from_value::<Vec<ClassEntry>>(self.classes.clone()) {
            classes
        } else if let Ok(class) = serde_json::from_value::<ClassEntry>(self.classes.clone()) {
            vec![class]
        } else {
            vec![]
        }
    }

    /// Get total character level
    pub fn get_total_level(&self) -> i64 {
        self.get_classes().iter().map(|c| c.level).sum()
    }
}

/// Extracted character HP data
#[derive(Debug, Clone)]
pub struct CharacterHpData {
    pub current_hp: i64,
    pub max_hp: i64,
    pub temporary_hp: i64,
    pub hp_percentage: f64,
    pub state: HpState,
    pub is_dead: bool,
    pub death_saves: DeathSaves,
}

/// Configuration for OBS operations
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OBSClientConfig {
    pub websocket_url: String,
    pub websocket_password: Option<String>,
    pub mode: OBSMode,
    pub scene_name: Option<String>,
    pub source_name: Option<String>,
    pub image_paths_by_state: Option<HashMap<HpState, String>>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OBSMode {
    ImageSwap,
    VisibilityToggle,
}

/// Main application configuration
#[derive(Debug, Clone)]
pub struct Config {
    pub dnd: DndConfig,
    pub obs: OBSClientConfig,
    pub poll_interval_ms: u64,
    pub stat_mappings: Vec<StatMapping>,
    pub game_log: Option<GameLogConfig>,
    pub rules: Option<RuleEngineConfig>,
    pub debug: DebugConfig,
}

#[derive(Debug, Clone)]
pub struct DndConfig {
    pub character_id: String,
    pub cobalt_session: String,
}

#[derive(Debug, Clone)]
pub struct DebugConfig {
    pub save_api_response: bool,
}
