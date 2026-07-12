// Standalone Vitest config — pure logic only.
// Deliberately separate from the forge/vite build configs, which are untouched.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'src/shared/__tests__/**/*.test.ts',
      // Phase 3: node-safe pure-logic tests for the living-environment layer.
      'src/renderer/environment/**/*.test.ts',
    ],
    environment: 'node',
    testTimeout: 20000,
  },
});
