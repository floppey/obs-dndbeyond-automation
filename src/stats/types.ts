/**
 * Type definitions for D&D Beyond stat calculations and OBS text source mapping
 */

import { DndBeyondCharacterResponse } from "../types.js";

/**
 * Available stat identifiers that can be mapped to OBS text sources
 */
export type StatId =
  | "level"
  | "ac"
  | "hp_current"
  | "hp_max"
  | "hp_temp"
  | "hp_display" // e.g., "72/125"
  | "strength"
  | "strength_mod"
  | "dexterity"
  | "dexterity_mod"
  | "constitution"
  | "constitution_mod"
  | "intelligence"
  | "intelligence_mod"
  | "wisdom"
  | "wisdom_mod"
  | "charisma"
  | "charisma_mod"
  | "proficiency"
  | "passive_perception"
  | "passive_investigation"
  | "passive_insight"
  | "initiative"
  | "speed"
  | "spell_save_dc"
  | "spell_attack";

/**
 * Configuration for a single stat-to-OBS mapping
 */
export interface StatMapping {
  statId: StatId;
  obsSourceName: string;
  format?: string; // Optional format string, e.g., "AC: {value}" or "+{value}"
}

/**
 * Stat definition with calculation function
 */
export interface StatDefinition {
  id: StatId;
  name: string;
  description: string;
  calculate: (data: DndBeyondCharacterResponse) => string | number;
}

/**
 * Result of a stat calculation with previous value for change detection
 */
export interface CalculatedStat {
  obsSourceName: string;
  value: string;
  previousValue?: string;
  changed: boolean;
}
