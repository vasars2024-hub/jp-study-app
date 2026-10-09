// Vitest config for the at-scale performance benchmarks in tools/perf.
//
// Deliberately separate from the root vitest.config.ts: these are measurements,
// not gates, and a 20,000-card / 200,000-row seed has no place in the normal
// suite's wall clock. Run through `node tools/perf/deckScale.cjs`.
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { searchForWorkspaceRoot } from 'vite';
// eslint-disable-next-line import/no-unresolved -- resolved through vitest's package "exports"
import { defineConfig } from 'vitest/config';

const ROOT = resolve(__dirname, '..', '..');
const REAL_MODULES = realpathSync(resolve(ROOT, 'node_modules'));

export default defineConfig({
  root: ROOT,
  server: { fs: { allow: [searchForWorkspaceRoot(ROOT), REAL_MODULES] } },
  resolve: {
    alias: {
      '@/app/(main)/entry/_lib/handle-play-media': resolve(ROOT, 'src/media/seanimeLocalPlayback.tsx'),
      '@': resolve(ROOT, 'vendor/seanime-web'),
    },
  },
  test: {
    include: ['tools/perf/**/*.perf.ts'],
    environment: 'jsdom',
    testTimeout: 600_000,
    hookTimeout: 600_000,
    pool: 'forks',
    maxWorkers: 1,
  },
});
