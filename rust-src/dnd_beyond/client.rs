use anyhow::{bail, Context, Result};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, COOKIE, USER_AGENT};
use std::collections::HashSet;

use crate::types::*;

use super::hp_calculator::calculate_hp_state;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// Client for fetching character data from D&D Beyond
pub struct DndBeyondClient {
    character_id: String,
    cobalt_session: String,
    save_api_response: bool,
    http: reqwest::Client,
}

impl DndBeyondClient {
    pub fn new(character_id: String, cobalt_session: String, save_api_response: bool) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            character_id,
            cobalt_session,
            save_api_response,
            http,
        }
    }

    fn headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            COOKIE,
            HeaderValue::from_str(&format!("cobalt-session={}", self.cobalt_session))
                .unwrap_or_else(|_| HeaderValue::from_static("")),
        );
        headers.insert(USER_AGENT, HeaderValue::from_static(UA));
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
        headers
    }

    /// Fetch character data and extract HP data
    pub async fn fetch_character(&self) -> Result<CharacterHpData> {
        let raw = self.fetch_raw_character().await?;
        self.extract_hp_data(&raw)
    }

    /// Fetch raw character response for stat calculations
    pub async fn fetch_raw_character(&self) -> Result<DndBeyondCharacterResponse> {
        let url = format!(
            "https://character-service.dndbeyond.com/character/v5/character/{}",
            self.character_id
        );

        let response = self
            .http
            .get(&url)
            .headers(self.headers())
            .send()
            .await
            .context("Failed to send request to D&D Beyond")?;

        let status = response.status();
        if status.as_u16() >= 400 {
            match status.as_u16() {
                401 | 403 => {
                    bail!("Authentication failed ({}). Check your cobalt-session cookie.", status)
                }
                404 => bail!("Character not found ({}). Check your character ID.", status),
                _ => bail!("HTTP {}", status),
            }
        }

        let body = response
            .text()
            .await
            .context("Failed to read response body")?;

        if self.save_api_response {
            if let Err(e) = tokio::fs::write("api-response.json", &body).await {
                eprintln!("[DND] Failed to save API response: {}", e);
            } else {
                println!("[DND] API response saved to api-response.json");
            }
        }

        self.parse_raw_response(&body)
    }

    /// Parse raw API response
    fn parse_raw_response(&self, body: &str) -> Result<DndBeyondCharacterResponse> {
        let value: serde_json::Value =
            serde_json::from_str(body).context("Failed to parse API response as JSON")?;

        // Try unwrapping { data: ... } envelope
        let char_value = if let Some(data) = value.get("data") {
            data.clone()
        } else if value.get("baseHitPoints").is_some() {
            value
        } else {
            bail!("Invalid API response structure: missing character data");
        };

        let parsed: DndBeyondCharacterResponse = serde_json::from_value(char_value)
            .context("Failed to parse character data from API response")?;

        // Validate required fields
        if parsed.stats.len() < 3 {
            bail!("Missing or invalid stats in API response");
        }

        Ok(parsed)
    }

    /// Extract HP data from raw character response
    fn extract_hp_data(&self, data: &DndBeyondCharacterResponse) -> Result<CharacterHpData> {
        let max_hp = self.calculate_max_hp(data);
        let current_hp = (max_hp - data.removed_hit_points).max(0);
        let temporary_hp = data.temporary_hit_points;
        let hp_percentage = if max_hp > 0 {
            (current_hp as f64 / max_hp as f64) * 100.0
        } else {
            0.0
        };

        let state = calculate_hp_state(current_hp, max_hp, data.is_dead, &data.death_saves);

        Ok(CharacterHpData {
            current_hp,
            max_hp,
            temporary_hp,
            hp_percentage,
            state,
            is_dead: data.is_dead,
            death_saves: data.death_saves.clone(),
        })
    }

    /// Calculate max HP based on D&D Beyond rules
    fn calculate_max_hp(&self, data: &DndBeyondCharacterResponse) -> i64 {
        if let Some(override_hp) = data.override_hit_points {
            return override_hp;
        }

        let con_score = self.calculate_constitution_score(data);
        let con_modifier = if con_score >= 10 {
            (con_score - 10) / 2
        } else {
            -((10 - con_score + 1) / 2)
        };
        let total_level = data.get_total_level();
        let hp_bonus = self.get_hp_bonus_modifiers(data);
        let bonus_hp = data.bonus_hit_points.unwrap_or(0);

        let max_hp = data.base_hit_points + con_modifier * total_level + hp_bonus + bonus_hp;

        println!(
            "[DND] HP Calculation: base={} + (CON mod {} x level {}) + bonuses={} + manual={} = {}",
            data.base_hit_points, con_modifier, total_level, hp_bonus, bonus_hp, max_hp
        );

        max_hp.max(0)
    }

    /// Calculate constitution score
    fn calculate_constitution_score(&self, data: &DndBeyondCharacterResponse) -> i64 {
        let mut con_score = data.stats.get(2).and_then(|s| s.value).unwrap_or(10);

        if let Some(bonus) = data.bonus_stats.get(2).and_then(|s| s.value) {
            con_score += bonus;
        }

        if let Some(override_val) = data.override_stats.get(2).and_then(|s| s.value) {
            con_score = override_val;
        }

        con_score += self.get_constitution_modifiers(data);
        con_score
    }

    /// Get active item definition IDs
    /// Items that can attune are only active when attuned, others when equipped
    fn get_active_item_ids(&self, data: &DndBeyondCharacterResponse) -> HashSet<i64> {
        let mut active_ids = HashSet::new();
        if let Some(ref inventory) = data.inventory {
            for item in inventory {
                if item.definition.is_consumable {
                    continue;
                }
                if item.definition.can_attune {
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

    /// Sum constitution-score modifiers
    fn get_constitution_modifiers(&self, data: &DndBeyondCharacterResponse) -> i64 {
        let active_item_ids = self.get_active_item_ids(data);
        let mut total = 0i64;

        let item_modifiers: Vec<&Modifier> = data
            .modifiers
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
            .collect();

        let all_modifiers: Vec<&Modifier> = data
            .modifiers
            .race
            .iter()
            .chain(data.modifiers.class.iter())
            .chain(data.modifiers.background.iter())
            .chain(item_modifiers.into_iter())
            .chain(data.modifiers.feat.iter())
            .chain(data.modifiers.condition.iter())
            .collect();

        for modifier in all_modifiers {
            if modifier.r#type == "bonus" && modifier.sub_type == "constitution-score" {
                let val = modifier.fixed_value.or(modifier.value);
                if let Some(v) = val {
                    total += v;
                }
            }
        }

        total
    }

    /// Sum HP bonus modifiers
    fn get_hp_bonus_modifiers(&self, data: &DndBeyondCharacterResponse) -> i64 {
        let active_item_ids = self.get_active_item_ids(data);
        let mut total = 0i64;

        let item_modifiers: Vec<&Modifier> = data
            .modifiers
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
            .collect();

        let all_modifiers: Vec<&Modifier> = data
            .modifiers
            .race
            .iter()
            .chain(data.modifiers.class.iter())
            .chain(data.modifiers.background.iter())
            .chain(item_modifiers.into_iter())
            .chain(data.modifiers.feat.iter())
            .chain(data.modifiers.condition.iter())
            .collect();

        for modifier in all_modifiers {
            if modifier.r#type == "bonus"
                && modifier.sub_type == "hit-points"
                && modifier.dice.is_none()
            {
                let val = modifier.fixed_value.or(modifier.value);
                if let Some(v) = val {
                    total += v;
                }
            }
        }

        total
    }
}
