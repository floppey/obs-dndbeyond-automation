/**
 * Type definitions for JSON configuration file structure
 */

/**
 * D&D Beyond configuration section
 */
export interface JsonConfigDndBeyond {
  characterId: string;
  cobaltSession: string;
}

/**
 * Image paths for image_swap mode
 */
export interface JsonConfigImages {
  healthy: string;
  scratched: string;
  bloodied: string;
  dying: string;
  unconscious: string;
}

/**
 * OBS configuration section
 */
export interface JsonConfigObs {
  websocketUrl: string;
  websocketPassword?: string;
  mode: "image_swap" | "visibility_toggle";
  sceneName?: string; // Required for visibility_toggle
  sourceName?: string; // Required for image_swap
  images?: JsonConfigImages; // Required for image_swap
}

/**
 * Polling configuration section
 */
export interface JsonConfigPolling {
  intervalMs: number;
}

/**
 * Stat mapping configuration
 */
export interface JsonConfigStatMapping {
  statId: string;
  obsSourceName: string;
  format?: string;
}

/**
 * Last roll configuration
 */
export interface JsonConfigLastRoll {
  sourceName: string;
  format?: string;
}

/**
 * Roll history configuration
 */
export interface JsonConfigRollHistory {
  sourceName: string;
  format?: string;
  count?: number;
}

/**
 * Game log configuration section
 */
export interface JsonConfigGameLog {
  enabled: boolean;
  gameId?: string;
  userId?: string;
  pollIntervalMs?: number;
  lastRoll?: JsonConfigLastRoll;
  rollHistory?: JsonConfigRollHistory;
}

/**
 * Debug configuration section
 */
export interface JsonConfigDebug {
  saveApiResponse?: boolean;
}

/**
 * Rules engine configuration
 */
export interface JsonConfigRules {
  version: string;
  ruleLists: Array<{
    id: string;
    name: string;
    enabled?: boolean;
    mode: "first_match" | "all_matches";
    rules: Array<{
      id: string;
      name?: string;
      enabled?: boolean;
      condition: unknown; // Complex nested type, validated at runtime
      actions: unknown[]; // Complex type, validated at runtime
      priority?: number;
    }>;
  }>;
}

/**
 * Complete JSON configuration structure
 */
export interface JsonConfig {
  dndBeyond: JsonConfigDndBeyond;
  obs: JsonConfigObs;
  polling: JsonConfigPolling;
  statMappings?: JsonConfigStatMapping[];
  gameLog?: JsonConfigGameLog;
  debug?: JsonConfigDebug;
  rules?: JsonConfigRules;
}
