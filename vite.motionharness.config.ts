// Dev-only: builds the Phase 4.5 motion harness into a SELF-CONTAINED bundle
// that opens over file:// — no dev server, no Electron. Needed because this
// environment's preview port is held by another session, and shipping motion
// work without ever looking at it is how the Arena shipped games that printed
// their own answers.
//
//   npx vite build --config vite.motionharness.config.ts
//   → harness-dist/motion-harness.html  (open directly)
//
// Separate from vite.renderer.config.ts on purpose: the production build must
// keep emitting index.html only, so the harness never leaks into the app.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

/**
 * Vite always emits `<script type="module" crossorigin>`, which the browser
 * refuses to load over file:// (module scripts are CORS-checked, and file://
 * has a null origin). The bundle is IIFE, so a classic deferred script is
 * equivalent — and loads.
 */
function classicScriptForFileUrl() {
  return {
    name: 'classic-script-for-file-url',
    enforce: 'post' as const,
    transformIndexHtml(html: string) {
      return html
        .replace(/<script type="module" crossorigin/g, '<script defer')
        .replace(/ crossorigin href=/g, ' href=');
    },
  };
}

export default defineConfig({
  plugins: [react(), classicScriptForFileUrl()],
  // Relative asset URLs so the html works from the filesystem.
  base: './',
  define: { global: 'globalThis' },
  build: {
    outDir: 'harness-dist',
    emptyOutDir: true,
    copyPublicDir: false,
    // Inline every asset; classic-script output so file:// isn't blocked by the
    // module CORS rules.
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'motion-harness.html'),
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'harness.js',
        assetFileNames: 'harness[extname]',
      },
    },
  },
});
