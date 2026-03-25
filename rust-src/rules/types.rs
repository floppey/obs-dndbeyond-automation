use serde::{Deserialize, Serialize};

use crate::types::{DeathSaves, DndBeyondCharacterResponse};

/// Condition types - using serde tagged union
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Condition {
    // HP conditions
    HpPercentage {
        operator: String,
        value: f64,
    },
    HpValue {
        operator: String,
        value: f64,
    },
    HpTemp {
        operator: String,
        value: f64,
    },
    HpMissing {
        operator: String,
        value: f64,
    },
    // Death state conditions
    IsDead {
        value: bool,
    },
    IsUnconscious {
        value: bool,
    },
    DeathSavesSuccess {
        operator: String,
        value: f64,
    },
    DeathSavesFailure {
        operator: String,
        value: f64,
    },
    // Stat conditions
    StatValue {
        #[serde(rename = "statName")]
        stat_name: String,
        operator: String,
        value: f64,
    },
    AbilityScore {
        ability: String,
        operator: String,
        value: f64,
    },
    AbilityModifier {
        ability: String,
        operator: String,
        value: f64,
    },
    // Equipment conditions
    ItemEquipped {
        #[serde(rename = "itemName")]
        item_name: String,
        #[serde(rename = "matchPartial", default)]
        match_partial: Option<bool>,
    },
    ItemAttuned {
        #[serde(rename = "itemName")]
        item_name: String,
        #[serde(rename = "matchPartial", default)]
        match_partial: Option<bool>,
    },
    ArmorEquipped {
        value: bool,
    },
    ShieldEquipped {
        value: bool,
    },
    // Resource conditions
    SpellSlotsAvailable {
        #[serde(rename = "spellLevel")]
        spell_level: i64,
        operator: String,
        value: f64,
    },
    SpellSlotsUsed {
        #[serde(rename = "spellLevel")]
        spell_level: i64,
        operator: String,
        value: f64,
    },
    GoldAmount {
        operator: String,
        value: f64,
    },
    // Level conditions
    Level {
        operator: String,
        value: f64,
    },
    ClassLevel {
        #[serde(rename = "className")]
        class_name: String,
        operator: String,
        value: f64,
    },
    HasClass {
        #[serde(rename = "className")]
        class_name: String,
        value: bool,
    },
    // Constant conditions
    Always,
    Never,
}

/// Condition group with AND/OR logic
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConditionGroup {
    pub operator: String, // "AND" or "OR"
    pub conditions: Vec<RuleCondition>,
}

/// A rule's condition: single condition, group, or null (always matches)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RuleCondition {
    Group(ConditionGroup),
    Single(Condition),
    Null,
}

/// Action types
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum RuleAction {
    SetImage {
        #[serde(rename = "sourceName")]
        source_name: String,
        #[serde(rename = "imagePath")]
        image_path: String,
    },
    SetVisibility {
        #[serde(rename = "sceneName")]
        scene_name: String,
        #[serde(rename = "itemName")]
        item_name: String,
        visible: bool,
    },
    SetText {
        #[serde(rename = "sourceName")]
        source_name: String,
        text: String,
    },
    SetFilterVisibility {
        #[serde(rename = "sourceName")]
        source_name: String,
        #[serde(rename = "filterName")]
        filter_name: String,
        visible: bool,
    },
    SetInputSettings {
        #[serde(rename = "inputName")]
        input_name: String,
        settings: serde_json::Value,
    },
}

/// A single rule
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Rule {
    pub id: String,
    pub name: Option<String>,
    pub enabled: Option<bool>,
    pub condition: Option<RuleCondition>,
    pub actions: Vec<RuleAction>,
    pub priority: Option<i64>,
}

/// Rule evaluation mode
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RuleEvaluationMode {
    FirstMatch,
    AllMatches,
}

/// A collection of related rules
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleList {
    pub id: String,
    pub name: String,
    pub enabled: Option<bool>,
    pub mode: RuleEvaluationMode,
    pub rules: Vec<Rule>,
}

/// Complete rules engine configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleEngineConfig {
    pub version: String,
    pub rule_lists: Vec<RuleList>,
}

/// Evaluation context
#[derive(Debug, Clone, Serialize)]
pub struct EvaluationContext {
    pub character: DndBeyondCharacterResponse,
    pub current_hp: i64,
    pub max_hp: i64,
    pub temporary_hp: i64,
    pub hp_percentage: f64,
    pub is_dead: bool,
    pub death_saves: DeathSaves,
    pub timestamp: u64,
}
