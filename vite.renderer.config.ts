import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react()],
  // ADR-004's single permitted alias. The adopted Seanime source under
  // vendor/seanime-web/ imports itself as "@/..." exactly as it does upstream, so the
  // tree stays byte-identical to the pinned checkout and an upstream sync is a
  // mechanical diff. Study OS code never uses "@/" (verified: 0 occurrences), so this
  // claims an otherwise-unused namespace.
  //
  // It lives under vendor/ rather than src/ for the same reason the generated types
  // already do: vendor/** is lint-excluded, and the architecture audit
  // (tools/architecture-audit.cjs) walks src/ only. Third-party source should not be
  // hand-edited to satisfy this repo's own lint and layering rules.
  resolve: {
    alias: { '@': resolve(__dirname, 'vendor/seanime-web') },
  },
  // Bind the dev server to IPv4 loopback. By default Vite listens on
  // "localhost", which on this machine resolves to IPv6 (::1) — and the Electron
  // window (which loads http://localhost:5173) then fails with
  // ERR_CONNECTION_REFUSED, leaving a blank screen. Pinning to 127.0.0.1 fixes it.
  server: {
    host: '127.0.0.1',
    // Honour an assigned PORT when one is set (dev harnesses run alongside the
    // Electron dev server, which owns the default). Unset = Vite's default, so
    // the normal `npm start` flow is unaffected.
    ...(process.env.PORT ? { port: Number(process.env.PORT) } : {}),
    // Don't watch the large local onnxruntime .wasm engine files copied into
    // public/ort — on Windows the file watcher throws EBUSY on them and crashes
    // the dev server. They're static, so there's nothing to watch anyway.
    watch: {
      ignored: [
        '**/public/ort/**',
        '**/public/models/**',
        '**/public/cedict/**',
        '**/public/kuromoji/**',
        '**/public/yomitan/**',
      ],
    },
  },
  // @huggingface/transformers bundles onnxruntime-web (with .wasm). If Vite
  // discovers it lazily at runtime it re-optimizes and force-reloads the whole
  // page mid-translation (which corrupted the window). Excluding it from the
  // dep optimizer makes Vite serve it as native ESM and skips that reload.
  // Pre-bundle pdf.js so opening the first PDF doesn't trigger a lazy re-optimize
  // + page reload mid-read (same class of problem as transformers, but pdf.js is
  // small enough to just bundle up front).
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
    // kuromoji: we import two CJS internals directly (see tokenizer.ts) —
    // pre-bundle them so their require() chains resolve and nothing reloads
    // mid-session.
    include: [
      'pdfjs-dist',
      '@sglkc/kuromoji/src/loader/DictionaryLoader',
      '@sglkc/kuromoji/src/Tokenizer',
      'fflate',
      '@mozilla/readability',
    ],
  },
  // Some browser libraries (e.g. epub.js dependencies) expect a `global`.
  define: { global: 'globalThis' },
  // ~1 GB models/dicts live in public/ and ship via packager extraResource (see
  // forge.config.ts). Skipping copyPublicDir keeps the Vite renderer build fast.
  build: {
    copyPublicDir: false,
    // Two entries, not one (BLANC_REFINEMENT_PLAN.md Pillar 1). The Blanc
    // Toolbox window loads blanc.html → src/renderer/blancMain.tsx, so it never
    // pulls in the Study OS desktop shell, widget registry, or city engine.
    // Rollup still shares common chunks between the two, so this splits what
    // Blanc *boots*, not what the app ships.
    //
    // Only the two real app entries are listed — the *-harness.html files at the
    // repo root are dev-server-only and must stay out of the production build.
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        blanc: resolve(__dirname, 'blanc.html'),
      },
    },
  },
});
