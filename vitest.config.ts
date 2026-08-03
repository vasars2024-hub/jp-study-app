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
      'src/renderer/__tests__/**/*.test.ts',
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
