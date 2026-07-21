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
      external: ['adm-zip', 'ffmpeg-static', 'node-llama-cpp', 'onnxruntime-node', 'linkedom', '@mozilla/readability', '@mozilla/readability/JSDOMParser', 'sql.js'],
    },
  },
});
