import { DndBeyondCharacterResponse } from '../types.js';

export function createMockCharacterData(overrides: Partial<DndBeyondCharacterResponse> = {}): DndBeyondCharacterResponse {
  return {
    baseHitPoints: 50,
    bonusHitPoints: null,
    overrideHitPoints: null,
    removedHitPoints: 0,
    temporaryHitPoints: 0,
    stats: [
      { id: 1, name: 'strength', value: 10 },
      { id: 2, name: 'dexterity', value: 14 },
      { id: 3, name: 'constitution', value: 16 },
      { id: 4, name: 'intelligence', value: 12 },
      { id: 5, name: 'wisdom', value: 13 },
      { id: 6, name: 'charisma', value: 8 },
    ],
    bonusStats: [
      { id: 1, name: null, value: null },
      { id: 2, name: null, value: null },
      { id: 3, name: null, value: null },
      { id: 4, name: null, value: null },
      { id: 5, name: null, value: null },
      { id: 6, name: null, value: null },
    ],
    overrideStats: [
      { id: 1, name: null, value: null },
      { id: 2, name: null, value: null },
      { id: 3, name: null, value: null },
      { id: 4, name: null, value: null },
      { id: 5, name: null, value: null },
      { id: 6, name: null, value: null },
    ],
    classes: [{ level: 5 }],
    modifiers: {
      race: [],
      class: [],
      background: [],
      item: [],
      feat: [],
      condition: [],
    },
    deathSaves: { successes: 0, failures: 0 },
    isDead: false,
    characterValues: [],
    inventory: [],
    ...overrides,
  };
}
