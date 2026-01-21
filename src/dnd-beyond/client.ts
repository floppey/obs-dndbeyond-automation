/**
 * D&D Beyond API client
 * Fetches character data from D&D Beyond's character service
 */

import https from "https";
import fs from "fs";
import {
  DndBeyondCharacterResponse,
  CharacterHpData,
  HpState,
  ClassEntry,
  Modifier,
} from "../types.js";
import { calculateHpState } from "./hp-calculator.js";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Client for fetching character data from D&D Beyond
 */
export class DndBeyondClient {
   private characterId: string;
   private cobaltSession: string;
   private saveApiResponse: boolean;

   constructor(characterId: string, cobaltSession: string, saveApiResponse: boolean = false) {
     this.characterId = characterId;
     this.cobaltSession = cobaltSession;
     this.saveApiResponse = saveApiResponse;
   }

  /**
   * Fetch character data from D&D Beyond API
   * @throws Error if the API request fails or response is invalid
   */
  async fetchCharacter(): Promise<CharacterHpData> {
    const url = `https://character-service.dndbeyond.com/character/v5/character/${this.characterId}`;

    try {
      const response = await this.makeRequest(url);
      return this.parseResponse(response);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch D&D Beyond character: ${errorMessage}`);
    }
  }

  /**
   * Fetch raw character response for stat calculations
   * @throws Error if the API request fails or response is invalid
   */
  async fetchRawCharacter(): Promise<DndBeyondCharacterResponse> {
    const url = `https://character-service.dndbeyond.com/character/v5/character/${this.characterId}`;

    try {
      const response = await this.makeRequest(url);
      return this.parseRawResponse(response);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to fetch D&D Beyond character: ${errorMessage}`);
    }
  }

  /**
   * Make HTTPS request to D&D Beyond API
   */
  private makeRequest(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        headers: {
          Cookie: `cobalt-session=${this.cobaltSession}`,
          "User-Agent": USER_AGENT,
          Accept: "application/json",
          "Accept-Language": "en-US,en;q=0.9",
        },
        timeout: 10000,
      };

      https
        .get(url, options, (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", () => {
            // Check for HTTP errors
            if (res.statusCode && res.statusCode >= 400) {
              if (res.statusCode === 401 || res.statusCode === 403) {
                reject(
                  new Error(
                    `Authentication failed (${res.statusCode}). Check your cobalt-session cookie.`
                  )
                );
              } else if (res.statusCode === 404) {
                reject(
                  new Error(
                    `Character not found (${res.statusCode}). Check your character ID.`
                  )
                );
              } else {
                reject(new Error(`HTTP ${res.statusCode}: ${data}`));
              }
              return;
            }

            resolve(data);
          });
        })
        .on("error", (err) => {
          reject(err);
        })
        .on("timeout", () => {
          reject(new Error("Request timeout after 10 seconds"));
        });
    });
  }

  /**
   * Calculate constitution score from stats and modifiers
   */
  private calculateConstitutionScore(data: DndBeyondCharacterResponse): number {
    // Start with base CON (id: 3)
    let conScore = data.stats[2].value;

    // Add bonus from bonusStats if present
    if (data.bonusStats[2].value !== null) {
      conScore += data.bonusStats[2].value;
    }

    // Use override if present (takes precedence)
    if (data.overrideStats[2].value !== null) {
      conScore = data.overrideStats[2].value;
    }

    // Add modifiers with subType: "constitution-score"
    const constitutionModifiers = this.getConstitutionModifiers(data);
    conScore += constitutionModifiers;

    return conScore;
  }

  /**
   * Get a Set of item definition IDs that are currently active (equipped/attuned and not consumable)
   */
  private getActiveItemIds(data: DndBeyondCharacterResponse): Set<number> {
    const activeIds = new Set<number>();

    if (!data.inventory) return activeIds;

    for (const item of data.inventory) {
      // Skip consumables (potions, scrolls, etc.)
      if (item.definition?.isConsumable) {
        continue;
      }

      // Include if equipped or attuned
      if (item.equipped || item.isAttuned) {
        activeIds.add(item.definition.id);
      }
    }

    return activeIds;
  }

  /**
   * Sum all constitution-score modifiers from all modifier arrays, filtering item modifiers
   */
  private getConstitutionModifiers(
    data: DndBeyondCharacterResponse
  ): number {
    const activeItemIds = this.getActiveItemIds(data);
    let total = 0;

    // Collect all modifiers, filtering item modifiers by active items
    const itemModifiers = data.modifiers.item.filter((mod) => {
      if (typeof mod.componentId === "number") {
        return activeItemIds.has(mod.componentId);
      }
      return true;
    });

    const allModifiers: Modifier[] = [
      ...data.modifiers.race,
      ...data.modifiers.class,
      ...data.modifiers.background,
      ...itemModifiers,
      ...data.modifiers.feat,
      ...data.modifiers.condition,
    ];

    // Sum modifiers with type: "bonus" and subType: "constitution-score"
    for (const modifier of allModifiers) {
      if (
        modifier.type === "bonus" &&
        modifier.subType === "constitution-score"
      ) {
        // Use fixedValue if available, otherwise value
        const val = modifier.fixedValue !== null ? modifier.fixedValue : modifier.value;
        if (val !== null) {
          total += val;
        }
      }
    }

    return total;
  }

  /**
   * Calculate constitution modifier from constitution score
   */
  private calculateConstitutionModifier(conScore: number): number {
    return Math.floor((conScore - 10) / 2);
  }

  /**
   * Get total character level from classes
   */
  private getTotalLevel(classes: ClassEntry[] | ClassEntry): number {
    // Handle both array and single object formats
    if (Array.isArray(classes)) {
      return classes.reduce((sum, classEntry) => sum + classEntry.level, 0);
    } else {
      return classes.level;
    }
  }

  /**
   * Sum all HP bonus modifiers, filtering item modifiers to only active items
   */
  private getHpBonusModifiers(data: DndBeyondCharacterResponse): number {
    const activeItemIds = this.getActiveItemIds(data);
    let total = 0;

    // Collect all modifiers, filtering item modifiers by active items
    const itemModifiers = data.modifiers.item.filter((mod) => {
      if (typeof mod.componentId === "number") {
        return activeItemIds.has(mod.componentId);
      }
      return true;
    });

    const allModifiers: Modifier[] = [
      ...data.modifiers.race,
      ...data.modifiers.class,
      ...data.modifiers.background,
      ...itemModifiers,
      ...data.modifiers.feat,
      ...data.modifiers.condition,
    ];

    // Sum modifiers with type: "bonus" and subType: "hit-points"
    for (const modifier of allModifiers) {
      if (
        modifier.type === "bonus" &&
        modifier.subType === "hit-points" &&
        !modifier.dice  // Skip modifiers with dice (consumable effects)
      ) {
        const val = modifier.fixedValue !== null ? modifier.fixedValue : modifier.value;
        if (val !== null) {
          total += val;
        }
      }
    }

    return total;
  }

  /**
   * Calculate max HP based on D&D Beyond rules
   */
  private calculateMaxHp(data: DndBeyondCharacterResponse): number {
    // If override is set, use it
    if (data.overrideHitPoints !== null) {
      return data.overrideHitPoints;
    }

    // Calculate: base + (CON modifier × total level) + HP bonuses
    const conScore = this.calculateConstitutionScore(data);
    const conModifier = this.calculateConstitutionModifier(conScore);
    const totalLevel = this.getTotalLevel(data.classes);
    const hpBonus = this.getHpBonusModifiers(data);

    const maxHp = data.baseHitPoints + conModifier * totalLevel + hpBonus;
    return Math.max(0, maxHp);
  }

    /**
     * Parse D&D Beyond API response and extract HP data
     */
    private parseResponse(responseBody: string): CharacterHpData {
      // Only save API response if debug setting is enabled
      if (this.saveApiResponse) {
        try {
          const responsePath = "api-response.json";
          const prettyJson = JSON.stringify(JSON.parse(responseBody), null, 2);
          fs.writeFileSync(responsePath, prettyJson);
          console.log(`[DND] API response saved to ${responsePath}`);
        } catch (error) {
          console.warn(
            `[DND] Failed to save API response: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      let apiWrapper: { success?: boolean; data?: DndBeyondCharacterResponse };
      let parsedResponse: DndBeyondCharacterResponse;

      try {
        apiWrapper = JSON.parse(responseBody);
      } catch (error) {
        throw new Error("Failed to parse API response as JSON");
      }

      // Unwrap the data if it's wrapped in an API response envelope
      if (apiWrapper && apiWrapper.data) {
        parsedResponse = apiWrapper.data;
      } else if (apiWrapper && typeof apiWrapper === "object" && "baseHitPoints" in apiWrapper) {
        // If it's already the character data, use it directly
        parsedResponse = apiWrapper as DndBeyondCharacterResponse;
      } else {
        throw new Error("Invalid API response structure: missing character data");
      }

      // Validate required fields
      if (typeof parsedResponse.baseHitPoints !== "number") {
        throw new Error("Missing or invalid baseHitPoints in API response");
      }
      if (!Array.isArray(parsedResponse.stats) || parsedResponse.stats.length < 3) {
        throw new Error("Missing or invalid stats in API response");
      }
      if (!parsedResponse.modifiers) {
        throw new Error("Missing modifiers in API response");
      }
      if (!parsedResponse.classes) {
        throw new Error("Missing classes in API response");
      }

     // Calculate max HP using new logic
     const maxHp = this.calculateMaxHp(parsedResponse);

     // Get current HP (max HP minus damage taken)
     const currentHp = Math.max(0, maxHp - (parsedResponse.removedHitPoints || 0));
     const temporaryHp = parsedResponse.temporaryHitPoints || 0;

     // Calculate HP percentage
     const hpPercentage = maxHp > 0 ? (currentHp / maxHp) * 100 : 0;

     // Determine HP state
     const state = calculateHpState(
       currentHp,
       maxHp,
       parsedResponse.isDead,
       parsedResponse.deathSaves
     );

      return {
        currentHp,
        maxHp,
        temporaryHp,
        hpPercentage,
        state,
        isDead: parsedResponse.isDead || false,
        deathSaves: parsedResponse.deathSaves || { successes: 0, failures: 0 },
      };
    }

   /**
    * Parse D&D Beyond API response and extract raw character data
    */
   private parseRawResponse(responseBody: string): DndBeyondCharacterResponse {
     let apiWrapper: { success?: boolean; data?: DndBeyondCharacterResponse };
     let parsedResponse: DndBeyondCharacterResponse;

     try {
       apiWrapper = JSON.parse(responseBody);
     } catch (error) {
       throw new Error("Failed to parse API response as JSON");
     }

     // Unwrap the data if it's wrapped in an API response envelope
     if (apiWrapper && apiWrapper.data) {
       parsedResponse = apiWrapper.data;
     } else if (
       apiWrapper &&
       typeof apiWrapper === "object" &&
       "baseHitPoints" in apiWrapper
     ) {
       // If it's already the character data, use it directly
       parsedResponse = apiWrapper as DndBeyondCharacterResponse;
     } else {
       throw new Error("Invalid API response structure: missing character data");
     }

     // Validate required fields
     if (typeof parsedResponse.baseHitPoints !== "number") {
       throw new Error("Missing or invalid baseHitPoints in API response");
     }
     if (!Array.isArray(parsedResponse.stats) || parsedResponse.stats.length < 3) {
       throw new Error("Missing or invalid stats in API response");
     }
     if (!parsedResponse.modifiers) {
       throw new Error("Missing modifiers in API response");
     }
     if (!parsedResponse.classes) {
       throw new Error("Missing classes in API response");
     }

     return parsedResponse;
   }
}
