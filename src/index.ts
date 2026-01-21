/**
 * Main entry point for OBS D&D Beyond HP Swapper
 * Implements the polling loop that keeps OBS in sync with character HP
 */

import { loadConfig, logConfig } from "./config.js";
import { DndBeyondClient } from "./dnd-beyond/client.js";
import { formatHpInfo } from "./dnd-beyond/hp-calculator.js";
import { OBSClient } from "./obs/client.js";
import { StatCalculator } from "./stats/index.js";
import { HpState, Config } from "./types.js";
import { CalculatedStat } from "./stats/types.js";

/**
 * Main application class
 */
class OBSDndBeyondAutomation {
  private dndClient: DndBeyondClient;
  private obsClient: OBSClient;
  private statCalculator: StatCalculator;
  private config: Config;
  private pollIntervalMs: number;
  private pollHandle: NodeJS.Timeout | null = null;
  private previousState: HpState | null = null;
  private previousStatValues: Map<string, string> = new Map();
  private isShuttingDown = false;
  private pollCount = 0;

   constructor() {
     const config = loadConfig();
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

      // Start polling loop
      console.log(
        `[APP] Starting polling loop (interval: ${this.pollIntervalMs}ms)...`
      );
      await this.poll();

       // Schedule subsequent polls
       this.pollHandle = setInterval(() => {
         this.poll().catch((error) => {
           console.error(`[APP] Poll error: ${error instanceof Error ? error.message : String(error)}`);
           this.shutdown("POLL_ERROR");
         });
       }, this.pollIntervalMs);

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
 * Start the application
 */
async function main(): Promise<void> {
  const app = new OBSDndBeyondAutomation();
  await app.start();
}

// Run the application
main().catch((error) => {
  console.error(`[FATAL] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
