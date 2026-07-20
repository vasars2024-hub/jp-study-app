// Dev-only harness: mounts BlancShell alone in a plain browser so the Blanc
// Toolbox can be clicked and screenshotted WITHOUT Electron (same pattern and
// reasoning as arenaHarness.tsx). Not imported by the app, not in the
// production build — `vite build` emits index.html only.
//
// The preload-bridge stub lives in blanc-harness.html as a CLASSIC script:
// several renderer modules (playerBus.ts) read window.api at module-eval time,
// which happens before any statement in this module runs.
//
//   npx vite --config vite.renderer.config.ts --port 5174
//   → http://127.0.0.1:5174/blanc-harness.html
import { createRoot } from 'react-dom/client';
import BlancShell from '../components/blanc/BlancShell';
import '../theme/blanc.css';
import '../styles.css';

const container = document.getElementById('root');
if (container) createRoot(container).render(<BlancShell initialBook={null} onInitialBookConsumed={() => undefined} />);
