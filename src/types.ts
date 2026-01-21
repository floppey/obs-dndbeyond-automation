/**
 * Type definitions for OBS D&D Beyond HP Swapper
 */

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
  [key: string]: unknown; // Allow additional fields
}

/**
 * Class entry in D&D Beyond API
 */
export interface ClassEntry {
  level: number;
  [key: string]: unknown; // Allow additional fields
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
