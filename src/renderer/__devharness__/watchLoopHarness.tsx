/**
 * Dev-only harness for the Phase 6 watch-to-review loop, so the panel can actually be
 * LOOKED AT without Electron, a sidecar, a video, or a live Anki collection. Follows
 * studyLibraryHarness.tsx's pattern.
 *
 *   npx vite --config vite.renderer.config.ts --port 5174
 *   → http://127.0.0.1:5174/src/renderer/__devharness__/watch-loop-harness.html?state=populated
 *
 * `?state=` picks the scenario, chosen so the states that are hard to reach in the real
 * app are one click away:
 *   populated (default) · empty · anki-down · clear · stream · many
 *
 * `empty` and `anki-down` are the two a new user hits first — nothing mined yet, and Anki
 * not running — and both were blank or misleading in the obvious implementation.
 *
 * Not imported by the app and not in the production build — `vite build` emits index.html
 * only.
 */
import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import SeanimeWatchLoopPanel from '../components/reading/SeanimeWatchLoopPanel';
import { VIDEO_CORE_MINING_HISTORY_KEY } from '../../shared/videoCoreMining';
import '../styles.css';

const scenario = new URLSearchParams(location.search).get('state') ?? 'populated';

const FRIEREN = 'C:\\Anime\\Frieren\\Sousou no Frieren - 01.mkv';
const BIG_O = 'C:\\Anime\\The Big O\\The Big O - 02 [BDRip 1440x1080 x265 FLAC].mkv';

interface Seed {
  noteId: number;
  term: string;
  sentence: string;
  startMs: number;
  path: string;
  title: string;
  episode: number;
  ivlDays?: number;
  leech?: boolean;
  suspended?: boolean;
  /** Omit the interval record entirely — the `untracked` arm. */
  unscanned?: boolean;
}

const SEEDS: Seed[] = [
  { noteId: 501, term: '無防備', sentence: '猫が窓辺で無防備に寝ている。', startMs: 125_000, path: FRIEREN, title: 'Sousou no Frieren', episode: 1, ivlDays: 2, leech: true },
  { noteId: 502, term: '足掻く', sentence: 'どれだけ足掻いても結果は変わらない。', startMs: 402_150, path: BIG_O, title: 'The Big O', episode: 2, ivlDays: 4, suspended: true },
  { noteId: 503, term: '今日は本当にいい天気ですね。', sentence: '今日は本当にいい天気ですね。', startMs: 6_648, path: FRIEREN, title: 'Sousou no Frieren', episode: 1, ivlDays: 41 },
  { noteId: 504, term: '面影', sentence: '彼女にはまだ幼い頃の面影が残っている。', startMs: 733_400, path: BIG_O, title: 'The Big O', episode: 2, ivlDays: 9 },
  { noteId: 505, term: '呆気ない', sentence: '戦いは呆気ないほど早く終わった。', startMs: 61_200, path: FRIEREN, title: 'Sousou no Frieren', episode: 1, ivlDays: 0 },
  { noteId: 506, term: '心当たり', sentence: '心当たりがまったくないわけではない。', startMs: 918_000, path: BIG_O, title: 'The Big O', episode: 2, unscanned: true },
];

/** `many` exercises the truncation note and the tile layout at a realistic history size. */
const seeds: Seed[] = scenario === 'many'
  ? Array.from({ length: 34 }, (_, i) => {
      const base = SEEDS[i % SEEDS.length] as Seed;
      return { ...base, noteId: 900 + i, startMs: base.startMs + i * 4_000 };
    })
  : scenario === 'stream'
    ? SEEDS.slice(0, 3).map((seed) => ({ ...seed, path: '' }))
    : scenario === 'clear'
      // Nothing stuck: the attention list must say so rather than render empty.
      ? SEEDS.map((seed) => ({ ...seed, leech: false, suspended: false, ivlDays: 30, unscanned: false }))
      : SEEDS;

const history = scenario === 'empty' ? [] : seeds.map((seed, index) => ({
  id: `mine-${seed.noteId}`,
  createdAt: 1_760_000_000_000 - index * 3_600_000,
  status: 'exported' as const,
  noteId: seed.noteId,
  term: seed.term,
  sentence: seed.sentence,
  provenance: {
    schemaVersion: 1 as const,
    cue: {
      index,
      trackNumber: 3,
      rawText: seed.sentence,
      text: seed.sentence,
      startMs: seed.startMs,
      endMs: seed.startMs + 3_000,
    },
    source: {
      playbackId: `p-${index}`,
      playbackType: 'localfile',
      streamType: 'native',
      ...(seed.path ? { localFilePath: seed.path } : {}),
      mediaTitle: seed.title,
      episodeNumber: seed.episode,
    },
    assets: {},
    capturedAt: 1_760_000_000_000 - index * 3_600_000,
  },
}));

// Two refused mines, so the duplicate line is visible in the default scenario.
if (scenario === 'populated') {
  for (const n of [1, 2]) {
    history.push({
      ...history[0],
      id: `mine-dup-${n}`,
      status: 'duplicate' as unknown as 'exported',
      noteId: undefined as unknown as number,
    });
  }
}

localStorage.setItem(VIDEO_CORE_MINING_HISTORY_KEY, JSON.stringify(history));

const entries = seeds
  .filter((seed) => !seed.unscanned)
  .map((seed) => ({
    expression: seed.term,
    ivlDays: seed.ivlDays ?? 0,
    noteId: seed.noteId,
    modelName: 'JP Study App::JA Immersion',
    ...(seed.leech ? { leech: true } : {}),
    ...(seed.suspended ? { suspended: true } : {}),
  }));

const api = {
  ankiStatus: async () => (
    scenario === 'anki-down'
      ? {
          connected: false,
          decks: [],
          models: [],
          error: 'AnkiConnect is not responding on port 8765.',
        }
      : { connected: true, decks: ['JP Study::Immersion'], models: [] }
  ),
  ankiGetIntervals: async () => ({
    generatedAt: Date.now(),
    sourceQueries: ['deck:JP Study::Immersion'],
    entries,
    noteCount: entries.length,
    truncated: false,
  }),
  // What the panels actually call now. Kept alongside the collection-wide stub above so the
  // harness still reflects both channels, and filtered by the requested ids so the harness
  // shows the same narrowing the real main process does.
  ankiGetIntervalsForNotes: async (noteIds: readonly number[]) => ({
    generatedAt: Date.now(),
    sourceQueries: [`nid:${noteIds.length} notes`],
    entries: entries.filter((e) => noteIds.includes(e.noteId)),
    noteCount: entries.length,
    truncated: false,
  }),
};
(window as unknown as { api: typeof api }).api = api;

// The loop's closing arrow has no player here, so make it observable instead of silent.
window.addEventListener('seanime:media-workspace-open', (event) => {
  // eslint-disable-next-line no-console
  console.info('[harness] replay request', (event as CustomEvent).detail);
});

/**
 * `&focus=1` mounts the view as a readiness row hands it off — scoped to one file, with
 * the chip and its way back out. `&focus=miss` scopes it to a file nothing was mined from,
 * which must still be clearable rather than a dead end.
 */
const focusParam = new URLSearchParams(location.search).get('focus');
const focus = focusParam
  ? {
      pathKey: (focusParam === 'miss' ? 'C:\\Anime\\Nothing\\Never mined.mkv' : FRIEREN)
        .replace(/\\/g, '/')
        .toLowerCase(),
      title: focusParam === 'miss' ? 'Never mined' : 'Sousou no Frieren',
    }
  : null;

createRoot(document.getElementById('root') as HTMLElement).render(
  createElement(SeanimeWatchLoopPanel, {
    focus,
    onClearFocus: () => {
      location.search = location.search.replace(/[?&]focus=[^&]*/, '');
    },
  }),
);
