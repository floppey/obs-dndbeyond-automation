# Configuration System - Implementation Summary

## Overview

The OBS D&D Beyond Automation app now features a modern, user-friendly JSON-based configuration system with an interactive setup wizard that runs automatically on first run.

## What Was Implemented

### 1. Configuration Type System (`src/config/types.ts`)
- **JsonConfig** - Complete JSON structure definition
- **JsonConfigDndBeyond** - D&D Beyond credentials
- **JsonConfigObs** - OBS WebSocket settings with mode-specific configs
- **JsonConfigImages** - Image paths for image_swap mode
- **JsonConfigGameLog** - Game log and dice roll settings
- **JsonConfigPolling** - Polling interval settings
- **JsonConfigStatMapping** - Stat-to-OBS source mapping
- **JsonConfigDebug** - Debug settings

### 2. Configuration Loader (`src/config/loader.ts`)
- **loadJsonConfig()** - Loads and validates config.json from current working directory
- **validateJsonConfig()** - Comprehensive validation with helpful error messages
- **saveJsonConfig()** - Saves configuration to config.json
- **configExists()** - Checks if config.json exists

**Validation includes:**
- Required field presence
- Type checking
- Mode-specific requirements (image_swap vs visibility_toggle)
- Polling interval minimum (>= 1000ms)
- Game log dependencies
- Image path requirements for image_swap mode

### 3. Interactive Setup Wizard (`src/config/setup.ts`)
- **runSetupWizard()** - Main wizard function with beautiful terminal UI
- Clear section headings with emoji indicators
- Context-sensitive prompts with helpful descriptions
- Input validation for each field
- Default values for optional fields
- Configuration summary before saving
- Sensitive data redaction in summary

**Wizard sections:**
1. D&D Beyond Configuration
   - Character ID (with format validation)
   - Cobalt Session token (with length validation)
2. OBS Configuration
   - WebSocket URL (with protocol validation)
   - WebSocket password (optional)
   - Mode selection (image_swap or visibility_toggle)
3. Mode-Specific Configuration
   - For image_swap: source name + 5 image paths
   - For visibility_toggle: scene name
4. Polling Configuration
   - Interval in milliseconds (with minimum validation)
5. Game Log Configuration (optional)
   - Enable/disable
   - Game ID and User ID
   - Last roll display settings
   - Roll history settings
6. Debug Settings
   - API response saving

### 4. Configuration Entry Point (`src/config/index.ts`)
- **loadOrCreateConfig()** - Main async function that handles:
  - `--setup` flag detection to force setup wizard
  - config.json existence check
  - Automatic setup wizard on first run
  - Configuration conversion from JsonConfig to internal Config type
- **convertJsonConfigToConfig()** - Transforms JSON config to application-compatible Config type
- **buildOBSClientConfig()** - Constructs OBSClientConfig with mode-specific settings

### 5. Updated Application Entry Point (`src/index.ts`)
- Modified to use async `loadOrCreateConfig()` instead of synchronous `loadConfig()`
- Config passed as constructor argument
- Proper error handling in main() function
- Maintains all existing functionality

### 6. Example Configuration (`config.example.json`)
- Fully commented example showing all possible settings
- Both image_swap and visibility_toggle examples
- Stat mapping examples
- Game log configuration examples
- Sensible defaults and placeholder values

### 7. Updated Documentation (`README.md`)
- Interactive setup wizard as primary configuration method
- Manual config.json creation instructions
- `--setup` flag documentation
- Both JSON and legacy environment variable examples
- Backward compatibility notes

## Key Features

### ✅ User-Friendly Setup
- Automatic on first run
- Clear, helpful prompts
- Input validation with friendly error messages
- Helper text explaining where to find credentials

### ✅ Beautiful Terminal UI
- ASCII art borders and section headers
- Emoji indicators for each section
- Color-coded feedback (✓, ✅, ❌, ℹ️)
- Configuration summary before saving
- Sensitive data redaction

### ✅ Robust Validation
- Type checking at runtime
- Mode-specific validation
- Helpful error messages that explain what's wrong
- Minimum value constraints
- Dependency validation

### ✅ Backward Compatibility
- Existing Config type unchanged
- All internal interfaces preserved
- Supports legacy .env files
- Drop-in replacement for loadConfig()

### ✅ Flexible Configuration
- Supports all existing OBS modes (image_swap, visibility_toggle)
- Full stat mapping support
- Game log configuration in JSON
- Debug settings
- Optional components

### ✅ Developer-Friendly
- Well-documented code with JSDoc comments
- Type-safe with full TypeScript support
- Modular design with single responsibilities
- Clean separation of concerns
- Comprehensive error handling

## File Structure

```
src/
├── config/
│   ├── types.ts       - Type definitions for JSON config
│   ├── loader.ts      - Configuration file loading and validation
│   ├── setup.ts       - Interactive setup wizard
│   └── index.ts       - Main entry point, conversion logic
├── config.ts          - Original env-based config (kept for reference)
└── index.ts           - Updated to use new async config loading

config.example.json    - Example configuration file
```

## Usage

### First Run (Interactive Setup)
```bash
npm run dev
# The wizard will guide you through configuration
# config.json will be created automatically
```

### Subsequent Runs
```bash
npm start
# Loads from config.json automatically
```

### Re-run Setup Wizard
```bash
npm run dev -- --setup
# Forces the setup wizard to run even if config.json exists
```

### Manual Configuration
```bash
cp config.example.json config.json
# Edit config.json with your settings
npm start
```

## Configuration Format

### Minimal Config
```json
{
  "dndBeyond": {
    "characterId": "123456789",
    "cobaltSession": "your_token"
  },
  "obs": {
    "websocketUrl": "ws://localhost:4455",
    "mode": "image_swap",
    "sourceName": "CharacterPortrait",
    "images": {
      "healthy": "path/to/healthy.png",
      "scratched": "path/to/scratched.png",
      "bloodied": "path/to/bloodied.png",
      "dying": "path/to/dying.png",
      "unconscious": "path/to/unconscious.png"
    }
  },
  "polling": {
    "intervalMs": 5000
  }
}
```

### Full Config (with all features)
See config.example.json for comprehensive example.

## Error Handling

The configuration system provides helpful error messages:

```
❌ Configuration error: dndBeyond.cobaltSession is required and must be a string
❌ Validation failed: polling.intervalMs must be a number >= 1000
❌ Invalid configuration: image_swap mode requires obs.images
```

## Conversion Logic

The `convertJsonConfigToConfig()` function:
1. Validates JsonConfig structure
2. Parses stat mappings from JSON format
3. Builds GameLogConfig if enabled
4. Constructs OBSClientConfig based on mode
5. Converts HpState enum values correctly
6. Returns internal Config type compatible with existing code

This ensures the new JSON system is completely transparent to the rest of the application.

## Testing

The implementation includes:
- Type validation tests
- Configuration loading tests
- Invalid config rejection tests
- Conversion logic tests
- All existing tests continue to pass

## Backward Compatibility

✅ Existing Config type is unchanged
✅ OBSClientConfig interface preserved
✅ All stat mapping functionality works
✅ Game log support fully functional
✅ .env files still work (legacy support)
✅ loadConfig() still available in src/config.ts

## Future Enhancements

Potential improvements for future iterations:
- Config file encryption for sensitive data
- Multiple config profiles
- Environment-specific config overrides
- Configuration export/import
- Config validation via CLI command
- Auto-migration from .env to config.json

## Conclusion

The new configuration system provides a modern, user-friendly experience while maintaining full backward compatibility with the existing codebase. The interactive setup wizard eliminates the need for users to manually edit configuration files, reducing errors and improving accessibility for non-technical streamers.
