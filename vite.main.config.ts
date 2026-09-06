import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      // Keep native/CJS deps external so they are required from node_modules
      // at runtime instead of being bundled. ffmpeg-static resolves its binary
      // path via __dirname, which only works when it's required from its own
      // folder rather than inlined into the main bundle.
      // sql.js ships a .wasm loaded at runtime from its own folder (parsing
      // Anki .apkg SQLite) — keep it external like the others.
      // 7z-wasm is the same shape (7zz.wasm beside its loader, opening the .7z
      // subtitle packs Route A depends on) and `subtitleArchive.ts` resolves
      // both files with `require.resolve`, which needs them left where they are.
      external: ['adm-zip', 'ffmpeg-static', 'node-llama-cpp', 'onnxruntime-node', 'linkedom', '@mozilla/readability', '@mozilla/readability/JSDOMParser', 'sql.js', '7z-wasm', '7z-wasm/7zz.umd.js'],
    },
  },
});
