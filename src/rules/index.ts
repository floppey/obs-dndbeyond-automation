/**
 * Rules Engine Module
 * 
 * Provides a flexible rule-based system for triggering OBS actions
 * based on D&D Beyond character state.
 * 
 * @module rules
 */

export * from "./types.js";
export { RuleEngine } from "./engine.js";
export { ActionExecutor } from "./executor.js";
