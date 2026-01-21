/**
 * Configuration management for OBS D&D Beyond automation
 * Loads and validates environment variables
 */

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Config, HpState, OBSClientConfig } from "./types.js";
import { StatMapping, StatId } from "./stats/types.js";

// Load .env.local if it exists, otherwise fall back to .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// Try .env.local first, then .env
dotenv.config({ path: path.join(rootDir, ".env.local") });
dotenv.config({ path: path.join(rootDir, ".env") }); // Won't override existing vars

/**
 * Parse stat mappings from environment variables
 * Format: STAT_MAPPING_<N>=<stat_id>:<obs_source_name>[:<format>]
 */
function parseStatMappings(): StatMapping[] {
  const mappings: StatMapping[] = [];

  for (let i = 1; i <= 20; i++) {
    const envVar = process.env[`STAT_MAPPING_${i}`];
    if (!envVar) continue;

    const parts = envVar.split(":");
    if (parts.length < 2) {
      console.warn(`[CONFIG] Invalid STAT_MAPPING_${i}: ${envVar}`);
      continue;
    }

    const statId = parts[0].trim() as StatId;
    const obsSourceName = parts[1].trim();
    const format = parts[2]?.trim();

    mappings.push({
      statId,
      obsSourceName,
      format: format || undefined,
    });
  }

  return mappings;
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): Config {
  const dndCharacterId = process.env.DND_CHARACTER_ID;
  const dndCobaltSession = process.env.DND_COBALT_SESSION;
  const obsWebsocketUrl = process.env.OBS_WEBSOCKET_URL || "ws://localhost:4455";
  const obsWebsocketPassword = process.env.OBS_WEBSOCKET_PASSWORD;
  const pollIntervalMs = parseInt(process.env.POLL_INTERVAL_MS || "5000", 10);
  const obsMode = process.env.OBS_MODE as "image_swap" | "visibility_toggle";

  // Validate required fields
  if (!dndCharacterId) {
    throw new Error("Missing required environment variable: DND_CHARACTER_ID");
  }
  if (!dndCobaltSession) {
    throw new Error("Missing required environment variable: DND_COBALT_SESSION");
  }
  if (!obsMode || !["image_swap", "visibility_toggle"].includes(obsMode)) {
    throw new Error(
      'Invalid OBS_MODE: must be "image_swap" or "visibility_toggle"'
    );
  }

  // Build OBS configuration based on mode
  const obsConfig = buildOBSConfig(obsMode, obsWebsocketUrl, obsWebsocketPassword);

   // Parse stat mappings
   const statMappings = parseStatMappings();

   // Debug settings
   const debugSaveApiResponse = process.env.DEBUG_SAVE_API_RESPONSE?.toLowerCase() === 'true';

   // Validate poll interval
   if (pollIntervalMs < 1000) {
     console.warn(
       `POLL_INTERVAL_MS is very low (${pollIntervalMs}ms). Recommended minimum: 3000ms`
     );
   }

   return {
     dnd: {
       characterId: dndCharacterId,
       cobaltSession: dndCobaltSession,
     },
     obs: obsConfig,
     pollIntervalMs,
     statMappings,
     debug: {
       saveApiResponse: debugSaveApiResponse,
     },
   };
}

/**
 * Build OBS configuration based on mode and environment variables
 */
function buildOBSConfig(
  mode: "image_swap" | "visibility_toggle",
  websocketUrl: string,
  websocketPassword: string | undefined
): OBSClientConfig {
  const config: OBSClientConfig = {
    websocketUrl,
    websocketPassword: websocketPassword || undefined,
    mode,
  };

  if (mode === "visibility_toggle") {
    const sceneName = process.env.OBS_SCENE_NAME;
    if (!sceneName) {
      throw new Error(
        'visibility_toggle mode requires OBS_SCENE_NAME environment variable'
      );
    }
    config.sceneName = sceneName;
  } else if (mode === "image_swap") {
    const sourceName = process.env.OBS_SOURCE_NAME;
    if (!sourceName) {
      throw new Error('image_swap mode requires OBS_SOURCE_NAME environment variable');
    }

    // Load image paths for each state
    const imagePathsByState: Record<HpState, string> = {} as Record<
      HpState,
      string
    >;
    const stateToEnvVar: Record<HpState, string> = {
      [HpState.Healthy]: "OBS_IMAGE_HEALTHY",
      [HpState.Scratched]: "OBS_IMAGE_SCRATCHED",
      [HpState.Bloodied]: "OBS_IMAGE_BLOODIED",
      [HpState.Dying]: "OBS_IMAGE_DYING",
      [HpState.Unconscious]: "OBS_IMAGE_UNCONSCIOUS",
    };

    for (const [state, envVar] of Object.entries(stateToEnvVar)) {
      const path = process.env[envVar];
      if (!path) {
        throw new Error(`image_swap mode requires ${envVar} environment variable`);
      }
      imagePathsByState[state as HpState] = path;
    }

    config.sourceName = sourceName;
    config.imagePathsByState = imagePathsByState;
  }

  return config;
}

/**
 * Log configuration (without sensitive data)
 */
export function logConfig(config: Config): void {
   const sanitized = {
     dnd: {
       characterId: config.dnd.characterId,
       cobaltSession: "***[REDACTED]***",
     },
     obs: {
       websocketUrl: config.obs.websocketUrl,
       websocketPassword: config.obs.websocketPassword ? "***[REDACTED]***" : undefined,
       mode: config.obs.mode,
       sceneName: config.obs.sceneName,
       sourceName: config.obs.sourceName,
     },
     pollIntervalMs: config.pollIntervalMs,
     statMappings: config.statMappings.length > 0 
       ? `${config.statMappings.length} mapping(s) configured`
       : "No stat mappings configured",
     debug: {
       saveApiResponse: config.debug.saveApiResponse,
     },
   };

   console.log("[CONFIG] Configuration loaded:", JSON.stringify(sanitized, null, 2));
}
