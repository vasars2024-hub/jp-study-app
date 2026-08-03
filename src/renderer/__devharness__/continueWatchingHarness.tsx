/**
 * Dev-only harness for the Phase 6 slice 7 "Continue watching" widget, so it can actually
 * be LOOKED AT without Electron, a sidecar, a watched video or a mined card. Follows
 * `watchLoopHarness.tsx`'s pattern.
 *
 *   npx vite --config vite.renderer.config.ts --port 5174
 *   → http://127.0.0.1:5174/src/renderer/__devharness__/continue-watching-harness.html?state=populated
 *
 * `?state=` picks the scenario:
 *   populated (default) · empty · server-off · long · mixed
 *
 * It renders the widget inside a real `.widget-frame` / `.widget-body` at three sizes —
 * the registry default, the registry minimum, and a tall one — because the one thing a
 * jsdom test cannot answer is whether a row *fits*, and this widget computes its own row
 * count from the height `WidgetFrame` gives it.
 *
 * Not imported by the app and absent from the production build: `vite build` emits
 * index.html only.
 */
import { createRoot } from 'react-dom/client';
import { createElement, Fragment } from 'react';
import { ContinueWatchingWidget } from '../widgets/continueWatching';
import { VIDEO_CORE_MINING_HISTORY_KEY } from '../../shared/videoCoreMining';
import { VIDEO_CORE_RESUME_STORAGE_KEY } from '../../shared/videoCoreStudy';
import '../styles.css';

const scenario = new URLSearchParams(location.search).get('state') ?? 'populated';

const FRIEREN = 'C:\\Anime\\Frieren\\Sousou no Frieren - 01.mkv';
const BIG_O = 'C:\\Anime\\The Big O\\The Big O - 02 [BDRip 1440x1080 x265 FLAC].mkv';
const LONG = 'C:\\Anime\\Very Long Series Name Season 2\\[SubsPlease] A Very Long Release '
  + 'Title That Will Not Fit - 11 (1080p) [ABCD1234].mkv';
const UNTITLED = 'D:\\Downloads\\AnimePahe_Gnosia_-_03_1080p.mp4';

interface Seed {
  path: string;
  positionSec: number;
  minutesAgo: number;
  /** Only files Study OS has probed carry a duration — and only those get a bar. */
  durationSec?: number;
  title?: string;
  cards?: number;
}

const SEEDS: Seed[] = [
  { path: FRIEREN, positionSec: 742, minutesAgo: 6, durationSec: 1420, title: 'Sousou no Frieren', cards: 3 },
  { path: BIG_O, positionSec: 402, minutesAgo: 90, durationSec: 1500, title: 'The Big O', cards: 1 },
  // No duration: the bar must be absent rather than drawn at 0%.
  { path: UNTITLED, positionSec: 128, minutesAgo: 400 },
  { path: LONG, positionSec: 3725, minutesAgo: 1500, durationSec: 7200, title: 'A Very Long Series Title That Should Ellipsize Cleanly' },
];

const seeds: Seed[] = scenario === 'empty'
  ? []
  : scenario === 'long'
    ? Array.from({ length: 12 }, (_, i) => {
        const base = SEEDS[i % SEEDS.length] as Seed;
        return { ...base, path: `${base.path}.${i}`, minutesAgo: i * 30 };
      })
    : scenario === 'mixed'
      // Every row without a probed duration or a mined card: the plainest possible list.
      ? SEEDS.map((seed) => ({ path: seed.path, positionSec: seed.positionSec, minutesAgo: seed.minutesAgo }))
      : SEEDS;

const NOW = 1_760_000_000_000;

localStorage.setItem(VIDEO_CORE_RESUME_STORAGE_KEY, JSON.stringify(
  seeds.map((seed) => ({
    key: `file:${seed.path.replace(/\\/g, '/').toLowerCase()}`,
    positionSec: seed.positionSec,
    updatedAt: NOW - seed.minutesAgo * 60_000,
  })),
));

localStorage.setItem(VIDEO_CORE_MINING_HISTORY_KEY, JSON.stringify(
  seeds.flatMap((seed, seedIndex) => Array.from({ length: seed.cards ?? 0 }, (_, i) => ({
    id: `mine-${seedIndex}-${i}`,
    createdAt: NOW - i * 3_600_000,
    status: 'exported' as const,
    noteId: 5000 + seedIndex * 10 + i,
    term: '無防備',
    sentence: '猫が窓辺で無防備に寝ている。',
    provenance: {
      schemaVersion: 1 as const,
      cue: { index: i, trackNumber: 3, rawText: '…', text: '…', startMs: 125_000, endMs: 128_000 },
      source: {
        playbackId: `p-${seedIndex}-${i}`,
        playbackType: 'localfile',
        streamType: 'native',
        localFilePath: seed.path,
        mediaTitle: seed.title ?? '',
      },
      assets: {},
      capturedAt: NOW - i * 3_600_000,
    },
  }))),
));

const api = {
  listMedia: async () => seeds
    .filter((seed) => seed.durationSec != null || seed.title)
    .map((seed, index) => ({
      id: `m-${index}`,
      title: seed.title ?? '',
      path: seed.path,
      fileName: seed.path.split(/[\\/]/).pop() ?? '',
      addedAt: 0,
      ...(seed.durationSec != null ? { durationSec: seed.durationSec } : {}),
    })),
  seanimeStatus: async () => ({ kind: scenario === 'server-off' ? 'disabled' : 'ready' }),
  onSeanimeStatus: () => () => undefined,
};
(window as unknown as { api: typeof api }).api = api;

// Neither arrow has a destination here, so make both observable instead of silent.
for (const name of ['seanime:media-workspace-open', 'seanime:study-review-focus']) {
  window.addEventListener(name, (event) => {
    // eslint-disable-next-line no-console
    console.info(`[harness] ${name}`, (event as CustomEvent).detail);
  });
}

/** The registry's own sizes, plus a tall one, in `WidgetFrame`'s real chrome. */
const FRAMES: Array<{ label: string; w: number; h: number }> = [
  { label: 'default 320 × 250', w: 320, h: 250 },
  { label: 'minimum 240 × 130', w: 240, h: 130 },
  { label: 'tall 360 × 400', w: 360, h: 400 },
];

createRoot(document.getElementById('root') as HTMLElement).render(
  createElement(
    'div',
    { className: 'cw-harness' },
    ...FRAMES.map((frame) => createElement(
      Fragment,
      { key: frame.label },
      createElement('p', { className: 'cw-harness-label' }, frame.label),
      createElement(
        'div',
        {
          className: 'widget-frame',
          // `position: absolute` in the real desktop; static here so they stack.
          style: { position: 'static', width: `${frame.w}px`, height: `${frame.h}px` },
        },
        createElement(
          'div',
          { className: 'widget-bar' },
          createElement('span', { className: 'widget-title' }, 'Continue Watching'),
        ),
        createElement(
          'div',
          { className: 'widget-body' },
          createElement(ContinueWatchingWidget, {
            settings: {},
            setSettings: () => undefined,
            // Exactly what WidgetFrame passes: the frame height minus its 30px bar.
            size: { w: frame.w, h: frame.h - 30 },
          }),
        ),
      ),
    )),
  ),
);
