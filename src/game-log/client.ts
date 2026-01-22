/**
 * Client for D&D Beyond Game Log API
 * Fetches and parses dice roll events from the game log
 */

import https from "https";
import { GameLogMessage, GameLogResponse, ParsedRoll } from "./types.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Client for fetching game log data from D&D Beyond
 */
export class GameLogClient {
  private gameId: string;
  private userId: string;
  private cobaltSession: string;
  private lastPollKey?: string;
  private bearerToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(gameId: string, userId: string, cobaltSession: string) {
    this.gameId = gameId;
    this.userId = userId;
    this.cobaltSession = cobaltSession;
  }

  /**
   * Fetch game log messages from D&D Beyond API
   * @throws Error if the API request fails or response is invalid
   */
  async fetchGameLog(): Promise<GameLogMessage[]> {
    const url = this.buildUrl();

    try {
      const response = await this.makeRequest(url);
      return this.parseResponse(response);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch game log: ${errorMessage}`);
    }
  }

  /**
   * Parse and filter game log messages
   * Returns only dice rolls from the configured user
   */
  private parseResponse(responseBody: string): GameLogMessage[] {
    let apiResponse: GameLogResponse;

    try {
      apiResponse = JSON.parse(responseBody);
    } catch (error) {
      throw new Error("Failed to parse game log response as JSON");
    }

    // Validate response structure
    if (!Array.isArray(apiResponse.data)) {
      throw new Error("Invalid API response structure: missing data array");
    }

    // Store the last key for pagination on next request
    if (apiResponse.lastKey) {
      this.lastPollKey = apiResponse.lastKey.dateTime_eventType_userId;
    }

    // Filter to only dice roll events from the configured user
    const rolls = apiResponse.data.filter(
      (msg) =>
        msg.eventType === "dice/roll/fulfilled" && msg.userId === this.userId
    );

    return rolls;
  }

   /**
    * Build the API URL with pagination support
    */
   private buildUrl(): string {
     let url = `https://game-log-rest-live.dndbeyond.com/v1/getmessages?gameId=${this.gameId}&userId=${this.userId}`;

     // Add pagination key if available
     if (this.lastPollKey) {
       url += `&lastKey=${encodeURIComponent(this.lastPollKey)}`;
     }

     return url;
   }

   /**
    * Fetch a fresh bearer token from the auth service
    * Token is valid for 5 minutes (300 seconds)
    */
    private async fetchBearerToken(): Promise<string> {
      const url = new URL("https://auth-service.dndbeyond.com/v1/cobalt-token");

      return new Promise((resolve, reject) => {
        const options = {
          hostname: url.hostname,
          path: url.pathname,
          method: "POST",
          headers: {
            Cookie: `CobaltSession=${this.cobaltSession}`,
            "User-Agent": USER_AGENT,
            Accept: "application/json",
            "Content-Type": "application/json",
            "Content-Length": "0",
            Origin: "https://www.dndbeyond.com",
            Referer: "https://www.dndbeyond.com/",
          },
          timeout: 10000,
        };

        const req = https.request(options, (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            // Debug: log the response
            console.log(`[GAME_LOG] Auth response (${res.statusCode}): ${data.substring(0, 200)}`);

            if (res.statusCode && res.statusCode >= 400) {
              reject(
                new Error(`Failed to fetch bearer token: HTTP ${res.statusCode} - ${data}`)
              );
              return;
            }

            try {
              const response = JSON.parse(data);
              if (!response.token) {
                reject(new Error(`No token in auth response: ${JSON.stringify(response)}`));
                return;
              }

              // Store token and calculate expiry (refresh 30 seconds early)
              this.bearerToken = response.token;
              const ttl = response.ttl || 300;
              this.tokenExpiresAt = Date.now() + (ttl - 30) * 1000;

              console.log(`[GAME_LOG] ✓ Bearer token obtained (expires in ${ttl}s)`);
              resolve(response.token);
            } catch (error) {
              reject(new Error(`Failed to parse auth response: ${data}`));
            }
          });
        });

        req.on("error", reject);
        req.on("timeout", () => reject(new Error("Auth request timeout")));

        // End the request (send empty body for POST)
        req.end();
      });
    }

   /**
    * Get a valid bearer token, refreshing if expired
    */
   private async getValidToken(): Promise<string> {
     if (this.bearerToken && Date.now() < this.tokenExpiresAt) {
       return this.bearerToken;
     }

     console.log("[GAME_LOG] Fetching new bearer token...");
     return this.fetchBearerToken();
   }

   /**
    * Make HTTPS request to game log API
    */
   private async makeRequest(url: string): Promise<string> {
     const token = await this.getValidToken();

     return new Promise((resolve, reject) => {
       const options = {
         headers: {
           Authorization: `Bearer ${token}`,
           Cookie: `cobalt-session=${this.cobaltSession}`,
           "User-Agent": USER_AGENT,
           Accept: "application/json",
           "Accept-Language": "en-US,en;q=0.9",
         },
         timeout: 10000,
       };

       https
         .get(url, options, (res) => {
           let data = "";

           res.on("data", (chunk) => {
             data += chunk;
           });

           res.on("end", () => {
             // Check for HTTP errors
             if (res.statusCode && res.statusCode >= 400) {
               if (res.statusCode === 401 || res.statusCode === 403) {
                 reject(
                   new Error(
                     `Authentication failed (${res.statusCode}). Check your cobalt-session cookie.`
                   )
                 );
               } else if (res.statusCode === 404) {
                 reject(
                   new Error(
                     `Game not found (${res.statusCode}). Check your game ID.`
                   )
                 );
               } else {
                 reject(new Error(`HTTP ${res.statusCode}: ${data}`));
               }
               return;
             }

             resolve(data);
           });
         })
         .on("error", (err) => {
           reject(err);
         })
         .on("timeout", () => {
           reject(new Error("Request timeout after 10 seconds"));
         });
     });
   }

  /**
   * Parse game log messages into display-friendly roll objects
   */
  static parseRolls(messages: GameLogMessage[]): ParsedRoll[] {
    return messages.map((msg) => {
      const roll = msg.data.rolls[0]; // Take first roll (usually only one per message)
      const diceString = GameLogClient.buildDiceString(roll.diceNotation);
      const valuesString = roll.result.values.join(", ");

      return {
        id: msg.id,
        timestamp: parseInt(msg.dateTime, 10),
        character: msg.data.context.name,
        action: msg.data.action,
        total: roll.result.total,
        breakdown: roll.result.text,
        rollType: roll.rollType,
        rollKind: roll.rollKind || "",
        dice: diceString,
        values: valuesString,
      };
    });
  }

  /**
   * Build human-readable dice notation string from dice notation object
   * Example: "2d20+1" or "1d8"
   */
  private static buildDiceString(notation: { set: any[]; constant: number }): string {
    const parts: string[] = [];

    // Build each dice set
    for (const diceSet of notation.set) {
      const diceStr = `${diceSet.count}${diceSet.dieType}`;
      parts.push(diceStr);

      // Handle operation and operand (e.g., advantage is operation 2, operand 1 meaning "drop 1")
      if (diceSet.operation && diceSet.operand !== undefined) {
        // Operation 2 = drop, so skip showing it in dice string
        // The actual advantage/disadvantage is shown in rollKind instead
      }
    }

    // Add constant modifier if non-zero
    if (notation.constant !== 0) {
      parts.push(notation.constant > 0 ? `+${notation.constant}` : `${notation.constant}`);
    }

    return parts.join("");
  }
}
