/**
 * Comprehensive unit tests for the Action Executor
 *
 * Tests the complete action execution system including:
 * - Single and multiple action execution
 * - All action types (set_image, set_visibility, set_text, set_filter_visibility, set_input_settings)
 * - Variable interpolation (HP-related placeholders)
 * - Error handling and recovery
 * - Logging behavior
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActionExecutor } from './executor.js';
import {
  EvaluationContext,
  RuleAction,
  SetImageAction,
  SetVisibilityAction,
  SetTextAction,
  SetFilterVisibilityAction,
  SetInputSettingsAction,
} from './types.js';
import { DndBeyondCharacterResponse } from '../types.js';

// ============================================================================
// MOCK SETUP
// ============================================================================

/**
 * Create a minimal mock D&D Beyond character response
 */
function createMockCharacter(
  overrides?: Partial<DndBeyondCharacterResponse>
): DndBeyondCharacterResponse {
  return {
    baseHitPoints: 100,
    bonusHitPoints: null,
    overrideHitPoints: null,
    removedHitPoints: 0,
    temporaryHitPoints: 0,
    stats: [
      { id: 1, name: 'Strength', value: 14 },
      { id: 2, name: 'Dexterity', value: 16 },
      { id: 3, name: 'Constitution', value: 13 },
      { id: 4, name: 'Intelligence', value: 10 },
      { id: 5, name: 'Wisdom', value: 12 },
      { id: 6, name: 'Charisma', value: 8 },
    ],
    bonusStats: [],
    overrideStats: [],
    classes: [
      { level: 5 },
    ],
    modifiers: {
      race: [],
      class: [],
      background: [],
      item: [],
      feat: [],
      condition: [],
    },
    deathSaves: {
      successes: 0,
      failures: 0,
    },
    isDead: false,
    inventory: [],
    ...overrides,
  };
}

/**
 * Create an evaluation context with sensible defaults
 */
function createContext(
  overrides?: Partial<EvaluationContext>
): EvaluationContext {
  return {
    character: createMockCharacter(),
    currentHp: 50,
    maxHp: 100,
    temporaryHp: 5,
    hpPercentage: 50,
    isDead: false,
    deathSaves: { successes: 0, failures: 0 },
    timestamp: Date.now(),
    ...overrides,
  };
}

/**
 * Create a mock OBS client with all required methods
 */
function createMockObsClient() {
  return {
    setImagePath: vi.fn().mockResolvedValue(undefined),
    setSourceVisibility: vi.fn().mockResolvedValue(undefined),
    setText: vi.fn().mockResolvedValue(undefined),
    obs: {
      call: vi.fn().mockResolvedValue(undefined),
    },
  };
}

// ============================================================================
// TEST SUITES
// ============================================================================

describe('ActionExecutor', () => {
  let mockObsClient: any;
  let context: EvaluationContext;
  let executor: ActionExecutor;
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    mockObsClient = createMockObsClient();
    context = createContext();
    executor = new ActionExecutor(mockObsClient, context);
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  // ==========================================================================
  // EXECUTE ACTIONS - BASIC BEHAVIOR
  // ==========================================================================

  describe('executeActions', () => {
    it('should do nothing when given empty actions array', async () => {
      const actions: RuleAction[] = [];
      await executor.executeActions(actions);

      expect(consoleLogSpy).not.toHaveBeenCalled();
    });

    it('should log action count when executing actions', async () => {
      const actions: SetImageAction[] = [
        { type: 'set_image', sourceName: 'source1', imagePath: '/path/to/image.png' },
        { type: 'set_image', sourceName: 'source2', imagePath: '/path/to/image2.png' },
      ];

      await executor.executeActions(actions);

      expect(consoleLogSpy).toHaveBeenCalledWith('[ACTIONS] Executing 2 action(s)');
    });

    it('should execute all actions in sequence', async () => {
      const actions: SetImageAction[] = [
        { type: 'set_image', sourceName: 'source1', imagePath: '/path/1.png' },
        { type: 'set_image', sourceName: 'source2', imagePath: '/path/2.png' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setImagePath).toHaveBeenCalledTimes(2);
      expect(mockObsClient.setImagePath).toHaveBeenNthCalledWith(1, 'source1', '/path/1.png');
      expect(mockObsClient.setImagePath).toHaveBeenNthCalledWith(2, 'source2', '/path/2.png');
    });

    it('should continue executing after action failure', async () => {
      const actions: SetImageAction[] = [
        { type: 'set_image', sourceName: 'source1', imagePath: '/path/1.png' },
        { type: 'set_image', sourceName: 'source2', imagePath: '/path/2.png' },
        { type: 'set_image', sourceName: 'source3', imagePath: '/path/3.png' },
      ];

      // Make second action fail
      mockObsClient.setImagePath.mockRejectedValueOnce(new Error('OBS Connection failed'));

      await executor.executeActions(actions);

      // Should have attempted all three
      expect(mockObsClient.setImagePath).toHaveBeenCalledTimes(3);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ACTIONS] Error executing action: OBS Connection failed'
      );
    });
  });

  // ==========================================================================
  // SET_IMAGE ACTIONS
  // ==========================================================================

  describe('set_image action', () => {
    it('should call setImagePath with source name and path', async () => {
      const actions: SetImageAction[] = [
        { type: 'set_image', sourceName: 'Character HP', imagePath: '/images/healthy.png' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setImagePath).toHaveBeenCalledWith('Character HP', '/images/healthy.png');
    });

    it('should interpolate variables in image path', async () => {
      const actions: SetImageAction[] = [
        { type: 'set_image', sourceName: 'HP Indicator', imagePath: '/images/hp_{hp_percentage}.png' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setImagePath).toHaveBeenCalledWith('HP Indicator', '/images/hp_50.png');
    });

    it('should handle missing image paths gracefully', async () => {
      mockObsClient.setImagePath.mockRejectedValueOnce(new Error('File not found'));

      const actions: SetImageAction[] = [
        { type: 'set_image', sourceName: 'Missing', imagePath: '/nonexistent.png' },
      ];

      await executor.executeActions(actions);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ACTIONS] Error executing action: File not found'
      );
    });
  });

  // ==========================================================================
  // SET_VISIBILITY ACTIONS
  // ==========================================================================

  describe('set_visibility action', () => {
    it('should call setSourceVisibility to show item', async () => {
      const actions: SetVisibilityAction[] = [
        { type: 'set_visibility', sceneName: 'Main', itemName: 'Bloodied Overlay', visible: true },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setSourceVisibility).toHaveBeenCalledWith(
        'Main',
        'Bloodied Overlay',
        true
      );
    });

    it('should call setSourceVisibility to hide item', async () => {
      const actions: SetVisibilityAction[] = [
        { type: 'set_visibility', sceneName: 'Main', itemName: 'Dead Overlay', visible: false },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setSourceVisibility).toHaveBeenCalledWith(
        'Main',
        'Dead Overlay',
        false
      );
    });

    it('should handle multiple visibility changes', async () => {
      const actions: SetVisibilityAction[] = [
        { type: 'set_visibility', sceneName: 'Main', itemName: 'Overlay1', visible: true },
        { type: 'set_visibility', sceneName: 'Main', itemName: 'Overlay2', visible: false },
        { type: 'set_visibility', sceneName: 'Battle', itemName: 'Overlay3', visible: true },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setSourceVisibility).toHaveBeenCalledTimes(3);
      expect(mockObsClient.setSourceVisibility).toHaveBeenNthCalledWith(1, 'Main', 'Overlay1', true);
      expect(mockObsClient.setSourceVisibility).toHaveBeenNthCalledWith(2, 'Main', 'Overlay2', false);
      expect(mockObsClient.setSourceVisibility).toHaveBeenNthCalledWith(3, 'Battle', 'Overlay3', true);
    });
  });

  // ==========================================================================
  // SET_TEXT ACTIONS
  // ==========================================================================

  describe('set_text action', () => {
    it('should call setText with source name and text', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: 'Health is good' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', 'Health is good');
    });

    it('should interpolate {hp_current} variable', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: 'Current HP: {hp_current}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', 'Current HP: 50');
    });

    it('should interpolate {current_hp} variable (alias)', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: 'HP: {current_hp}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', 'HP: 50');
    });

    it('should interpolate {hp_max} variable', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: 'Max HP: {hp_max}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', 'Max HP: 100');
    });

    it('should interpolate {max_hp} variable (alias)', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: 'Max: {max_hp}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', 'Max: 100');
    });

    it('should interpolate {hp_temp} variable', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: 'Temp HP: {hp_temp}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', 'Temp HP: 5');
    });

    it('should interpolate {temp_hp} variable (alias)', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: 'Temporary: {temp_hp}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', 'Temporary: 5');
    });

    it('should interpolate {hp_percentage} variable', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: 'Health: {hp_percentage}%' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', 'Health: 50%');
    });

    it('should interpolate {hp_percent} variable (alias)', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: '{hp_percent}% HP' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', '50% HP');
    });

    it('should round hp_percentage to nearest integer', async () => {
      // Create context with 33.33% HP
      executor = new ActionExecutor(
        mockObsClient,
        createContext({ currentHp: 33, maxHp: 99, hpPercentage: 33.33 })
      );

      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: '{hp_percentage}%' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', '33%');
    });

    it('should interpolate {hp_missing} variable', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: 'HP Lost: {hp_missing}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', 'HP Lost: 50');
    });

    it('should handle multiple variables in single text', async () => {
      const actions: SetTextAction[] = [
        {
          type: 'set_text',
          sourceName: 'HP Display',
          text: '{hp_current}/{hp_max} ({hp_percentage}%) - Temp: {hp_temp}',
        },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith(
        'HP Display',
        '50/100 (50%) - Temp: 5'
      );
    });

    it('should handle zero HP correctly', async () => {
      executor = new ActionExecutor(
        mockObsClient,
        createContext({ currentHp: 0, maxHp: 100, hpPercentage: 0 })
      );

      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: '{hp_current}/{hp_max}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', '0/100');
    });

    it('should handle full HP correctly', async () => {
      executor = new ActionExecutor(
        mockObsClient,
        createContext({ currentHp: 100, maxHp: 100, hpPercentage: 100 })
      );

      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'HP Display', text: '{hp_percentage}%' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('HP Display', '100%');
    });
  });

  // ==========================================================================
  // SET_FILTER_VISIBILITY ACTIONS
  // ==========================================================================

  describe('set_filter_visibility action', () => {
    it('should enable filter using obs.call', async () => {
      const actions: SetFilterVisibilityAction[] = [
        { type: 'set_filter_visibility', sourceName: 'Character', filterName: 'Red Tint', visible: true },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.obs.call).toHaveBeenCalledWith('SetSourceFilterEnabled', {
        sourceName: 'Character',
        filterName: 'Red Tint',
        filterEnabled: true,
      });
    });

    it('should disable filter using obs.call', async () => {
      const actions: SetFilterVisibilityAction[] = [
        { type: 'set_filter_visibility', sourceName: 'Character', filterName: 'Red Tint', visible: false },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.obs.call).toHaveBeenCalledWith('SetSourceFilterEnabled', {
        sourceName: 'Character',
        filterName: 'Red Tint',
        filterEnabled: false,
      });
    });

    it('should log success message when enabling filter', async () => {
      const actions: SetFilterVisibilityAction[] = [
        { type: 'set_filter_visibility', sourceName: 'Character', filterName: 'Damage', visible: true },
      ];

      await executor.executeActions(actions);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ACTIONS] ✓ Filter "Damage" on source "Character" is now enabled'
      );
    });

    it('should log success message when disabling filter', async () => {
      const actions: SetFilterVisibilityAction[] = [
        { type: 'set_filter_visibility', sourceName: 'Character', filterName: 'Damage', visible: false },
      ];

      await executor.executeActions(actions);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ACTIONS] ✓ Filter "Damage" on source "Character" is now disabled'
      );
    });

    it('should handle missing obs client gracefully', async () => {
      const badClient: any = { setImagePath: vi.fn(), setSourceVisibility: vi.fn(), setText: vi.fn() };
      executor = new ActionExecutor(badClient, context);

      const actions: SetFilterVisibilityAction[] = [
        { type: 'set_filter_visibility', sourceName: 'Character', filterName: 'Filter', visible: true },
      ];

      await executor.executeActions(actions);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ACTIONS] Error executing action: OBS WebSocket client not available'
      );
    });
  });

  // ==========================================================================
  // SET_INPUT_SETTINGS ACTIONS
  // ==========================================================================

  describe('set_input_settings action', () => {
    it('should set input settings using obs.call', async () => {
      const settings = { text: '50/100', color: '#ff0000' };
      const actions: SetInputSettingsAction[] = [
        { type: 'set_input_settings', inputName: 'HP Display', settings },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.obs.call).toHaveBeenCalledWith('SetInputSettings', {
        inputName: 'HP Display',
        inputSettings: settings,
      });
    });

    it('should handle multiple setting properties', async () => {
      const settings = {
        text: 'Advanced Text',
        color: '#00ff00',
        fontSize: 24,
        fontFamily: 'Arial',
        bold: true,
      };
      const actions: SetInputSettingsAction[] = [
        { type: 'set_input_settings', inputName: 'Complex Input', settings },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.obs.call).toHaveBeenCalledWith('SetInputSettings', {
        inputName: 'Complex Input',
        inputSettings: settings,
      });
    });

    it('should log success message when setting input settings', async () => {
      const actions: SetInputSettingsAction[] = [
        { type: 'set_input_settings', inputName: 'Test Input', settings: { text: 'test' } },
      ];

      await executor.executeActions(actions);

      expect(consoleLogSpy).toHaveBeenCalledWith(
        '[ACTIONS] ✓ Updated input settings for "Test Input"'
      );
    });

    it('should handle empty settings object', async () => {
      const actions: SetInputSettingsAction[] = [
        { type: 'set_input_settings', inputName: 'Empty Input', settings: {} },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.obs.call).toHaveBeenCalledWith('SetInputSettings', {
        inputName: 'Empty Input',
        inputSettings: {},
      });
    });

    it('should handle missing obs client gracefully', async () => {
      const badClient: any = { setImagePath: vi.fn(), setSourceVisibility: vi.fn(), setText: vi.fn() };
      executor = new ActionExecutor(badClient, context);

      const actions: SetInputSettingsAction[] = [
        { type: 'set_input_settings', inputName: 'Test', settings: {} },
      ];

      await executor.executeActions(actions);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ACTIONS] Error executing action: OBS WebSocket client not available'
      );
    });
  });

  // ==========================================================================
  // VARIABLE INTERPOLATION - EDGE CASES
  // ==========================================================================

  describe('variable interpolation', () => {
    it('should leave unknown variables unchanged', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: 'Value: {unknown_var}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Display', 'Value: {unknown_var}');
    });

    it('should warn about unknown variables', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: 'Value: {mystery}' },
      ];

      await executor.executeActions(actions);

      expect(consoleWarnSpy).toHaveBeenCalledWith('[ACTIONS] Unknown variable: mystery');
    });

    it('should handle case-insensitive variable names', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: '{HP_CURRENT}/{HP_MAX}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Display', '50/100');
    });

    it('should handle mixed case variables', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: '{Hp_Current} / {MAX_HP}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Display', '50 / 100');
    });

    it('should handle multiple occurrences of same variable', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: '{hp_current} then {hp_current} again' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Display', '50 then 50 again');
    });

    it('should handle adjacent variables', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: '{hp_current}{hp_max}{hp_temp}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Display', '501005');
    });

    it('should handle variables with no context values', async () => {
      executor = new ActionExecutor(
        mockObsClient,
        createContext({
          currentHp: 0,
          maxHp: 0,
          temporaryHp: 0,
          hpPercentage: 0,
        })
      );

      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: '{hp_current}/{hp_max} temp {hp_temp}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Display', '0/0 temp 0');
    });

    it('should handle empty text', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: '' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Display', '');
    });

    it('should handle text with no variables', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: 'Static text content' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Display', 'Static text content');
    });
  });

  // ==========================================================================
  // HP CALCULATION EDGE CASES
  // ==========================================================================

  describe('HP variable calculations', () => {
    it('should calculate hp_missing correctly', async () => {
      executor = new ActionExecutor(
        mockObsClient,
        createContext({ currentHp: 25, maxHp: 100 })
      );

      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: '{hp_missing}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Display', '75');
    });

    it('should handle hp_missing when at full health', async () => {
      executor = new ActionExecutor(
        mockObsClient,
        createContext({ currentHp: 100, maxHp: 100 })
      );

      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: '{hp_missing}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Display', '0');
    });

    it('should round hp_percentage with decimal values', async () => {
      executor = new ActionExecutor(
        mockObsClient,
        createContext({ currentHp: 33, maxHp: 100, hpPercentage: 33.7 })
      );

      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: '{hp_percentage}%' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Display', '34%');
    });

    it('should handle negative hp_missing gracefully (over-healed)', async () => {
      executor = new ActionExecutor(
        mockObsClient,
        createContext({ currentHp: 110, maxHp: 100 })
      );

      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: '{hp_missing}' },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Display', '-10');
    });
  });

  // ==========================================================================
  // MIXED ACTION TYPES
  // ==========================================================================

  describe('mixed action execution', () => {
    it('should execute different action types in sequence', async () => {
      const actions: RuleAction[] = [
        { type: 'set_image', sourceName: 'Image', imagePath: '/test.png' },
        { type: 'set_text', sourceName: 'Text', text: 'HP: {hp_current}' },
        { type: 'set_visibility', sceneName: 'Main', itemName: 'Overlay', visible: true },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setImagePath).toHaveBeenCalledWith('Image', '/test.png');
      expect(mockObsClient.setText).toHaveBeenCalledWith('Text', 'HP: 50');
      expect(mockObsClient.setSourceVisibility).toHaveBeenCalledWith('Main', 'Overlay', true);
    });

    it('should continue after specific action type fails', async () => {
      mockObsClient.setImagePath.mockRejectedValueOnce(new Error('Image error'));

      const actions: RuleAction[] = [
        { type: 'set_image', sourceName: 'Image', imagePath: '/test.png' },
        { type: 'set_text', sourceName: 'Text', text: 'Fallback text' },
        { type: 'set_visibility', sceneName: 'Main', itemName: 'Overlay', visible: false },
      ];

      await executor.executeActions(actions);

      expect(mockObsClient.setText).toHaveBeenCalledWith('Text', 'Fallback text');
      expect(mockObsClient.setSourceVisibility).toHaveBeenCalledWith('Main', 'Overlay', false);
    });

    it('should handle complex action sequences', async () => {
      const actions: RuleAction[] = [
        { type: 'set_visibility', sceneName: 'Main', itemName: 'Healthy', visible: true },
        { type: 'set_visibility', sceneName: 'Main', itemName: 'Bloodied', visible: false },
        { type: 'set_text', sourceName: 'HP Display', text: '{hp_current}/{hp_max}' },
        { type: 'set_image', sourceName: 'Status', imagePath: '/status/healthy.png' },
      ];

      await executor.executeActions(actions);

      expect(consoleLogSpy).toHaveBeenCalledWith('[ACTIONS] Executing 4 action(s)');
      expect(mockObsClient.setSourceVisibility).toHaveBeenCalledTimes(2);
      expect(mockObsClient.setText).toHaveBeenCalledTimes(1);
      expect(mockObsClient.setImagePath).toHaveBeenCalledTimes(1);
    });
  });

  // ==========================================================================
  // ERROR HANDLING AND RECOVERY
  // ==========================================================================

  describe('error handling', () => {
    it('should catch and log errors from OBS client methods', async () => {
      mockObsClient.setText.mockRejectedValueOnce(new Error('Connection timeout'));

      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: 'Test' },
      ];

      await executor.executeActions(actions);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ACTIONS] Error executing action: Connection timeout'
      );
    });

    it('should handle non-Error objects thrown as errors', async () => {
      mockObsClient.setText.mockRejectedValueOnce('String error');

      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: 'Test' },
      ];

      await executor.executeActions(actions);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ACTIONS] Error executing action: String error');
    });

    it('should not throw when individual actions fail', async () => {
      mockObsClient.setImagePath.mockRejectedValueOnce(new Error('Test error'));

      const actions: RuleAction[] = [
        { type: 'set_image', sourceName: 'Image', imagePath: '/test.png' },
      ];

      await expect(executor.executeActions(actions)).resolves.not.toThrow();
    });

    it('should gracefully handle undefined error objects', async () => {
      mockObsClient.setText.mockRejectedValueOnce(undefined);

      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: 'Test' },
      ];

      await executor.executeActions(actions);

      expect(consoleErrorSpy).toHaveBeenCalledWith('[ACTIONS] Error executing action: undefined');
    });
  });

  // ==========================================================================
  // LOGGING
  // ==========================================================================

  describe('logging', () => {
    it('should log when action count is logged', async () => {
      const actions: SetTextAction[] = [
        { type: 'set_text', sourceName: 'Display', text: 'Test' },
      ];

      await executor.executeActions(actions);

      expect(consoleLogSpy).toHaveBeenCalledWith('[ACTIONS] Executing 1 action(s)');
    });

    it('should log filter success with enabled state', async () => {
      const actions: SetFilterVisibilityAction[] = [
        { type: 'set_filter_visibility', sourceName: 'Source', filterName: 'Filter', visible: true },
      ];

      await executor.executeActions(actions);

      const calls = consoleLogSpy.mock.calls;
      expect(calls.some((call: any) => call[0].includes('enabled'))).toBe(true);
    });

    it('should log input settings success', async () => {
      const actions: SetInputSettingsAction[] = [
        { type: 'set_input_settings', inputName: 'Input', settings: {} },
      ];

      await executor.executeActions(actions);

      const calls = consoleLogSpy.mock.calls;
      expect(calls.some((call: any) => call[0].includes('Updated input settings'))).toBe(true);
    });
  });
});
