#!/usr/bin/env node
/**
 * A production snapshot of the app for the e2e harness, built into tools/e2e/out/app.
 *
 * Why not `npm start`: the dev server serves the LIVE tree, and this repo is edited by
 * several agents at once — another agent's save reloads the harness's page mid-flow
 * (measured: three full reloads in seven seconds while an EPUB was open) and a module
 * loaded later can be a half-written file. A production build is a snapshot: what was
 * built is what is tested, start to finish.
 *
 * It is the same build `electron-forge package` runs — forge's own ViteConfigGenerator
 * over forge.config.ts's VitePlugin entries, production mode — only written to a private
 * output directory, so neither the shared `.vite/` nor anyone's `npm start` is touched.
 * `out/app` then gets a package.json naming that main bundle. While the app runs, run.cjs
 * adds junctions to the repo's `public`, `private-assets`, `assets`, `extension`, `vendor`
 * and `node_modules` (`linkResources`), which is where an unpackaged main process looks for
 * them (`app.getAppPath()`), and removes them again at teardown (`unlinkResources`).
 */
'use strict';
/* eslint-disable @typescript-eslint/no-var-requires -- CommonJS tooling, run by node directly */

const fs = require('node:fs');
const path = require('node:path');

const REPO = path.resolve(__dirname, '..', '..');
const APP = path.join(__dirname, 'out', 'app');
const LINKS = ['public', 'private-assets', 'assets', 'extension', 'node_modules', 'vendor'];

async function loadVitePluginConfig() {
  const loadForgeConfig = require(path.join(REPO, 'node_modules', '@electron-forge', 'core', 'dist', 'util', 'forge-config.js')).default;
  const config = await loadForgeConfig(REPO);
  const plugin = (config.plugins ?? []).find((p) => p && p.name === 'vite');
  if (!plugin) throw new Error('forge.config.ts has no VitePlugin');
  return plugin.config;
}

function retarget(outDir) {
  const rel = String(outDir ?? '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!rel.startsWith('.vite/')) throw new Error(`unexpected outDir ${outDir}`);
  return path.join(APP, rel);
}

async function build() {
  const t0 = Date.now();
  const vite = require(path.join(REPO, 'node_modules', 'vite'));
  const ViteConfigGenerator = require(path.join(REPO, 'node_modules', '@electron-forge', 'plugin-vite', 'dist', 'ViteConfig.js')).default;
  const pluginConfig = await loadVitePluginConfig();
  const generator = new ViteConfigGenerator(pluginConfig, REPO, true);

  fs.rmSync(path.join(APP, '.vite'), { recursive: true, force: true });
  fs.mkdirSync(APP, { recursive: true });

  // Renderer first: the main build's defines name the renderer entries.
  const renderers = await generator.getRendererConfig();
  for (const config of renderers) {
    config.build = { ...config.build, outDir: retarget(config.build?.outDir) };
    config.logLevel = 'warn';
    console.log(`[e2e build] renderer -> ${path.relative(REPO, config.build.outDir)}`);
    await vite.build(config);
  }
  const builds = await generator.getBuildConfigs();
  for (const config of builds) {
    config.build = { ...config.build, outDir: retarget(config.build?.outDir) };
    config.logLevel = 'warn';
    const entry = config.build?.lib?.entry ?? config.build?.rollupOptions?.input;
    console.log(`[e2e build] ${typeof entry === 'string' ? path.relative(REPO, entry) : JSON.stringify(entry)} -> ${path.relative(REPO, config.build.outDir)}`);
    await vite.build(config);
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  fs.writeFileSync(
    path.join(APP, 'package.json'),
    JSON.stringify({ name: pkg.name, productName: pkg.productName, version: pkg.version, main: '.vite/build/main.js', private: true }, null, 2),
  );
  fs.writeFileSync(path.join(APP, 'build-info.json'), JSON.stringify({ builtAt: new Date().toISOString(), ms: Date.now() - t0 }, null, 2));
  console.log(`[e2e build] done in ${Math.round((Date.now() - t0) / 1000)} s`);
}

/**
 * The junctions an unpackaged app needs beside its package.json. They exist only while
 * the app runs (`run.cjs` links before launch and unlinks at teardown): a junction left in
 * tools/e2e/out is a trap for any recursive delete that follows it into the repo.
 */
function linkResources() {
  for (const name of LINKS) {
    const target = path.join(REPO, name);
    const link = path.join(APP, name);
    if (!fs.existsSync(target)) continue;
    try {
      fs.lstatSync(link);
      continue; // already linked
    } catch {
      /* not there yet */
    }
    fs.symlinkSync(target, link, 'junction');
  }
}

/** Remove the junctions themselves (never what they point at). */
function unlinkResources() {
  for (const name of LINKS) {
    const link = path.join(APP, name);
    let isLink = false;
    try {
      isLink = fs.lstatSync(link).isSymbolicLink();
    } catch {
      continue; // not linked
    }
    if (!isLink) continue;
    try {
      fs.unlinkSync(link);
    } catch {
      // A directory junction on some Node/Windows combinations wants rmdir; with no
      // `recursive` it removes the reparse point only and can never touch the target.
      fs.rmdirSync(link);
    }
  }
}

if (require.main === module) {
  build().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

module.exports = { APP, build, linkResources, unlinkResources };
