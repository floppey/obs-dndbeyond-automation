# Release Instructions for OBS D&D Beyond Automation

## Overview

This document describes how to build and distribute the OBS D&D Beyond Automation tool as a standalone executable or as a Node.js application that users can run.

## Building Options

### Option 1: Node.js Application (RECOMMENDED for End Users)

This is the most straightforward distribution method:

1. Users install Node.js 18+ from nodejs.org
2. Extract your distribution ZIP containing:
   - package.json
   - package-lock.json  
   - dist/ (compiled JavaScript)
   - config.example.json
   - README.md

3. Users run:
```bash
npm install --production
npm start
```

**Pros:**
- Simple distribution (~10MB ZIP)
- Reliable cross-platform support
- Easy to update

**Cons:**
- Requires Node.js installation

### Option 2: Standalone .exe Executable (Windows Only)

A standalone executable CAN be built using pkg, but has limitations with ES modules:

```bash
npm run build:exe
```

**Note:** Due to pkg v5.8.1 limitations with ES modules, the generated .exe will fail when run. This is a known limitation of the pkg tool. We recommend using Option 1 instead.

**If you need a standalone .exe**, consider these alternatives:
- Upgrade to a newer Node.js bundler like **esbuild** with **ncc** or **vercel/pkg** fork that supports ESM
- Convert the project to CommonJS (breaking change)
- Use **Electron** for a full desktop app

## Recommended Distribution Method: Node.js App

### What to Include in ZIP

```
obs-dndbeyond-automation/
├── package.json                  (dependencies list)
├── package-lock.json             (locked versions)
├── dist/                         (compiled JavaScript)
│   ├── index.js
│   ├── config.js
│   └── ... (all compiled files)
├── config.example.json           (example configuration)
├── README.md                     (user guide)
├── CONFIGURATION_SYSTEM.md       (setup instructions)
└── .gitignore
```

### Build Steps for Distribution

```bash
# 1. Compile TypeScript
npm run build

# 2. Create distribution ZIP with:
# - package.json
# - package-lock.json
# - dist/ directory
# - config.example.json
# - README.md
# - CONFIGURATION_SYSTEM.md
```

### How End Users Use It

1. **Install Node.js:**
   - Visit nodejs.org and install Node.js 18 LTS or later
   - Verify installation: `node --version` in Command Prompt

2. **Extract and Setup:**
   ```bash
   # Extract ZIP to a folder
   cd obs-dndbeyond-automation
   
   # Install dependencies
   npm install --production
   
   # Copy example config
   copy config.example.json config.json
   ```

3. **Configure:**
   - Edit config.json with their D&D Beyond character ID and OBS WebSocket credentials
   - See CONFIGURATION_SYSTEM.md for detailed instructions

4. **Run:**
   ```bash
   npm start
   ```

   Or use the development mode with auto-reload:
   ```bash
   npm run dev
   ```

### Distribution ZIP Contents

- **Size:** ~15-20MB (includes node_modules dependencies)
- **setup.exe:** Node.js installer (~20MB) - optional separate download
- **Application files:** ~5MB

## Alternative: Standalone .exe (If Needed)

If you absolutely need a standalone .exe:

### Current Limitation

The provided `npm run build:exe` command uses `pkg` v5.8.1, which does NOT properly support ES modules (used in this project). The resulting .exe will fail with `ERR_REQUIRE_ESM`.

### Workarounds

**Option A: Switch to CommonJS**
- Modify tsconfig.json: `"module": "CommonJS"`
- Requires code changes to replace `import.meta` usage
- Not recommended due to project complexity

**Option B: Use Alternative Bundlers**
- **ncc** (Next.js): Better ES module support
- **esbuild**: Fast bundler with ES module support
- **Vercel's newer pkg versions**: Check GitHub for experimental ESM support
- **Electron**: If you want a desktop app experience

**Option C: Document Node.js Requirement**
- Distribute as Node.js app (recommended, simplest)
- Users install Node.js once, then your app works everywhere

## Version Management

To update the version:

1. Edit `package.json` and update the `version` field
2. Rebuild: `npm run build`
3. Create new distribution ZIP with updated dist/ directory

## GitHub Releases

To publish releases on GitHub:

1. Build the application: `npm run build`
2. Create a GitHub release with tag (e.g., `v1.0.0`)
3. Upload ZIP file with package.json, package-lock.json, dist/, and documentation
4. Include setup instructions:
   ```markdown
   ## OBS D&D Beyond Automation v1.0.0
   
   ### Requirements
   - Windows/macOS/Linux
   - Node.js 18 LTS or later (from nodejs.org)
   
   ### Quick Start
   1. Extract ZIP
   2. Open Command Prompt/Terminal in extracted folder
   3. Run: `npm install --production && npm start`
   4. Edit `config.json` with your settings
   
   ### Documentation
   - Setup: See CONFIGURATION_SYSTEM.md
   - Features: See README.md
   ```

## Development Setup vs. Distribution

### For Developers (Full Development)

```bash
# Install all dependencies
npm install

# Development mode with auto-reload
npm run dev

# Compile TypeScript
npm run build

# Run tests
npm test

# Production build
npm run build
```

### For End Users (Minimal Distribution)

Users only need:
- Node.js 18+
- Source files from distribution ZIP
- One command: `npm install --production && npm start`

## Building for Multiple Platforms

This is Node.js code, so it runs on:
- ✅ Windows (x64, ARM64)
- ✅ macOS (Intel, Apple Silicon)
- ✅ Linux (x64, ARM)

No special build needed - same ZIP works everywhere with Node.js!

## Troubleshooting for Users

### "npm: command not found"
→ User needs to install Node.js from nodejs.org

### "config.json not found"
→ User should copy config.example.json to config.json in the same directory

### "Cannot find module"
→ User should run `npm install --production` before running

### "Port already in use"
→ Close other instances or change the polling interval in config.json

## Support and Updates

### Issue Reporting
Users should report issues with:
- Error messages from running `npm start`
- Screenshots of config.json (without secrets)
- Operating system and Node.js version

### Easy Updates
Users can update by:
1. Extracting new ZIP over old folder (keeps config.json)
2. Running: `npm install --production`
3. Running: `npm start`

## File Structure for Distribution

```
obs-dndbeyond-automation-v1.0.0.zip
├── package.json                    (REQUIRED)
├── package-lock.json               (REQUIRED)
├── dist/                           (REQUIRED - compiled code)
├── config.example.json             (REQUIRED - template)
├── README.md                       (REQUIRED - guide)
├── CONFIGURATION_SYSTEM.md         (RECOMMENDED)
└── .npmrc (optional - for npm settings)

DO NOT INCLUDE:
- node_modules/ (users run npm install)
- src/ (users don't need source)
- TypeScript config files
- Test files
- Dev dependencies
```

## Summary

**Recommended Approach:**
- Distribute as Node.js application ZIP
- Users install Node.js once
- Application runs: `npm install --production && npm start`
- Simplest, most reliable, cross-platform compatible

**Why Not .EXE?**
- Current pkg version (5.8.1) doesn't support this project's ES modules
- Standalone EXEs are large (~50MB) and don't offer significant advantages
- Node.js installation is one-time requirement most developers/gamers already have

