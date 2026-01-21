/**
 * Stat definitions for D&D Beyond character stats
 * Each stat includes a calculation function that processes character data
 */

import { DndBeyondCharacterResponse, Modifier } from "../types.js";
import { StatDefinition, StatId } from "./types.js";

/**
 * Get a Set of item definition IDs that are currently active (equipped/attuned and not consumable)
 * @param data Character data containing inventory
 * @returns Set of definition IDs for active items
 */
function getActiveItemIds(data: DndBeyondCharacterResponse): Set<number> {
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
 * Get filtered item modifiers - only from active (equipped/attuned non-consumable) items
 * @param data Character data containing inventory and modifiers
 * @returns Array of active item modifiers
 */
function getActiveItemModifiers(data: DndBeyondCharacterResponse): Modifier[] {
  const activeItemIds = getActiveItemIds(data);

  return data.modifiers.item.filter((mod) => {
    // componentId links to the item definition ID
    if (typeof mod.componentId === "number") {
      return activeItemIds.has(mod.componentId);
    }
    // If no componentId, include it (safety fallback)
    return true;
  });
}

/**
 * Get all modifiers from all sources, filtering item modifiers to only active items
 * @param data Character data
 * @returns Array of all active modifiers
 */
function getAllModifiers(data: DndBeyondCharacterResponse): Modifier[] {
  return [
    ...data.modifiers.race,
    ...data.modifiers.class,
    ...data.modifiers.background,
    ...getActiveItemModifiers(data),
    ...data.modifiers.feat,
    ...data.modifiers.condition,
  ];
}

/**
 * Helper: Get ability score (stat index: STR=0, DEX=1, CON=2, INT=3, WIS=4, CHA=5)
 * Handles base scores, bonuses, overrides, and "set" type modifiers (e.g. Gauntlets of Ogre Power)
 */
function getAbilityScore(
  data: DndBeyondCharacterResponse,
  statIndex: number,
  subType?: string
): number {
  // Construct subType if not provided
  if (!subType) {
    const abilityNames = [
      "strength",
      "dexterity",
      "constitution",
      "intelligence",
      "wisdom",
      "charisma",
    ];
    subType = `${abilityNames[statIndex]}-score`;
  }

  // Start with base stat
  let score = data.stats[statIndex].value;

  // Add bonus stats
  if (data.bonusStats[statIndex]?.value) {
    score += data.bonusStats[statIndex].value;
  }

  // Override takes precedence
  if (data.overrideStats[statIndex]?.value) {
    return data.overrideStats[statIndex].value;
  }

  // Collect all modifiers
  const allModifiers = getAllModifiers(data);

  // First, add all bonus modifiers
  for (const mod of allModifiers) {
    if (
      mod.type === "bonus" &&
      mod.subType === subType &&
      mod.isGranted !== false
    ) {
      const val = mod.fixedValue ?? mod.value;
      if (val !== null) {
        score += val;
      }
    }
  }

  // Then, check for "set" modifiers (like Gauntlets of Ogre Power)
  // These can override the score if conditions are met
  for (const mod of allModifiers) {
    if (
      mod.type === "set" &&
      mod.subType === subType &&
      mod.isGranted !== false
    ) {
      const setValue = mod.fixedValue ?? mod.value;
      if (setValue !== null) {
        // Check if this is a "if not already higher" restriction
        if (mod.restriction?.includes("not already higher")) {
          // Only use SET value if it's higher than current score
          if (setValue > score) {
            score = setValue;
          }
        } else {
          // No restriction or different restriction - use if higher
          // (Most SET effects want to give you the higher value)
          if (setValue > score) {
            score = setValue;
          }
        }
      }
    }
  }

  return score;
}

/**
 * Helper: Calculate ability modifier from ability score
 */
function getAbilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}



/**
 * Helper: Sum modifiers matching type and subType
 */
function sumModifiersByTypeAndSubType(
  data: DndBeyondCharacterResponse,
  type: string,
  subType: string
): number {
  let total = 0;
  const allModifiers = getAllModifiers(data);

  for (const modifier of allModifiers) {
    if (modifier.type === type && modifier.subType === subType) {
      const value =
        modifier.fixedValue !== null ? modifier.fixedValue : modifier.value;
      if (value !== null) {
        total += value;
      }
    }
  }

  return total;
}

/**
 * Helper: Get total character level from classes
 */
function getTotalLevel(
  classes: DndBeyondCharacterResponse["classes"]
): number {
  if (Array.isArray(classes)) {
    return classes.reduce((sum, classEntry) => sum + classEntry.level, 0);
  } else {
    return classes.level;
  }
}

/**
 * Helper: Get proficiency bonus based on level
 */
function getProficiencyBonus(level: number): number {
  if (level <= 4) return 2;
  if (level <= 8) return 3;
  if (level <= 12) return 4;
  if (level <= 16) return 5;
  return 6;
}

/**
 * Helper: Check if character is proficient in a skill
 */
function isProficientInSkill(
  data: DndBeyondCharacterResponse,
  skillSubType: string
): boolean {
  const allModifiers = getAllModifiers(data);
  return allModifiers.some(
    (m) =>
      m.type === "proficiency" &&
      m.subType === skillSubType &&
      m.fixedValue === 1
  );
}

/**
 * Helper: Get spellcasting ability mod (tries WIS, INT, then CHA)
 */
function getSpellcastingModifier(data: DndBeyondCharacterResponse): number {
  // Try to find spellcasting ability from modifiers
  const allModifiers = getAllModifiers(data);

  // Check for explicit spellcasting ability modifiers
  for (const ability of ["wisdom", "intelligence", "charisma"]) {
    const abilityMod = allModifiers.find(
      (m) => m.type === "ability" && m.subType === `${ability}-score`
    );
    if (abilityMod) {
      return getAbilityModifier(getAbilityScore(data, getAbilityIndex(ability)));
    }
  }

  // Default: prefer WIS > INT > CHA
  const wisdomMod = getAbilityModifier(getAbilityScore(data, 4));
  if (wisdomMod >= 0) return wisdomMod;

  const intelligenceMod = getAbilityModifier(
    getAbilityScore(data, 3)
  );
  if (intelligenceMod >= 0) return intelligenceMod;

  return getAbilityModifier(getAbilityScore(data, 5)); // CHA
}

/**
 * Helper: Get ability index by name
 */
function getAbilityIndex(abilityName: string): number {
  const indices: Record<string, number> = {
    strength: 0,
    dexterity: 1,
    constitution: 2,
    intelligence: 3,
    wisdom: 4,
    charisma: 5,
  };
  return indices[abilityName] ?? 0;
}

/**
 * Stat definitions with calculation functions
 */
const definitions: Record<StatId, StatDefinition> = {
  level: {
    id: "level",
    name: "Character Level",
    description: "Total character level (sum of all class levels)",
    calculate: (data) => getTotalLevel(data.classes),
  },

  ac: {
    id: "ac",
    name: "Armor Class",
    description: "Armor class (10 + DEX mod + armor/shield bonuses)",
    calculate: (data) => {
      // Base AC is 10 + DEX modifier
      const dexMod = getAbilityModifier(getAbilityScore(data, 1));
      let ac = 10 + dexMod;

      // Collect all modifiers (filtered to active items)
      const allModifiers = getAllModifiers(data);

      // Add AC bonuses from modifiers
      for (const mod of allModifiers) {
        if (
          mod.type === "bonus" &&
          (mod.subType === "armor-class" ||
            mod.subType === "unarmored-armor-class" ||
            mod.subType === "armored-armor-class") &&
          mod.isGranted !== false
        ) {
          const val = mod.fixedValue ?? mod.value;
          if (val !== null && typeof val === "number") {
            ac += val;
          }
        }
      }

      // Add custom AC bonus from characterValues (typeId 3)
      if (data.characterValues) {
        for (const cv of data.characterValues) {
          if (cv.typeId === 3 && typeof cv.value === "number") {
            ac += cv.value;
          }
        }
      }

      return Math.max(10, ac); // Minimum 10
    },
  },

  hp_current: {
    id: "hp_current",
    name: "Current HP",
    description: "Current hit points",
    calculate: (data) => {
      // Calculate max HP first
      const conScore = getAbilityScore(data, 2);
      const conMod = getAbilityModifier(conScore);
      const totalLevel = getTotalLevel(data.classes);
      const hpBonus = sumModifiersByTypeAndSubType(data, "bonus", "hit-points");

      const maxHp =
        data.baseHitPoints +
        conMod * totalLevel +
        hpBonus +
        (data.bonusHitPoints ?? 0);
      const currentHp = Math.max(0, maxHp - (data.removedHitPoints ?? 0));
      return currentHp;
    },
  },

  hp_max: {
    id: "hp_max",
    name: "Max HP",
    description: "Maximum hit points",
    calculate: (data) => {
      if (data.overrideHitPoints !== null) {
        return data.overrideHitPoints;
      }

      const conScore = getAbilityScore(data, 2);
      const conMod = getAbilityModifier(conScore);
      const totalLevel = getTotalLevel(data.classes);
      const hpBonus = sumModifiersByTypeAndSubType(data, "bonus", "hit-points");

      const maxHp =
        data.baseHitPoints +
        conMod * totalLevel +
        hpBonus +
        (data.bonusHitPoints ?? 0);
      return Math.max(0, maxHp);
    },
  },

  hp_temp: {
    id: "hp_temp",
    name: "Temporary HP",
    description: "Temporary hit points",
    calculate: (data) => data.temporaryHitPoints ?? 0,
  },

  hp_display: {
    id: "hp_display",
    name: "HP Display",
    description: "Formatted HP display (current/max)",
    calculate: (data) => {
      const conScore = getAbilityScore(data, 2);
      const conMod = getAbilityModifier(conScore);
      const totalLevel = getTotalLevel(data.classes);
      const hpBonus = sumModifiersByTypeAndSubType(data, "bonus", "hit-points");

      const maxHp =
        data.baseHitPoints +
        conMod * totalLevel +
        hpBonus +
        (data.bonusHitPoints ?? 0);
      const currentHp = Math.max(0, maxHp - (data.removedHitPoints ?? 0));
      return `${currentHp}/${maxHp}`;
    },
  },

  strength: {
    id: "strength",
    name: "Strength Score",
    description: "Strength ability score",
    calculate: (data) => getAbilityScore(data, 0),
  },

  strength_mod: {
    id: "strength_mod",
    name: "Strength Modifier",
    description: "Strength modifier",
    calculate: (data) => {
      const score = getAbilityScore(data, 0);
      const mod = getAbilityModifier(score);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    },
  },

  dexterity: {
    id: "dexterity",
    name: "Dexterity Score",
    description: "Dexterity ability score",
    calculate: (data) => getAbilityScore(data, 1),
  },

  dexterity_mod: {
    id: "dexterity_mod",
    name: "Dexterity Modifier",
    description: "Dexterity modifier",
    calculate: (data) => {
      const score = getAbilityScore(data, 1);
      const mod = getAbilityModifier(score);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    },
  },

  constitution: {
    id: "constitution",
    name: "Constitution Score",
    description: "Constitution ability score",
    calculate: (data) => getAbilityScore(data, 2),
  },

  constitution_mod: {
    id: "constitution_mod",
    name: "Constitution Modifier",
    description: "Constitution modifier",
    calculate: (data) => {
      const score = getAbilityScore(data, 2);
      const mod = getAbilityModifier(score);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    },
  },

  intelligence: {
    id: "intelligence",
    name: "Intelligence Score",
    description: "Intelligence ability score",
    calculate: (data) => getAbilityScore(data, 3),
  },

  intelligence_mod: {
    id: "intelligence_mod",
    name: "Intelligence Modifier",
    description: "Intelligence modifier",
    calculate: (data) => {
      const score = getAbilityScore(data, 3);
      const mod = getAbilityModifier(score);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    },
  },

  wisdom: {
    id: "wisdom",
    name: "Wisdom Score",
    description: "Wisdom ability score",
    calculate: (data) => getAbilityScore(data, 4),
  },

  wisdom_mod: {
    id: "wisdom_mod",
    name: "Wisdom Modifier",
    description: "Wisdom modifier",
    calculate: (data) => {
      const score = getAbilityScore(data, 4);
      const mod = getAbilityModifier(score);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    },
  },

  charisma: {
    id: "charisma",
    name: "Charisma Score",
    description: "Charisma ability score",
    calculate: (data) => getAbilityScore(data, 5),
  },

  charisma_mod: {
    id: "charisma_mod",
    name: "Charisma Modifier",
    description: "Charisma modifier",
    calculate: (data) => {
      const score = getAbilityScore(data, 5);
      const mod = getAbilityModifier(score);
      return mod >= 0 ? `+${mod}` : `${mod}`;
    },
  },

  proficiency: {
    id: "proficiency",
    name: "Proficiency Bonus",
    description: "Proficiency bonus (based on character level)",
    calculate: (data) => {
      const level = getTotalLevel(data.classes);
      return `+${getProficiencyBonus(level)}`;
    },
  },

  passive_perception: {
    id: "passive_perception",
    name: "Passive Perception",
    description: "Passive perception (10 + WIS mod + proficiency if applicable)",
    calculate: (data) => {
      const wisdomScore = getAbilityScore(data, 4);
      const wisMod = getAbilityModifier(wisdomScore);
      let passivePerception = 10 + wisMod;

      // Add proficiency if proficient in Perception
      if (isProficientInSkill(data, "perception")) {
        const level = getTotalLevel(data.classes);
        passivePerception += getProficiencyBonus(level);
      }

      // Add passive-perception bonuses from modifiers
      const passiveBonus = sumModifiersByTypeAndSubType(
        data,
        "bonus",
        "passive-perception"
      );
      passivePerception += passiveBonus;

      return passivePerception;
    },
  },

  passive_investigation: {
    id: "passive_investigation",
    name: "Passive Investigation",
    description:
      "Passive investigation (10 + INT mod + proficiency if applicable)",
    calculate: (data) => {
      const intelligenceScore = getAbilityScore(data, 3);
      const intMod = getAbilityModifier(intelligenceScore);
      let passiveInvestigation = 10 + intMod;

      // Add proficiency if proficient in Investigation
      if (isProficientInSkill(data, "investigation")) {
        const level = getTotalLevel(data.classes);
        passiveInvestigation += getProficiencyBonus(level);
      }

      // Add passive-investigation bonuses from modifiers
      const passiveBonus = sumModifiersByTypeAndSubType(
        data,
        "bonus",
        "passive-investigation"
      );
      passiveInvestigation += passiveBonus;

      return passiveInvestigation;
    },
  },

  passive_insight: {
    id: "passive_insight",
    name: "Passive Insight",
    description: "Passive insight (10 + WIS mod + proficiency if applicable)",
    calculate: (data) => {
      const wisdomScore = getAbilityScore(data, 4);
      const wisMod = getAbilityModifier(wisdomScore);
      let passiveInsight = 10 + wisMod;

      // Add proficiency if proficient in Insight
      if (isProficientInSkill(data, "insight")) {
        const level = getTotalLevel(data.classes);
        passiveInsight += getProficiencyBonus(level);
      }

      // Add passive-insight bonuses from modifiers
      const passiveBonus = sumModifiersByTypeAndSubType(
        data,
        "bonus",
        "passive-insight"
      );
      passiveInsight += passiveBonus;

      return passiveInsight;
    },
  },

  initiative: {
    id: "initiative",
    name: "Initiative",
    description: "Initiative bonus (DEX mod + bonuses)",
    calculate: (data) => {
      const dexScore = getAbilityScore(data, 1);
      const dexMod = getAbilityModifier(dexScore);

      // Add initiative bonuses from modifiers
      const initiativeBonus = sumModifiersByTypeAndSubType(
        data,
        "bonus",
        "initiative"
      );

      const total = dexMod + initiativeBonus;
      return total >= 0 ? `+${total}` : `${total}`;
    },
  },

  speed: {
    id: "speed",
    name: "Speed",
    description: "Movement speed in feet (base 30 + modifiers)",
    calculate: (data) => {
      let speed = 30;

      // Add speed modifiers
      const speedBonus = sumModifiersByTypeAndSubType(data, "bonus", "speed");
      speed += speedBonus;

      // Add custom speed bonus from characterValues (typeId 2)
      if (data.characterValues) {
        for (const cv of data.characterValues) {
          if (cv.typeId === 2 && typeof cv.value === "number") {
            speed += cv.value;
          }
        }
      }

      return `${speed} ft.`;
    },
  },

  spell_save_dc: {
    id: "spell_save_dc",
    name: "Spell Save DC",
    description: "Spell save DC (8 + proficiency + spellcasting ability mod)",
    calculate: (data) => {
      const level = getTotalLevel(data.classes);
      const profBonus = getProficiencyBonus(level);
      const spellMod = getSpellcastingModifier(data);

      return 8 + profBonus + spellMod;
    },
  },

  spell_attack: {
    id: "spell_attack",
    name: "Spell Attack",
    description: "Spell attack modifier (proficiency + spellcasting ability mod)",
    calculate: (data) => {
      const level = getTotalLevel(data.classes);
      const profBonus = getProficiencyBonus(level);
      const spellMod = getSpellcastingModifier(data);

      const total = profBonus + spellMod;
      return total >= 0 ? `+${total}` : `${total}`;
    },
  },
};

/**
 * Export the stat definitions map
 */
export const statDefinitions: Record<StatId, StatDefinition> = definitions;

// Export helpers for testing
export {
  getActiveItemIds,
  getActiveItemModifiers,
  getAllModifiers,
  getAbilityScore,
  getAbilityModifier,
  sumModifiersByTypeAndSubType,
  getTotalLevel,
  getProficiencyBonus,
  isProficientInSkill,
};

