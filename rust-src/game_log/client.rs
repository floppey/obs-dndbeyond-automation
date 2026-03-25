use anyhow::{bail, Context, Result};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, ACCEPT_LANGUAGE, AUTHORIZATION, COOKIE, USER_AGENT};

use super::types::*;

const UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/// Client for fetching game log data from D&D Beyond
pub struct GameLogClient {
    game_id: String,
    user_id: String,
    cobalt_session: String,
    last_poll_key: Option<String>,
    bearer_token: Option<String>,
    token_expires_at: u64,
    http: reqwest::Client,
}

impl GameLogClient {
    pub fn new(game_id: String, user_id: String, cobalt_session: String) -> Self {
        let http = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .build()
            .expect("Failed to build HTTP client");

        Self {
            game_id,
            user_id,
            cobalt_session,
            last_poll_key: None,
            bearer_token: None,
            token_expires_at: 0,
            http,
        }
    }

    /// Fetch game log messages
    pub async fn fetch_game_log(&mut self) -> Result<Vec<GameLogMessage>> {
        let url = self.build_url();
        let token = self.get_valid_token().await?;

        let mut headers = HeaderMap::new();
        headers.insert(
            AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {}", token))
                .unwrap_or_else(|_| HeaderValue::from_static("")),
        );
        headers.insert(
            COOKIE,
            HeaderValue::from_str(&format!("cobalt-session={}", self.cobalt_session))
                .unwrap_or_else(|_| HeaderValue::from_static("")),
        );
        headers.insert(USER_AGENT, HeaderValue::from_static(UA));
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));

        let response = self
            .http
            .get(&url)
            .headers(headers)
            .send()
            .await
            .context("Failed to send game log request")?;

        let status = response.status();
        if status.as_u16() >= 400 {
            match status.as_u16() {
                401 | 403 => bail!("Authentication failed ({}). Check your cobalt-session cookie.", status),
                404 => bail!("Game not found ({}). Check your game ID.", status),
                _ => bail!("HTTP {}", status),
            }
        }

        let body = response.text().await.context("Failed to read game log response")?;
        self.parse_response(&body)
    }

    fn parse_response(&mut self, body: &str) -> Result<Vec<GameLogMessage>> {
        let api_response: GameLogResponse =
            serde_json::from_str(body).context("Failed to parse game log response as JSON")?;

        if let Some(ref last_key) = api_response.last_key {
            self.last_poll_key = Some(last_key.date_time_event_type_user_id.clone());
        }

        let rolls: Vec<GameLogMessage> = api_response
            .data
            .into_iter()
            .filter(|msg| {
                msg.event_type == "dice/roll/fulfilled" && msg.user_id == self.user_id
            })
            .collect();

        Ok(rolls)
    }

    fn build_url(&self) -> String {
        let mut url = format!(
            "https://game-log-rest-live.dndbeyond.com/v1/getmessages?gameId={}&userId={}",
            self.game_id, self.user_id
        );

        if let Some(ref key) = self.last_poll_key {
            url.push_str(&format!("&lastKey={}", urlencoding::encode(key)));
        }

        url
    }

    async fn get_valid_token(&mut self) -> Result<String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        if let Some(ref token) = self.bearer_token {
            if now < self.token_expires_at {
                return Ok(token.clone());
            }
        }

        println!("[GAME_LOG] Fetching new bearer token...");
        self.fetch_bearer_token().await
    }

    async fn fetch_bearer_token(&mut self) -> Result<String> {
        let mut headers = HeaderMap::new();
        headers.insert(
            COOKIE,
            HeaderValue::from_str(&format!("CobaltSession={}", self.cobalt_session))
                .unwrap_or_else(|_| HeaderValue::from_static("")),
        );
        headers.insert(USER_AGENT, HeaderValue::from_static(UA));
        headers.insert(ACCEPT, HeaderValue::from_static("application/json"));
        headers.insert(
            reqwest::header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        headers.insert(
            reqwest::header::ORIGIN,
            HeaderValue::from_static("https://www.dndbeyond.com"),
        );
        headers.insert(
            reqwest::header::REFERER,
            HeaderValue::from_static("https://www.dndbeyond.com/"),
        );

        let response = self
            .http
            .post("https://auth-service.dndbeyond.com/v1/cobalt-token")
            .headers(headers)
            .body("")
            .send()
            .await
            .context("Failed to fetch bearer token")?;

        let status = response.status();
        let body = response.text().await.context("Failed to read auth response")?;

        println!(
            "[GAME_LOG] Auth response ({}): {}",
            status,
            &body[..body.len().min(200)]
        );

        if status.as_u16() >= 400 {
            bail!("Failed to fetch bearer token: HTTP {} - {}", status, body);
        }

        let parsed: serde_json::Value =
            serde_json::from_str(&body).context("Failed to parse auth response")?;

        let token = parsed
            .get("token")
            .and_then(|t| t.as_str())
            .ok_or_else(|| anyhow::anyhow!("No token in auth response: {}", body))?
            .to_string();

        let ttl = parsed.get("ttl").and_then(|t| t.as_u64()).unwrap_or(300);

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        self.bearer_token = Some(token.clone());
        self.token_expires_at = now + (ttl - 30) * 1000;

        println!("[GAME_LOG] Bearer token obtained (expires in {}s)", ttl);
        Ok(token)
    }

    /// Parse game log messages into display-friendly roll objects
    pub fn parse_rolls(messages: &[GameLogMessage]) -> Vec<ParsedRoll> {
        messages
            .iter()
            .filter_map(|msg| {
                let roll = msg.data.rolls.first()?;
                let dice_string = Self::build_dice_string(&roll.dice_notation);
                let values_string = roll
                    .result
                    .values
                    .iter()
                    .map(|v| v.to_string())
                    .collect::<Vec<_>>()
                    .join(", ");

                Some(ParsedRoll {
                    id: msg.id.clone(),
                    timestamp: msg.date_time.parse::<i64>().unwrap_or(0),
                    character: msg.data.context.name.clone(),
                    action: msg.data.action.clone(),
                    total: roll.result.total,
                    breakdown: roll.result.text.clone(),
                    roll_type: roll.roll_type.clone(),
                    roll_kind: roll.roll_kind.clone(),
                    dice: dice_string,
                    values: values_string,
                })
            })
            .collect()
    }

    fn build_dice_string(notation: &DiceNotation) -> String {
        let mut parts: Vec<String> = Vec::new();

        for dice_set in &notation.set {
            parts.push(format!("{}{}", dice_set.count, dice_set.die_type));
        }

        if notation.constant != 0 {
            if notation.constant > 0 {
                parts.push(format!("+{}", notation.constant));
            } else {
                parts.push(format!("{}", notation.constant));
            }
        }

        parts.join("")
    }
}
