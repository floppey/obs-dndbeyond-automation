/**
 * Stat calculator orchestrator
 * Calculates stat values and manages OBS text source updates
 */

import { DndBeyondCharacterResponse } from "../types.js";
import { CalculatedStat, ComputedStat, StatId, StatMapping } from "./types.js";
import { statDefinitions, getExpressionVariables } from "./definitions.js";
import { evaluateExpression } from "./expression.js";

/**
 * Calculator for D&D Beyond stats
 */
export class StatCalculator {
  /**
   * Calculate a single stat value
   * @throws Error if stat is unknown
   */
  calculateStat(statId: StatId, data: DndBeyondCharacterResponse): string | number {
    const definition = statDefinitions[statId];
    if (!definition) {
      throw new Error(`Unknown stat: ${statId}`);
    }

    try {
      return definition.calculate(data);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`[STATS] Error calculating stat ${statId}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Calculate all configured stat mappings
   * Returns array of { obsSourceName, value, changed } tuples
   */
  calculateMappings(
    mappings: StatMapping[],
    data: DndBeyondCharacterResponse,
    previousValues?: Map<string, string>
  ): CalculatedStat[] {
    return mappings.map((mapping) => {
      try {
        const rawValue = this.calculateStat(mapping.statId, data);
        let formattedValue = String(rawValue);

        // Apply format if specified
        if (mapping.format) {
          formattedValue = mapping.format.replace("{value}", String(rawValue));
        }

        // Check for change
        const previousValue = previousValues?.get(mapping.obsSourceName);
        const changed = formattedValue !== previousValue;

        return {
          obsSourceName: mapping.obsSourceName,
          value: formattedValue,
          previousValue,
          changed,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(
          `[STATS] Failed to calculate mapping for ${mapping.obsSourceName} (stat: ${mapping.statId}): ${errorMessage}`
        );
        // Return a placeholder value to avoid breaking the array
        return {
          obsSourceName: mapping.obsSourceName,
          value: "ERROR",
          previousValue: previousValues?.get(mapping.obsSourceName),
          changed: true,
        };
      }
    });
  }

  /**
   * Calculate all configured computed stats (arithmetic expressions).
   * Returns the same CalculatedStat shape as calculateMappings, so results
   * can be merged and pushed to OBS identically.
   */
  calculateComputed(
    computed: ComputedStat[],
    data: DndBeyondCharacterResponse,
    previousValues?: Map<string, string>
  ): CalculatedStat[] {
    const variables = getExpressionVariables(data);

    return computed.map((stat) => {
      try {
        const rawValue = evaluateExpression(stat.expression, variables);
        let formattedValue = String(rawValue);

        if (stat.format) {
          formattedValue = stat.format.replace("{value}", String(rawValue));
        }

        const previousValue = previousValues?.get(stat.obsSourceName);
        const changed = formattedValue !== previousValue;

        return {
          obsSourceName: stat.obsSourceName,
          value: formattedValue,
          previousValue,
          changed,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(
          `[STATS] Failed to evaluate computed stat "${stat.id}" (${stat.expression}) for ${stat.obsSourceName}: ${errorMessage}`
        );
        return {
          obsSourceName: stat.obsSourceName,
          value: "ERROR",
          previousValue: previousValues?.get(stat.obsSourceName),
          changed: true,
        };
      }
    });
  }

  /**
   * Get all available stat IDs
   */
  getAvailableStats(): StatId[] {
    return Object.keys(statDefinitions) as StatId[];
  }

  /**
   * Get stat definition by ID
   */
  getStatDefinition(statId: StatId) {
    return statDefinitions[statId];
  }
}
