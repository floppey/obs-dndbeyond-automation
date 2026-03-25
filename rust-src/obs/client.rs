use anyhow::{bail, Result};
use obws::Client as ObwsClient;
use obws::requests::inputs::InputId;
use obws::requests::scene_items;
use obws::requests::scenes::SceneId;
use obws::requests::sources::SourceId;
use std::sync::Arc;
use tokio::sync::Mutex;

use crate::types::OBSClientConfig;

/// Client for controlling OBS via WebSocket
pub struct OBSClient {
    config: OBSClientConfig,
    client: Arc<Mutex<Option<ObwsClient>>>,
    connected: Arc<Mutex<bool>>,
}

impl OBSClient {
    pub fn new(config: OBSClientConfig) -> Self {
        Self {
            config,
            client: Arc::new(Mutex::new(None)),
            connected: Arc::new(Mutex::new(false)),
        }
    }

    /// Connect to OBS WebSocket server
    pub async fn connect(&self) -> Result<()> {
        if *self.connected.lock().await {
            return Ok(());
        }

        println!(
            "[OBS] Connecting to OBS WebSocket at {}...",
            self.config.websocket_url
        );

        // Parse host and port from websocket URL
        let url = &self.config.websocket_url;
        let url_without_scheme = url
            .strip_prefix("ws://")
            .or_else(|| url.strip_prefix("wss://"))
            .unwrap_or(url);

        let parts: Vec<&str> = url_without_scheme.split(':').collect();
        let host = parts.first().copied().unwrap_or("localhost");
        let port: u16 = parts
            .get(1)
            .and_then(|p| p.parse().ok())
            .unwrap_or(4455);

        let client = if let Some(ref password) = self.config.websocket_password {
            if password.is_empty() {
                ObwsClient::connect(host, port, None::<String>).await
            } else {
                ObwsClient::connect(host, port, Some(password)).await
            }
        } else {
            ObwsClient::connect(host, port, None::<String>).await
        };

        match client {
            Ok(c) => {
                *self.client.lock().await = Some(c);
                *self.connected.lock().await = true;
                println!("[OBS] Connected to OBS WebSocket");
                Ok(())
            }
            Err(e) => {
                bail!("Failed to connect to OBS WebSocket: {}", e);
            }
        }
    }

    /// Disconnect from OBS WebSocket server
    pub async fn disconnect(&self) -> Result<()> {
        if !*self.connected.lock().await {
            return Ok(());
        }

        *self.client.lock().await = None;
        *self.connected.lock().await = false;
        println!("[OBS] Disconnected from OBS WebSocket");
        Ok(())
    }

    /// Check if connected
    pub async fn is_connected(&self) -> bool {
        *self.connected.lock().await
    }

    /// Set image source file path (for image_swap mode)
    pub async fn set_image_path(&self, source_name: &str, image_path: &str) -> Result<()> {
        let guard = self.client.lock().await;
        let client = guard
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Not connected to OBS WebSocket"))?;

        let settings = serde_json::json!({
            "file": image_path,
        });

        client
            .inputs()
            .set_settings(obws::requests::inputs::SetSettings {
                input: InputId::Name(source_name),
                settings: &settings,
                overlay: Some(true),
            })
            .await
            .map_err(|e| anyhow::anyhow!("Failed to update OBS image source: {}", e))?;

        println!(
            "[OBS] Updated source \"{}\" with image: {}",
            source_name, image_path
        );
        Ok(())
    }

    /// Set scene item visibility (for visibility_toggle mode)
    pub async fn set_source_visibility(
        &self,
        scene_name: &str,
        item_name: &str,
        visible: bool,
    ) -> Result<()> {
        let guard = self.client.lock().await;
        let client = guard
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Not connected to OBS WebSocket"))?;

        // Get scene item ID
        let item_id = match client
            .scene_items()
            .id(scene_items::Id {
                scene: SceneId::Name(scene_name),
                source: item_name,
                search_offset: None,
            })
            .await
        {
            Ok(id) => id,
            Err(e) => {
                eprintln!(
                    "[OBS] Warning: Failed to get scene item ID for \"{}\": {}",
                    item_name, e
                );
                return Ok(());
            }
        };

        // Set visibility
        if let Err(e) = client
            .scene_items()
            .set_enabled(scene_items::SetEnabled {
                scene: SceneId::Name(scene_name),
                item_id,
                enabled: visible,
            })
            .await
        {
            eprintln!(
                "[OBS] Warning: Failed to set visibility for \"{}\": {}",
                item_name, e
            );
            return Ok(());
        }

        let state = if visible { "shown" } else { "hidden" };
        println!(
            "[OBS] Scene item \"{}\" in scene \"{}\" is now {}",
            item_name, scene_name, state
        );
        Ok(())
    }

    /// Set text source content
    pub async fn set_text(&self, source_name: &str, text: &str) -> Result<()> {
        let guard = self.client.lock().await;
        let client = guard
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Not connected to OBS WebSocket"))?;

        let settings = serde_json::json!({
            "text": text,
        });

        if let Err(e) = client
            .inputs()
            .set_settings(obws::requests::inputs::SetSettings {
                input: InputId::Name(source_name),
                settings: &settings,
                overlay: Some(true),
            })
            .await
        {
            eprintln!(
                "[OBS] Warning: Failed to set text for \"{}\": {}",
                source_name, e
            );
            return Ok(());
        }

        println!("[OBS] Updated text \"{}\": {}", source_name, text);
        Ok(())
    }

    /// Set source filter enabled/disabled
    pub async fn set_filter_enabled(
        &self,
        source_name: &str,
        filter_name: &str,
        enabled: bool,
    ) -> Result<()> {
        let guard = self.client.lock().await;
        let client = guard
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Not connected to OBS WebSocket"))?;

        client
            .filters()
            .set_enabled(obws::requests::filters::SetEnabled {
                source: SourceId::Name(source_name),
                filter: filter_name,
                enabled,
            })
            .await
            .map_err(|e| anyhow::anyhow!("Failed to set filter enabled: {}", e))?;

        let state = if enabled { "enabled" } else { "disabled" };
        println!(
            "[OBS] Filter \"{}\" on source \"{}\" is now {}",
            filter_name, source_name, state
        );
        Ok(())
    }

    /// Set arbitrary input settings
    pub async fn set_input_settings(
        &self,
        input_name: &str,
        settings: &serde_json::Value,
    ) -> Result<()> {
        let guard = self.client.lock().await;
        let client = guard
            .as_ref()
            .ok_or_else(|| anyhow::anyhow!("Not connected to OBS WebSocket"))?;

        client
            .inputs()
            .set_settings(obws::requests::inputs::SetSettings {
                input: InputId::Name(input_name),
                settings,
                overlay: Some(true),
            })
            .await
            .map_err(|e| anyhow::anyhow!("Failed to set input settings: {}", e))?;

        println!("[OBS] Updated input settings for \"{}\"", input_name);
        Ok(())
    }
}
