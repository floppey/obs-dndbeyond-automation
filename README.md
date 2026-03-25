# OBS D&D Beyond Automation

Automatically synchronize D&D Beyond character data with OBS for live streaming overlays. Display HP states, real-time character stats, and live dice rolls directly in your stream.

Built in Rust for fast startup, low memory usage, and a single portable executable.

## Quick Start

### 1. Install Rust

Install from [rustup.rs](https://rustup.rs/) or run:
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### 2. Build

```bash
cargo build --release
```

The binary will be at `target/release/obs-dndbeyond-automation.exe` (Windows).

### 3. First Run

On first run with no `config.json`, a default template is created and the web UI starts:

```bash
cargo run --release
```

Open http://localhost:3000 to configure your settings, then restart the application.

### 4. Manual Configuration (Alternative)

Copy the example and edit:
```bash
cp config.example.json config.json
```

**Finding your Credentials:**

**D&D Beyond Character ID:**
- Visit your character sheet at `https://www.dndbeyond.com/characters/{CHARACTER_ID}/...`
- Copy the `CHARACTER_ID` from the URL

**Cobalt Session Cookie:**
1. Open browser DevTools (F12)
2. Go to Network tab
3. Refresh your D&D Beyond character sheet
4. Find a request to `character-service.dndbeyond.com`
5. In Request Headers, copy the `cobalt-session` cookie value

### 5. HP State Display Mode

Choose your HP display mode in `config.json`:

**Option A: Image Swap Mode** (swap portrait images based on HP)
```json
{
  "obs": {
    "mode": "image_swap",
    "sourceName": "Character_Portrait",
    "images": {
      "healthy": "C:/obs-images/healthy.png",
      "scratched": "C:/obs-images/scratched.png",
      "bloodied": "C:/obs-images/bloodied.png",
      "dying": "C:/obs-images/dying.png",
      "unconscious": "C:/obs-images/unconscious.png"
    }
  }
}
```

**Option B: Visibility Toggle Mode** (show/hide scene items based on HP)
```json
{
  "obs": {
    "mode": "visibility_toggle",
    "sceneName": "D&D Overlay"
  }
}
```
Then create scene items in OBS with these exact names: `healthy`, `scratched`, `bloodied`, `dying`, `unconscious`

### 6. (Optional) Configure Stat Display

Map any character stat to an OBS text source:
```json
{
  "statMappings": [
    { "statId": "ac", "obsSourceName": "Text_AC", "format": "AC: {value}" },
    { "statId": "hp_display", "obsSourceName": "Text_HP" },
    { "statId": "level", "obsSourceName": "Text_Level", "format": "Lvl {value}" },
    { "statId": "passive_perception", "obsSourceName": "Text_PP", "format": "PP {value}" },
    { "statId": "initiative", "obsSourceName": "Text_Initiative" }
  ]
}
```

### 7. (Optional) Configure Dice Roll Display

Display your dice rolls from D&D Beyond's game log:
```json
{
  "gameLog": {
    "enabled": true,
    "gameId": "your_campaign_id",
    "userId": "your_user_id",
    "pollIntervalMs": 3000,
    "lastRoll": {
      "sourceName": "Text_LastRoll",
      "format": "{action}: {total}"
    },
    "rollHistory": {
      "sourceName": "Text_RollHistory",
      "format": "{action} {total}",
      "count": 5
    }
  }
}
```

**Finding your IDs:**
- **Game ID**: Open your campaign, check Network tab for requests to `game-log-rest-live.dndbeyond.com`, find `gameId` parameter
- **User ID**: Same request will show your `userId` parameter

### 8. Run

```bash
cargo run --release
```

## Features

### HP State Tracking
- **Real-time HP Sync**: Polls D&D Beyond every 5-10 seconds (configurable)
- **Flexible Display**: Choose between image swapping or visibility toggling
- **Smart State Detection**: Healthy (>75%), Scratched (50-75%), Bloodied (25-50%), Dying (0-25%), Unconscious (0 HP or death saves)
- **Automatic Reconnection**: Gracefully handles connection drops

### Live Stat Display
- **25+ Character Stats**: Map any D&D stat to your OBS overlay
- **Real-time Updates**: Stats update whenever they change
- **Formatted Output**: Modifiers display with +/- signs, speeds with "ft." suffix
- **Combat Ready**: Initiative, AC, spell DCs, passive checks all available

### Live Dice Rolls
- **Real-time Roll Display**: See your D&D Beyond dice rolls in OBS
- **Last Roll + History**: Separate displays for most recent roll and roll history
- **Flexible Formatting**: Customize how rolls appear with placeholders
- **Your Rolls Only**: Filters to show only your character's rolls

### Rules Engine
- **Condition-Action System**: Trigger OBS changes based on character state
- **20+ Condition Types**: HP, death saves, equipment, ability scores, level, and more
- **5 Action Types**: Set image, visibility, text, filter visibility, input settings
- **Visual Editor**: Web UI at http://localhost:3000 for managing rules

### Web Configuration UI
- **Live Preview**: Real-time character state display
- **Rules Editor**: Visual drag-and-drop rule management
- **Settings Panel**: Configure all settings without editing JSON

## Available Stats

#### Basic
- **`level`** - Total character level
- **`ac`** - Armor Class

#### Hit Points
- **`hp_current`** - Current HP
- **`hp_max`** - Maximum HP
- **`hp_temp`** - Temporary HP
- **`hp_display`** - Formatted as "72/125"

#### Ability Scores & Modifiers
- **`strength`**, **`strength_mod`** - Strength score and modifier
- **`dexterity`**, **`dexterity_mod`** - Dexterity score and modifier
- **`constitution`**, **`constitution_mod`** - Constitution score and modifier
- **`intelligence`**, **`intelligence_mod`** - Intelligence score and modifier
- **`wisdom`**, **`wisdom_mod`** - Wisdom score and modifier
- **`charisma`**, **`charisma_mod`** - Charisma score and modifier

#### Combat Stats
- **`proficiency`** - Proficiency bonus
- **`initiative`** - Initiative bonus
- **`speed`** - Movement speed

#### Passive Checks
- **`passive_perception`**, **`passive_investigation`**, **`passive_insight`**

#### Spellcasting
- **`spell_save_dc`** - Spell Save DC
- **`spell_attack`** - Spell attack modifier

## Dice Roll Placeholders

| Placeholder | Example | Description |
|-------------|---------|-------------|
| `{character}` | `Kan` | Character name |
| `{action}` | `Persuasion` | What was rolled |
| `{total}` | `21` | Final roll result |
| `{breakdown}` | `(14,20)+1` | Dice breakdown |
| `{roll_type}` | `check` | Type: check, save, to hit, heal, roll |
| `{roll_kind}` | `advantage` | Advantage, disadvantage, or blank |
| `{dice}` | `2d20+5` | Dice notation |
| `{values}` | `14, 20` | Individual die values |

## Project Structure

```
obs-dndbeyond-automation/
├── Cargo.toml                      # Rust dependencies
├── config.example.json             # Configuration template
├── config.rules.example.json       # Rules engine example
├── web-ui/                         # Web configuration UI
│   ├── index.html
│   ├── app.js
│   └── styles.css
└── rust-src/                       # Rust source code
    ├── main.rs                     # Entry point & polling loops
    ├── types.rs                    # Core type definitions
    ├── config/                     # Configuration loading & validation
    ├── dnd_beyond/                 # D&D Beyond API client & HP calculator
    ├── obs/                        # OBS WebSocket client (v5 protocol)
    ├── stats/                      # 25+ stat definitions & calculator
    ├── game_log/                   # Dice roll fetching & formatting
    ├── rules/                      # Rules engine & action executor
    └── web/                        # Web server (axum) with SSE
```

## Troubleshooting

### "Cannot read character data"
- Verify `dndBeyond.characterId` in `config.json`
- Get a fresh `dndBeyond.cobaltSession` cookie from browser DevTools
- Check internet connection

### "Failed to connect to OBS WebSocket"
- Ensure OBS is running
- Enable WebSocket Server: Tools > WebSocket Server Settings > Enable
- Verify `obs.websocketUrl` in `config.json` (usually `ws://localhost:4455`)

### "Scene item not found" (visibility_toggle mode)
- Scene items must be named exactly: `healthy`, `scratched`, `bloodied`, `dying`, `unconscious`
- Names are case-sensitive

### No OBS updates
- Take or heal damage on character sheet (app only updates on change)
- Verify OBS source/scene names match exactly

### Dice rolls not appearing
- Verify `gameLog.enabled` is `true` and IDs are correct
- Character must be in a campaign
- Check console for `[GAME_LOG]` messages

### Save API response for debugging
```json
{
  "debug": {
    "saveApiResponse": true
  }
}
```

## Security Notes

- Never commit `config.json` (`.gitignore` excludes it)
- `dndBeyond.cobaltSession` is sensitive - treat like a password
- Use local OBS WebSocket when possible
