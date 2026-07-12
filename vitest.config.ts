// Standalone Vitest config — targets pure logic in src/shared only.
// Deliberately separate from the forge/vite build configs, which are untouched.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/shared/__tests__/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
