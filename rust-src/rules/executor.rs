use anyhow::Result;
use regex::Regex;

use crate::obs::client::OBSClient;

use super::types::{EvaluationContext, RuleAction};

/// Executes rule actions against OBS
pub struct ActionExecutor<'a> {
    obs_client: &'a OBSClient,
    context: &'a EvaluationContext,
}

impl<'a> ActionExecutor<'a> {
    pub fn new(obs_client: &'a OBSClient, context: &'a EvaluationContext) -> Self {
        Self {
            obs_client,
            context,
        }
    }

    /// Execute a list of actions. Continues even if individual actions fail.
    pub async fn execute_actions(&self, actions: &[RuleAction]) -> Result<()> {
        if actions.is_empty() {
            return Ok(());
        }

        println!("[ACTIONS] Executing {} action(s)", actions.len());

        for action in actions {
            if let Err(e) = self.execute_action(action).await {
                eprintln!("[ACTIONS] Error executing action: {}", e);
            }
        }

        Ok(())
    }

    async fn execute_action(&self, action: &RuleAction) -> Result<()> {
        match action {
            RuleAction::SetImage {
                source_name,
                image_path,
            } => {
                let path = self.interpolate_variables(image_path);
                self.obs_client.set_image_path(source_name, &path).await
            }
            RuleAction::SetVisibility {
                scene_name,
                item_name,
                visible,
            } => {
                self.obs_client
                    .set_source_visibility(scene_name, item_name, *visible)
                    .await
            }
            RuleAction::SetText { source_name, text } => {
                let interpolated = self.interpolate_variables(text);
                self.obs_client.set_text(source_name, &interpolated).await
            }
            RuleAction::SetFilterVisibility {
                source_name,
                filter_name,
                visible,
            } => {
                self.obs_client
                    .set_filter_enabled(source_name, filter_name, *visible)
                    .await
            }
            RuleAction::SetInputSettings {
                input_name,
                settings,
            } => {
                self.obs_client
                    .set_input_settings(input_name, settings)
                    .await
            }
        }
    }

    /// Replace {variable} placeholders with values from the evaluation context
    fn interpolate_variables(&self, text: &str) -> String {
        let re = Regex::new(r"\{([^}]+)\}").unwrap();
        re.replace_all(text, |caps: &regex::Captures| {
            let var_name = caps[1].to_lowercase();
            match var_name.as_str() {
                "hp_current" | "current_hp" => self.context.current_hp.to_string(),
                "hp_max" | "max_hp" => self.context.max_hp.to_string(),
                "hp_temp" | "temp_hp" => self.context.temporary_hp.to_string(),
                "hp_percentage" | "hp_percent" => {
                    format!("{}", self.context.hp_percentage.round() as i64)
                }
                "hp_missing" => {
                    (self.context.max_hp - self.context.current_hp).to_string()
                }
                _ => {
                    eprintln!("[ACTIONS] Unknown variable: {}", &caps[1]);
                    caps[0].to_string()
                }
            }
        })
        .to_string()
    }
}
