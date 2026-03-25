use std::collections::HashMap;

use crate::types::DndBeyondCharacterResponse;

use super::definitions::get_stat_definitions;
use super::types::{CalculatedStat, StatMapping};

/// Calculator for D&D Beyond stats
pub struct StatCalculator;

impl StatCalculator {
    pub fn new() -> Self {
        Self
    }

    /// Calculate a single stat value
    pub fn calculate_stat(
        &self,
        stat_id: &str,
        data: &DndBeyondCharacterResponse,
    ) -> Option<String> {
        let definitions = get_stat_definitions();
        let definition = definitions.iter().find(|d| d.id == stat_id)?;
        Some((definition.calculate)(data).to_string())
    }

    /// Calculate all configured stat mappings
    pub fn calculate_mappings(
        &self,
        mappings: &[StatMapping],
        data: &DndBeyondCharacterResponse,
        previous_values: &HashMap<String, String>,
    ) -> Vec<CalculatedStat> {
        mappings
            .iter()
            .map(|mapping| {
                match self.calculate_stat(&mapping.stat_id, data) {
                    Some(raw_value) => {
                        let formatted = if let Some(ref format) = mapping.format {
                            format.replace("{value}", &raw_value)
                        } else {
                            raw_value
                        };

                        let previous = previous_values.get(&mapping.obs_source_name).cloned();
                        let changed = previous.as_ref() != Some(&formatted);

                        CalculatedStat {
                            obs_source_name: mapping.obs_source_name.clone(),
                            value: formatted,
                            previous_value: previous,
                            changed,
                        }
                    }
                    None => {
                        eprintln!(
                            "[STATS] Failed to calculate mapping for {} (stat: {})",
                            mapping.obs_source_name, mapping.stat_id
                        );
                        CalculatedStat {
                            obs_source_name: mapping.obs_source_name.clone(),
                            value: "ERROR".to_string(),
                            previous_value: previous_values
                                .get(&mapping.obs_source_name)
                                .cloned(),
                            changed: true,
                        }
                    }
                }
            })
            .collect()
    }
}
