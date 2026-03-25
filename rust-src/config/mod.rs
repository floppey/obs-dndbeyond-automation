pub mod loader;
pub mod types;

use anyhow::{bail, Result};
use std::collections::HashMap;
use std::path::PathBuf;

use crate::game_log::types::GameLogConfig;
use crate::rules::types::RuleEngineConfig;
use crate::stats::types::StatMapping;
use crate::types::*;

use self::loader::{config_exists, load_json_config, save_json_config};
use self::types::JsonConfig;

/// Result of loading configuration
pub struct ConfigLoadResult {
    pub config: Config,
    pub needs_setup: bool,
}

/// Default configuration template
fn default_config() -> JsonConfig {
    serde_json::from_str(
        r#"{
  "dndBeyond": {
    "characterId": "YOUR_CHARACTER_ID",
    "cobaltSession": "YOUR_COBALT_SESSION_TOKEN"
  },
  "obs": {
    "websocketUrl": "ws://localhost:4455",
    "websocketPassword": "",
    "mode": "image_swap",
    "sourceName": "Character_Portrait",
    "images": {
      "healthy": "C:/path/to/healthy.png",
      "scratched": "C:/path/to/scratched.png",
      "bloodied": "C:/path/to/bloodied.png",
      "dying": "C:/path/to/dying.png",
      "unconscious": "C:/path/to/unconscious.png"
    }
  },
  "polling": {
    "intervalMs": 5000
  },
  "gameLog": {
    "enabled": false
  },
  "debug": {
    "saveApiResponse": false
  }
}"#,
    )
    .expect("Default config should be valid JSON")
}

/// Check if config has placeholder values
fn has_placeholder_values(config: &JsonConfig) -> bool {
    config.dnd_beyond.character_id == "YOUR_CHARACTER_ID"
        || config.dnd_beyond.cobalt_session == "YOUR_COBALT_SESSION_TOKEN"
}

/// Load or create configuration
pub async fn load_or_create_config() -> Result<ConfigLoadResult> {
    let config_path = PathBuf::from("config.json");
    let mut needs_setup = false;

    let json_config = if config_exists(&config_path) {
        println!("[CONFIG] Loading configuration from config.json...");
        let loaded = load_json_config(&config_path).await?;
        match loaded {
            Some(cfg) => {
                if has_placeholder_values(&cfg) {
                    needs_setup = true;
                    println!(
                        "[CONFIG] Configuration contains placeholder values - setup required."
                    );
                }
                cfg
            }
            None => bail!("Failed to load config.json"),
        }
    } else {
        println!("[CONFIG] No configuration found. Creating default config.json...");
        let cfg = default_config();
        save_json_config(&cfg, &config_path).await?;
        needs_setup = true;
        println!("[CONFIG] Default config.json created. Please configure via the web UI.");
        cfg
    };

    let config = convert_json_config_to_config(&json_config)?;
    Ok(ConfigLoadResult {
        config,
        needs_setup,
    })
}

/// Convert JsonConfig to internal Config type
fn convert_json_config_to_config(json_config: &JsonConfig) -> Result<Config> {
    // Parse stat mappings
    let stat_mappings: Vec<StatMapping> = json_config
        .stat_mappings
        .as_ref()
        .map(|mappings| {
            mappings
                .iter()
                .map(|m| StatMapping {
                    stat_id: m.stat_id.clone(),
                    obs_source_name: m.obs_source_name.clone(),
                    format: m.format.clone(),
                })
                .collect()
        })
        .unwrap_or_default();

    // Parse game log configuration
    let game_log = json_config
        .game_log
        .as_ref()
        .and_then(|gl| {
            if !gl.enabled {
                return None;
            }
            Some(GameLogConfig {
                enabled: true,
                game_id: gl.game_id.clone().unwrap_or_default(),
                user_id: gl.user_id.clone().unwrap_or_default(),
                cobalt_session: json_config.dnd_beyond.cobalt_session.clone(),
                poll_interval_ms: gl.poll_interval_ms.unwrap_or(3000),
                last_roll: gl.last_roll.as_ref().map(|lr| crate::game_log::types::LastRollConfig {
                    source_name: lr.source_name.clone(),
                    format: lr.format.clone().unwrap_or_else(|| "{action}: {total}".to_string()),
                }),
                roll_history: gl.roll_history.as_ref().map(|rh| {
                    crate::game_log::types::RollHistoryConfig {
                        source_name: rh.source_name.clone(),
                        format: rh
                            .format
                            .clone()
                            .unwrap_or_else(|| "{action} {total}".to_string()),
                        count: rh.count.unwrap_or(5),
                    }
                }),
            })
        });

    // Build OBS client config
    let obs = build_obs_client_config(json_config)?;

    // Parse rules
    let rules: Option<RuleEngineConfig> = json_config
        .rules
        .as_ref()
        .and_then(|v| serde_json::from_value(v.clone()).ok());

    Ok(Config {
        dnd: DndConfig {
            character_id: json_config.dnd_beyond.character_id.clone(),
            cobalt_session: json_config.dnd_beyond.cobalt_session.clone(),
        },
        obs,
        poll_interval_ms: json_config.polling.interval_ms,
        stat_mappings,
        game_log,
        rules,
        debug: DebugConfig {
            save_api_response: json_config
                .debug
                .as_ref()
                .and_then(|d| d.save_api_response)
                .unwrap_or(false),
        },
    })
}

/// Build OBS client configuration
fn build_obs_client_config(json_config: &JsonConfig) -> Result<OBSClientConfig> {
    let obs_json = &json_config.obs;

    match obs_json.mode.as_str() {
        "visibility_toggle" => {
            let scene_name = obs_json
                .scene_name
                .clone()
                .ok_or_else(|| anyhow::anyhow!("visibility_toggle mode requires sceneName"))?;
            Ok(OBSClientConfig {
                websocket_url: obs_json.websocket_url.clone(),
                websocket_password: obs_json.websocket_password.clone(),
                mode: OBSMode::VisibilityToggle,
                scene_name: Some(scene_name),
                source_name: None,
                image_paths_by_state: None,
            })
        }
        "image_swap" => {
            let source_name = obs_json
                .source_name
                .clone()
                .ok_or_else(|| anyhow::anyhow!("image_swap mode requires sourceName"))?;
            let images = obs_json
                .images
                .as_ref()
                .ok_or_else(|| anyhow::anyhow!("image_swap mode requires images"))?;

            let mut image_paths = HashMap::new();
            image_paths.insert(HpState::Healthy, images.healthy.clone());
            image_paths.insert(HpState::Scratched, images.scratched.clone());
            image_paths.insert(HpState::Bloodied, images.bloodied.clone());
            image_paths.insert(HpState::Dying, images.dying.clone());
            image_paths.insert(HpState::Unconscious, images.unconscious.clone());

            Ok(OBSClientConfig {
                websocket_url: obs_json.websocket_url.clone(),
                websocket_password: obs_json.websocket_password.clone(),
                mode: OBSMode::ImageSwap,
                scene_name: None,
                source_name: Some(source_name),
                image_paths_by_state: Some(image_paths),
            })
        }
        other => bail!("Unknown OBS mode: {}", other),
    }
}

/// Log configuration summary (redacting sensitive values)
pub fn log_config(config: &Config) {
    println!("[CONFIG] Configuration loaded:");
    println!(
        "[CONFIG]   Character ID: {}",
        config.dnd.character_id
    );
    println!(
        "[CONFIG]   Cobalt Session: {}...{}",
        &config.dnd.cobalt_session[..4.min(config.dnd.cobalt_session.len())],
        if config.dnd.cobalt_session.len() > 8 {
            &config.dnd.cobalt_session[config.dnd.cobalt_session.len() - 4..]
        } else {
            ""
        }
    );
    println!(
        "[CONFIG]   OBS URL: {}",
        config.obs.websocket_url
    );
    println!("[CONFIG]   OBS Mode: {:?}", config.obs.mode);
    println!(
        "[CONFIG]   Poll Interval: {}ms",
        config.poll_interval_ms
    );
    println!(
        "[CONFIG]   Stat Mappings: {}",
        config.stat_mappings.len()
    );
    println!(
        "[CONFIG]   Game Log: {}",
        if config.game_log.is_some() {
            "enabled"
        } else {
            "disabled"
        }
    );
    println!(
        "[CONFIG]   Rules: {}",
        config
            .rules
            .as_ref()
            .map(|r| format!("{} rule lists", r.rule_lists.len()))
            .unwrap_or_else(|| "none".to_string())
    );
}
