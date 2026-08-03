/**
 * sweep-theme-a11y.mjs — run the deep a11y gate against ONE theme, with a legible stamp.
 *
 * Exists for two reasons, both of which cost a worker session on 2026-08-03:
 *
 *  1. `RUN_STAMP=x node …gate.mjs --theme=y` is a *different command string* from
 *     `node …gate.mjs`, so a permission allow-rule written for the gate does not match it.
 *     A worker had all five of its invocation attempts refused for exactly this reason and
 *     measured nothing. One wrapper means one allow-rule.
 *  2. The gate throws if its scratch profile already exists, so every run needs a distinct
 *     stamp. Deriving the stamp from the theme id makes that automatic and makes the proof
 *     directory say which theme it describes.
 *
 * Usage:  node docs/migration/tools/sweep-theme-a11y.mjs <theme-id> [extra gate args...]
 *
 * It does not interpret the gate's output. It sets a stamp, forwards the flags, and exits
 * with the gate's own exit code — read that code directly, never through a pipe.
 */
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GATE = path.join(HERE, 'packaged-a11y-deep-gate.mjs');

const [themeId, ...rest] = process.argv.slice(2);
if (!themeId || themeId.startsWith('--')) {
  console.error('usage: node docs/migration/tools/sweep-theme-a11y.mjs <theme-id> [gate args]');
  process.exit(2);
}

// The theme id is the stamp. If the same theme is swept twice in one session the gate's
// own "scratch profile already exists" guard is what should fire — that is a real signal
// that a previous run is still holding the profile, not something to paper over here.
const stamp = `sweep-${themeId}`;

const result = spawnSync(process.execPath, [GATE, `--theme=${themeId}`, ...rest], {
  stdio: 'inherit',
  env: { ...process.env, RUN_STAMP: stamp },
});

if (result.error) {
  console.error(`[sweep-theme] failed to launch the gate: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
