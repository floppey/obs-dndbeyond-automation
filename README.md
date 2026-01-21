# OBS D&D Beyond HP Image Swapper

Automatically synchronize OBS scene elements with a D&D Beyond character's health state in real-time during live streaming.

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

### 4. Choose Operation Mode

**Option A: Image Swap Mode**
```env
OBS_MODE=image_swap
OBS_SOURCE_NAME=Character_Portrait
OBS_IMAGE_HEALTHY=C:/obs-images/healthy.png
OBS_IMAGE_SCRATCHED=C:/obs-images/scratched.png
OBS_IMAGE_BLOODIED=C:/obs-images/bloodied.png
OBS_IMAGE_DYING=C:/obs-images/dying.png
OBS_IMAGE_UNCONSCIOUS=C:/obs-images/unconscious.png
```

**Option B: Visibility Toggle Mode**
```env
OBS_MODE=visibility_toggle
OBS_SCENE_NAME=D&D Overlay
```
Then create scene items in OBS with these exact names: `healthy`, `scratched`, `bloodied`, `dying`, `unconscious`

### 5. Start the Application
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Features

- ✅ **Real-time HP Sync**: Polls D&D Beyond every 5-10 seconds (configurable)
- ✅ **Flexible Integration**: Choose between image swapping or visibility toggling
- ✅ **Smart State Detection**: 
  - Healthy (> 75%)
  - Scratched (50-75%)
  - Bloodied (25-50%)
  - Dying (0-25%)
  - Unconscious (0 HP or death saves)
- ✅ **Automatic Reconnection**: Gracefully handles connection drops
- ✅ **Type-Safe**: Full TypeScript coverage
- ✅ **Efficient**: Only updates OBS when state changes

## Configuration

See `.env.example` for all available options and their descriptions.

### Environment Variables

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `DND_CHARACTER_ID` | ✓ | - | From D&D Beyond URL |
| `DND_COBALT_SESSION` | ✓ | - | From browser cookies (sensitive!) |
| `OBS_WEBSOCKET_URL` | | `ws://localhost:4455` | OBS WebSocket endpoint |
| `OBS_WEBSOCKET_PASSWORD` | | - | If password protected in OBS |
| `OBS_MODE` | ✓ | - | `image_swap` or `visibility_toggle` |
| `POLL_INTERVAL_MS` | | `5000` | Polling interval in ms (min: 3000) |
| Mode-specific variables | * | - | See `.env.example` |

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
│ Beyond API   │     │ HP State         │
└──────────────┘     └──────────────────┘
                     
     └───────────┬───────────┘
                 ▼
         ┌──────────────────┐
         │ Calculate New    │
         │ HP State         │
         └──────────────────┘
                 │
         ┌───────┴────────┐
         ▼ (Changed)      │ (Same)
    ┌─────────────┐   [Continue]
    │ Update OBS  │
    │ via WS      │
    └─────────────┘
```

## HP State Thresholds

| State | HP Range | Typical Visual |
|-------|----------|---|
| Healthy | > 75% | Green, full portrait |
| Scratched | 50-75% | Yellow, minor wounds |
| Bloodied | 25-50% | Orange, significant damage |
| Dying | 0-25% | Red, critical condition |
| Unconscious | 0 or death saves | Gray/black, unconscious |

## Troubleshooting

### "Cannot read character data"
- Verify `DND_CHARACTER_ID` is correct (from URL)
- Get a fresh `DND_COBALT_SESSION` cookie from browser DevTools
- Check internet connection

### "Failed to connect to OBS WebSocket"
- Ensure OBS is running
- Enable WebSocket Server: Tools → WebSocket Server Settings → Enable
- Verify `OBS_WEBSOCKET_URL` matches OBS settings (usually `ws://localhost:4455`)
- Check firewall isn't blocking the connection

### "Scene item not found" (visibility_toggle mode)
- Verify scene items are named exactly: `healthy`, `scratched`, `bloodied`, `dying`, `unconscious`
- Names are case-sensitive
- Ensure items exist in the scene specified by `OBS_SCENE_NAME`

### No OBS updates even though app runs
- Take or heal damage on character sheet (app only updates on state change)
- Check OBS source/scene names match configuration exactly
- Verify files exist and paths are correct (use forward slashes: `C:/path/file.png`)

For more detailed troubleshooting, see `PLAN.md`.

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
│   │   ├── client.ts              # D&D Beyond API
│   │   └── hp-calculator.ts       # HP → State mapping
│   └── obs/
│       └── client.ts              # OBS WebSocket client
└── dist/                           # Compiled output (generated)
```

## Development

### Type Safety
- Full TypeScript strict mode enabled
- No `any` types used
- Type definitions for all public APIs

### Error Handling
- Try/catch throughout
- Graceful degradation on API failures
- Automatic reconnection on WebSocket drops
- Detailed error logging

### Logging
- Timestamped console output
- Colored status indicators (✓ for success, ✗ for failure, ⚠ for warnings)
- Poll number tracking for debugging

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

## License

MIT

## Troubleshooting for Advanced Users

### Testing D&D Beyond polling manually
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

## Support

For issues or questions:
1. Check `PLAN.md` for detailed architecture and troubleshooting
2. Verify configuration in `.env` matches your setup
3. Check OBS logs: Help → View Logs
4. Review application output for specific error messages

---

**Made for D&D streamers and storytellers** 🐉
