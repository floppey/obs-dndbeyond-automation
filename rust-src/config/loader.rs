use anyhow::{bail, Context, Result};
use std::path::Path;

use super::types::JsonConfig;

/// Load config.json from the given path
pub async fn load_json_config(config_path: &Path) -> Result<Option<JsonConfig>> {
    if !config_path.exists() {
        return Ok(None);
    }

    let content =
        tokio::fs::read_to_string(config_path)
            .await
            .context("Failed to read config.json")?;

    let config: JsonConfig =
        serde_json::from_str(&content).context("Invalid JSON in config.json")?;

    validate_json_config(&config)?;
    Ok(Some(config))
}

/// Validate JSON configuration structure
fn validate_json_config(config: &JsonConfig) -> Result<()> {
    // Validate dndBeyond section
    if config.dnd_beyond.character_id.is_empty() {
        bail!("dndBeyond.characterId is required and must be a string");
    }
    if config.dnd_beyond.cobalt_session.is_empty() {
        bail!("dndBeyond.cobaltSession is required and must be a string");
    }

    // Validate obs section
    if config.obs.websocket_url.is_empty() {
        bail!("obs.websocketUrl is required and must be a string");
    }
    if config.obs.mode != "image_swap" && config.obs.mode != "visibility_toggle" {
        bail!("obs.mode must be either \"image_swap\" or \"visibility_toggle\"");
    }

    // Validate mode-specific requirements
    if config.obs.mode == "visibility_toggle" {
        if config.obs.scene_name.as_ref().map_or(true, |s| s.is_empty()) {
            bail!("obs.sceneName is required for visibility_toggle mode");
        }
    } else if config.obs.mode == "image_swap" {
        if config.obs.source_name.as_ref().map_or(true, |s| s.is_empty()) {
            bail!("obs.sourceName is required for image_swap mode");
        }
        if config.obs.images.is_none() {
            bail!("obs.images is required for image_swap mode");
        }
    }

    // Validate polling section
    if config.polling.interval_ms < 1000 {
        bail!("polling.intervalMs must be >= 1000");
    }

    // Validate gameLog section if present and enabled
    if let Some(ref game_log) = config.game_log {
        if game_log.enabled {
            if game_log.game_id.as_ref().map_or(true, |s| s.is_empty()) {
                bail!("gameLog.gameId is required when gameLog.enabled is true");
            }
            if game_log.user_id.as_ref().map_or(true, |s| s.is_empty()) {
                bail!("gameLog.userId is required when gameLog.enabled is true");
            }
        }
    }

    Ok(())
}

/// Save configuration to config.json
pub async fn save_json_config(config: &JsonConfig, config_path: &Path) -> Result<()> {
    let json_string =
        serde_json::to_string_pretty(config).context("Failed to serialize config")?;
    tokio::fs::write(config_path, json_string)
        .await
        .context("Failed to write config.json")?;
    Ok(())
}

/// Check if config.json exists
pub fn config_exists(config_path: &Path) -> bool {
    config_path.exists()
}
