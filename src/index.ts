/**
 * Main entry point for OBS D&D Beyond HP Swapper
 * Implements the polling loop that keeps OBS in sync with character HP
 */

import { logConfig } from "./config.js";
import { loadOrCreateConfig } from "./config/index.js";
import { DndBeyondClient } from "./dnd-beyond/client.js";
import { formatHpInfo } from "./dnd-beyond/hp-calculator.js";
import { OBSClient } from "./obs/client.js";
import { StatCalculator } from "./stats/index.js";
import { HpState, Config } from "./types.js";
import { CalculatedStat } from "./stats/types.js";
import { GameLogClient, formatRoll, formatRollHistory } from "./game-log/index.js";
import type { ParsedRoll } from "./game-log/types.js";

/**
 * Main application class
 */
class OBSDndBeyondAutomation {
  private dndClient: DndBeyondClient;
  private obsClient: OBSClient;
  private gameLogClient?: GameLogClient;
  private statCalculator: StatCalculator;
  private config: Config;
  private pollIntervalMs: number;
  private pollHandle: NodeJS.Timeout | null = null;
  private gameLogPollHandle: NodeJS.Timeout | null = null;
  private previousState: HpState | null = null;
  private previousStatValues: Map<string, string> = new Map();
   private seenRollIds: Set<string> = new Set();
  private rollHistory: ParsedRoll[] = [];
  private isShuttingDown = false;
  private pollCount = 0;
  private gameLogPollCount = 0;

    constructor(config: Config) {
      logConfig(config);

      this.config = config;
      this.dndClient = new DndBeyondClient(
        config.dnd.characterId,
        config.dnd.cobaltSession,
        config.debug.saveApiResponse
      );
      this.obsClient = new OBSClient(config.obs);
      this.statCalculator = new StatCalculator();
      this.pollIntervalMs = config.pollIntervalMs;

      // Initialize game log client if configured
      if (config.gameLog && config.gameLog.enabled) {
        this.gameLogClient = new GameLogClient(
          config.gameLog.gameId,
          config.gameLog.userId,
          config.gameLog.cobaltSession
        );
      }

      // Set up graceful shutdown handlers
      process.on("SIGINT", () => this.shutdown("SIGINT"));
      process.on("SIGTERM", () => this.shutdown("SIGTERM"));
    }

   /**
    * Start the automation
    */
   async start(): Promise<void> {
     try {
       console.log("[APP] Initializing OBS D&D Beyond HP Swapper...");

       // Connect to OBS
       await this.obsClient.connect();

       // Start character polling loop
       console.log(
         `[APP] Starting character polling loop (interval: ${this.pollIntervalMs}ms)...`
       );
       await this.poll();

        // Schedule subsequent character polls
        this.pollHandle = setInterval(() => {
          this.poll().catch((error) => {
            console.error(`[APP] Poll error: ${error instanceof Error ? error.message : String(error)}`);
            this.shutdown("POLL_ERROR");
          });
        }, this.pollIntervalMs);

        // Start game log polling if configured
        if (this.gameLogClient && this.config.gameLog) {
          console.log(
            `[APP] Starting game log polling (interval: ${this.config.gameLog.pollIntervalMs}ms)...`
          );
          await this.pollGameLog();

          this.gameLogPollHandle = setInterval(() => {
            this.pollGameLog().catch((error) => {
              console.error(`[APP] Game log poll error: ${error instanceof Error ? error.message : String(error)}`);
              // Don't shutdown on game log errors - they're less critical
            });
          }, this.config.gameLog.pollIntervalMs);
        }

       console.log("[APP] ✓ Automation started successfully");
     } catch (error) {
       console.error(
         `[APP] Failed to start: ${error instanceof Error ? error.message : String(error)}`
       );
       await this.cleanup();
       process.exit(1);
     }
   }

     /**
      * Execute one polling cycle
      */
     private async poll(): Promise<void> {
       this.pollCount++;

       // Skip if shutting down
       if (this.isShuttingDown) {
         return;
       }

       try {
         // Fetch current character state
         const characterData = await this.dndClient.fetchCharacter();
         const hpInfo = formatHpInfo(
           characterData.currentHp,
           characterData.maxHp,
           characterData.temporaryHp,
           characterData.state
         );

         // Check if HP state changed
         const hpStateChanged = characterData.state !== this.previousState;

         // Calculate stats and check if any changed
         let statsCalculated: CalculatedStat[] = [];
         if (this.config.statMappings.length > 0) {
           try {
             const rawCharacterData = await this.dndClient.fetchRawCharacter();
             statsCalculated = this.statCalculator.calculateMappings(
               this.config.statMappings,
               rawCharacterData,
               this.previousStatValues
             );
           } catch (error) {
             const errorMessage =
               error instanceof Error ? error.message : String(error);
             console.warn(`[POLL #${this.pollCount}] Failed to calculate stats: ${errorMessage}`);
           }
         }

         // Check if any stats changed
         const anyStatsChanged = statsCalculated.some((s) => s.changed);

         // Log state
         if (!hpStateChanged && !anyStatsChanged) {
           console.log(`[POLL #${this.pollCount}] ${hpInfo} [no changes]`);
           return;
         }

         // Log changes
         console.log(`[POLL #${this.pollCount}] ${hpInfo}`);
         if (anyStatsChanged) {
           const changedStats = statsCalculated.filter((s) => s.changed);
           for (const stat of changedStats) {
             console.log(
               `[POLL #${this.pollCount}]   ${stat.obsSourceName}: ${stat.value}`
             );
           }
         }

         // Update OBS for HP state if changed
         if (hpStateChanged) {
           this.previousState = characterData.state;
           try {
             await this.updateOBS(characterData.state);
           } catch (error) {
             console.error(
               `[APP] Failed to update OBS HP state: ${
                 error instanceof Error ? error.message : String(error)
               }`
             );
           }
         }

         // Update OBS for changed stats
         if (anyStatsChanged) {
           const changedStats = statsCalculated.filter((s) => s.changed);
           for (const stat of changedStats) {
             try {
               await this.obsClient.setText(stat.obsSourceName, stat.value);
               this.previousStatValues.set(stat.obsSourceName, stat.value);
             } catch (error) {
               console.error(
                 `[APP] Failed to update stat ${stat.obsSourceName}: ${
                   error instanceof Error ? error.message : String(error)
                 }`
               );
             }
           }
         }
       } catch (error) {
         const errorMessage = error instanceof Error ? error.message : String(error);
         console.error(`[POLL #${this.pollCount}] Error fetching character: ${errorMessage}`);
         throw error; // Re-throw to trigger fail-fast in interval handler
       }
     }

     /**
      * Poll game log for new dice rolls
      */
     private async pollGameLog(): Promise<void> {
       this.gameLogPollCount++;

       // Skip if shutting down
       if (this.isShuttingDown || !this.gameLogClient || !this.config.gameLog) {
         return;
       }

       try {
         // Fetch game log messages
         const messages = await this.gameLogClient.fetchGameLog();

         if (messages.length === 0) {
           console.log(`[GAME_LOG #${this.gameLogPollCount}] No new rolls`);
           return;
         }

         // Parse rolls
         const parsedRolls = GameLogClient.parseRolls(messages);

          // Filter to only new rolls (by ID) - rolls we haven't seen before
          const newRolls = parsedRolls.filter(
            (roll) => !this.seenRollIds.has(roll.id)
          );

          if (newRolls.length === 0) {
            console.log(`[GAME_LOG #${this.gameLogPollCount}] No new rolls [${parsedRolls.length} total]`);
            return;
          }

          // Mark all new rolls as seen
          for (const roll of newRolls) {
            this.seenRollIds.add(roll.id);
          }

          // Prevent memory leak - keep only last 100 roll IDs
          if (this.seenRollIds.size > 100) {
            const idsArray = Array.from(this.seenRollIds);
            this.seenRollIds = new Set(idsArray.slice(-100));
          }

           // Add new rolls to history
           this.rollHistory = [...this.rollHistory, ...newRolls];

           // Sort by timestamp descending (newest first)
           this.rollHistory.sort((a, b) => b.timestamp - a.timestamp);

           // Limit history size to prevent memory growth
           if (this.rollHistory.length > 50) {
             this.rollHistory = this.rollHistory.slice(0, 50);
           }

           // The newest roll is now first after sorting
           const newestRoll = this.rollHistory[0];

          console.log(`[GAME_LOG #${this.gameLogPollCount}] ✓ New roll: ${newestRoll.character} ${newestRoll.action} = ${newestRoll.total}`);

         // Update OBS sources if configured
         if (this.config.gameLog.lastRoll) {
           try {
             const formatted = formatRoll(newestRoll, this.config.gameLog.lastRoll.format);
             await this.obsClient.setText(this.config.gameLog.lastRoll.sourceName, formatted);
           } catch (error) {
             console.error(
               `[APP] Failed to update last roll source: ${
                 error instanceof Error ? error.message : String(error)
               }`
             );
           }
         }

         if (this.config.gameLog.rollHistory) {
           try {
             const formatted = formatRollHistory(
               this.rollHistory,
               this.config.gameLog.rollHistory.format,
               this.config.gameLog.rollHistory.count
             );
             await this.obsClient.setText(this.config.gameLog.rollHistory.sourceName, formatted);
           } catch (error) {
             console.error(
               `[APP] Failed to update roll history source: ${
                 error instanceof Error ? error.message : String(error)
               }`
             );
           }
         }
       } catch (error) {
         const errorMessage = error instanceof Error ? error.message : String(error);
         console.error(`[GAME_LOG #${this.gameLogPollCount}] Error fetching game log: ${errorMessage}`);
         // Don't re-throw - game log errors are non-critical
       }
     }

  /**
   * Update OBS based on configuration mode
   */
  private async updateOBS(state: HpState): Promise<void> {
    if (!this.obsClient.isConnected()) {
      console.warn("[OBS] Not connected to OBS, attempting reconnect...");
      try {
        await this.obsClient.connect();
      } catch (error) {
        throw new Error("Failed to reconnect to OBS");
      }
    }

    // Get configuration from environment to determine update mode
    const obsMode = process.env.OBS_MODE as "image_swap" | "visibility_toggle";

    if (obsMode === "image_swap") {
      await this.updateImageSwap(state);
    } else if (obsMode === "visibility_toggle") {
      await this.updateVisibilityToggle(state);
    }
  }

  /**
   * Update OBS by swapping image source path
   */
  private async updateImageSwap(state: HpState): Promise<void> {
    const sourceName = process.env.OBS_SOURCE_NAME;
    const imagePath = process.env[`OBS_IMAGE_${state.toUpperCase()}`];

    if (!sourceName || !imagePath) {
      throw new Error(`Missing configuration for image_swap mode: sourceName=${sourceName}, imagePath=${imagePath}`);
    }

    await this.obsClient.setImagePath(sourceName, imagePath);
  }

  /**
   * Update OBS by toggling scene item visibility
   */
  private async updateVisibilityToggle(newState: HpState): Promise<void> {
    const sceneName = process.env.OBS_SCENE_NAME;

    if (!sceneName) {
      throw new Error("Missing OBS_SCENE_NAME for visibility_toggle mode");
    }

    // All possible states
    const allStates = Object.values(HpState);

    // Toggle visibility: show the item matching current state, hide others
    for (const stateItem of allStates) {
      const isActive = stateItem === newState;
      await this.obsClient.setSourceVisibility(sceneName, stateItem, isActive);
    }
  }

  /**
   * Gracefully shutdown the application
   */
  private async shutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log(`\n[APP] Received ${signal}, shutting down gracefully...`);

    await this.cleanup();
    console.log("[APP] Shutdown complete");
    process.exit(0);
  }

   /**
    * Clean up resources
    */
   private async cleanup(): Promise<void> {
     // Stop polling
     if (this.pollHandle) {
       clearInterval(this.pollHandle);
       this.pollHandle = null;
     }

     // Stop game log polling
     if (this.gameLogPollHandle) {
       clearInterval(this.gameLogPollHandle);
       this.gameLogPollHandle = null;
     }

     // Disconnect from OBS
     try {
       await this.obsClient.disconnect();
     } catch (error) {
       console.error(`[APP] Error during OBS disconnect: ${
         error instanceof Error ? error.message : String(error)
       }`);
     }
   }
}

/**
 * Helper to keep console window open until user presses a key
 * Only waits if running in a terminal (not piped/redirected)
 */
async function waitForKeypress(): Promise<void> {
  // Only wait if running in a terminal (not piped)
  if (process.stdin.isTTY) {
    console.log("\n🔑 Press any key to exit...");
    process.stdin.setRawMode(true);
    return new Promise((resolve) => {
      process.stdin.once("data", () => {
        process.stdin.setRawMode(false);
        resolve();
      });
    });
  }
}

/**
 * Start the application
 */
async function main(): Promise<void> {
  try {
    console.log("[APP] Loading configuration...");
    const config = await loadOrCreateConfig();
    const app = new OBSDndBeyondAutomation(config);
    await app.start();
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const errorStack =
      error instanceof Error && error.stack ? `\n${error.stack}` : "";
    console.error(
      `\n❌ [FATAL ERROR] Application crashed during startup: ${errorMessage}${errorStack}`
    );
    await waitForKeypress();
    process.exit(1);
  }
}

// Run the application
main().catch((error) => {
  const errorMessage =
    error instanceof Error ? error.message : String(error);
  const errorStack =
    error instanceof Error && error.stack ? `\n${error.stack}` : "";
  console.error(
    `\n❌ [FATAL ERROR] Uncaught exception: ${errorMessage}${errorStack}`
  );
  waitForKeypress().then(() => {
    process.exit(1);
  });
});
