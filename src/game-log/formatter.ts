/**
 * Formatter for parsed rolls
 * Converts parsed roll data into display strings using format templates
 */

import { ParsedRoll } from "./types.js";

/**
 * Format a single parsed roll using a format string template
 * Available placeholders:
 * - {character}: Character name
 * - {action}: Action name (e.g., "Persuasion", "Attack Roll")
 * - {total}: Total roll value
 * - {breakdown}: Detailed roll breakdown (e.g., "(14,20)+1")
 * - {roll_type}: Roll type (e.g., "check", "to hit")
 * - {roll_kind}: Roll kind (e.g., "advantage", "disadvantage")
 * - {dice}: Dice notation (e.g., "2d20+1")
 * - {values}: Individual die values comma-separated (e.g., "14, 20")
 */
export function formatRoll(roll: ParsedRoll, format: string): string {
  return format
    .replace(/{character}/g, roll.character)
    .replace(/{action}/g, roll.action)
    .replace(/{total}/g, String(roll.total))
    .replace(/{breakdown}/g, roll.breakdown)
    .replace(/{roll_type}/g, roll.rollType)
    .replace(/{roll_kind}/g, roll.rollKind)
    .replace(/{dice}/g, roll.dice)
    .replace(/{values}/g, roll.values);
}

/**
 * Format a list of parsed rolls into a multi-line history string
 * Joins formatted rolls with newlines, showing the most recent first
 */
export function formatRollHistory(
  rolls: ParsedRoll[],
  format: string,
  count: number
): string {
  // Skip the first roll (newest) since it's shown in "Last Roll"
  // Then take the next N rolls for history
  const historyRolls = rolls.slice(1, count + 1);

  // Format each roll
  const formatted = historyRolls.map((roll) => formatRoll(roll, format));

  // Join with newlines
  return formatted.join("\n");
}
