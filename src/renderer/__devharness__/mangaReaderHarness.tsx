// Dev-only harness: mounts MangaReader on its own in a plain browser, so the
// Phase A-D manga OCR/reader work (reading order, view modes, region editor,
// sidebar, Cubari-style settings panel) can be clicked and screenshotted
// WITHOUT Electron. Follows the exact pattern of arenaHarness.tsx — see that
// file's header comment for why this exists (npm start isn't drivable by the
// screenshot tooling used in this repo). Not imported by the app and not in
// the production build — `vite build` emits index.html only.
//
//   npx vite --config vite.renderer.config.ts --port 5174
//   → http://127.0.0.1:5174/manga-reader-harness.html
//
// KNOWN ISSUE (unresolved as of this writing): unlike GameArenaView,
// MangaReader.tsx's transitive import graph is very deep (~120+ modules —
// wordLookup.ts/DictionaryResults.tsx pull in translator.ts, mining.ts,
// chineseDict.ts, flashcardDeck.ts, profiles.ts, toolboxSettings.ts, etc.).
// Loading it standalone (bypassing main.tsx's normal boot sequence — i18n
// init, theme boot, IndexedDB open) currently stalls silently: window.api
// never gets assigned and #root stays empty, with no console error and no
// Vite error overlay. Confirmed via performance.getEntriesByType('resource')
// that module fetching itself halts (not just slow) partway through the
// chain. Root cause not yet isolated — likely a module expecting boot-time
// state that only main.tsx's sequence provides. The real app (`npm start`)
// boots this exact component tree successfully with no such issue, so this
// is specific to the standalone-harness isolation, not the component code.
// A future session debugging this should try stubbing progressively deeper
// (translator.ts, chineseDict.ts, profiles.ts) to find which import actually
// blocks, or binary-search by temporarily commenting out MangaReader.tsx's
// own imports.
import { createRoot } from 'react-dom/client';
import '../theme/tokens.css';
import '../styles.css';
import type { LibraryItem } from '../../shared/types';
import type { MokuroPage } from '../../shared/mokuroTypes';
import { emptyReadingListsDocument } from '../../shared/readingLists';
import { createReadingList, addLibraryItemToReadingList, createReadingListsMutationContext } from '../../shared/readingListMutations';

const PAGE_W = 800;
const PAGE_H = 1200;

/** A simple inline SVG "manga page" with colored regions roughly matching the fixture blocks below. */
function fixturePageDataUrl(n: number): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">
      <rect width="100%" height="100%" fill="#f4f0e8"/>
      <rect x="10" y="10" width="${PAGE_W - 20}" height="${PAGE_H - 20}" fill="none" stroke="#222" stroke-width="4"/>
      <line x1="${PAGE_W / 2}" y1="10" x2="${PAGE_W / 2}" y2="${PAGE_H - 10}" stroke="#222" stroke-width="2"/>
      <ellipse cx="200" cy="180" rx="120" ry="80" fill="#fff" stroke="#222" stroke-width="3"/>
      <ellipse cx="585" cy="285" rx="135" ry="135" fill="#fff" stroke="#222" stroke-width="3"/>
      <rect x="100" y="700" width="300" height="80" fill="#ffe08a" stroke="#222" stroke-width="3"/>
      <ellipse cx="625" cy="975" rx="125" ry="75" fill="#fff" stroke="#222" stroke-width="3"/>
      <text x="400" y="${PAGE_H - 30}" font-size="28" text-anchor="middle" fill="#999">page ${n}</text>
    </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const PAGE_COUNT = 12;
const pages = Array.from({ length: PAGE_COUNT }, (_, i) => fixturePageDataUrl(i + 1));

const fixturePage: MokuroPage = {
  version: '1.01',
  img_width: PAGE_W,
  img_height: PAGE_H,
  blocks: [
    {
      box: [80, 100, 320, 260],
      vertical: true,
      lines: ['こんにちは'],
      rawLines: ['こんにちは'],
      regionId: 'harness:80,100,320,260',
      confidence: 0.92,
      kind: 'text',
    },
    {
      box: [450, 150, 720, 420],
      vertical: true,
      lines: ['元気ですか', '今日は良い天気'],
      rawLines: ['元気ですか', '今日は良い天気'],
      regionId: 'harness:450,150,720,420',
      confidence: 0.81,
      kind: 'text',
    },
    {
      box: [100, 700, 400, 780],
      vertical: false,
      lines: ['ドン'],
      rawLines: ['ドン'],
      regionId: 'harness:100,700,400,780',
      confidence: 0.65,
      kind: 'sfx',
    },
    {
      box: [500, 900, 750, 1050],
      vertical: true,
      lines: ['また明日ね'],
      rawLines: ['また明日ね'],
      regionId: 'harness:500,900,750,1050',
      confidence: 0.4,
      kind: 'text',
    },
  ],
};

const fixtureItem: LibraryItem = {
  id: 'harness-item',
  title: 'Harness Test Volume',
  kind: 'manga',
  createdAt: Date.now(),
  pageCount: PAGE_COUNT,
};

const noop = async (): Promise<void> => undefined;
const notFound = async (): Promise<null> => null;
let readingDocument = emptyReadingListsDocument();
const listCount = Math.max(0, Math.min(5, Number(new URLSearchParams(location.search).get('lists')) || 0));
for (let index = 0; index < listCount; index += 1) {
  const created = createReadingList(readingDocument, { name: `Manga club ${index + 1}` }, createReadingListsMutationContext());
  readingDocument = addLibraryItemToReadingList(created.document, created.listId, fixtureItem, createReadingListsMutationContext()).document;
}

// Minimal stand-in for the preload bridge. Anything MangaReader/DictionaryPopup
// might reach that isn't explicitly mocked falls through the Proxy below to a
// generic resolved no-op rather than throwing, so the harness stays usable
// even if a code path reaches an untouched IPC method.
const mangaApi = {
  readingListsLoad: async () => ({ ok: true, snapshot: { document: readingDocument, health: { state: 'ok', lostRevisions: 0 } } }),
  onReadingListsChanged: () => () => undefined,
  playerWindowId: async () => 'manga-harness',
  getMangaPages: async () => pages,
  readMangaPage: async () => pages[0],
  setProgress: noop,
  mangaOcrAvailable: async () => true,
  mangaOcrLoadCache: async () => fixturePage,
  mangaOcrScanPage: async () => fixturePage,
  mangaOcrSaveCorrection: async () => fixturePage,
  mangaOcrRescanRegion: async () => fixturePage,
  mangaOcrMergeRegions: async () => fixturePage,
  mangaOcrSplitRegion: async () => fixturePage,
  mangaOcrAddRegion: async () => fixturePage,
  mangaOcrSaveOrder: async () => fixturePage,
  mangaOcrRecognizeImage: async () => 'てすと',
  onMangaOcrProgress: () => () => undefined,
  translateRunBatch: async (req: { items: Array<{ id: string; text: string }> }) => ({
    ok: true,
    results: req.items.map((it) => ({ id: it.id, text: `[EN] ${it.text}` })),
  }),
  assetsList: async () => ({ assets: [], statuses: [] }),
  assetsFreeSpace: async () => 32 * 1024 * 1024 * 1024,
  onAssetStatus: () => () => undefined,
  assetsStart: noop,
  assetsPause: noop,
  assetsCancel: noop,
  assetsRemove: noop,
  lookupWord: notFound,
  lookupTerm: notFound,
  lookupTermOffline: notFound,
};

const apiProxy = new Proxy(mangaApi as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop in target) return target[prop];
    if (prop.startsWith('on')) return () => () => undefined;
    // Unknown request resolves empty; subscriptions return an unsubscribe above.
    return async () => undefined;
  },
});

(window as unknown as { api: unknown }).api = apiProxy;

// The reader and theme both reach preload during module evaluation.
void (async () => {
  const { bootTheme } = await import('../theme');
  bootTheme();
  const { default: MangaReader } = await import('../views/MangaReader');
  const container = document.getElementById('root');
  if (container) createRoot(container).render(
    <MangaReader item={fixtureItem} onClose={() => console.log('[harness] onClose called')} />,
  );
})().catch((error) => {
  console.error(error);
  const container = document.getElementById('root');
  if (container) container.textContent = String(error);
});
