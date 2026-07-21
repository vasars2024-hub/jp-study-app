// Dev-only harness: mounts GameArenaView on its own in a plain browser, so the
// Arena can be clicked and screenshotted WITHOUT Electron. `npm start` isn't
// drivable by the screenshot tooling used in this repo, which is why UI bugs
// here went unseen for so long (the prompt block was printing each round's own
// answer). Not imported by the app and not in the production build — `vite
// build` emits index.html only.
//
//   npx vite --config vite.renderer.config.ts --port 5174
//   → http://127.0.0.1:5174/arena-harness.html
//
// The whole app can't boot this way (main.tsx's boot chain needs the preload
// bridge), but a single view mounted over a stub can.
import { createRoot } from 'react-dom/client';
import GameArenaView from '../views/GameArenaView';
import { bootTheme } from '../theme';
import '../theme/tokens.css';
import '../styles.css';

// Minimal stand-in for the preload bridge: the Arena only reaches it through
// the asset store (Mirror Writing's local evaluator download). Shape must match
// the flat preload surface — assetsList/assetsFreeSpace/onAssetStatus.
const noop = async (): Promise<void> => undefined;
(window as unknown as { api: unknown }).api = {
  assetsList: async () => ({ assets: [], statuses: [] }),
  assetsFreeSpace: async () => 32 * 1024 * 1024 * 1024,
  onAssetStatus: () => () => undefined,
  assetsStart: noop,
  assetsCancel: noop,
  assetsDelete: noop,
};

bootTheme();

const container = document.getElementById('root');
if (container) createRoot(container).render(<GameArenaView />);
