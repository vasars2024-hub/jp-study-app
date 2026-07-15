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
    ],
    environment: 'node',
    testTimeout: 20000,
  },
});
