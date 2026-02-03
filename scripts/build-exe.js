#!/usr/bin/env node

/**
 * Build executable script for OBS D&D Beyond automation
 * Uses esbuild to bundle ES Modules to CommonJS, then pkg to create .exe
 * 
 * Embeds web-ui static files into the executable for single-file distribution.
 */

import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const bundleFile = path.join(distDir, 'bundle.cjs');
const releaseDir = path.join(projectRoot, 'release');
const webUiSrc = path.join(projectRoot, 'web-ui');
const webUiDest = path.join(distDir, 'web-ui');

/**
 * Recursively copy a directory
 */
function copyDirSync(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function build() {
  try {
    // Ensure dist directory exists
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
    }
    
    // Ensure release directory exists
    if (!fs.existsSync(releaseDir)) {
      fs.mkdirSync(releaseDir, { recursive: true });
    }
    
    console.log('📦 Bundling with esbuild...');
    
    // Build with esbuild: convert ES Modules to CommonJS and bundle everything
    await esbuild.build({
      entryPoints: [path.join(projectRoot, 'src/index.ts')],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: bundleFile,
      // Handle import.meta.url for ESM compatibility in CommonJS
      define: {
        'import.meta.url': 'importMetaUrl',
      },
      banner: {
        js: 'const importMetaUrl = require("url").pathToFileURL(__filename).href;',
      },
      // Bundle all dependencies except Node.js built-ins that pkg provides
      external: [
        'readline/promises',
      ],
    });
    
    console.log('✅ Bundle created: ' + bundleFile);
    
    // Copy web-ui folder to dist for pkg to include
    console.log('📁 Copying web-ui assets...');
    copyDirSync(webUiSrc, webUiDest);
    console.log('✅ Web UI assets copied to: ' + webUiDest);
    
    // Create pkg config that includes web-ui assets
    const pkgConfig = {
      pkg: {
        assets: [
          "dist/web-ui/**/*"
        ],
        outputPath: "release"
      }
    };
    
    // Write temporary pkg config
    const pkgConfigPath = path.join(projectRoot, 'pkg-config.json');
    fs.writeFileSync(pkgConfigPath, JSON.stringify(pkgConfig, null, 2));
    
    console.log('📦 Creating executable with pkg...');
    const pkgCommand = `npx pkg "${bundleFile}" --config "${pkgConfigPath}" --targets node18-win-x64 --output "${path.join(releaseDir, 'obs-dndbeyond-automation.exe')}"`;
    
    execSync(pkgCommand, {
      stdio: 'inherit',
      cwd: projectRoot,
    });
    
    // Clean up temporary pkg config
    fs.unlinkSync(pkgConfigPath);
    
    // Copy example config to release folder
    const configExample = path.join(projectRoot, 'config.example.json');
    const configDest = path.join(releaseDir, 'config.example.json');
    if (fs.existsSync(configExample)) {
      fs.copyFileSync(configExample, configDest);
      console.log('✅ Example config copied to release folder');
    }
    
    console.log('✅ Executable created: ' + path.join(releaseDir, 'obs-dndbeyond-automation.exe'));
    console.log('\n🎉 Build complete! Release folder contains:');
    console.log('   - obs-dndbeyond-automation.exe (single executable with embedded web UI)');
    console.log('   - config.example.json (copy to config.json and edit)');
    console.log('\n📝 Users should create config.json next to the .exe before running.');
    
  } catch (error) {
    console.error('❌ Build failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

build();
