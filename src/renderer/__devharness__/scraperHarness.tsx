// Dev-only harness: renders the Scraper app in a plain browser.
//
// The full renderer boot (main.tsx) needs the Electron preload bridge, so it
// never mounts outside `npm start` — and a UI this large cannot be judged from
// tests alone. Same rationale and shape as motionHarness.tsx.
//
//   npx vite --config vite.renderer.config.ts --port 5174
//   → http://127.0.0.1:5174/scraper-harness.html
//
// Not imported by the app; `vite build` emits index.html only.
import { createRoot } from 'react-dom/client';
import '../theme/tokens.css';
import '../styles.css';
import '../theme/materials.css';
import '../theme/typography.css';
import '../theme/motion.css';
import '../components/ui/ui.css';
import '../theme/a11y.css';
import ScraperApp from '../components/scraper/ScraperApp';

// The scraper shell itself touches only localStorage, but the Discover page
// reaches through the preload bridge for MyAnimeList/AniList. Stub the two
// calls it makes so the page renders its empty/error state instead of throwing
// — the real console is verified in Electron, not here.
(window as unknown as { api: Record<string, unknown> }).api = {
  searchDiscovery: async () => [],
  browseDiscovery: async () => ({
    candidates: [],
    provenance: { servedBy: null, failures: [], fetchedAt: 0 },
  }),
  discoveryDetail: async () => null,
  openExternal: () => undefined,
  setUiLang: () => undefined,
};

const container = document.getElementById('root');
if (container) {
  document.documentElement.setAttribute('data-theme', 'study-os');
  container.style.height = '100vh';
  createRoot(container).render(<ScraperApp />);
}
