use crate::types::DndBeyondCharacterResponse;

/// Configuration for a single stat-to-OBS mapping
#[derive(Debug, Clone)]
pub struct StatMapping {
    pub stat_id: String,
    pub obs_source_name: String,
    pub format: Option<String>,
}

/// Stat definition with calculation function
#[allow(dead_code)]
pub struct StatDefinition {
    pub id: &'static str,
    pub name: &'static str,
    pub description: &'static str,
    pub calculate: fn(&DndBeyondCharacterResponse) -> StatValue,
}

/// Stat value that can be a number or a string
pub enum StatValue {
    Number(i64),
    Text(String),
}

impl std::fmt::Display for StatValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            StatValue::Number(n) => write!(f, "{}", n),
            StatValue::Text(s) => write!(f, "{}", s),
        }
    }
}

/// Result of a stat calculation with previous value for change detection
#[derive(Debug)]
#[allow(dead_code)]
pub struct CalculatedStat {
    pub obs_source_name: String,
    pub value: String,
    pub previous_value: Option<String>,
    pub changed: bool,
}
