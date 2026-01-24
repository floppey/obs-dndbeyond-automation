/**
 * Interactive setup wizard for configuration
 * Uses Node.js readline to prompt user for configuration values
 */

import readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { JsonConfig, JsonConfigImages } from "./types.js";

/**
 * Create a readline interface for prompting
 */
function createInterface(): readline.Interface {
  return readline.createInterface({ input, output });
}

/**
 * Prompt user for a single input with optional validation
 */
async function prompt(
  rl: readline.Interface,
  question: string,
  defaultValue?: string,
  validator?: (value: string) => boolean | string
): Promise<string> {
  let value: string;

  while (true) {
    const displayQuestion = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
    value = await rl.question(displayQuestion);

    // Use default if empty
    if (!value && defaultValue) {
      value = defaultValue;
    }

    // Validate if validator provided
    if (validator) {
      const result = validator(value);
      if (result === true) {
        break;
      }
      if (typeof result === "string") {
        console.log(`  ❌ ${result}`);
        continue;
      }
    } else {
      // No validator, just require non-empty
      if (value) {
        break;
      }
      console.log("  ❌ Value cannot be empty");
    }
  }

  return value;
}

/**
 * Prompt yes/no question
 */
async function promptYesNo(rl: readline.Interface, question: string, defaultYes = false): Promise<boolean> {
  const defaultStr = defaultYes ? "[Y/n]" : "[y/N]";
  const answer = await rl.question(`${question} ${defaultStr}: `);
  const normalized = answer.toLowerCase().trim();

  if (normalized === "") {
    return defaultYes;
  }

  return normalized === "y" || normalized === "yes";
}

/**
 * Format helper text
 */
function printHelp(title: string, content: string): void {
  console.log(`\n  ℹ️  ${title}:`);
  console.log(`     ${content}\n`);
}

/**
 * Run interactive setup wizard
 */
export async function runSetupWizard(): Promise<JsonConfig> {
  const rl = createInterface();

  console.log("\n╔════════════════════════════════════════════════════════════╗");
  console.log("║                                                            ║");
  console.log("║    OBS D&D Beyond HP Swapper - Configuration Setup         ║");
  console.log("║                                                            ║");
  console.log("╚════════════════════════════════════════════════════════════╝\n");

  try {
    // D&D Beyond Configuration
    console.log("📚 D&D BEYOND CONFIGURATION\n");

    const characterId = await prompt(
      rl,
      "Character ID",
      undefined,
      (val) => {
        if (!/^\d+$/.test(val)) {
          return "Character ID must be numeric";
        }
        return true;
      }
    );
    printHelp(
      "Finding Character ID",
      "Open your character sheet in D&D Beyond and look at the URL: dndbeyond.com/characters/[ID]/[name]"
    );

    const cobaltSession = await prompt(
      rl,
      "Cobalt Session Token",
      undefined,
      (val) => (val.length > 10 ? true : "Token seems too short")
    );
    printHelp(
      "Finding Cobalt Session",
      "See the README for instructions. Open browser DevTools (F12), go to Storage → Cookies, search for 'cobalt_session'"
    );

    // OBS Configuration
    console.log("\n🎬 OBS CONFIGURATION\n");

    const websocketUrl = await prompt(
      rl,
      "OBS WebSocket URL",
      "ws://localhost:4455",
      (val) => {
        if (!val.startsWith("ws://") && !val.startsWith("wss://")) {
          return "Must start with ws:// or wss://";
        }
        return true;
      }
    );

    const hasPassword = await promptYesNo(rl, "Does your OBS WebSocket require a password?", false);
    let websocketPassword: string | undefined;
    if (hasPassword) {
      websocketPassword = await prompt(rl, "OBS WebSocket Password");
    }

    console.log("\n  Mode selection:");
    console.log("    1. image_swap - Swap image source when HP changes");
    console.log("    2. visibility_toggle - Toggle source visibility per HP state\n");

    const mode = await prompt(
      rl,
      "Select mode (1 or 2)",
      "1",
      (val) => {
        if (val === "1" || val === "image_swap") {
          return true;
        }
        if (val === "2" || val === "visibility_toggle") {
          return true;
        }
        return "Enter 1 or 2";
      }
    );
    const selectedMode = mode === "1" || mode === "image_swap" ? "image_swap" : "visibility_toggle";

    let sceneName: string | undefined;
    let sourceName: string | undefined;
    let images: JsonConfigImages | undefined;

    if (selectedMode === "image_swap") {
      console.log("\n  📁 IMAGE SWAP MODE\n");
      sourceName = await prompt(rl, "OBS Image Source Name");
      printHelp("Image Source", "This is the name of the image source in OBS you want to swap");

      console.log("  Now provide the image paths for each HP state:\n");

      const imagePathValidator = (val: string) => {
        // Basic validation - should be a file path
        if (!val || val.length < 2) {
          return "Path cannot be empty";
        }
        return true;
      };

      images = {
        healthy: await prompt(rl, "    Image path for HEALTHY (>75% HP)", undefined, imagePathValidator),
        scratched: await prompt(rl, "    Image path for SCRATCHED (>50% HP)", undefined, imagePathValidator),
        bloodied: await prompt(rl, "    Image path for BLOODIED (>25% HP)", undefined, imagePathValidator),
        dying: await prompt(rl, "    Image path for DYING (>0% HP)", undefined, imagePathValidator),
        unconscious: await prompt(rl, "    Image path for UNCONSCIOUS (0% HP)", undefined, imagePathValidator),
      };
    } else {
      console.log("\n  👁️  VISIBILITY TOGGLE MODE\n");
      sceneName = await prompt(rl, "OBS Scene Name");
      printHelp("Scene Name", "This is the OBS scene where source items will be toggled");
    }

    // Polling Configuration
    console.log("\n⏱️  POLLING CONFIGURATION\n");
    const intervalMs = await prompt(
      rl,
      "Polling interval (milliseconds)",
      "5000",
      (val) => {
        const num = parseInt(val, 10);
        if (isNaN(num) || num < 1000) {
          return "Must be a number >= 1000";
        }
        return true;
      }
    );
    printHelp(
      "Polling Interval",
      "How often to check for HP changes (in milliseconds). 5000ms = 5 seconds. Minimum is 1000ms"
    );

    // Game Log Configuration
    console.log("\n🎲 GAME LOG CONFIGURATION (Optional)\n");
    const enableGameLog = await promptYesNo(rl, "Enable game log polling for dice rolls?", false);

    let gameLogConfig;
    if (enableGameLog) {
      const gameId = await prompt(rl, "Game ID");
      printHelp("Game ID", "Find this in your game URL on D&D Beyond: dndbeyond.com/campaigns/[CAMPAIGN]/games/[GAME_ID]");

      const userId = await prompt(rl, "User ID");
      printHelp("User ID", "This is your D&D Beyond user ID. Check in browser DevTools Storage → Cookies");

      const pollIntervalMs = await prompt(rl, "Game log polling interval (ms)", "3000", (val) => {
        const num = parseInt(val, 10);
        if (isNaN(num) || num < 1000) {
          return "Must be a number >= 1000";
        }
        return true;
      });

      const enableLastRoll = await promptYesNo(rl, "Show last roll in OBS?", false);
      let lastRoll;
      if (enableLastRoll) {
        const sourceName = await prompt(rl, "  OBS source name for last roll");
        const format = await prompt(
          rl,
          "  Display format (e.g., '{character} {action} = {total}')",
          "{character} {action} = {total}"
        );
        lastRoll = { sourceName, format };
      }

      const enableRollHistory = await promptYesNo(rl, "Show roll history in OBS?", false);
      let rollHistory;
      if (enableRollHistory) {
        const sourceName = await prompt(rl, "  OBS source name for roll history");
        const format = await prompt(rl, "  Display format per roll (e.g., '{character} {action} = {total}')", "{character} {action} = {total}");
        const count = await prompt(rl, "  Number of rolls to show", "5", (val) => {
          const num = parseInt(val, 10);
          if (isNaN(num) || num < 1) {
            return "Must be a positive number";
          }
          return true;
        });
        rollHistory = { sourceName, format, count: parseInt(count, 10) };
      }

      gameLogConfig = {
        enabled: true,
        gameId,
        userId,
        pollIntervalMs: parseInt(pollIntervalMs, 10),
        lastRoll,
        rollHistory,
      };
    } else {
      gameLogConfig = {
        enabled: false,
      };
    }

    // Debug Configuration
    console.log("\n🐛 DEBUG CONFIGURATION (Optional)\n");
    const debugSaveApiResponse = await promptYesNo(rl, "Save API responses for debugging?", false);

    // Build final configuration
    const config: JsonConfig = {
      dndBeyond: {
        characterId,
        cobaltSession,
      },
      obs: {
        websocketUrl,
        websocketPassword,
        mode: selectedMode,
        sceneName,
        sourceName,
        images,
      },
      polling: {
        intervalMs: parseInt(intervalMs, 10),
      },
      gameLog: gameLogConfig,
      debug: {
        saveApiResponse: debugSaveApiResponse,
      },
    };

    // Summary
    console.log("\n╔════════════════════════════════════════════════════════════╗");
    console.log("║                   Configuration Summary                     ║");
    console.log("╚════════════════════════════════════════════════════════════╝\n");
    console.log(`  📚 D&D Beyond:`);
    console.log(`     Character ID: ${characterId}`);
    console.log(`     Cobalt Session: ***[REDACTED]***\n`);
    console.log(`  🎬 OBS:`);
    console.log(`     WebSocket URL: ${websocketUrl}`);
    console.log(`     Password: ${websocketPassword ? "***[SET]***" : "Not set"}`);
    console.log(`     Mode: ${selectedMode}`);
    if (selectedMode === "image_swap") {
      console.log(`     Source Name: ${sourceName}`);
    } else {
      console.log(`     Scene Name: ${sceneName}`);
    }
    console.log(`\n  ⏱️  Polling: ${config.polling.intervalMs}ms`);
    console.log(`  🎲 Game Log: ${gameLogConfig.enabled ? "Enabled" : "Disabled"}`);
    console.log(`  🐛 Debug: ${debugSaveApiResponse ? "Enabled" : "Disabled"}\n`);

    const confirm = await promptYesNo(rl, "Save configuration?", true);
    if (!confirm) {
      console.log("\n❌ Configuration cancelled. Exiting.\n");
      process.exit(0);
    }

    console.log("\n✅ Configuration saved to config.json\n");
    return config;
  } finally {
    rl.close();
  }
}
