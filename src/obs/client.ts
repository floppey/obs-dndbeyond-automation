/**
 * OBS WebSocket client
 * Handles communication with OBS via WebSocket protocol
 */

import OBSWebSocket from "obs-websocket-js";
import { OBSClientConfig } from "../types.js";

/**
 * Client for controlling OBS via WebSocket
 */
export class OBSClient {
  private config: OBSClientConfig;
  private obs: OBSWebSocket;
  private connected: boolean = false;

  constructor(config: OBSClientConfig) {
    this.config = config;
    this.obs = new OBSWebSocket();
  }

  /**
   * Connect to OBS WebSocket server
   * @throws Error if connection fails
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      console.log(
        `[OBS] Connecting to OBS WebSocket at ${this.config.websocketUrl}...`
      );

      await this.obs.connect(this.config.websocketUrl, this.config.websocketPassword);

      this.connected = true;
      console.log("[OBS] ✓ Connected to OBS WebSocket");

      // Set up disconnection handler
      this.obs.on("ConnectionClosed", () => {
        console.warn("[OBS] ✗ Connection to OBS closed");
        this.connected = false;
      });

      this.obs.on("ConnectionError", (error) => {
        console.error(`[OBS] Connection error: ${error}`);
        this.connected = false;
      });
    } catch (error) {
      this.connected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to OBS WebSocket: ${errorMessage}`);
    }
  }

  /**
   * Disconnect from OBS WebSocket server
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.obs.disconnect();
      this.connected = false;
      console.log("[OBS] Disconnected from OBS WebSocket");
    } catch (error) {
      console.error(
        `[OBS] Error during disconnect: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Check if currently connected to OBS
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Set image source file path (for image_swap mode)
   * @param sourceName - Name of the image source in OBS
   * @param imagePath - Full path to the image file
   * @throws Error if update fails
   */
  async setImagePath(sourceName: string, imagePath: string): Promise<void> {
    if (!this.connected) {
      throw new Error("Not connected to OBS WebSocket");
    }

     try {
       // Use correct API for OBS 28+ (obs-websocket-js v5)
       // The settings are nested under the source settings
       await this.obs.call("SetInputSettings", {
         inputName: sourceName,
         inputSettings: {
           file: imagePath,
         },
       });

      console.log(`[OBS] ✓ Updated source "${sourceName}" with image: ${imagePath}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to update OBS image source: ${errorMessage}`);
    }
  }

  /**
   * Set scene item visibility (for visibility_toggle mode)
   * @param sceneName - Name of the scene
   * @param itemName - Name of the scene item (source name in the scene)
   * @param visible - Whether to show or hide the item
   * @throws Error if update fails
   */
  async setSourceVisibility(
    sceneName: string,
    itemName: string,
    visible: boolean
  ): Promise<void> {
    if (!this.connected) {
      throw new Error("Not connected to OBS WebSocket");
    }

    try {
      // Get scene item ID first
      const sceneItemResponse = await this.obs.call("GetSceneItemId", {
        sceneName: sceneName,
        sourceName: itemName,
      });

      const sceneItemId = sceneItemResponse.sceneItemId as number;

      // Then set its visibility
      await this.obs.call("SetSceneItemEnabled", {
        sceneName: sceneName,
        sceneItemId: sceneItemId,
        sceneItemEnabled: visible,
      });

      const state = visible ? "shown" : "hidden";
      console.log(`[OBS] ✓ Scene item "${itemName}" in scene "${sceneName}" is now ${state}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      // Don't throw on visibility errors - some items might not exist
      console.warn(
        `[OBS] Warning: Failed to set visibility for "${itemName}": ${errorMessage}`
      );
    }
  }
}
