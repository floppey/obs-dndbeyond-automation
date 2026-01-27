/**
 * Tests for stat definition helper functions
 */

import { describe, it, expect } from 'vitest';
import {
  getAbilityModifier,
  getProficiencyBonus,
  getTotalLevel,
  getActiveItemIds,
  getAbilityScore,
  isWearingArmor,
  statDefinitions,
} from '../stats/definitions.js';
import { createMockCharacterData } from '../__fixtures__/character-data.js';
import { DndBeyondCharacterResponse } from '../types.js';

describe('getAbilityModifier', () => {
  it('should return 0 for ability score 10', () => {
    expect(getAbilityModifier(10)).toBe(0);
  });

  it('should return -1 for ability score 8', () => {
    expect(getAbilityModifier(8)).toBe(-1);
  });

  it('should return +5 for ability score 20', () => {
    expect(getAbilityModifier(20)).toBe(5);
  });

  it('should return -5 for ability score 1', () => {
    expect(getAbilityModifier(1)).toBe(-5);
  });

  it('should return +1 for ability score 12', () => {
    expect(getAbilityModifier(12)).toBe(1);
  });

  it('should return +2 for ability score 14', () => {
    expect(getAbilityModifier(14)).toBe(2);
  });
});

describe('getProficiencyBonus', () => {
  it('should return +2 for level 1', () => {
    expect(getProficiencyBonus(1)).toBe(2);
  });

  it('should return +2 for level 4', () => {
    expect(getProficiencyBonus(4)).toBe(2);
  });

  it('should return +3 for level 5', () => {
    expect(getProficiencyBonus(5)).toBe(3);
  });

  it('should return +3 for level 8', () => {
    expect(getProficiencyBonus(8)).toBe(3);
  });

  it('should return +4 for level 9', () => {
    expect(getProficiencyBonus(9)).toBe(4);
  });

  it('should return +4 for level 12', () => {
    expect(getProficiencyBonus(12)).toBe(4);
  });

  it('should return +5 for level 13', () => {
    expect(getProficiencyBonus(13)).toBe(5);
  });

  it('should return +5 for level 16', () => {
    expect(getProficiencyBonus(16)).toBe(5);
  });

  it('should return +6 for level 17', () => {
    expect(getProficiencyBonus(17)).toBe(6);
  });

  it('should return +6 for level 20', () => {
    expect(getProficiencyBonus(20)).toBe(6);
  });
});

describe('getTotalLevel', () => {
  it('should return 5 for single class { level: 5 }', () => {
    const result = getTotalLevel({ level: 5 });
    expect(result).toBe(5);
  });

  it('should return 8 for array of classes [{ level: 5 }, { level: 3 }]', () => {
    const result = getTotalLevel([{ level: 5 }, { level: 3 }]);
    expect(result).toBe(8);
  });

  it('should return 0 for empty array', () => {
    const result = getTotalLevel([]);
    expect(result).toBe(0);
  });

  it('should handle multiple multiclass levels', () => {
    const result = getTotalLevel([
      { level: 3 },
      { level: 4 },
      { level: 2 },
    ]);
    expect(result).toBe(9);
  });
});

describe('getActiveItemIds', () => {
  it('should return empty Set for empty inventory', () => {
    const data = createMockCharacterData({ inventory: [] });
    const ids = getActiveItemIds(data);
    expect(ids.size).toBe(0);
  });

  it('should not include consumable items even if equipped', () => {
    const data = createMockCharacterData({
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: { id: 100, name: 'Potion', isConsumable: true, canEquip: false, canAttune: false },
          quantity: 1,
          isAttuned: false,
          equipped: true,
        },
      ],
    });
    const ids = getActiveItemIds(data);
    expect(ids.size).toBe(0);
  });

  it('should include non-consumable equipped items', () => {
    const data = createMockCharacterData({
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: { id: 100, name: 'Sword', isConsumable: false, canEquip: true, canAttune: false },
          quantity: 1,
          isAttuned: false,
          equipped: true,
        },
      ],
    });
    const ids = getActiveItemIds(data);
    expect(ids.has(100)).toBe(true);
  });

  it('should include non-consumable attuned items', () => {
    const data = createMockCharacterData({
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: { id: 101, name: 'Ring of Protection', isConsumable: false, canEquip: true, canAttune: true },
          quantity: 1,
          isAttuned: true,
          equipped: false,
        },
      ],
    });
    const ids = getActiveItemIds(data);
    expect(ids.has(101)).toBe(true);
  });

  it('should not include non-consumable items that are neither equipped nor attuned', () => {
    const data = createMockCharacterData({
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: { id: 102, name: 'Sword', isConsumable: false, canEquip: true, canAttune: false },
          quantity: 1,
          isAttuned: false,
          equipped: false,
        },
      ],
    });
    const ids = getActiveItemIds(data);
    expect(ids.has(102)).toBe(false);
  });
});

describe('getAbilityScore', () => {
  it('should calculate base score only', () => {
    const data = createMockCharacterData();
    // STR is 10 by default in mock
    const score = getAbilityScore(data, 0);
    expect(score).toBe(10);
  });

  it('should add bonus stats to base score', () => {
    const data = createMockCharacterData({
      stats: [{ id: 1, name: 'strength', value: 10 }],
      bonusStats: [{ id: 1, name: null, value: 2 }],
    });
    const score = getAbilityScore(data, 0);
    expect(score).toBe(12);
  });

  it('should use override stats instead of base + bonuses', () => {
    const data = createMockCharacterData({
      stats: [{ id: 1, name: 'strength', value: 10 }],
      bonusStats: [{ id: 1, name: null, value: 2 }],
      overrideStats: [{ id: 1, name: null, value: 15 }],
    });
    const score = getAbilityScore(data, 0);
    expect(score).toBe(15);
  });

  it('should add bonus modifiers to score', () => {
    const data = createMockCharacterData({
      stats: [{ id: 1, name: 'strength', value: 10 }],
      modifiers: {
        race: [{ fixedValue: 2, id: 'm1', type: 'bonus', subType: 'strength-score', value: null }],
        class: [],
        background: [],
        item: [],
        feat: [],
        condition: [],
      },
    });
    const score = getAbilityScore(data, 0);
    expect(score).toBe(12);
  });

  it('should apply SET modifier if value is higher than current score', () => {
    const data = createMockCharacterData({
      stats: [{ id: 1, name: 'strength', value: 10 }],
      modifiers: {
        race: [],
        class: [],
        background: [],
        item: [{ fixedValue: 19, id: 'm1', type: 'set', subType: 'strength-score', value: null, restriction: 'not already higher' }],
        feat: [],
        condition: [],
      },
    });
    const score = getAbilityScore(data, 0);
    expect(score).toBe(19);
  });

  it('should ignore SET modifier if value is lower with "not already higher" restriction', () => {
    const data = createMockCharacterData({
      stats: [{ id: 1, name: 'strength', value: 18 }],
      modifiers: {
        race: [],
        class: [],
        background: [],
        item: [{ fixedValue: 15, id: 'm1', type: 'set', subType: 'strength-score', value: null, restriction: 'not already higher' }],
        feat: [],
        condition: [],
      },
    });
    const score = getAbilityScore(data, 0);
    expect(score).toBe(18);
  });
});

describe('statDefinitions.ac.calculate', () => {
  it('should calculate base 10 + DEX mod', () => {
    const data = createMockCharacterData({
      stats: [
        { id: 1, name: 'strength', value: 10 },
        { id: 2, name: 'dexterity', value: 14 }, // +2 modifier
      ],
    });
    const ac = statDefinitions.ac.calculate(data);
    expect(ac).toBe(12); // 10 + 2
  });

  it('should add armor-class bonus modifiers', () => {
    const data = createMockCharacterData({
      stats: [
        { id: 1, name: 'strength', value: 10 },
        { id: 2, name: 'dexterity', value: 14 }, // +2 modifier
      ],
      modifiers: {
        race: [],
        class: [],
        background: [],
        item: [{ fixedValue: 1, id: 'm1', type: 'bonus', subType: 'armor-class', value: null }],
        feat: [],
        condition: [],
      },
    });
    const ac = statDefinitions.ac.calculate(data);
    expect(ac).toBe(13); // 10 + 2 + 1
  });

  it('should add custom AC bonus from characterValues typeId 3', () => {
    const data = createMockCharacterData({
      stats: [
        { id: 1, name: 'strength', value: 10 },
        { id: 2, name: 'dexterity', value: 14 }, // +2 modifier
      ],
      characterValues: [
        { typeId: 3, value: 2, notes: null, valueId: null, valueTypeId: null, contextId: null, contextTypeId: null },
      ],
    });
    const ac = statDefinitions.ac.calculate(data);
    expect(ac).toBe(14); // 10 + 2 + 2
  });

  it('should enforce minimum AC of 10', () => {
    const data = createMockCharacterData({
      stats: [
        { id: 1, name: 'strength', value: 10 },
        { id: 2, name: 'dexterity', value: 3 }, // -4 modifier
      ],
      modifiers: {
        race: [],
        class: [],
        background: [],
        item: [],
        feat: [],
        condition: [],
      },
    });
    const ac = statDefinitions.ac.calculate(data);
    expect(ac).toBe(10); // 10 + (-4) = 6, but minimum is 10
  });

  it('should add unarmored-armor-class bonuses even with no armor', () => {
    const data = createMockCharacterData({
      stats: [
        { id: 1, name: 'strength', value: 10 },
        { id: 2, name: 'dexterity', value: 14 }, // +2 modifier
      ],
      modifiers: {
        race: [],
        class: [],
        background: [],
        item: [{ fixedValue: 2, id: 'm1', type: 'bonus', subType: 'unarmored-armor-class', value: null }],
        feat: [],
        condition: [],
      },
      inventory: [],
    });
    const ac = statDefinitions.ac.calculate(data);
    expect(ac).toBe(14); // 10 + 2 + 2 (from unarmored-armor-class bonus)
  });

  it('should add armored-armor-class bonus when wearing armor', () => {
    const data = createMockCharacterData({
      stats: [
        { id: 1, name: 'strength', value: 10 },
        { id: 2, name: 'dexterity', value: 14 }, // +2 modifier
      ],
      modifiers: {
        race: [],
        class: [],
        background: [],
        item: [{ fixedValue: 1, id: 'm1', type: 'bonus', subType: 'armored-armor-class', value: null }],
        feat: [],
        condition: [],
      },
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: {
            id: 200,
            name: 'Leather Armor',
            isConsumable: false,
            canEquip: true,
            canAttune: false,
            armorTypeId: 1, // This is armor
          },
          quantity: 1,
          isAttuned: false,
          equipped: true,
        },
      ],
    });
    const ac = statDefinitions.ac.calculate(data);
    expect(ac).toBe(13); // 10 + 2 + 1 (from armored-armor-class bonus)
  });

  it('should NOT add armored-armor-class bonus when not wearing armor', () => {
    const data = createMockCharacterData({
      stats: [
        { id: 1, name: 'strength', value: 10 },
        { id: 2, name: 'dexterity', value: 14 }, // +2 modifier
      ],
      modifiers: {
        race: [],
        class: [],
        background: [],
        item: [{ fixedValue: 1, id: 'm1', type: 'bonus', subType: 'armored-armor-class', value: null }],
        feat: [],
        condition: [],
      },
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: {
            id: 300,
            name: 'Bracers of Defense',
            isConsumable: false,
            canEquip: true,
            canAttune: true,
            armorTypeId: null, // This is NOT armor
          },
          quantity: 1,
          isAttuned: true,
          equipped: true,
        },
      ],
    });
    const ac = statDefinitions.ac.calculate(data);
    expect(ac).toBe(12); // 10 + 2 (NO armored-armor-class bonus since not wearing armor)
  });

  it('should handle AC override (characterValues typeId 1)', () => {
    const data = createMockCharacterData({
      stats: [
        { id: 1, name: 'strength', value: 10 },
        { id: 2, name: 'dexterity', value: 14 }, // +2 modifier
      ],
      characterValues: [
        { typeId: 1, value: 20, notes: null, valueId: null, valueTypeId: null, contextId: null, contextTypeId: null },
      ],
    });
    const ac = statDefinitions.ac.calculate(data);
    expect(ac).toBe(20); // Overridden to 20, ignoring all calculations
  });
});

describe('isWearingArmor', () => {
  it('should return false with empty inventory', () => {
    const data = createMockCharacterData({ inventory: [] });
    expect(isWearingArmor(data)).toBe(false);
  });

  it('should return false with no inventory', () => {
    const data = createMockCharacterData({ inventory: undefined });
    expect(isWearingArmor(data)).toBe(false);
  });

  it('should return false with unequipped armor', () => {
    const data = createMockCharacterData({
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: {
            id: 100,
            name: 'Leather Armor',
            isConsumable: false,
            canEquip: true,
            canAttune: false,
            armorTypeId: 1, // Is armor
          },
          quantity: 1,
          isAttuned: false,
          equipped: false, // But not equipped
        },
      ],
    });
    expect(isWearingArmor(data)).toBe(false);
  });

  it('should return true with equipped armor', () => {
    const data = createMockCharacterData({
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: {
            id: 100,
            name: 'Plate Armor',
            isConsumable: false,
            canEquip: true,
            canAttune: false,
            armorTypeId: 5, // Is armor
          },
          quantity: 1,
          isAttuned: false,
          equipped: true,
        },
      ],
    });
    expect(isWearingArmor(data)).toBe(true);
  });

  it('should return false with Bracers of Defense (no armorTypeId)', () => {
    const data = createMockCharacterData({
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: {
            id: 300,
            name: 'Bracers of Defense',
            isConsumable: false,
            canEquip: true,
            canAttune: true,
            armorTypeId: null, // Not armor
          },
          quantity: 1,
          isAttuned: true,
          equipped: true,
        },
      ],
    });
    expect(isWearingArmor(data)).toBe(false);
  });

  it('should return true with multiple items but only armor counts', () => {
    const data = createMockCharacterData({
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: {
            id: 200,
            name: 'Sword',
            isConsumable: false,
            canEquip: true,
            canAttune: false,
            armorTypeId: null, // Not armor
          },
          quantity: 1,
          isAttuned: false,
          equipped: true,
        },
        {
          id: 2,
          entityTypeId: 1,
          definition: {
            id: 201,
            name: 'Shield',
            isConsumable: false,
            canEquip: true,
            canAttune: false,
            armorTypeId: null, // Not armor (shields are separate)
          },
          quantity: 1,
          isAttuned: false,
          equipped: true,
        },
        {
          id: 3,
          entityTypeId: 1,
          definition: {
            id: 202,
            name: 'Chain Mail',
            isConsumable: false,
            canEquip: true,
            canAttune: false,
            armorTypeId: 3, // IS armor
          },
          quantity: 1,
          isAttuned: false,
          equipped: true,
        },
      ],
    });
    expect(isWearingArmor(data)).toBe(true);
  });

  it('should return false with equipped non-armor items', () => {
    const data = createMockCharacterData({
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: {
            id: 200,
            name: 'Sword',
            isConsumable: false,
            canEquip: true,
            canAttune: false,
            armorTypeId: null,
          },
          quantity: 1,
          isAttuned: false,
          equipped: true,
        },
        {
          id: 2,
          entityTypeId: 1,
          definition: {
            id: 201,
            name: 'Ring of Protection',
            isConsumable: false,
            canEquip: true,
            canAttune: true,
            armorTypeId: null,
          },
          quantity: 1,
          isAttuned: true,
          equipped: false,
        },
      ],
    });
    expect(isWearingArmor(data)).toBe(false);
  });

  it('should work with Defense fighting style: apply only when wearing armor', () => {
    // Scenario 1: Unarmored with Bracers of Defense
    const unarmoredData = createMockCharacterData({
      stats: [
        { id: 1, name: 'strength', value: 10 },
        { id: 2, name: 'dexterity', value: 14 }, // +2 modifier
      ],
      modifiers: {
        race: [],
        class: [{ fixedValue: 1, id: 'defense-1', type: 'bonus', subType: 'armored-armor-class', value: null }],
        background: [],
        item: [{ fixedValue: 2, id: 'bracers-1', type: 'bonus', subType: 'unarmored-armor-class', value: null }],
        feat: [],
        condition: [],
      },
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: {
            id: 300,
            name: 'Bracers of Defense',
            isConsumable: false,
            canEquip: true,
            canAttune: true,
            armorTypeId: null, // No armor
          },
          quantity: 1,
          isAttuned: true,
          equipped: true,
        },
      ],
    });
    const unarmoredAC = statDefinitions.ac.calculate(unarmoredData);
    expect(unarmoredAC).toBe(14); // 10 + 2 + 2 (bracers), NOT the +1 defense bonus

    // Scenario 2: Armored with Defense fighting style
    const armoredData = createMockCharacterData({
      stats: [
        { id: 1, name: 'strength', value: 10 },
        { id: 2, name: 'dexterity', value: 14 }, // +2 modifier
      ],
      modifiers: {
        race: [],
        class: [{ fixedValue: 1, id: 'defense-1', type: 'bonus', subType: 'armored-armor-class', value: null }],
        background: [],
        item: [],
        feat: [],
        condition: [],
      },
      inventory: [
        {
          id: 1,
          entityTypeId: 1,
          definition: {
            id: 400,
            name: 'Chain Mail',
            isConsumable: false,
            canEquip: true,
            canAttune: false,
            armorTypeId: 3, // Is armor
          },
          quantity: 1,
          isAttuned: false,
          equipped: true,
        },
      ],
    });
    const armoredAC = statDefinitions.ac.calculate(armoredData);
    expect(armoredAC).toBe(13); // 10 + 2 + 1 (defense bonus), dex mod NOT added (armor sets its own AC)
  });
});
