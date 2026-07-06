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
  private shouldReconnect: boolean = true;
  private retryLoopActive: boolean = false;
  private retryDelayMs: number = 5000;

  constructor(config: OBSClientConfig) {
    this.config = config;
    this.obs = new OBSWebSocket();

    this.obs.on("ConnectionClosed", () => {
      // Failed connect attempts also emit this event - only react to a real drop
      if (!this.connected) {
        return;
      }
      console.warn("[OBS] ✗ Connection to OBS closed");
      this.connected = false;
      if (this.shouldReconnect) {
        this.connectWithRetry().catch((error) => {
          console.error(
            `[OBS] Reconnect loop failed: ${
              error instanceof Error ? error.message : String(error)
            }`
          );
        });
      }
    });

    this.obs.on("ConnectionError", (error) => {
      if (this.connected) {
        console.error(`[OBS] Connection error: ${error}`);
      }
      this.connected = false;
    });
  }

  /**
   * Connect to OBS WebSocket server (single attempt)
   * @throws Error if connection fails
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.obs.connect(this.config.websocketUrl, this.config.websocketPassword);

      this.connected = true;
      console.log("[OBS] ✓ Connected to OBS WebSocket");
    } catch (error) {
      this.connected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to connect to OBS WebSocket: ${errorMessage}`);
    }
  }

  /**
   * Connect to OBS, retrying until it becomes available.
   * Resolves once connected; never throws for connection failures.
   */
  async connectWithRetry(): Promise<void> {
    if (this.retryLoopActive) {
      return;
    }
    this.retryLoopActive = true;

    try {
      let attempt = 0;
      while (this.shouldReconnect && !this.connected) {
        attempt++;
        try {
          await this.connect();
          return;
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          // Log the first failure and then a reminder every ~30s to avoid spam
          if (attempt === 1) {
            console.warn(
              `[OBS] ${errorMessage} - waiting for OBS at ${this.config.websocketUrl}, retrying every ${this.retryDelayMs / 1000}s...`
            );
          } else if (attempt % 6 === 0) {
            console.warn(
              `[OBS] Still waiting for OBS (attempt ${attempt})...`
            );
          }
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs));
        }
      }
    } finally {
      this.retryLoopActive = false;
    }
  }

  /**
   * Disconnect from OBS WebSocket server
   */
  async disconnect(): Promise<void> {
    this.shouldReconnect = false;

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

   /**
    * Set text source content (for stat display)
    * @param sourceName - Name of the text source in OBS
    * @param text - Text content to display
    * @throws Error if update fails
    */
   async setText(sourceName: string, text: string): Promise<void> {
     if (!this.connected) {
       throw new Error("Not connected to OBS WebSocket");
     }

     try {
       await this.obs.call("SetInputSettings", {
         inputName: sourceName,
         inputSettings: {
           text: text,
         },
       });
       console.log(`[OBS] ✓ Updated text "${sourceName}": ${text}`);
     } catch (error) {
       const errorMessage = error instanceof Error ? error.message : String(error);
       console.warn(
         `[OBS] Warning: Failed to set text for "${sourceName}": ${errorMessage}`
       );
     }
   }
}
