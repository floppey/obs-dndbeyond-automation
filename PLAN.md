# OBS D&D Beyond HP Image Swapper - Implementation Plan

## 1. Project Overview

**Purpose**: Automatically synchronize OBS scene elements with a D&D Beyond character's health state in real-time during live streaming.

**Core Functionality**:
- Poll D&D Beyond character API every 5-10 seconds
- Calculate HP percentage and map to health states
- Swap OBS image sources OR toggle scene visibility based on HP
- Support two operation modes: image swapping and visibility toggling
- Gracefully handle API failures and WebSocket disconnections

**Target Use Case**: D&D streaming where character HP states are reflected visually in real-time (e.g., portrait changes from healthy to bloodied as damage is taken).

---

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Main Event Loop (index.ts)               │
│  Runs on configurable interval (default: 5s)                 │
└────────────────┬────────────────────────────────────────────┘
                 │
     ┌───────────┴───────────┐
     ▼                       ▼
┌─────────────┐      ┌──────────────────┐
│  Poll D&D   │      │  Track Previous  │
│  Beyond API │      │  HP State        │
└─────────────┘      └──────────────────┘
     │                       │
     └───────────┬───────────┘
                 ▼
         ┌──────────────────┐
         │ Calculate New    │
         │ HP State         │
         └──────────────────┘
                 │
         ┌───────┴────────┐
         ▼ (State Changed)│
    ┌────────────┐       ▼ (No Change)
    │ Update OBS │    [Wait for next poll]
    │  via WS    │
    └────────────┘
         │
    ┌────┴─────────────┐
    ▼                  ▼
[Image Swap]    [Visibility Toggle]
Set source      Toggle scene item
file path       visibility
```

**Component Interaction**:
```
┌──────────────────────────────────────────────────────────┐
│                   Configuration (config.ts)              │
│  - Environment variables validation                      │
│  - Type-safe configuration object                        │
│  - Default values and validation                         │
└──────────────────────────────────────────────────────────┘
        │                           │                    │
        ▼                           ▼                    ▼
   ┌────────────┐          ┌────────────────┐  ┌──────────────┐
   │  D&D API   │          │ OBS WebSocket  │  │ Type System  │
   │  Client    │          │ Client         │  │ (types.ts)   │
   └────────────┘          └────────────────┘  └──────────────┘
        │                           │
        ▼                           ▼
   ┌────────────┐          ┌──────────────────┐
   │ HP State   │          │ Image/Visibility │
   │ Calculator │          │ Commands         │
   └────────────┘          └──────────────────┘
```

---

## 3. Implementation Phases

### Phase 1: Foundation ✓
- [x] Create project structure and package.json
- [x] Set up TypeScript configuration
- [x] Create type definitions (types.ts)
- [x] Create configuration system (config.ts)

### Phase 2: D&D Beyond Integration ✓
- [x] Implement D&D Beyond API client (dnd-beyond/client.ts)
- [x] Create HP calculation and state mapping logic (dnd-beyond/hp-calculator.ts)
- [x] Add error handling and retry logic

### Phase 3: OBS Integration ✓
- [x] Implement OBS WebSocket client (obs/client.ts)
- [x] Support image swap mode
- [x] Support visibility toggle mode
- [x] Handle connection/disconnection gracefully

### Phase 4: Main Application Loop ✓
- [x] Create main entry point (index.ts)
- [x] Implement polling loop
- [x] Add state change detection
- [x] Implement graceful shutdown
- [x] Add comprehensive logging

### Phase 5: Configuration & Documentation ✓
- [x] Create .env.example template
- [x] Create .gitignore
- [x] Add inline code comments
- [x] Document configuration options

---

## 4. Configuration Requirements

### Required Environment Variables

| Variable | Type | Required | Default | Description |
|----------|------|----------|---------|-------------|
| `DND_CHARACTER_ID` | string | ✓ | - | Character ID from D&D Beyond URL |
| `DND_COBALT_SESSION` | string | ✓ | - | Authentication cookie from D&D Beyond |
| `OBS_WEBSOCKET_URL` | string | | `ws://localhost:4455` | OBS WebSocket endpoint |
| `OBS_WEBSOCKET_PASSWORD` | string | | `` | OBS WebSocket password (if configured) |
| `POLL_INTERVAL_MS` | number | | `5000` | Polling interval in milliseconds |
| `OBS_MODE` | string | ✓ | - | Either `image_swap` or `visibility_toggle` |
| `OBS_SCENE_NAME` | string | * | - | Scene name (required if mode is `visibility_toggle`) |
| `OBS_SOURCE_NAME` | string | * | - | Source name (required if mode is `image_swap`) |
| `OBS_IMAGE_HEALTHY` | string | * | - | Image path for healthy state (image_swap mode) |
| `OBS_IMAGE_SCRATCHED` | string | * | - | Image path for scratched state (image_swap mode) |
| `OBS_IMAGE_BLOODIED` | string | * | - | Image path for bloodied state (image_swap mode) |
| `OBS_IMAGE_DYING` | string | * | - | Image path for dying state (image_swap mode) |
| `OBS_IMAGE_UNCONSCIOUS` | string | * | - | Image path for unconscious state (image_swap mode) |

**Notes**:
- Variables marked with `*` are conditionally required based on `OBS_MODE`
- All image paths should use forward slashes or escaped backslashes (e.g., `C:/path/file.png`)
- `DND_COBALT_SESSION` is sensitive - never commit `.env` to git

### Obtaining D&D Beyond Credentials

1. Log in to D&D Beyond
2. Navigate to your character sheet
3. Look at the URL: `https://www.dndbeyond.com/characters/{CHARACTER_ID}/...`
4. In browser DevTools (F12):
   - Network tab
   - Refresh page
   - Find request to `character-service.dndbeyond.com`
   - Copy `cobalt-session` cookie value from Request Headers

---

## 5. Usage Instructions

### Quick Start

1. **Clone and install**:
   ```bash
   cd obs-dndbeyond-automation
   npm install
   ```

2. **Configure environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your credentials and paths
   ```

3. **For Image Swap Mode**:
   ```env
   OBS_MODE=image_swap
   OBS_SOURCE_NAME=Character_Portrait
   OBS_IMAGE_HEALTHY=C:/obs-images/healthy.png
   OBS_IMAGE_SCRATCHED=C:/obs-images/scratched.png
   OBS_IMAGE_BLOODIED=C:/obs-images/bloodied.png
   OBS_IMAGE_DYING=C:/obs-images/dying.png
   OBS_IMAGE_UNCONSCIOUS=C:/obs-images/unconscious.png
   ```

4. **For Visibility Toggle Mode**:
   ```env
   OBS_MODE=visibility_toggle
   OBS_SCENE_NAME=D&D Overlay
   ```
   Then in OBS, create scene items named: `healthy`, `scratched`, `bloodied`, `dying`, `unconscious`

5. **Start the application**:
   ```bash
   npm start
   ```

   Or for development with auto-reload:
   ```bash
   npm run dev
   ```

6. **Build for production**:
   ```bash
   npm run build
   node dist/index.js
   ```

### Output Example

```
[2026-01-21T17:30:45.123Z] Initializing OBS D&D Beyond HP Swapper...
[2026-01-21T17:30:45.234Z] Configuration loaded: image_swap mode
[2026-01-21T17:30:45.456Z] Connecting to OBS WebSocket at ws://localhost:4455...
[2026-01-21T17:30:45.789Z] ✓ Connected to OBS WebSocket
[2026-01-21T17:30:50.123Z] Poll #1: Character HP 28/30 (93%) → healthy
[2026-01-21T17:30:55.456Z] Poll #2: Character HP 28/30 (93%) → healthy [no change]
[2026-01-21T17:31:00.789Z] Poll #3: Character HP 12/30 (40%) → scratched
[2026-01-21T17:31:00.890Z] ✓ Updated OBS source "Character_Portrait" with image: C:/obs-images/scratched.png
```

---

## 6. Troubleshooting Guide

### Issue: "Cannot read character data"

**Symptoms**: Application crashes immediately after first poll attempt

**Causes**:
- Invalid `DND_CHARACTER_ID` (check D&D Beyond URL)
- Expired `DND_COBALT_SESSION` cookie
- D&D Beyond API is down (rare)

**Solutions**:
1. Verify character ID from URL
2. Get fresh `cobalt-session` cookie from browser DevTools
3. Check internet connectivity
4. Try polling manually: `curl -H "Cookie: cobalt-session=YOUR_COOKIE" https://character-service.dndbeyond.com/character/v5/character/YOUR_ID`

### Issue: "Failed to connect to OBS WebSocket"

**Symptoms**: Error after "Connecting to OBS WebSocket..."

**Causes**:
- OBS not running
- OBS WebSocket server not enabled
- Wrong `OBS_WEBSOCKET_URL`
- Firewall blocking connection

**Solutions**:
1. Ensure OBS is running
2. In OBS: Tools → WebSocket Server Settings → Enable
3. Check configured port (usually 4455 for OBS 28+)
4. Verify URL format: `ws://localhost:4455` (WebSocket, not HTTP)
5. Try connecting locally first, then test remote addresses

### Issue: "Invalid image path or file not found"

**Symptoms**: OBS update succeeds but image doesn't change

**Causes**:
- Image path uses Windows backslashes (need forward slashes)
- File doesn't exist at specified path
- File permissions issue

**Solutions**:
1. Use forward slashes: `C:/obs-images/file.png` not `C:\obs-images\file.png`
2. Verify files exist and paths are absolute
3. Check file permissions (OBS process needs read access)
4. In OBS, test path manually: Sources → Image → Browse

### Issue: "Scene item not found" (visibility_toggle mode)

**Symptoms**: Error message when trying to toggle visibility

**Causes**:
- Scene item names don't match config exactly (case-sensitive)
- Scene items don't exist in specified scene

**Solutions**:
1. In OBS, check exact spelling of scene items (must be: `healthy`, `scratched`, `bloodied`, `dying`, `unconscious`)
2. Verify items are in the correct scene specified by `OBS_SCENE_NAME`
3. All five items must exist (or only unhidden states will update)

### Issue: "Polling seems to lag or get stale data"

**Symptoms**: HP changes take 10+ seconds to appear, or shows old values

**Causes**:
- `POLL_INTERVAL_MS` set too high
- Network latency to D&D Beyond
- OBS WebSocket latency

**Solutions**:
1. Reduce `POLL_INTERVAL_MS` (be respectful to D&D Beyond API, don't go below 3000)
2. Check network latency: `ping character-service.dndbeyond.com`
3. For smoother streaming, set to 3000-5000ms range
4. Verify character is being edited on current tab (not in background)

### Issue: "Connection drops unexpectedly"

**Symptoms**: Application stops updating, then may reconnect

**Causes**:
- Network interruption
- OBS restarts or crashes
- Screensaver/sleep mode activated

**Solutions**:
1. Application automatically attempts to reconnect
2. Check firewall/antivirus isn't blocking connection
3. Avoid leaving computer in sleep mode
4. Monitor logs for "Connection lost" messages

### Issue: "No updates after starting application"

**Symptoms**: Application runs but OBS never changes, or scene items don't toggle

**Causes**:
- Previous HP state is same as current (no state change detected)
- Wrong scene/source names configured
- OBS update commands failing silently

**Solutions**:
1. Take or heal damage on character sheet - application only updates when state changes
2. Check `OBS_SCENE_NAME` and `OBS_SOURCE_NAME` against OBS exactly
3. Check console logs for errors (run with `npm run dev` for verbose output)
4. In OBS, manually verify source/scene exists and responds to updates

---

## 7. Development Notes

### Adding New HP States

To add a new HP state (e.g., `critical` for HP ≤ 10%):

1. Update `HpState` enum in `types.ts`
2. Update threshold logic in `dnd-beyond/hp-calculator.ts`
3. Add image path in `.env.example` and config
4. Create scene items in OBS with matching names
5. Restart application

### Performance Considerations

- Each poll makes one HTTPS request to D&D Beyond
- Keep `POLL_INTERVAL_MS` ≥ 3000ms to respect D&D Beyond API rate limits
- OBS WebSocket updates are near-instantaneous (< 100ms)
- Memory usage minimal (~30-50MB) even with continuous polling

### Testing Without OBS

To test D&D Beyond polling without OBS:
```bash
# Modify index.ts temporarily to skip OBS connection
# Or set OBS_MODE to non-existent value and catch error handling
```

To test OBS updates without D&D Beyond:
```bash
# Modify index.ts to use mock HP data
const mockHpData = { currentHitPoints: 15, maxHitPoints: 30 };
```

---

## 8. File Structure Reference

```
obs-dndbeyond-automation/
├── PLAN.md                         # This file
├── package.json                    # Project metadata and dependencies
├── tsconfig.json                   # TypeScript compiler configuration
├── .env.example                    # Environment variable template
├── .gitignore                      # Git exclusion rules
├── src/
│   ├── index.ts                   # Main entry point and polling loop
│   ├── config.ts                  # Configuration validation and parsing
│   ├── types.ts                   # TypeScript interfaces and enums
│   ├── dnd-beyond/
│   │   ├── client.ts              # D&D Beyond API client
│   │   └── hp-calculator.ts       # HP → State mapping logic
│   └── obs/
│       └── client.ts              # OBS WebSocket client and controllers
└── dist/                           # Compiled JavaScript (after npm run build)
    └── [same structure as src/]
```

---

## Summary

This is a production-ready automation tool for D&D streaming that:
- ✓ Polls D&D Beyond in real-time
- ✓ Calculates HP state with configurable thresholds
- ✓ Updates OBS via WebSocket with zero dependencies beyond obs-websocket-js
- ✓ Supports two flexible integration modes (image swap and visibility toggle)
- ✓ Handles errors gracefully with automatic reconnection
- ✓ Provides clear logging for debugging
- ✓ Type-safe throughout with full TypeScript coverage

**Estimated Setup Time**: 10-15 minutes (get cookie, copy images, configure .env, npm install, npm start)
