/**
 * Main configuration entry point
 * Handles loading or creating configuration with interactive setup
 */

import { Config, HpState } from "../types.js";
import { StatMapping } from "../stats/types.js";
import { GameLogConfig } from "../game-log/types.js";
import { RuleEngineConfig } from "../rules/types.js";
import { loadJsonConfig, saveJsonConfig, configExists } from "./loader.js";
import { JsonConfig } from "./types.js";

/** Result of loading configuration — includes setup mode flag */
export interface ConfigLoadResult {
  config: Config;
  /** True when config was just created from template and needs user configuration */
  needsSetup: boolean;
}

/**
 * Default configuration template used when no config.json exists.
 * Contains placeholder values that the user must fill in via the web UI.
 */
const DEFAULT_CONFIG: JsonConfig = {
  dndBeyond: {
    characterId: "YOUR_CHARACTER_ID",
    cobaltSession: "YOUR_COBALT_SESSION_TOKEN",
  },
  obs: {
    websocketUrl: "ws://localhost:4455",
    websocketPassword: "",
    mode: "image_swap",
    sourceName: "Character_Portrait",
    images: {
      healthy: "C:/path/to/healthy.png",
      scratched: "C:/path/to/scratched.png",
      bloodied: "C:/path/to/bloodied.png",
      dying: "C:/path/to/dying.png",
      unconscious: "C:/path/to/unconscious.png",
    },
  },
  polling: {
    intervalMs: 5000,
  },
  gameLog: {
    enabled: false,
  },
  debug: {
    saveApiResponse: false,
  },
};

/**
 * Load or create configuration
 * - Checks for --setup flag to force setup wizard (interactive terminal only)
 * - Checks if config.json exists and loads it
 * - If config.json doesn't exist, creates a default one and signals setup mode
 * - Converts JsonConfig to internal Config type
 */
export async function loadOrCreateConfig(): Promise<ConfigLoadResult> {
  const forceSetup = process.argv.includes("--setup");

  let jsonConfig: JsonConfig;
  let needsSetup = false;

  if (forceSetup && !isPackagedExe()) {
    // Force setup wizard (only in dev/terminal mode, not in packaged exe)
    const { runSetupWizard } = await import("./setup.js");
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

    // Detect if config still has placeholder values from initial creation
    if (isPackagedExe() && hasPlaceholderValues(jsonConfig)) {
      needsSetup = true;
      console.log("[CONFIG] Configuration contains placeholder values — setup required.");
    }
  } else if (!isPackagedExe()) {
    // No config exists in dev mode — run interactive setup wizard
    const { runSetupWizard } = await import("./setup.js");
    console.log("[CONFIG] No configuration found, starting interactive setup wizard...\n");
    jsonConfig = await runSetupWizard();
    await saveJsonConfig(jsonConfig);
  } else {
    // No config exists in exe mode — create default and enter setup mode
    console.log("[CONFIG] No configuration found. Creating default config.json...");
    jsonConfig = DEFAULT_CONFIG;
    await saveJsonConfig(jsonConfig);
    needsSetup = true;
    console.log("[CONFIG] ✓ Default config.json created. Please configure via the web UI.");
  }

  // Convert JsonConfig to internal Config type
  return { config: convertJsonConfigToConfig(jsonConfig), needsSetup };
}

/**
 * Check if running as a packaged executable (pkg)
 */
function isPackagedExe(): boolean {
  // @ts-expect-error - process.pkg is added by pkg at runtime
  return !!process.pkg;
}

/**
 * Check if a config still has placeholder values from the default template.
 * This catches the case where the user ran the exe, it created the default config,
 * but the user didn't configure it via the web UI before restarting.
 */
function hasPlaceholderValues(config: JsonConfig): boolean {
  return (
    config.dndBeyond.characterId === "YOUR_CHARACTER_ID" ||
    config.dndBeyond.cobaltSession === "YOUR_COBALT_SESSION_TOKEN"
  );
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
