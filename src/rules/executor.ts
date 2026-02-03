/**
 * Action Executor for the Rules Engine
 *
 * Executes rule actions against OBS based on evaluation results.
 * Provides variable interpolation support and error handling.
 *
 * @module rules/executor
 */

import { RuleAction, SetImageAction, SetVisibilityAction, SetTextAction, SetFilterVisibilityAction, SetInputSettingsAction, EvaluationContext } from "./types.js";
import { OBSClient } from "../obs/client.js";

/**
 * Executes rule actions against OBS
 *
 * Supports multiple action types with variable interpolation for text and image paths.
 * Continues executing actions even if individual actions fail.
 */
export class ActionExecutor {
  constructor(
    private obsClient: OBSClient,
    private context: EvaluationContext
  ) {}

  /**
   * Execute a list of actions
   * Continues even if individual actions fail
   *
   * @param actions - Array of actions to execute
   */
  async executeActions(actions: RuleAction[]): Promise<void> {
    if (actions.length === 0) {
      return;
    }

    console.log(`[ACTIONS] Executing ${actions.length} action(s)`);

    for (const action of actions) {
      await this.executeAction(action);
    }
  }

  /**
   * Execute a single action based on its type
   *
   * @param action - Action to execute
   */
  private async executeAction(action: RuleAction): Promise<void> {
    try {
      switch (action.type) {
        case "set_image":
          await this.executeSetImage(action);
          break;

        case "set_visibility":
          await this.executeSetVisibility(action);
          break;

        case "set_text":
          await this.executeSetText(action);
          break;

        case "set_filter_visibility":
          await this.executeSetFilterVisibility(action);
          break;

        case "set_input_settings":
          await this.executeSetInputSettings(action);
          break;

        default:
          const _exhaustive: never = action;
          console.warn(`[ACTIONS] Unknown action type: ${(_exhaustive as any).type}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[ACTIONS] Error executing action: ${errorMessage}`);
    }
  }

  /**
   * Execute a set_image action
   *
   * @param action - SetImageAction to execute
   */
  private async executeSetImage(action: SetImageAction): Promise<void> {
    const imagePath = this.interpolateVariables(action.imagePath);
    await this.obsClient.setImagePath(action.sourceName, imagePath);
  }

  /**
   * Execute a set_visibility action
   *
   * @param action - SetVisibilityAction to execute
   */
  private async executeSetVisibility(action: SetVisibilityAction): Promise<void> {
    await this.obsClient.setSourceVisibility(action.sceneName, action.itemName, action.visible);
  }

  /**
   * Execute a set_text action
   *
   * @param action - SetTextAction to execute
   */
  private async executeSetText(action: SetTextAction): Promise<void> {
    const text = this.interpolateVariables(action.text);
    await this.obsClient.setText(action.sourceName, text);
  }

  /**
   * Execute a set_filter_visibility action
   *
   * Uses OBS WebSocket call "SetSourceFilterEnabled"
   *
   * @param action - SetFilterVisibilityAction to execute
   */
  private async executeSetFilterVisibility(action: SetFilterVisibilityAction): Promise<void> {
    // Access the underlying OBSWebSocket through the obs property
    const obsWebSocket = (this.obsClient as any).obs;
    
    if (!obsWebSocket) {
      throw new Error("OBS WebSocket client not available");
    }

    await obsWebSocket.call("SetSourceFilterEnabled", {
      sourceName: action.sourceName,
      filterName: action.filterName,
      filterEnabled: action.visible,
    });

    const state = action.visible ? "enabled" : "disabled";
    console.log(`[ACTIONS] ✓ Filter "${action.filterName}" on source "${action.sourceName}" is now ${state}`);
  }

  /**
   * Execute a set_input_settings action
   *
   * Uses OBS WebSocket call "SetInputSettings"
   *
   * @param action - SetInputSettingsAction to execute
   */
  private async executeSetInputSettings(action: SetInputSettingsAction): Promise<void> {
    // Access the underlying OBSWebSocket through the obs property
    const obsWebSocket = (this.obsClient as any).obs;
    
    if (!obsWebSocket) {
      throw new Error("OBS WebSocket client not available");
    }

    await obsWebSocket.call("SetInputSettings", {
      inputName: action.inputName,
      inputSettings: action.settings,
    });

    console.log(`[ACTIONS] ✓ Updated input settings for "${action.inputName}"`);
  }

  /**
   * Replace {variable} placeholders in strings with values from the evaluation context
   *
   * Supported variables:
   * - {hp_current}, {current_hp}: Current HP value
   * - {hp_max}, {max_hp}: Maximum HP value
   * - {hp_temp}, {temp_hp}: Temporary HP value
   * - {hp_percentage}, {hp_percent}: HP as percentage (0-100)
   * - {hp_missing}: HP lost from maximum
   *
   * @param text - String with variable placeholders
   * @returns String with variables replaced
   */
  private interpolateVariables(text: string): string {
    return text.replace(/\{([^}]+)\}/g, (match, varName) => {
      switch (varName.toLowerCase()) {
        case "hp_current":
        case "current_hp":
          return String(this.context.currentHp);

        case "hp_max":
        case "max_hp":
          return String(this.context.maxHp);

        case "hp_temp":
        case "temp_hp":
          return String(this.context.temporaryHp);

        case "hp_percentage":
        case "hp_percent":
          return String(Math.round(this.context.hpPercentage));

        case "hp_missing":
          return String(this.context.maxHp - this.context.currentHp);

        default:
          console.warn(`[ACTIONS] Unknown variable: ${varName}`);
          return match; // Leave unchanged
      }
    });
  }
}
