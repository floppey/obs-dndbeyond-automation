/**
 * Configuration loader - reads and validates config.json
 */

import fs from "fs";
import path from "path";
import { JsonConfig } from "./types.js";

/**
 * Load config.json from the current working directory
 * @returns JsonConfig if file exists, null if not found
 * @throws Error if file exists but is invalid
 */
export async function loadJsonConfig(): Promise<JsonConfig | null> {
  const configPath = path.resolve(process.cwd(), "config.json");

  // Check if file exists
  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const fileContent = fs.readFileSync(configPath, "utf-8");
    const config = JSON.parse(fileContent) as JsonConfig;

    // Validate required fields
    validateJsonConfig(config);

    return config;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in config.json: ${error.message}`);
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("Failed to load config.json");
  }
}

/**
 * Validate JSON configuration structure
 * @throws Error if validation fails
 */
function validateJsonConfig(config: unknown): asserts config is JsonConfig {
  if (!config || typeof config !== "object") {
    throw new Error("Configuration must be a JSON object");
  }

  const cfg = config as Record<string, unknown>;

  // Validate dndBeyond section
  if (!cfg.dndBeyond || typeof cfg.dndBeyond !== "object") {
    throw new Error("Missing required section: dndBeyond");
  }
  const dnd = cfg.dndBeyond as Record<string, unknown>;
  if (!dnd.characterId || typeof dnd.characterId !== "string") {
    throw new Error("dndBeyond.characterId is required and must be a string");
  }
  if (!dnd.cobaltSession || typeof dnd.cobaltSession !== "string") {
    throw new Error("dndBeyond.cobaltSession is required and must be a string");
  }

  // Validate obs section
  if (!cfg.obs || typeof cfg.obs !== "object") {
    throw new Error("Missing required section: obs");
  }
  const obs = cfg.obs as Record<string, unknown>;
  if (!obs.websocketUrl || typeof obs.websocketUrl !== "string") {
    throw new Error("obs.websocketUrl is required and must be a string");
  }
  if (!obs.mode || !["image_swap", "visibility_toggle"].includes(obs.mode as string)) {
    throw new Error('obs.mode must be either "image_swap" or "visibility_toggle"');
  }

  // Validate mode-specific requirements
  if (obs.mode === "visibility_toggle") {
    if (!obs.sceneName || typeof obs.sceneName !== "string") {
      throw new Error("obs.sceneName is required for visibility_toggle mode");
    }
  } else if (obs.mode === "image_swap") {
    if (!obs.sourceName || typeof obs.sourceName !== "string") {
      throw new Error("obs.sourceName is required for image_swap mode");
    }
    if (!obs.images || typeof obs.images !== "object") {
      throw new Error("obs.images is required for image_swap mode");
    }
    const images = obs.images as Record<string, unknown>;
    const requiredImages = ["healthy", "scratched", "bloodied", "dying", "unconscious"];
    for (const img of requiredImages) {
      if (!images[img] || typeof images[img] !== "string") {
        throw new Error(`obs.images.${img} is required for image_swap mode`);
      }
    }
  }

  // Validate polling section
  if (!cfg.polling || typeof cfg.polling !== "object") {
    throw new Error("Missing required section: polling");
  }
  const polling = cfg.polling as Record<string, unknown>;
  if (typeof polling.intervalMs !== "number" || polling.intervalMs < 1000) {
    throw new Error("polling.intervalMs must be a number >= 1000");
  }

  // Validate gameLog section if present
  if (cfg.gameLog && typeof cfg.gameLog === "object") {
    const gameLog = cfg.gameLog as Record<string, unknown>;
    if (gameLog.enabled === true) {
      if (!gameLog.gameId || typeof gameLog.gameId !== "string") {
        throw new Error("gameLog.gameId is required when gameLog.enabled is true");
      }
      if (!gameLog.userId || typeof gameLog.userId !== "string") {
        throw new Error("gameLog.userId is required when gameLog.enabled is true");
      }
    }
  }
}

/**
 * Save configuration to config.json
 */
export async function saveJsonConfig(config: JsonConfig): Promise<void> {
  const configPath = path.resolve(process.cwd(), "config.json");

  try {
    const jsonString = JSON.stringify(config, null, 2);
    fs.writeFileSync(configPath, jsonString, "utf-8");
  } catch (error) {
    throw new Error(
      `Failed to save config.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Check if config.json exists in current working directory
 */
export function configExists(): boolean {
  const configPath = path.resolve(process.cwd(), "config.json");
  return fs.existsSync(configPath);
}
