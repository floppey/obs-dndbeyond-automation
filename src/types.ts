/**
 * Type definitions for OBS D&D Beyond HP Swapper
 */

import { StatMapping } from "./stats/types.js";
import { GameLogConfig } from "./game-log/types.js";

/**
 * HP health states mapped from percentage
 */
export enum HpState {
  Healthy = "healthy",      // > 75%
  Scratched = "scratched",  // > 50% && <= 75%
  Bloodied = "bloodied",    // > 25% && <= 50%
  Dying = "dying",          // > 0% && <= 25%
  Unconscious = "unconscious" // 0% or in death saves
}

/**
 * Stat entry in D&D Beyond API
 */
export interface StatEntry {
  id: number;
  name: string | null;
  value: number;
}

/**
 * Modifier from D&D Beyond API
 */
export interface Modifier {
  fixedValue: number | null;
  id: string;
  type: string;
  subType: string;
  value: number | null;
  isGranted?: boolean;
  restriction?: string;
  dice?: {
    diceCount: number | null;
    diceValue: number | null;
    diceMultiplier: number | null;
    fixedValue: number | null;
    diceString: string | null;
  } | null;
  [key: string]: unknown; // Allow additional fields
}

/**
 * Character value override from D&D Beyond API
 * Stores custom character overrides like AC bonuses and speed bonuses
 */
export interface CharacterValue {
  typeId: number;
  value: number | string;
  notes: string | null;
  valueId: string | null;
  valueTypeId: string | null;
  contextId: string | null;
  contextTypeId: string | null;
}

/**
 * Class entry in D&D Beyond API
 */
export interface ClassEntry {
  level: number;
  [key: string]: unknown; // Allow additional fields
}

/**
 * Inventory item from D&D Beyond API
 */
export interface InventoryItem {
  id: number;
  entityTypeId: number;
  definition: {
    id: number;
    name: string;
    isConsumable: boolean;
    canEquip: boolean;
    canAttune: boolean;
    [key: string]: unknown;
  };
  quantity: number;
  isAttuned: boolean;
  equipped: boolean;
  [key: string]: unknown;
}

/**
 * Response from D&D Beyond character API
 */
export interface DndBeyondCharacterResponse {
  baseHitPoints: number;
  bonusHitPoints: number | null;
  overrideHitPoints: number | null;
  removedHitPoints: number;
  temporaryHitPoints: number;
  stats: StatEntry[];
  bonusStats: StatEntry[];
  overrideStats: StatEntry[];
  classes: ClassEntry[] | ClassEntry;
  modifiers: {
    race: Modifier[];
    class: Modifier[];
    background: Modifier[];
    item: Modifier[];
    feat: Modifier[];
    condition: Modifier[];
  };
  deathSaves: {
    successes: number;
    failures: number;
  };
  isDead: boolean;
  characterValues?: CharacterValue[];
  inventory?: InventoryItem[];
  [key: string]: unknown; // Allow additional fields
}

/**
 * Extracted character HP data
 */
export interface CharacterHpData {
  currentHp: number;
  maxHp: number;
  temporaryHp: number;
  hpPercentage: number;
  state: HpState;
  isDead: boolean;
  deathSaves: {
    successes: number;
    failures: number;
  };
}

/**
 * Configuration for OBS operations
 */
export interface OBSClientConfig {
  websocketUrl: string;
  websocketPassword?: string;
  mode: "image_swap" | "visibility_toggle";
  sceneName?: string; // For visibility_toggle mode
  sourceName?: string; // For image_swap mode
  imagePathsByState?: Record<HpState, string>; // For image_swap mode
}

/**
 * Main application configuration
 */
export interface Config {
  dnd: {
    characterId: string;
    cobaltSession: string;
  };
  obs: OBSClientConfig;
  pollIntervalMs: number;
  statMappings: StatMapping[];
  gameLog?: GameLogConfig;
  debug: {
    saveApiResponse: boolean;
  };
}

/**
 * D&D Beyond API client interface
 */
export interface IDndBeyondClient {
  fetchCharacter(): Promise<CharacterHpData>;
}

/**
 * OBS WebSocket client interface
 */
export interface IOBSClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  setImagePath(sourceName: string, imagePath: string): Promise<void>;
  setSourceVisibility(
    sceneName: string,
    itemName: string,
    visible: boolean
  ): Promise<void>;
}

