// Dev-only harness: mounts the grammar Practice panel on its own in a plain
// browser so the redesigned filter sidebar can be clicked and screenshotted
// WITHOUT Electron. Same rationale as arenaHarness.tsx — `npm start` isn't
// drivable by the tooling here, and the last time a UI shipped on green tests
// alone it turned out to be printing each quiz round's own answer.
//
//   npx vite --config vite.renderer.config.ts --port 5174
//   → http://127.0.0.1:5174/grammar-harness.html
//
// Not imported by the app and not in the production build — `vite build` emits
// index.html only.
import { createRoot } from 'react-dom/client';
import GrammarPracticePanel from '../components/grammar/GrammarPracticePanel';
import { bootTheme } from '../theme';
import '../theme/tokens.css';
import '../styles.css';

// The panel reaches the preload bridge only for the Anki export path. Shape
// must match the flat preload surface — a nested `api.anki.*` stub throws and
// blanks the tree with no console error, which looks exactly like an app bug.
(window as unknown as { api: unknown }).api = {
  ankiMineNote: async () => ({ ok: true }),
  searchExamples: async () => [],
};

bootTheme();

const container = document.getElementById('root');
if (container) createRoot(container).render(<GrammarPracticePanel />);
