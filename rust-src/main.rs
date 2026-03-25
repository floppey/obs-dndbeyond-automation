mod config;
mod dnd_beyond;
mod game_log;
mod obs;
mod rules;
mod stats;
mod types;
mod web;

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::Mutex;

use config::log_config;
use dnd_beyond::client::DndBeyondClient;
use dnd_beyond::hp_calculator::format_hp_info;
use game_log::client::GameLogClient;
use game_log::formatter::{format_roll, format_roll_history};
use game_log::types::ParsedRoll;
use obs::client::OBSClient;
use rules::engine::RuleEngine;
use rules::executor::ActionExecutor;
use rules::types::EvaluationContext;
use stats::calculator::StatCalculator;
use types::*;
use web::server::WebServer;

/// Main application
struct OBSDndBeyondAutomation {
    dnd_client: DndBeyondClient,
    obs_client: Arc<OBSClient>,
    game_log_client: Option<Mutex<GameLogClient>>,
    stat_calculator: StatCalculator,
    rule_engine: RuleEngine,
    web_server: WebServer,
    config: Arc<Mutex<Config>>,
    previous_state: Mutex<Option<HpState>>,
    previous_stat_values: Mutex<HashMap<String, String>>,
    previous_rule_actions: Mutex<String>,
    seen_roll_ids: Mutex<HashSet<String>>,
    roll_history: Mutex<Vec<ParsedRoll>>,
    poll_count: Mutex<u64>,
    game_log_poll_count: Mutex<u64>,
}

impl OBSDndBeyondAutomation {
    fn new(config: Config) -> Self {
        log_config(&config);

        let dnd_client = DndBeyondClient::new(
            config.dnd.character_id.clone(),
            config.dnd.cobalt_session.clone(),
            config.debug.save_api_response,
        );

        let obs_client = Arc::new(OBSClient::new(config.obs.clone()));

        let game_log_client = config.game_log.as_ref().and_then(|gl| {
            if gl.enabled {
                Some(Mutex::new(GameLogClient::new(
                    gl.game_id.clone(),
                    gl.user_id.clone(),
                    gl.cobalt_session.clone(),
                )))
            } else {
                None
            }
        });

        let web_server = WebServer::new(config.clone());

        Self {
            dnd_client,
            obs_client,
            game_log_client,
            stat_calculator: StatCalculator::new(),
            rule_engine: RuleEngine::new(),
            web_server,
            config: Arc::new(Mutex::new(config)),
            previous_state: Mutex::new(None),
            previous_stat_values: Mutex::new(HashMap::new()),
            previous_rule_actions: Mutex::new(String::new()),
            seen_roll_ids: Mutex::new(HashSet::new()),
            roll_history: Mutex::new(Vec::new()),
            poll_count: Mutex::new(0),
            game_log_poll_count: Mutex::new(0),
        }
    }

    async fn start(&mut self) -> anyhow::Result<()> {
        println!("[APP] Initializing OBS D&D Beyond HP Swapper...");

        // Start web UI server first
        if let Err(e) = self.web_server.start(3000).await {
            eprintln!("[APP] Failed to start web UI: {}", e);
        }

        // Connect to OBS
        self.obs_client.connect().await?;

        let config = self.config.lock().await;
        let poll_interval = config.poll_interval_ms;
        let game_log_config = config.game_log.clone();
        drop(config);

        // Start character polling loop
        println!(
            "[APP] Starting character polling loop (interval: {}ms)...",
            poll_interval
        );

        // Initial poll
        if let Err(e) = self.poll().await {
            eprintln!("[APP] Initial poll error: {}", e);
        }

        // Start game log polling if configured
        if let Some(ref gl_config) = game_log_config {
            println!(
                "[APP] Starting game log polling (interval: {}ms)...",
                gl_config.poll_interval_ms
            );
            if let Err(e) = self.poll_game_log().await {
                eprintln!("[APP] Initial game log poll error: {}", e);
            }
        }

        println!("[APP] Automation started successfully");

        // Main loop
        let mut poll_interval_timer =
            tokio::time::interval(tokio::time::Duration::from_millis(poll_interval));
        let game_log_interval = game_log_config
            .as_ref()
            .map(|gl| tokio::time::Duration::from_millis(gl.poll_interval_ms));

        let mut game_log_timer = game_log_interval.map(tokio::time::interval);

        // Take the config update receiver
        let mut config_update_rx = self.web_server.take_config_update_rx();

        loop {
            tokio::select! {
                _ = poll_interval_timer.tick() => {
                    if let Err(e) = self.poll().await {
                        eprintln!("[APP] Poll error: {}", e);
                        break;
                    }
                }
                _ = async {
                    if let Some(ref mut timer) = game_log_timer {
                        timer.tick().await
                    } else {
                        // Never resolve if no game log
                        std::future::pending::<tokio::time::Instant>().await
                    }
                } => {
                    if let Err(e) = self.poll_game_log().await {
                        eprintln!("[APP] Game log poll error: {}", e);
                    }
                }
                update = async {
                    if let Some(ref mut rx) = config_update_rx {
                        rx.recv().await
                    } else {
                        std::future::pending::<Option<rules::types::RuleEngineConfig>>().await
                    }
                } => {
                    if let Some(rules_config) = update {
                        let mut config = self.config.lock().await;
                        config.rules = Some(rules_config);
                        println!("[APP] Rules configuration updated via web UI");
                    }
                }
                _ = tokio::signal::ctrl_c() => {
                    println!("\n[APP] Received shutdown signal...");
                    break;
                }
            }
        }

        self.cleanup().await;
        Ok(())
    }

    /// Execute one polling cycle
    async fn poll(&self) -> anyhow::Result<()> {
        let mut count = self.poll_count.lock().await;
        *count += 1;
        let poll_num = *count;
        drop(count);

        // Fetch character data
        let character_data = match self.dnd_client.fetch_character().await {
            Ok(data) => data,
            Err(e) => {
                eprintln!("[POLL #{}] Error fetching character: {}", poll_num, e);
                return Err(e);
            }
        };

        let hp_info = format_hp_info(
            character_data.current_hp,
            character_data.max_hp,
            character_data.temporary_hp,
            character_data.state,
        );

        // Fetch raw character data
        let raw_character_data = match self.dnd_client.fetch_raw_character().await {
            Ok(data) => Some(data),
            Err(e) => {
                eprintln!(
                    "[POLL #{}] Failed to fetch raw character data: {}",
                    poll_num, e
                );
                None
            }
        };

        // Build evaluation context and process rules
        if let Some(ref raw_data) = raw_character_data {
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis() as u64;

            let context = EvaluationContext {
                character: raw_data.clone(),
                current_hp: character_data.current_hp,
                max_hp: character_data.max_hp,
                temporary_hp: character_data.temporary_hp,
                hp_percentage: character_data.hp_percentage,
                is_dead: character_data.is_dead,
                death_saves: character_data.death_saves.clone(),
                timestamp: now,
            };

            // Update web server with context
            self.web_server.update_context(context.clone()).await;

            // Evaluate rules
            let config = self.config.lock().await;
            if let Some(ref rules_config) = config.rules {
                if !rules_config.rule_lists.is_empty() {
                    let actions = self.rule_engine.evaluate(rules_config, &context);
                    let actions_hash = serde_json::to_string(&actions).unwrap_or_default();

                    let mut prev = self.previous_rule_actions.lock().await;
                    if actions_hash != *prev && !actions.is_empty() {
                        println!(
                            "[POLL #{}] Rules triggered {} action(s)",
                            poll_num,
                            actions.len()
                        );
                        let executor = ActionExecutor::new(&self.obs_client, &context);
                        if let Err(e) = executor.execute_actions(&actions).await {
                            eprintln!("[POLL #{}] Rules execution failed: {}", poll_num, e);
                        }
                        *prev = actions_hash;
                    }
                }
            }
            drop(config);
        }

        // Check if HP state changed
        let mut prev_state = self.previous_state.lock().await;
        let hp_state_changed = Some(character_data.state) != *prev_state;

        // Calculate stats
        let config = self.config.lock().await;
        let stat_mappings = config.stat_mappings.clone();
        drop(config);

        let mut stats_calculated = Vec::new();
        if !stat_mappings.is_empty() {
            if let Some(ref raw_data) = raw_character_data {
                let prev_values = self.previous_stat_values.lock().await;
                stats_calculated =
                    self.stat_calculator
                        .calculate_mappings(&stat_mappings, raw_data, &prev_values);
            }
        }

        let any_stats_changed = stats_calculated.iter().any(|s| s.changed);

        if !hp_state_changed && !any_stats_changed {
            println!("[POLL #{}] {} [no changes]", poll_num, hp_info);
            return Ok(());
        }

        println!("[POLL #{}] {}", poll_num, hp_info);
        if any_stats_changed {
            for stat in stats_calculated.iter().filter(|s| s.changed) {
                println!(
                    "[POLL #{}]   {}: {}",
                    poll_num, stat.obs_source_name, stat.value
                );
            }
        }

        // Update OBS for HP state
        if hp_state_changed {
            *prev_state = Some(character_data.state);
            if let Err(e) = self.update_obs(character_data.state).await {
                eprintln!("[APP] Failed to update OBS HP state: {}", e);
            }
        }

        // Update OBS for changed stats
        if any_stats_changed {
            let mut prev_values = self.previous_stat_values.lock().await;
            for stat in stats_calculated.iter().filter(|s| s.changed) {
                if let Err(e) = self
                    .obs_client
                    .set_text(&stat.obs_source_name, &stat.value)
                    .await
                {
                    eprintln!(
                        "[APP] Failed to update stat {}: {}",
                        stat.obs_source_name, e
                    );
                } else {
                    prev_values.insert(stat.obs_source_name.clone(), stat.value.clone());
                }
            }
        }

        Ok(())
    }

    /// Poll game log for new dice rolls
    async fn poll_game_log(&self) -> anyhow::Result<()> {
        let game_log_client = match &self.game_log_client {
            Some(c) => c,
            None => return Ok(()),
        };

        let mut count = self.game_log_poll_count.lock().await;
        *count += 1;
        let poll_num = *count;
        drop(count);

        let config = self.config.lock().await;
        let game_log_config = match &config.game_log {
            Some(c) => c.clone(),
            None => return Ok(()),
        };
        drop(config);

        let mut client = game_log_client.lock().await;
        let messages = match client.fetch_game_log().await {
            Ok(m) => m,
            Err(e) => {
                eprintln!("[GAME_LOG #{}] Error fetching game log: {}", poll_num, e);
                return Ok(());
            }
        };

        if messages.is_empty() {
            println!("[GAME_LOG #{}] No new rolls", poll_num);
            return Ok(());
        }

        let parsed_rolls = GameLogClient::parse_rolls(&messages);

        let mut seen = self.seen_roll_ids.lock().await;
        let new_rolls: Vec<ParsedRoll> = parsed_rolls
            .into_iter()
            .filter(|r| !seen.contains(&r.id))
            .collect();

        if new_rolls.is_empty() {
            println!("[GAME_LOG #{}] No new rolls", poll_num);
            return Ok(());
        }

        for roll in &new_rolls {
            seen.insert(roll.id.clone());
        }

        // Prevent memory leak
        if seen.len() > 100 {
            let ids: Vec<String> = seen.iter().cloned().collect();
            *seen = ids.into_iter().rev().take(100).collect();
        }
        drop(seen);

        // Add to history
        let mut history = self.roll_history.lock().await;
        history.extend(new_rolls);
        history.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
        history.truncate(50);

        let newest_roll = history.first().cloned();
        drop(history);

        if let Some(ref roll) = newest_roll {
            println!(
                "[GAME_LOG #{}] New roll: {} {} = {}",
                poll_num, roll.character, roll.action, roll.total
            );

            if let Some(ref lr_config) = game_log_config.last_roll {
                let formatted = format_roll(roll, &lr_config.format);
                if let Err(e) = self
                    .obs_client
                    .set_text(&lr_config.source_name, &formatted)
                    .await
                {
                    eprintln!("[APP] Failed to update last roll source: {}", e);
                }
            }

            if let Some(ref rh_config) = game_log_config.roll_history {
                let history = self.roll_history.lock().await;
                let formatted = format_roll_history(&history, &rh_config.format, rh_config.count);
                drop(history);
                if let Err(e) = self
                    .obs_client
                    .set_text(&rh_config.source_name, &formatted)
                    .await
                {
                    eprintln!("[APP] Failed to update roll history source: {}", e);
                }
            }
        }

        Ok(())
    }

    /// Update OBS based on configuration mode
    async fn update_obs(&self, state: HpState) -> anyhow::Result<()> {
        if !self.obs_client.is_connected().await {
            eprintln!("[OBS] Not connected to OBS, attempting reconnect...");
            self.obs_client.connect().await?;
        }

        let config = self.config.lock().await;
        match config.obs.mode {
            OBSMode::ImageSwap => {
                if let (Some(ref source_name), Some(ref images)) = (
                    &config.obs.source_name,
                    &config.obs.image_paths_by_state,
                ) {
                    if let Some(image_path) = images.get(&state) {
                        self.obs_client
                            .set_image_path(source_name, image_path)
                            .await?;
                    }
                }
            }
            OBSMode::VisibilityToggle => {
                if let Some(ref scene_name) = config.obs.scene_name {
                    for hp_state in HpState::all() {
                        let is_active = *hp_state == state;
                        self.obs_client
                            .set_source_visibility(scene_name, &hp_state.to_string(), is_active)
                            .await?;
                    }
                }
            }
        }

        Ok(())
    }

    async fn cleanup(&mut self) {
        self.web_server.stop().await;
        if let Err(e) = self.obs_client.disconnect().await {
            eprintln!("[APP] Error during OBS disconnect: {}", e);
        }
    }
}

#[tokio::main]
async fn main() {
    println!("[APP] Loading configuration...");

    let result = match config::load_or_create_config().await {
        Ok(r) => r,
        Err(e) => {
            eprintln!("\n[FATAL ERROR] {}", e);
            wait_for_keypress().await;
            std::process::exit(1);
        }
    };

    if result.needs_setup {
        println!();
        println!("========================================================");
        println!("                    FIRST-TIME SETUP                     ");
        println!("                                                         ");
        println!("  A default config.json has been created.                ");
        println!("  Open the web UI to configure your settings:            ");
        println!("                                                         ");
        println!("    -> http://localhost:3000                              ");
        println!("                                                         ");
        println!("  After saving your settings, restart the application.   ");
        println!("========================================================");
        println!();

        let mut web_server = WebServer::new(result.config);
        match web_server.start(3000).await {
            Ok(_) => {
                println!("[APP] Web UI is running. Configure your settings at http://localhost:3000");
                println!("[APP] Press Ctrl+C to exit.");

                // Wait for Ctrl+C
                tokio::signal::ctrl_c().await.ok();
                web_server.stop().await;
            }
            Err(e) => {
                eprintln!("[APP] Failed to start web UI: {}", e);
                wait_for_keypress().await;
                std::process::exit(1);
            }
        }
        return;
    }

    let mut app = OBSDndBeyondAutomation::new(result.config);
    if let Err(e) = app.start().await {
        eprintln!("\n[FATAL ERROR] Application crashed: {}", e);
        wait_for_keypress().await;
        std::process::exit(1);
    }

    println!("[APP] Shutdown complete");
}

/// Wait for user to press Enter (for error display in exe mode)
async fn wait_for_keypress() {
    use std::io::Read;
    println!("\nPress Enter to exit...");
    let _ = std::io::stdin().read(&mut [0u8]);
}
