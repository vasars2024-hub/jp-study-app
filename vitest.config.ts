// Standalone Vitest config — pure logic in src/shared, plus main-process
// modules that can run under a stubbed `electron` (see src/main/__tests__).
// Deliberately separate from the forge/vite build configs, which are untouched.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/shared/__tests__/**/*.test.ts',
      'src/main/__tests__/**/*.test.ts',
      // Noctis engine purity proofs — pure TS, no electron stubbing needed.
      'src/main/city/engine/tests/**/*.test.ts',
      // Phase 3: node-safe pure-logic tests for the living-environment layer.
      'src/renderer/environment/**/*.test.ts',
      // Renderer modules whose only browser dependency (localStorage) is stubbed via vi.stubGlobal.
      //
      // `.tsx` included 2026-08-04 (audit U9). The glob was `.test.ts` only, so two
      // component tests under this directory were SILENTLY never collected — not
      // skipped, not reported, simply invisible. They were the complete stranded set
      // (375 of 377 files collected), and the audit's own prediction that they would
      // fail was refuted: they pass, 4 tests, 0 failed. `environment: 'node'` below
      // never applied to them either, because both declare `// @vitest-environment
      // jsdom` on line 1.
      //
      // `docs/migration/tools/vitest.tsx.config.mjs` was deleted in the same change:
      // it existed only to run these two, and leaving it would have made it a second
      // source of truth about which tests exist.
      'src/renderer/__tests__/**/*.test.{ts,tsx}',
      // The adopted MEDIA surface. Added 2026-08-02, closing `media-unreachable-by-vitest`:
      // `src/media/**` was outside every glob above, so rules that belong to those components
      // had to be exiled into `src/shared/` to get a test at all, and the two that were
      // (`directstreamOpenRecovery.ts`, `videoCoreResumeWrite.ts`) said so in their headers.
      // They now live beside their only consumer. Node-env applies here too: a test in this
      // tree may import the pure modules, never `StudyPlayerSlice.tsx` itself, which pulls
      // React and the adopted bundle.
      'src/media/**/*.test.ts',
    ],
    environment: 'node',
    testTimeout: 20000,
  },
});
