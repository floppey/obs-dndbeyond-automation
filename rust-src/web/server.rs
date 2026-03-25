use axum::{
    extract::State,
    http::StatusCode,
    response::{
        sse::{Event, Sse},
        Json,
    },
    routing::get,
    Router,
};
use std::convert::Infallible;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{broadcast, Mutex, RwLock};
use tokio_stream::wrappers::BroadcastStream;
use tokio_stream::StreamExt;
use tower_http::services::ServeDir;

use crate::rules::types::{EvaluationContext, RuleEngineConfig};
use crate::types::Config;

/// Shared application state for the web server
#[allow(dead_code)]
pub struct AppState {
    pub config: RwLock<Config>,
    pub current_context: RwLock<Option<EvaluationContext>>,
    pub sse_tx: broadcast::Sender<String>,
    pub config_path: PathBuf,
    pub config_update_tx: Mutex<Option<tokio::sync::mpsc::Sender<RuleEngineConfig>>>,
}

/// Web server for rules configuration UI
pub struct WebServer {
    state: Arc<AppState>,
    shutdown_tx: Option<tokio::sync::oneshot::Sender<()>>,
    config_update_rx: Option<tokio::sync::mpsc::Receiver<RuleEngineConfig>>,
}

impl WebServer {
    pub fn new(config: Config) -> Self {
        let (sse_tx, _) = broadcast::channel::<String>(100);
        let (config_update_tx, config_update_rx) = tokio::sync::mpsc::channel::<RuleEngineConfig>(10);

        let state = Arc::new(AppState {
            config: RwLock::new(config),
            current_context: RwLock::new(None),
            sse_tx,
            config_path: PathBuf::from("config.json"),
            config_update_tx: Mutex::new(Some(config_update_tx)),
        });

        Self {
            state,
            shutdown_tx: None,
            config_update_rx: Some(config_update_rx),
        }
    }

    /// Get the config update receiver for the main app to listen on
    pub fn take_config_update_rx(
        &mut self,
    ) -> Option<tokio::sync::mpsc::Receiver<RuleEngineConfig>> {
        self.config_update_rx.take()
    }

    /// Update the current evaluation context
    pub async fn update_context(&self, context: EvaluationContext) {
        let client_data = format_context_for_client(&context);
        *self.state.current_context.write().await = Some(context);

        let payload = serde_json::json!({
            "type": "state",
            "data": client_data,
        });

        let _ = self.state.sse_tx.send(serde_json::to_string(&payload).unwrap_or_default());
    }

    /// Update in-memory config (e.g. when rules change)
    #[allow(dead_code)]
    pub async fn update_config_rules(&self, rules: Option<RuleEngineConfig>) {
        let mut config = self.state.config.write().await;
        config.rules = rules;
    }

    /// Start the web server
    pub async fn start(&mut self, port: u16) -> anyhow::Result<()> {
        let state = self.state.clone();

        // Determine web-ui path
        let web_ui_path = find_web_ui_path();
        println!("[WEB] Serving static files from: {}", web_ui_path.display());

        let app = Router::new()
            .route("/api/health", get(health_handler))
            .route("/api/config", get(get_config_handler).put(put_config_handler))
            .route("/api/rules", get(get_rules_handler).put(put_rules_handler))
            .route("/api/state", get(get_state_handler))
            .route("/api/events", get(sse_handler))
            .fallback_service(ServeDir::new(&web_ui_path).append_index_html_on_directories(true))
            .with_state(state);

        let addr = SocketAddr::from(([127, 0, 0, 1], port));
        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        self.shutdown_tx = Some(shutdown_tx);

        let listener = match tokio::net::TcpListener::bind(addr).await {
            Ok(l) => l,
            Err(_) => {
                let addr2 = SocketAddr::from(([127, 0, 0, 1], port + 1));
                println!("[WEB] Port {} in use, trying {}...", port, port + 1);
                tokio::net::TcpListener::bind(addr2).await?
            }
        };

        let actual_addr = listener.local_addr()?;
        println!(
            "[WEB] Configuration UI available at http://localhost:{}",
            actual_addr.port()
        );

        tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = shutdown_rx.await;
                })
                .await
                .ok();
        });

        Ok(())
    }

    /// Stop the web server
    pub async fn stop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        println!("[WEB] Server stopped");
    }
}

/// Find the web-ui directory
fn find_web_ui_path() -> PathBuf {
    // Try relative to current directory
    let p = PathBuf::from("web-ui");
    if p.exists() {
        return p;
    }
    // Fallback
    PathBuf::from("web-ui")
}

/// Format evaluation context for client
fn format_context_for_client(context: &EvaluationContext) -> serde_json::Value {
    let inventory: Vec<serde_json::Value> = context
        .character
        .inventory
        .as_ref()
        .map(|inv| {
            inv.iter()
                .map(|item| {
                    serde_json::json!({
                        "name": item.definition.name,
                        "equipped": item.equipped,
                        "attuned": item.is_attuned,
                    })
                })
                .collect()
        })
        .unwrap_or_default();

    serde_json::json!({
        "hp": {
            "current": context.current_hp,
            "max": context.max_hp,
            "temp": context.temporary_hp,
            "percentage": context.hp_percentage.round() as i64,
        },
        "isDead": context.is_dead,
        "deathSaves": {
            "successes": context.death_saves.success_count,
            "failures": context.death_saves.fail_count,
        },
        "inventory": inventory,
        "level": context.character.get_total_level(),
        "timestamp": context.timestamp,
    })
}

// === Route handlers ===

async fn health_handler() -> Json<serde_json::Value> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    Json(serde_json::json!({ "status": "ok", "timestamp": now }))
}

async fn get_config_handler(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    match tokio::fs::read_to_string(&state.config_path).await {
        Ok(content) => match serde_json::from_str::<serde_json::Value>(&content) {
            Ok(json) => Ok(Json(json)),
            Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
        },
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}

async fn put_config_handler(
    State(state): State<Arc<AppState>>,
    Json(new_config): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    // Validate required fields
    if new_config.get("dndBeyond").and_then(|d| d.get("characterId")).is_none()
        || new_config
            .get("dndBeyond")
            .and_then(|d| d.get("cobaltSession"))
            .is_none()
    {
        return Json(serde_json::json!({
            "success": false,
            "error": "Missing required D&D Beyond settings"
        }));
    }

    match tokio::fs::write(
        &state.config_path,
        serde_json::to_string_pretty(&new_config).unwrap_or_default(),
    )
    .await
    {
        Ok(_) => {
            println!("[WEB] Configuration updated");
            Json(serde_json::json!({
                "success": true,
                "message": "Settings saved. Restart the application for connection changes to take effect."
            }))
        }
        Err(e) => Json(serde_json::json!({
            "success": false,
            "error": e.to_string()
        })),
    }
}

async fn get_rules_handler(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    match tokio::fs::read_to_string(&state.config_path).await {
        Ok(content) => {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                let rules = json
                    .get("rules")
                    .cloned()
                    .unwrap_or(serde_json::json!({"version": "1.0", "ruleLists": []}));
                Json(rules)
            } else {
                Json(serde_json::json!({"version": "1.0", "ruleLists": []}))
            }
        }
        Err(_) => Json(serde_json::json!({"version": "1.0", "ruleLists": []})),
    }
}

async fn put_rules_handler(
    State(state): State<Arc<AppState>>,
    Json(rules_config): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    // Validate
    if rules_config.get("version").is_none() || rules_config.get("ruleLists").is_none() {
        return Json(serde_json::json!({
            "success": false,
            "error": "Invalid rules configuration: missing version or ruleLists"
        }));
    }

    // Save to disk
    match tokio::fs::read_to_string(&state.config_path).await {
        Ok(content) => {
            if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&content) {
                json["rules"] = rules_config.clone();
                if let Err(e) = tokio::fs::write(
                    &state.config_path,
                    serde_json::to_string_pretty(&json).unwrap_or_default(),
                )
                .await
                {
                    return Json(serde_json::json!({
                        "success": false,
                        "error": e.to_string()
                    }));
                }
            }
        }
        Err(e) => {
            return Json(serde_json::json!({
                "success": false,
                "error": e.to_string()
            }));
        }
    }

    // Notify main app of rules update
    if let Ok(parsed) = serde_json::from_value::<RuleEngineConfig>(rules_config) {
        let guard = state.config_update_tx.lock().await;
        if let Some(ref tx) = *guard {
            let _ = tx.send(parsed).await;
        }
    }

    println!("[WEB] Rules configuration updated");
    Json(serde_json::json!({"success": true}))
}

async fn get_state_handler(
    State(state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    let ctx = state.current_context.read().await;
    if let Some(ref context) = *ctx {
        Json(serde_json::json!({
            "success": true,
            "data": format_context_for_client(context),
        }))
    } else {
        Json(serde_json::json!({
            "success": false,
            "error": "No character data available yet. Waiting for first poll..."
        }))
    }
}

async fn sse_handler(
    State(state): State<Arc<AppState>>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let rx = state.sse_tx.subscribe();

    // Send initial state
    let initial = {
        let ctx = state.current_context.read().await;
        let data = ctx.as_ref().map(format_context_for_client);
        serde_json::json!({"type": "state", "data": data})
    };

    let initial_event = Event::default().data(serde_json::to_string(&initial).unwrap_or_default());

    let stream = BroadcastStream::new(rx).filter_map(|msg| {
        match msg {
            Ok(data) => Some(Ok(Event::default().data(data))),
            Err(_) => None,
        }
    });

    let initial_stream = tokio_stream::once(Ok(initial_event));
    let combined = initial_stream.chain(stream);

    Sse::new(combined)
}
