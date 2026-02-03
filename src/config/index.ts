/**
 * Main configuration entry point
 * Handles loading or creating configuration with interactive setup
 */

import { Config, HpState } from "../types.js";
import { StatMapping } from "../stats/types.js";
import { GameLogConfig } from "../game-log/types.js";
import { RuleEngineConfig } from "../rules/types.js";
import { loadJsonConfig, saveJsonConfig, configExists } from "./loader.js";
import { runSetupWizard } from "./setup.js";
import { JsonConfig } from "./types.js";

/**
 * Load or create configuration
 * - Checks for --setup flag to force setup wizard
 * - Checks if config.json exists and loads it
 * - If config.json doesn't exist, runs interactive setup wizard
 * - Converts JsonConfig to internal Config type
 */
export async function loadOrCreateConfig(): Promise<Config> {
  const forceSetup = process.argv.includes("--setup");

  let jsonConfig: JsonConfig;

  if (forceSetup) {
    // Force setup wizard
    console.log("[CONFIG] --setup flag detected, running configuration wizard...\n");
    jsonConfig = await runSetupWizard();
    await saveJsonConfig(jsonConfig);
  } else if (configExists()) {
    // Load existing config
    console.log("[CONFIG] Loading configuration from config.json...");
    const loaded = await loadJsonConfig();
    if (!loaded) {
      throw new Error("Failed to load config.json");
    }
    jsonConfig = loaded;
  } else {
    // No config exists, run setup wizard
    console.log("[CONFIG] No configuration found, starting interactive setup wizard...\n");
    jsonConfig = await runSetupWizard();
    await saveJsonConfig(jsonConfig);
  }

  // Convert JsonConfig to internal Config type
  return convertJsonConfigToConfig(jsonConfig);
}

/**
 * Convert JsonConfig (from file) to internal Config type (for application)
 */
function convertJsonConfigToConfig(jsonConfig: JsonConfig): Config {
  // Parse stat mappings
  const statMappings: StatMapping[] = [];
  if (jsonConfig.statMappings) {
    for (const mapping of jsonConfig.statMappings) {
      statMappings.push({
        statId: mapping.statId as any,
        obsSourceName: mapping.obsSourceName,
        format: mapping.format,
      });
    }
  }

  // Parse game log configuration
  let gameLogConfig: GameLogConfig | undefined;
  if (jsonConfig.gameLog && jsonConfig.gameLog.enabled) {
    gameLogConfig = {
      enabled: true,
      gameId: jsonConfig.gameLog.gameId || "",
      userId: jsonConfig.gameLog.userId || "",
      cobaltSession: jsonConfig.dndBeyond.cobaltSession,
      pollIntervalMs: jsonConfig.gameLog.pollIntervalMs || 3000,
      lastRoll: jsonConfig.gameLog.lastRoll
        ? {
            sourceName: jsonConfig.gameLog.lastRoll.sourceName,
            format: jsonConfig.gameLog.lastRoll.format || "{action}: {total}",
          }
        : undefined,
      rollHistory: jsonConfig.gameLog.rollHistory
        ? {
            sourceName: jsonConfig.gameLog.rollHistory.sourceName,
            format: jsonConfig.gameLog.rollHistory.format || "{action} {total}",
            count: jsonConfig.gameLog.rollHistory.count || 5,
          }
        : undefined,
    };
  }

  // Build OBS client config
  const obsClientConfig = buildOBSClientConfig(jsonConfig);

  // Build final config
  const config: Config = {
    dnd: {
      characterId: jsonConfig.dndBeyond.characterId,
      cobaltSession: jsonConfig.dndBeyond.cobaltSession,
    },
    obs: obsClientConfig,
    pollIntervalMs: jsonConfig.polling.intervalMs,
    statMappings,
    gameLog: gameLogConfig,
    rules: jsonConfig.rules as RuleEngineConfig | undefined,
    debug: {
      saveApiResponse: jsonConfig.debug?.saveApiResponse || false,
    },
  };

  return config;
}

/**
 * Build OBS client configuration
 */
function buildOBSClientConfig(jsonConfig: JsonConfig) {
  const obsJson = jsonConfig.obs;

  if (obsJson.mode === "visibility_toggle") {
    if (!obsJson.sceneName) {
      throw new Error("visibility_toggle mode requires sceneName");
    }
    return {
      websocketUrl: obsJson.websocketUrl,
      websocketPassword: obsJson.websocketPassword,
      mode: "visibility_toggle" as const,
      sceneName: obsJson.sceneName,
    };
  } else if (obsJson.mode === "image_swap") {
    if (!obsJson.sourceName || !obsJson.images) {
      throw new Error("image_swap mode requires sourceName and images");
    }

    // Convert image paths to HpState mapping
    const imagePathsByState: Record<HpState, string> = {
      [HpState.Healthy]: obsJson.images.healthy,
      [HpState.Scratched]: obsJson.images.scratched,
      [HpState.Bloodied]: obsJson.images.bloodied,
      [HpState.Dying]: obsJson.images.dying,
      [HpState.Unconscious]: obsJson.images.unconscious,
    };

    return {
      websocketUrl: obsJson.websocketUrl,
      websocketPassword: obsJson.websocketPassword,
      mode: "image_swap" as const,
      sourceName: obsJson.sourceName,
      imagePathsByState,
    };
  } else {
    throw new Error(`Unknown OBS mode: ${obsJson.mode}`);
  }
}
