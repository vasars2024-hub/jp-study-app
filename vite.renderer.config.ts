import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config
export default defineConfig({
  plugins: [react()],
  // Bind the dev server to IPv4 loopback. By default Vite listens on
  // "localhost", which on this machine resolves to IPv6 (::1) — and the Electron
  // window (which loads http://localhost:5173) then fails with
  // ERR_CONNECTION_REFUSED, leaving a blank screen. Pinning to 127.0.0.1 fixes it.
  server: {
    host: '127.0.0.1',
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
  },
});
