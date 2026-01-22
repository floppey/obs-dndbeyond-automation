/**
 * Type definitions for D&D Beyond Game Log API
 * Handles dice rolls and related game events
 */

/**
 * Game log message from D&D Beyond API
 */
export interface GameLogMessage {
  id: string;
  dateTime: string;
  gameId: string;
  userId: string;
  data: GameLogRollData;
  entityId: string;
  entityType?: string;
  eventType: string;
}

/**
 * Roll data contained in a game log message
 */
export interface GameLogRollData {
  action: string;
  rolls: DiceRoll[];
  context: RollContext;
  rollId?: string;
  setId?: string;
}

/**
 * Individual dice roll result
 */
export interface DiceRoll {
  diceNotation: DiceNotation;
  rollType: string;  // "check", "save", "to hit", "heal", "roll"
  rollKind: string;  // "advantage", "disadvantage", ""
  result: RollResult;
}

/**
 * Dice notation metadata
 */
export interface DiceNotation {
  set: DiceSet[];
  constant: number;
}

/**
 * Set of dice in notation
 */
export interface DiceSet {
  count: number;
  dieType: string;
  dice: { dieType: string; dieValue: number }[];
  operation: number;
  operand?: number;
}

/**
 * Result of a dice roll
 */
export interface RollResult {
  constant: number;
  values: number[];
  total: number;
  text: string;
}

/**
 * Context information about who made the roll
 */
export interface RollContext {
  entityId: string;
  entityType: string;
  name: string;
  avatarUrl?: string;
  userId: string;
}

/**
 * Response from game log API
 */
export interface GameLogResponse {
  data: GameLogMessage[];
  lastKey?: {
    gameId: string;
    dateTime_eventType_userId: string;
  };
}

/**
 * Parsed roll for display in OBS
 */
export interface ParsedRoll {
  id: string;
  timestamp: number;
  character: string;
  action: string;
  total: number;
  breakdown: string;
  rollType: string;
  rollKind: string;
  dice: string;
  values: string;
}

/**
 * Game log configuration
 */
export interface GameLogConfig {
  enabled: boolean;
  gameId: string;
  userId: string;
  cobaltSession: string;
  pollIntervalMs: number;
  lastRoll?: {
    sourceName: string;
    format: string;
  };
  rollHistory?: {
    sourceName: string;
    format: string;
    count: number;
  };
}
