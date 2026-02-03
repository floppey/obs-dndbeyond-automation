/**
 * Embedded Web Server for Rules Configuration UI
 * 
 * Provides a local web interface for managing rule configurations
 * with real-time character state preview.
 * 
 * @module web/server
 */

import express, { Express, Request, Response } from "express";
import { Server } from "http";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs/promises";
import { RuleEngineConfig, EvaluationContext } from "../rules/types.js";
import { Config } from "../types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Web server for rules configuration UI
 */
export class WebServer {
  private app: Express;
  private server: Server | null = null;
  private config: Config;
  private sseClients: Set<Response> = new Set();
  private currentContext: EvaluationContext | null = null;
  private onConfigUpdate?: (rulesConfig: RuleEngineConfig) => Promise<void>;
  private configPath: string;

  constructor(config: Config, configPath: string = "config.json") {
    this.config = config;
    this.configPath = configPath;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Set callback for when config is updated via UI
   */
  setConfigUpdateHandler(handler: (rulesConfig: RuleEngineConfig) => Promise<void>): void {
    this.onConfigUpdate = handler;
  }

  /**
   * Update the current evaluation context (called from poll loop for live preview)
   */
  updateContext(context: EvaluationContext): void {
    this.currentContext = context;
    this.broadcastState();
  }

  /**
   * Start the web server
   */
  async start(port: number = 3000): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(port, "127.0.0.1", () => {
          console.log(`[WEB] ✓ Configuration UI available at http://localhost:${port}`);
          resolve();
        });
        
        if (this.server) {
          this.server.on("error", (error: NodeJS.ErrnoException) => {
            if (error.code === "EADDRINUSE") {
              console.warn(`[WEB] Port ${port} in use, trying ${port + 1}...`);
              this.server = this.app.listen(port + 1, "127.0.0.1", () => {
                console.log(`[WEB] ✓ Configuration UI available at http://localhost:${port + 1}`);
                resolve();
              });
            } else {
              reject(error);
            }
          });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the web server
   */
  async stop(): Promise<void> {
    return new Promise((resolve) => {
      // Close all SSE connections
      for (const client of this.sseClients) {
        client.end();
      }
      this.sseClients.clear();

      if (this.server) {
        this.server.close(() => {
          console.log("[WEB] Server stopped");
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    this.app.use(express.json({ limit: "1mb" }));
    
    // Serve static files from web-ui directory
    // When packaged with pkg, files are in the snapshot filesystem
    const webUiPath = this.getWebUiPath();
    console.log(`[WEB] Serving static files from: ${webUiPath}`);
    this.app.use(express.static(webUiPath));
  }

  /**
   * Get the correct path to web-ui folder
   * Handles both development (source) and packaged (exe) environments
   */
  private getWebUiPath(): string {
    // Check if running as packaged executable
    // @ts-expect-error - process.pkg is added by pkg at runtime
    if (process.pkg) {
      // In packaged mode, assets are in the snapshot filesystem
      // pkg places assets relative to the bundle location
      return path.join(__dirname, '../web-ui');
    }
    
    // Development mode - relative to source file location
    return path.join(__dirname, '../../web-ui');
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get("/api/health", (_req: Request, res: Response) => {
      res.json({ status: "ok", timestamp: Date.now() });
    });

     // Get current full configuration - read from file to get latest
     this.app.get("/api/config", async (_req: Request, res: Response) => {
       try {
         const configContent = await fs.readFile(this.configPath, "utf-8");
         const jsonConfig = JSON.parse(configContent);
         res.json(jsonConfig);
       } catch (error) {
         const errorMsg = error instanceof Error ? error.message : String(error);
         console.error(`[WEB] Failed to read config: ${errorMsg}`);
         res.status(500).json({ error: errorMsg });
       }
     });

     // Update full configuration
     this.app.put("/api/config", async (req: Request, res: Response) => {
       try {
         const newConfig = req.body;
         
         // Validate required fields
         if (!newConfig.dndBeyond?.characterId || !newConfig.dndBeyond?.cobaltSession) {
           res.status(400).json({ 
             success: false, 
             error: "Missing required D&D Beyond settings (characterId, cobaltSession)" 
           });
           return;
         }
         if (!newConfig.obs?.websocketUrl) {
           res.status(400).json({ 
             success: false, 
             error: "Missing OBS websocket URL" 
           });
           return;
         }
         
         // Write to config.json
         await fs.writeFile(this.configPath, JSON.stringify(newConfig, null, 2));
         
         // Update in-memory config
         this.config = newConfig;
         
         console.log("[WEB] ✓ Configuration updated");
         res.json({ 
           success: true, 
           message: "Settings saved. Restart the application for connection changes to take effect." 
         });
       } catch (error) {
         const errorMsg = error instanceof Error ? error.message : String(error);
         console.error(`[WEB] Failed to save config: ${errorMsg}`);
         res.status(500).json({ success: false, error: errorMsg });
       }
     });

    // Get rules configuration - read from file to get latest
    this.app.get("/api/rules", async (_req: Request, res: Response) => {
      try {
        const configContent = await fs.readFile(this.configPath, "utf-8");
        const jsonConfig = JSON.parse(configContent);
        res.json(jsonConfig.rules || { version: "1.0", ruleLists: [] });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[WEB] Failed to read rules: ${errorMsg}`);
        res.status(500).json({ version: "1.0", ruleLists: [] });
      }
    });

    // Update rules configuration
    this.app.put("/api/rules", async (req: Request, res: Response) => {
      try {
        const rulesConfig = req.body as RuleEngineConfig;
        
        if (!rulesConfig.version || !Array.isArray(rulesConfig.ruleLists)) {
          res.status(400).json({ 
            success: false, 
            error: "Invalid rules configuration: missing version or ruleLists" 
          });
          return;
        }

        // Save to disk
        await this.saveConfig(rulesConfig);
        
        // Update in-memory config
        this.config.rules = rulesConfig;
        
        // Call update handler if set (to reload rules in the engine)
        if (this.onConfigUpdate) {
          await this.onConfigUpdate(rulesConfig);
        }
        
        console.log(`[WEB] Rules configuration updated (${rulesConfig.ruleLists.length} rule lists)`);
        res.json({ success: true });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error(`[WEB] Failed to update rules: ${errorMsg}`);
        res.status(500).json({ success: false, error: errorMsg });
      }
    });

    // Get current character state (for live preview)
    this.app.get("/api/state", (_req: Request, res: Response) => {
      if (this.currentContext) {
        res.json({
          success: true,
          data: this.formatContextForClient(this.currentContext),
        });
      } else {
        res.json({ 
          success: false, 
          error: "No character data available yet. Waiting for first poll..." 
        });
      }
    });

    // Server-Sent Events for real-time state updates
    this.app.get("/api/events", (req: Request, res: Response) => {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering

      // Send initial state
      const initialData = this.currentContext 
        ? this.formatContextForClient(this.currentContext)
        : null;
      res.write(`data: ${JSON.stringify({ type: "state", data: initialData })}\n\n`);

      // Add to clients set
      this.sseClients.add(res);
      console.log(`[WEB] SSE client connected (${this.sseClients.size} total)`);

      // Remove on disconnect
      req.on("close", () => {
        this.sseClients.delete(res);
        console.log(`[WEB] SSE client disconnected (${this.sseClients.size} remaining)`);
      });
    });

    // Serve index.html for root and any unmatched routes (SPA fallback)
    this.app.get("*", (_req: Request, res: Response) => {
      const indexPath = path.join(this.getWebUiPath(), 'index.html');
      res.sendFile(indexPath, (err: NodeJS.ErrnoException | null) => {
        if (err) {
          console.error(`[WEB] Failed to serve index.html: ${err.message}`);
          res.status(404).send("Web UI not found. Make sure web-ui files are properly packaged.");
        }
      });
    });
  }

  /**
   * Save config to disk
   */
  private async saveConfig(rulesConfig?: RuleEngineConfig): Promise<void> {
    // Read current config file
    const configContent = await fs.readFile(this.configPath, "utf-8");
    const jsonConfig = JSON.parse(configContent);
    
    // Update rules section (use provided config or in-memory config)
    jsonConfig.rules = rulesConfig || this.config.rules;
    
    // Write back
    await fs.writeFile(this.configPath, JSON.stringify(jsonConfig, null, 2));
  }

  /**
   * Broadcast current state to all SSE clients
   */
  private broadcastState(): void {
    if (this.sseClients.size === 0) return;
    
    const payload = JSON.stringify({
      type: "state",
      data: this.currentContext ? this.formatContextForClient(this.currentContext) : null,
    });
    
    for (const client of this.sseClients) {
      client.write(`data: ${payload}\n\n`);
    }
  }

  /**
   * Format evaluation context for client consumption
   */
  private formatContextForClient(context: EvaluationContext): object {
    return {
      hp: {
        current: context.currentHp,
        max: context.maxHp,
        temp: context.temporaryHp,
        percentage: Math.round(context.hpPercentage),
      },
      isDead: context.isDead,
      deathSaves: context.deathSaves,
      inventory: context.character.inventory?.map(item => ({
        name: item.definition.name,
        equipped: item.equipped,
        attuned: item.isAttuned,
      })) || [],
      level: this.calculateTotalLevel(context.character.classes),
      timestamp: context.timestamp,
    };
  }

  /**
   * Calculate total level from classes
   */
  private calculateTotalLevel(classes: unknown): number {
    if (Array.isArray(classes)) {
      return classes.reduce((sum, c) => sum + (c.level || 0), 0);
    }
    if (classes && typeof classes === "object" && "level" in classes) {
      return (classes as { level: number }).level || 0;
    }
    return 0;
  }
}
