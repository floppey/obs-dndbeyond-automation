#!/usr/bin/env node

/**
 * Build executable script for OBS D&D Beyond automation
 * Uses esbuild to bundle ES Modules to CommonJS, then pkg to create .exe
 */

import * as esbuild from 'esbuild';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const bundleFile = path.join(distDir, 'bundle.cjs');
const releaseDir = path.join(projectRoot, 'release');

async function build() {
  try {
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
    
    console.log('📦 Creating executable with pkg...');
    const pkgCommand = `npx pkg "${bundleFile}" --targets node18-win-x64 --output "${path.join(releaseDir, 'obs-dndbeyond-automation.exe')}"`;
    
    execSync(pkgCommand, {
      stdio: 'inherit',
      cwd: projectRoot,
    });
    
    console.log('✅ Executable created: ' + path.join(releaseDir, 'obs-dndbeyond-automation.exe'));
    console.log('\n🎉 Build complete! Executable is ready for distribution.');
    
  } catch (error) {
    console.error('❌ Build failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

build();
