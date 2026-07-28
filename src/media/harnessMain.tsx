/**
 * Dev-server-only entry for `media-harness.html`.
 *
 * Stubs the preload bridge calls needed while the workspace modules evaluate. The Seanime
 * connection still points at the real sidecar's loopback origin and token, injected via
 * Vite `define`; the player-bus calls are inert because this isolated browser page is not
 * an Electron window. Everything else is the production path: the same MediaWorkspace,
 * the same adopted components, the same Tailwind build, talking to a real seanime.exe
 * serving a real scan.
 *
 * It exists so the adopted surface can be exercised against a live server without starting
 * a second Electron instance, which would share %APPDATA%/jp-study-app with the user's
 * running app and could corrupt real user data.
 *
 * Note the dynamic import inside the async bootstrap: exactly like MediaWorkspaceHost, the
 * adopted bundle must not evaluate until the auth token is in localStorage. See
 * seanimeBootstrap.ts. (An async IIFE rather than top-level await, because this repo
 * compiles with `module: commonjs`.)
 */
import { createRoot } from 'react-dom/client';
import { bootstrapSeanimeConnection } from './seanimeBootstrap';

declare const __SEANIME_CONN__: { baseUrl: string; token: string };
declare const __CUE_PROOF_CONFIG__:
  | { mkvPath: string; videoUrl: string }
  | undefined;

(window as unknown as { __SEANIME_CUE_PROOF_CONFIG__?: typeof __CUE_PROOF_CONFIG__ })
  .__SEANIME_CUE_PROOF_CONFIG__ = __CUE_PROOF_CONFIG__;

const noop = (): void => {
  /* event subscriptions are inert outside Electron */
};

// Minimal stand-in for the preload bridge.
(window as unknown as { api: Record<string, unknown> }).api = {
  seanimeConnection: async () => __SEANIME_CONN__,
  seanimeStatus: async () => ({ kind: 'ready' }),
  seanimeExtractAudio: async () => {
    throw new Error('Whisper audio extraction is unavailable in the browser proof harness.');
  },
  onSeanimeStatus: () => noop,
  playerWindowId: async () => 1,
  playerGetSnapshot: async () => null,
  onPlayerSync: () => noop,
  onPlayerCommand: () => noop,
};

void (async () => {
  const conn = await bootstrapSeanimeConnection();
  const { default: MediaWorkspace } = await import('./MediaWorkspace');
  createRoot(document.getElementById('root') as HTMLElement).render(<MediaWorkspace conn={conn} />);
})();
