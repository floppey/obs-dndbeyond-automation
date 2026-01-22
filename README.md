# OBS D&D Beyond Automation

Automatically synchronize D&D Beyond character data with OBS for live streaming overlays. Display HP states AND real-time character stats (AC, ability scores, modifiers, initiative, passives, and more) directly in your stream.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your D&D Beyond credentials and OBS settings
```

### 3. Get Your Credentials

**D&D Beyond Character ID:**
- Visit your character sheet at `https://www.dndbeyond.com/characters/{CHARACTER_ID}/...`
- Copy the `CHARACTER_ID` from the URL

**Cobalt Session Cookie:**
1. Open browser DevTools (F12)
2. Go to Network tab
3. Refresh your D&D Beyond character sheet
4. Find a request to `character-service.dndbeyond.com`
5. In Request Headers, copy the `cobalt-session` cookie value

### 4. Choose HP State Display Mode

**Option A: Image Swap Mode** (swap portrait images based on HP)
```env
OBS_MODE=image_swap
OBS_SOURCE_NAME=Character_Portrait
OBS_IMAGE_HEALTHY=C:/obs-images/healthy.png
OBS_IMAGE_SCRATCHED=C:/obs-images/scratched.png
OBS_IMAGE_BLOODIED=C:/obs-images/bloodied.png
OBS_IMAGE_DYING=C:/obs-images/dying.png
OBS_IMAGE_UNCONSCIOUS=C:/obs-images/unconscious.png
```

**Option B: Visibility Toggle Mode** (show/hide scene items based on HP)
```env
OBS_MODE=visibility_toggle
OBS_SCENE_NAME=D&D Overlay
```
Then create scene items in OBS with these exact names: `healthy`, `scratched`, `bloodied`, `dying`, `unconscious`

### 5. (Optional) Configure Stat Display

Map any character stat to an OBS text source:
```env
STAT_MAPPING_1=ac:Text_AC:AC {value}
STAT_MAPPING_2=hp_display:Text_HP
STAT_MAPPING_3=level:Text_Level:Lvl {value}
STAT_MAPPING_4=passive_perception:Text_PP:PP {value}
STAT_MAPPING_5=initiative:Text_Initiative:{value}
```

### 6. Start the Application
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Features

### 🩸 HP State Tracking (Original Feature)
- ✅ **Real-time HP Sync**: Polls D&D Beyond every 5-10 seconds (configurable)
- ✅ **Flexible Display**: Choose between image swapping or visibility toggling
- ✅ **Smart State Detection**: 
  - Healthy (> 75%)
  - Scratched (50-75%)
  - Bloodied (25-50%)
  - Dying (0-25%)
  - Unconscious (0 HP or death saves)
- ✅ **Automatic Reconnection**: Gracefully handles connection drops

### 📊 Live Stat Display (New!)
- ✅ **25+ Character Stats**: Map any D&D stat to your OBS overlay
- ✅ **Real-time Updates**: Stats update whenever they change
- ✅ **Formatted Output**: Modifiers display with +/- signs, speeds with "ft." suffix
- ✅ **Flexible Formatting**: Use `{value}` placeholders in custom formats
- ✅ **Combat Ready**: Initiative, AC, spell DCs, passive checks all available

### 🛡️ General Reliability
- ✅ **Type-Safe**: Full TypeScript coverage
- ✅ **Efficient**: Only updates OBS when values actually change
- ✅ **Graceful Errors**: Detailed logging helps troubleshoot issues

## Configuration

### Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `DND_CHARACTER_ID` | ✓ | - | From D&D Beyond URL |
| `DND_COBALT_SESSION` | ✓ | - | From browser cookies (sensitive!) |
| `OBS_WEBSOCKET_URL` | | `ws://localhost:4455` | OBS WebSocket endpoint |
| `OBS_WEBSOCKET_PASSWORD` | | - | If password protected in OBS |
| `OBS_MODE` | ✓ | - | `image_swap` or `visibility_toggle` |
| `POLL_INTERVAL_MS` | | `5000` | Polling interval in ms (min: 3000) |
| `STAT_MAPPING_*` | | - | See Stat Mapping section |
| Mode-specific variables | * | - | See `.env.example` |

## Stat Mapping Configuration

### Overview

Map any D&D Beyond character stat to an OBS text source for live overlay updates.

**Format:**
```
STAT_MAPPING_<N>=<stat_id>:<obs_source_name>[:<format>]
```

- `<N>`: Sequential number (1, 2, 3, ...)
- `<stat_id>`: The stat identifier (see list below)
- `<obs_source_name>`: Exact name of the OBS text source
- `<format>`: (Optional) Text format with `{value}` placeholder

### Examples

```env
# Display AC value: "AC 15"
STAT_MAPPING_1=ac:Text_AC:AC {value}

# Display HP with auto-formatting: "72/125"
STAT_MAPPING_2=hp_display:Text_HP

# Display level: "Lvl 5"
STAT_MAPPING_3=level:Text_Level:Lvl {value}

# Display initiative with modifier sign: "+2"
STAT_MAPPING_4=initiative:Text_Initiative:{value}

# Display passive perception: "PP 16"
STAT_MAPPING_5=passive_perception:Text_PP:PP {value}

# Display spell save DC (no format - shows value directly)
STAT_MAPPING_6=spell_save_dc:Text_SpellDC
```

### Available Stats

#### Basic
- **`level`** - Total character level (sum of all classes)
- **`ac`** - Armor Class

#### Hit Points
- **`hp_current`** - Current HP (number)
- **`hp_max`** - Maximum HP (number)
- **`hp_temp`** - Temporary HP (number)
- **`hp_display`** - Formatted as "72/125" (string)

#### Ability Scores
- **`strength`** - Strength score (8-20)
- **`dexterity`** - Dexterity score
- **`constitution`** - Constitution score
- **`intelligence`** - Intelligence score
- **`wisdom`** - Wisdom score
- **`charisma`** - Charisma score

#### Ability Modifiers
- **`strength_mod`** - Strength modifier ("+3" or "-1")
- **`dexterity_mod`** - Dexterity modifier
- **`constitution_mod`** - Constitution modifier
- **`intelligence_mod`** - Intelligence modifier
- **`wisdom_mod`** - Wisdom modifier
- **`charisma_mod`** - Charisma modifier

#### Combat Stats
- **`proficiency`** - Proficiency bonus ("+2" to "+6")
- **`initiative`** - Initiative bonus ("+5" or "-2")
- **`speed`** - Movement speed ("30 ft.")

#### Passive Checks
- **`passive_perception`** - Passive Perception (10 + WIS mod + prof if applicable)
- **`passive_investigation`** - Passive Investigation
- **`passive_insight`** - Passive Insight

#### Spellcasting
- **`spell_save_dc`** - Spell Save DC (8 + proficiency + spellcasting ability mod)
- **`spell_attack`** - Spell attack modifier ("+5" or "-1")

## Scripts

```bash
npm start          # Run the application
npm run dev        # Run with auto-reload (development)
npm run build      # Compile TypeScript to JavaScript
npm run clean      # Remove compiled files
```

## Architecture

```
┌─────────────────────────────────┐
│   Main Polling Loop (index.ts)   │
│     Every 5-10 seconds           │
└────────────────┬────────────────┘
                 │
     ┌───────────┴───────────┐
     ▼                       ▼
┌──────────────┐     ┌──────────────────┐
│ Poll D&D     │     │ Track Previous   │
│ Beyond API   │     │ HP State & Stats │
└──────┬───────┘     └──────┬───────────┘
       │                    │
       └────────┬───────────┘
                ▼
     ┌────────────────────────┐
     │ Calculate HP State &   │
     │ Character Stats        │
     └────────────┬───────────┘
                  │
        ┌─────────┴────────────┐
        │                      │
        ▼                      ▼
   ┌──────────┐         ┌──────────────┐
   │ HP State │         │ Stat Values  │
   │ Changed? │         │ Changed?     │
   └────┬─────┘         └────┬─────────┘
        │                    │
   ┌────┴────────┬───────────┴────┐
   ▼             ▼                ▼
 [Yes]        [Yes]            [No]
   │             │              │
   ▼             ▼              ▼
Update OBS  Update Text     Continue
 Visibility Sources
 / Image
```

## HP State Thresholds

| State | HP Range | Typical Visual |
|-------|----------|---|
| Healthy | > 75% | Green, full portrait |
| Scratched | 50-75% | Yellow, minor wounds |
| Bloodied | 25-50% | Orange, significant damage |
| Dying | 0-25% | Red, critical condition |
| Unconscious | 0 or death saves | Gray/black, unconscious |

## Project Structure

```
obs-dndbeyond-automation/
├── PLAN.md                         # Detailed implementation plan
├── README.md                        # This file
├── package.json                    # Dependencies
├── tsconfig.json                   # TypeScript config
├── .env.example                    # Configuration template
├── .gitignore                      # Git exclusions
├── src/
│   ├── index.ts                   # Main entry point
│   ├── config.ts                  # Configuration loading
│   ├── types.ts                   # TypeScript types
│   ├── dnd-beyond/
│   │   ├── client.ts              # D&D Beyond API client
│   │   └── hp-calculator.ts       # HP state calculation
│   ├── stats/
│   │   ├── index.ts               # Stat calculation orchestrator
│   │   ├── calculator.ts          # Stat value computation
│   │   ├── definitions.ts         # All stat definitions
│   │   └── types.ts               # Stat types
│   └── obs/
│       └── client.ts              # OBS WebSocket client
└── dist/                           # Compiled output (generated)
```

## Troubleshooting

### "Cannot read character data"
- Verify `DND_CHARACTER_ID` is correct (from URL)
- Get a fresh `DND_COBALT_SESSION` cookie from browser DevTools
- Check internet connection
- Try the manual test below

### "Failed to connect to OBS WebSocket"
- Ensure OBS is running
- Enable WebSocket Server: Tools → WebSocket Server Settings → Enable
- Verify `OBS_WEBSOCKET_URL` matches OBS settings (usually `ws://localhost:4455`)
- Check firewall isn't blocking the connection

### "Scene item not found" (visibility_toggle mode)
- Verify scene items are named exactly: `healthy`, `scratched`, `bloodied`, `dying`, `unconscious`
- Names are case-sensitive
- Ensure items exist in the scene specified by `OBS_SCENE_NAME`

### "Source not found" (image_swap mode)
- Verify source name in `OBS_SOURCE_NAME` matches exactly (case-sensitive)
- Ensure the source exists in your OBS scene

### No OBS updates even though app runs
- Take or heal damage on character sheet (app only updates on change)
- Check OBS source/scene names match configuration exactly
- Verify file paths are correct and use forward slashes (e.g., `C:/path/file.png`)

### Stat values not updating
- Verify `STAT_MAPPING_X` format is correct: `stat_id:obs_source_name:optional_format`
- Check that OBS text sources exist and have exact names from config
- Ensure stat IDs match the available stats list above
- If using custom format, include `{value}` placeholder

## Development

### Type Safety
- Full TypeScript strict mode enabled
- No `any` types used
- Type definitions for all public APIs

### Error Handling
- Try/catch throughout
- Graceful degradation on API failures
- Automatic reconnection on WebSocket drops
- Detailed error logging with context

### Logging
- Timestamped console output
- Colored status indicators (✓ for success, ✗ for failure, ⚠ for warnings)
- Poll number tracking for debugging
- Detailed stat change logging

## Dependencies

- **obs-websocket-js**: OBS WebSocket protocol v5 (OBS 28+)
- **dotenv**: Environment variable loading
- **@types/node**: Node.js type definitions
- **typescript**: TypeScript compiler

## Security Notes

- Never commit `.env` file to version control (`.gitignore` includes it)
- `DND_COBALT_SESSION` is sensitive - treat like a password
- Use local OBS WebSocket when possible (avoid exposing to network)
- If exposing to network, use strong password in OBS settings

## Advanced Troubleshooting

### Testing D&D Beyond API manually
```bash
curl -H "Cookie: cobalt-session=YOUR_COOKIE" \
  https://character-service.dndbeyond.com/character/v5/character/YOUR_ID
```

### Testing OBS WebSocket connection
```bash
# In OBS: Tools → WebSocket Server Settings → Copy Connection Info
# Verify the URL and password are correct in your .env
```

### Enable verbose logging
Modify `src/index.ts` to add more console.log statements and rebuild:
```bash
npm run build
node dist/index.js
```

### Save API response for debugging
In `.env`, set:
```env
DEBUG_SAVE_API_RESPONSE=true
```
This will save the raw D&D Beyond API response to `api-response.json` on each poll (useful for debugging stat calculations). Note: This creates large files (~40KB per poll).

## Common Questions

**Q: Can I use both HP states and stat display?**  
A: Yes! Both work simultaneously. Configure `OBS_MODE` for HP and `STAT_MAPPING_*` for stats.

**Q: How often does it update?**  
A: Every 5-10 seconds by default (configurable via `POLL_INTERVAL_MS`). Only pushes changes to OBS when values actually change.

**Q: Can I display multiple stat values in one source?**  
A: Not directly. Each `STAT_MAPPING_X` is one stat → one source. Create multiple mappings if you want multiple stats on screen.

**Q: Which stats affect which calculations?**  
A: The calculator uses equipped/attuned items and all active modifiers (race, class, background, feats, conditions).

**Q: Does it work with temporary HP, abilities, buffs, etc.?**  
A: Yes! It reads the full character data including temp HP, all ability modifiers, item bonuses, feat bonuses, and active conditions.

## Support

For issues or questions:
1. Check the Troubleshooting section above
2. Verify configuration in `.env` matches your setup
3. Check OBS logs: Help → View Logs
4. Review application output for specific error messages
5. See `PLAN.md` for detailed architecture

---

**Made for D&D streamers and storytellers** 🐉
