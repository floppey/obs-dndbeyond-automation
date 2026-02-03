/**
 * Unit tests for the configuration loader module
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import path from 'path';
import { loadJsonConfig, saveJsonConfig, configExists } from './loader.js';
import type { JsonConfig } from './types.js';

// Mock fs module
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

// Mock process.cwd
vi.mock('path', async () => {
  const actual = await vi.importActual<typeof import('path')>('path');
  return {
    ...actual,
    resolve: vi.fn((...args) => {
      // Mock resolve to return predictable paths
      return args[args.length - 1];
    }),
  };
});

import fs from 'fs';

/**
 * Helper function to create a valid config object with optional overrides
 * If overrides specify partial objects, they fully replace the section (no merge)
 */
function createValidConfig(overrides: Partial<JsonConfig> = {}): any {
  const baseConfig: JsonConfig = {
    dndBeyond: {
      characterId: 'test-char-123',
      cobaltSession: 'test-session-abc',
    },
    obs: {
      websocketUrl: 'ws://localhost:4444',
      mode: 'image_swap',
      sourceName: 'health-bar',
      images: {
        healthy: '/path/to/healthy.png',
        scratched: '/path/to/scratched.png',
        bloodied: '/path/to/bloodied.png',
        dying: '/path/to/dying.png',
        unconscious: '/path/to/unconscious.png',
      },
    },
    polling: {
      intervalMs: 5000,
    },
  };

  const result: any = { ...baseConfig };

  // Apply overrides - if a section is specified in overrides, use it as-is (no merge)
  if (overrides.dndBeyond !== undefined) {
    result.dndBeyond = overrides.dndBeyond;
  }
  if (overrides.obs !== undefined) {
    result.obs = overrides.obs;
  }
  if (overrides.polling !== undefined) {
    result.polling = overrides.polling;
  }
  if (overrides.gameLog !== undefined) {
    result.gameLog = overrides.gameLog;
  }
  if (overrides.debug !== undefined) {
    result.debug = overrides.debug;
  }
  if (overrides.rules !== undefined) {
    result.rules = overrides.rules;
  }
  if (overrides.statMappings !== undefined) {
    result.statMappings = overrides.statMappings;
  }

  return result;
}

describe('Config Loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==================== loadJsonConfig Tests ====================

  describe('loadJsonConfig()', () => {
    it('should return null when config file does not exist', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      mockExistSync.mockReturnValue(false);

      const result = await loadJsonConfig();

      expect(result).toBeNull();
      expect(mockExistSync).toHaveBeenCalled();
    });

    it('should load and return valid config when file exists', async () => {
      const validConfig = createValidConfig();
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = await loadJsonConfig();

      expect(result).toEqual(validConfig);
      expect(mockExistSync).toHaveBeenCalled();
      expect(mockReadFileSync).toHaveBeenCalled();
    });

    it('should throw error for invalid JSON in config file', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('{ invalid json }');

      await expect(loadJsonConfig()).rejects.toThrow('Invalid JSON in config.json');
    });

    it('should throw error when dndBeyond section is missing', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = { obs: {}, polling: {} };

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('Missing required section: dndBeyond');
    });

    it('should throw error when dndBeyond is not an object', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = { dndBeyond: 'not-an-object', obs: {}, polling: {} };

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('Missing required section: dndBeyond');
    });

    it('should throw error when dndBeyond.characterId is missing', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        dndBeyond: { cobaltSession: 'test-session' } as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('dndBeyond.characterId is required');
    });

    it('should throw error when dndBeyond.characterId is not a string', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        dndBeyond: { characterId: 123 as unknown as string, cobaltSession: 'test' },
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('dndBeyond.characterId is required');
    });

    it('should throw error when dndBeyond.cobaltSession is missing', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        dndBeyond: { characterId: 'test-id' } as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('dndBeyond.cobaltSession is required');
    });

    it('should throw error when dndBeyond.cobaltSession is not a string', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        dndBeyond: { characterId: 'test-id', cobaltSession: 456 as unknown as string },
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('dndBeyond.cobaltSession is required');
    });

    it('should throw error when obs section is missing', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = { dndBeyond: { characterId: 'id', cobaltSession: 'session' }, polling: {} };

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('Missing required section: obs');
    });

    it('should throw error when obs.websocketUrl is missing', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        obs: { mode: 'image_swap' } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('obs.websocketUrl is required');
    });

    it('should throw error when obs.mode is invalid', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        obs: { websocketUrl: 'ws://localhost', mode: 'invalid_mode' } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('obs.mode must be either "image_swap" or "visibility_toggle"');
    });

    it('should throw error when obs.mode is missing', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        obs: { websocketUrl: 'ws://localhost' } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('obs.mode must be either "image_swap" or "visibility_toggle"');
    });

    // ==================== image_swap mode validation ====================

    it('should throw error when image_swap mode requires sourceName but missing', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        obs: {
          websocketUrl: 'ws://localhost',
          mode: 'image_swap',
          images: {
            healthy: '/path/to/healthy.png',
            scratched: '/path/to/scratched.png',
            bloodied: '/path/to/bloodied.png',
            dying: '/path/to/dying.png',
            unconscious: '/path/to/unconscious.png',
          },
        } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('obs.sourceName is required for image_swap mode');
    });

    it('should throw error when image_swap mode requires images but missing', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        obs: {
          websocketUrl: 'ws://localhost',
          mode: 'image_swap',
          sourceName: 'health-bar',
        } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('obs.images is required for image_swap mode');
    });

    it('should throw error when image_swap missing healthy image', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        obs: {
          websocketUrl: 'ws://localhost',
          mode: 'image_swap',
          sourceName: 'health-bar',
          images: {
            scratched: '/path/to/scratched.png',
            bloodied: '/path/to/bloodied.png',
            dying: '/path/to/dying.png',
            unconscious: '/path/to/unconscious.png',
          },
        } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('obs.images.healthy is required for image_swap mode');
    });

    it('should throw error when image_swap missing scratched image', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        obs: {
          websocketUrl: 'ws://localhost',
          mode: 'image_swap',
          sourceName: 'health-bar',
          images: {
            healthy: '/path/to/healthy.png',
            bloodied: '/path/to/bloodied.png',
            dying: '/path/to/dying.png',
            unconscious: '/path/to/unconscious.png',
          },
        } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('obs.images.scratched is required for image_swap mode');
    });

    it('should throw error when image_swap missing bloodied image', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        obs: {
          websocketUrl: 'ws://localhost',
          mode: 'image_swap',
          sourceName: 'health-bar',
          images: {
            healthy: '/path/to/healthy.png',
            scratched: '/path/to/scratched.png',
            dying: '/path/to/dying.png',
            unconscious: '/path/to/unconscious.png',
          },
        } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('obs.images.bloodied is required for image_swap mode');
    });

    it('should throw error when image_swap missing dying image', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        obs: {
          websocketUrl: 'ws://localhost',
          mode: 'image_swap',
          sourceName: 'health-bar',
          images: {
            healthy: '/path/to/healthy.png',
            scratched: '/path/to/scratched.png',
            bloodied: '/path/to/bloodied.png',
            unconscious: '/path/to/unconscious.png',
          },
        } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('obs.images.dying is required for image_swap mode');
    });

    it('should throw error when image_swap missing unconscious image', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        obs: {
          websocketUrl: 'ws://localhost',
          mode: 'image_swap',
          sourceName: 'health-bar',
          images: {
            healthy: '/path/to/healthy.png',
            scratched: '/path/to/scratched.png',
            bloodied: '/path/to/bloodied.png',
            dying: '/path/to/dying.png',
          },
        } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('obs.images.unconscious is required for image_swap mode');
    });

    // ==================== visibility_toggle mode validation ====================

    it('should load config with visibility_toggle mode when sceneName is provided', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const validConfig = createValidConfig({
        obs: {
          websocketUrl: 'ws://localhost:4444',
          mode: 'visibility_toggle',
          sceneName: 'main-scene',
        } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = await loadJsonConfig();

      expect(result).toBeDefined();
      expect(result?.obs.mode).toBe('visibility_toggle');
    });

    it('should throw error when visibility_toggle mode requires sceneName but missing', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        obs: {
          websocketUrl: 'ws://localhost',
          mode: 'visibility_toggle',
        } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('obs.sceneName is required for visibility_toggle mode');
    });

    // ==================== polling validation ====================

    it('should throw error when polling section is missing', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig();
      delete (invalidConfig as any).polling;

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('Missing required section: polling');
    });

    it('should throw error when polling.intervalMs is below minimum 1000', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        polling: { intervalMs: 500 },
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('polling.intervalMs must be a number >= 1000');
    });

    it('should throw error when polling.intervalMs is zero', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        polling: { intervalMs: 0 },
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('polling.intervalMs must be a number >= 1000');
    });

    it('should throw error when polling.intervalMs is not a number', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        polling: { intervalMs: 'not-a-number' } as unknown as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('polling.intervalMs must be a number >= 1000');
    });

    it('should accept valid polling.intervalMs at minimum threshold', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const validConfig = createValidConfig({
        polling: { intervalMs: 1000 },
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = await loadJsonConfig();

      expect(result).toBeDefined();
      expect(result?.polling.intervalMs).toBe(1000);
    });

    // ==================== gameLog validation ====================

    it('should load config without gameLog section', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const validConfig = createValidConfig();
      delete (validConfig as any).gameLog;

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = await loadJsonConfig();

      expect(result).toBeDefined();
      expect(result?.gameLog).toBeUndefined();
    });

    it('should load config with gameLog disabled without requiring gameId/userId', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const validConfig = createValidConfig({
        gameLog: {
          enabled: false,
        },
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = await loadJsonConfig();

      expect(result).toBeDefined();
      expect(result?.gameLog?.enabled).toBe(false);
    });

    it('should throw error when gameLog.enabled is true but gameId is missing', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        gameLog: {
          enabled: true,
          userId: 'user-123',
        },
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('gameLog.gameId is required when gameLog.enabled is true');
    });

    it('should throw error when gameLog.enabled is true but userId is missing', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const invalidConfig = createValidConfig({
        gameLog: {
          enabled: true,
          gameId: 'game-123',
        },
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(invalidConfig));

      await expect(loadJsonConfig()).rejects.toThrow('gameLog.userId is required when gameLog.enabled is true');
    });

    it('should load config with gameLog.enabled true and both gameId and userId present', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const validConfig = createValidConfig({
        gameLog: {
          enabled: true,
          gameId: 'game-123',
          userId: 'user-456',
        },
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = await loadJsonConfig();

      expect(result).toBeDefined();
      expect(result?.gameLog?.enabled).toBe(true);
      expect(result?.gameLog?.gameId).toBe('game-123');
      expect(result?.gameLog?.userId).toBe('user-456');
    });

    it('should throw error when config is not an object', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify('not an object'));

      await expect(loadJsonConfig()).rejects.toThrow('Configuration must be a JSON object');
    });

    it('should throw error when config is null', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(null));

      await expect(loadJsonConfig()).rejects.toThrow('Configuration must be a JSON object');
    });
  });

  // ==================== saveJsonConfig Tests ====================

  describe('saveJsonConfig()', () => {
    it('should write valid config to file', async () => {
      const mockWriteFileSync = vi.mocked(fs.writeFileSync);
      const validConfig = createValidConfig();

      await saveJsonConfig(validConfig);

      expect(mockWriteFileSync).toHaveBeenCalled();
      const callArgs = mockWriteFileSync.mock.calls[0];
      expect(callArgs[1]).toContain('"dndBeyond"');
      expect(callArgs[1]).toContain('"obs"');
      expect(callArgs[1]).toContain('"polling"');
    });

    it('should format JSON with 2-space indentation', async () => {
      const mockWriteFileSync = vi.mocked(fs.writeFileSync);
      const validConfig = createValidConfig();

      await saveJsonConfig(validConfig);

      const callArgs = mockWriteFileSync.mock.calls[0];
      const writtenContent = callArgs[1] as string;
      // Check for 2-space indentation
      expect(writtenContent).toMatch(/\n  "/);
    });

    it('should throw error if write fails', async () => {
      const mockWriteFileSync = vi.mocked(fs.writeFileSync);
      mockWriteFileSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });

      const validConfig = createValidConfig();

      await expect(saveJsonConfig(validConfig)).rejects.toThrow('Failed to save config.json');
    });

    it('should preserve all config properties when saving', async () => {
      const mockWriteFileSync = vi.mocked(fs.writeFileSync);
      const validConfig = createValidConfig({
        gameLog: {
          enabled: true,
          gameId: 'test-game',
          userId: 'test-user',
        },
        debug: {
          saveApiResponse: true,
        },
      });

      await saveJsonConfig(validConfig);

      const callArgs = mockWriteFileSync.mock.calls[0];
      const writtenContent = callArgs[1] as string;
      expect(writtenContent).toContain('"gameLog"');
      expect(writtenContent).toContain('"debug"');
    });
  });

  // ==================== configExists Tests ====================

  describe('configExists()', () => {
    it('should return true when config file exists', () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      mockExistSync.mockReturnValue(true);

      const result = configExists();

      expect(result).toBe(true);
      expect(mockExistSync).toHaveBeenCalled();
    });

    it('should return false when config file does not exist', () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      mockExistSync.mockReturnValue(false);

      const result = configExists();

      expect(result).toBe(false);
      expect(mockExistSync).toHaveBeenCalled();
    });
  });

  // ==================== Integration Tests ====================

  describe('Integration scenarios', () => {
    it('should load, modify, and save config', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const mockWriteFileSync = vi.mocked(fs.writeFileSync);

      const originalConfig = createValidConfig();

      // Setup load
      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(originalConfig));

      // Load config
      const loadedConfig = await loadJsonConfig();
      expect(loadedConfig).toBeDefined();

      // Modify config
      if (loadedConfig) {
        loadedConfig.polling.intervalMs = 10000;
        await saveJsonConfig(loadedConfig);
      }

      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenContent = mockWriteFileSync.mock.calls[0][1] as string;
      expect(writtenContent).toContain('10000');
    });

    it('should handle optional websocketPassword field', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const validConfig = createValidConfig({
        obs: {
          websocketUrl: 'ws://localhost:4444',
          websocketPassword: 'secret-password',
          mode: 'image_swap',
          sourceName: 'health-bar',
          images: {
            healthy: '/path/to/healthy.png',
            scratched: '/path/to/scratched.png',
            bloodied: '/path/to/bloodied.png',
            dying: '/path/to/dying.png',
            unconscious: '/path/to/unconscious.png',
          },
        } as any,
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = await loadJsonConfig();

      expect(result).toBeDefined();
      expect((result?.obs as any).websocketPassword).toBe('secret-password');
    });

    it('should handle empty optional fields without error', async () => {
      const mockExistSync = vi.mocked(fs.existsSync);
      const mockReadFileSync = vi.mocked(fs.readFileSync);
      const validConfig = createValidConfig({
        debug: {
          saveApiResponse: false,
        },
      });

      mockExistSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify(validConfig));

      const result = await loadJsonConfig();

      expect(result).toBeDefined();
      expect(result?.debug?.saveApiResponse).toBe(false);
    });
  });
});
