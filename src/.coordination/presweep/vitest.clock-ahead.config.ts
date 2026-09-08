/**
 * The instrument config for the class-8 time-bomb control. See
 * `clock-ahead-setup.ts` for why this exists.
 *
 * Vitest 4 has no `--setupFiles` CLI flag (it errors `Unknown option`), so the
 * only way to inject the shim without editing the root config — which CLAUDE.md
 * puts out of bounds — is a second config that MERGES the real one. Merging
 * rather than restating it matters: the root config carries the `server.fs.allow`
 * repair that keeps `node_modules` resolvable inside a git worktree, and a
 * hand-written config would silently drop it and fail two suites for a reason
 * that has nothing to do with dates.
 *
 *     npx vitest run <files> --config src/.coordination/presweep/vitest.clock-ahead.config.ts
 *
 * `root` is pinned because vitest would otherwise take it from THIS file's
 * directory and find no tests at all — which reads as a clean run.
 */
import { resolve } from 'node:path';
import { defineConfig, mergeConfig } from 'vitest/config';
import base from '../../../vitest.config';

const REPO_ROOT = resolve(__dirname, '../../..');

export default mergeConfig(
  base,
  defineConfig({
    test: {
      root: REPO_ROOT,
      setupFiles: [resolve(__dirname, 'clock-ahead-setup.ts')],
    },
  }),
);
