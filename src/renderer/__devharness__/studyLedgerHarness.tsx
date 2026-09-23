/**
 * Dev-only harness for Phase 6 slice 8 — the study ledger's watch channel — so the two
 * surfaces it changes can be LOOKED AT without Electron, a sidecar, or a watched video.
 * Follows `continueWatchingHarness.tsx`'s pattern.
 *
 *   npx vite --config vite.renderer.config.ts --port 5174
 *   → http://127.0.0.1:5174/src/renderer/__devharness__/study-ledger-harness.html?state=mixed
 *
 * `?state=` picks the ledger to render against:
 *   mixed (default) · read-only · watch-only · empty · heavy
 *
 * Two things only a browser can answer here, and both have already been wrong once in
 * this track: whether the stacked bar's percentage heights actually resolve (a percentage
 * against an auto-height parent silently becomes `auto`, and the bars collapse), and
 * whether the split bar and its legend still fit inside the Today widget at the
 * registry's *minimum* frame rather than at a comfortable one.
 *
 * Not imported by the app and absent from the production build: `vite build` emits
 * index.html only.
 */
import { createRoot } from 'react-dom/client';
import { createElement, Fragment, type ReactNode } from 'react';
import '../styles.css';

/**
 * `window.api` must exist **before** the surfaces are imported, which is why every import
 * below is dynamic. `StatsContent` reaches `ankiSync`, and `ankiSync` calls
 * `window.api.onAnkiIntervalsChanged` at *module-evaluation* time — the same trap recorded
 * for the `CommandPalette` render test. Without this the module throws during import, React
 * never gets a tree, and the page renders as a silent blank rather than an error.
 *
 * Callable *and* awaitable, so one stub serves both shapes: a subscription call whose
 * return value gets invoked to unsubscribe, and an IPC call that gets awaited.
 */
function stubResult(): (() => void) & PromiseLike<null> {
  const fn = (() => undefined) as (() => void) & PromiseLike<null>;
  fn.then = ((resolve?: (v: null) => unknown) =>
    Promise.resolve(null).then(resolve)) as PromiseLike<null>['then'];
  return fn;
}
(window as unknown as { api: unknown }).api = new Proxy({}, {
  get: (_target, prop) => (prop === 'then' ? undefined : () => stubResult()),
});

const params = new URLSearchParams(location.search);
const scenario = params.get('state') ?? 'mixed';

/**
 * `mediaWorkspaceHostIsMounted()` asks the DOM whether anything is listening for
 * `MEDIA_WORKSPACE_OPEN_EVENT`. Mount the marker it looks for so the "By show" rows render
 * as the resume controls they are; `&host=off` shows the readout they fall back to when
 * the sidecar is disabled, which is the state most users are actually in today.
 */
if (params.get('host') !== 'off') {
  const marker = document.createElement('div');
  marker.className = 'seanime-host-present';
  marker.style.display = 'none';
  document.body.append(marker);
}

// Neither arrow has a destination in a harness, so make the one this page offers
// observable instead of silent.
window.addEventListener('seanime:media-workspace-open', (event) => {
  // eslint-disable-next-line no-console
  console.info('[harness] seanime:media-workspace-open', (event as CustomEvent).detail);
});

interface DaySeed {
  seconds: number;
  chars: number;
  watchSeconds: number;
}

function dayKeyOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** [readMinutes, chars, watchMinutes] for today back through 13 days ago. */
const PROFILES: Record<string, Array<[number, number, number]>> = {
  // A real week: some days read, some watched, some both, one blank.
  mixed: [
    [30, 4200, 15], [12, 1800, 48], [0, 0, 72], [45, 6100, 0], [0, 0, 0],
    [8, 900, 24], [22, 3000, 30], [0, 0, 51], [16, 2100, 0], [0, 0, 0],
    [35, 5200, 12], [0, 0, 66], [9, 1200, 18], [27, 3800, 0],
  ],
  // Nothing has ever been watched: the widget, the cards and the legend must all be
  // exactly what they were before this slice.
  'read-only': [
    [30, 4200, 0], [12, 1800, 0], [0, 0, 0], [45, 6100, 0], [0, 0, 0],
    [8, 900, 0], [22, 3000, 0], [0, 0, 0], [16, 2100, 0], [0, 0, 0],
    [35, 5200, 0], [0, 0, 0], [9, 1200, 0], [27, 3800, 0],
  ],
  // The mirror case, which is the one that used to render as an empty life.
  'watch-only': [
    [0, 0, 46], [0, 0, 72], [0, 0, 24], [0, 0, 0], [0, 0, 96],
    [0, 0, 18], [0, 0, 51], [0, 0, 0], [0, 0, 33], [0, 0, 66],
    [0, 0, 12], [0, 0, 0], [0, 0, 78], [0, 0, 40],
  ],
  empty: [],
  // One outlier day, to check the scale is the taller *stack* and not the taller channel.
  heavy: [
    [15, 2000, 20], [0, 0, 0], [190, 24000, 165], [10, 1400, 5], [0, 0, 0],
    [6, 700, 0], [0, 0, 9], [0, 0, 0], [4, 500, 0], [0, 0, 0],
    [0, 0, 0], [8, 1000, 0], [0, 0, 0], [0, 0, 0],
  ],
};

const days: Record<string, DaySeed> = {};
for (const [i, [readMin, chars, watchMin]] of (PROFILES[scenario] ?? PROFILES.mixed).entries()) {
  days[dayKeyOffset(i)] = { seconds: readMin * 60, chars, watchSeconds: watchMin * 60 };
}

const SHOWS = [
  ['file:c:/anime/frieren/sousou no frieren - 01.mkv', 'Sousou no Frieren — 1', 4820],
  ['file:c:/anime/frieren/sousou no frieren - 02.mkv', 'Sousou no Frieren — 2', 1410],
  ['file:d:/downloads/animepahe_gnosia_-_03_1080p.mp4', 'animepahe_gnosia_-_03_1080p.mp4', 690],
] as const;

const anyWatch = Object.values(days).some((d) => d.watchSeconds > 0);

/**
 * Exactly what `WidgetFrame` passes a widget: the frame height minus its 30px title bar,
 * and **not** minus `.widget-body`'s own 20px padding.
 */
function widgetProps(w: number, h: number) {
  return { settings: {}, setSettings: () => undefined, size: { w, h: h - 30 } };
}

/** `WidgetFrame`'s real chrome, at the registry's own sizes for each widget. */
function Frame(props: { label: string; w: number; h: number; body: ReactNode }) {
  return createElement(
    'div',
    null,
    createElement('p', { className: 'sl-label' }, props.label),
    createElement(
      'div',
      {
        className: 'widget-frame',
        // `position: absolute` on the real desktop; static here so they stack.
        style: { position: 'static', width: `${props.w}px`, height: `${props.h}px` },
      },
      createElement('div', { className: 'widget-bar' },
        createElement('span', { className: 'widget-title' }, props.label.split(' — ')[0])),
      createElement('div', { className: 'widget-body' }, props.body),
    ),
  );
}

// The imports are dynamic and therefore inside an async function, not top level: the
// repo's `module` setting rejects top-level `await`, and the root tsconfig is off limits.
void (async () => {
  const { statsKey } = await import('../stats');
  const { TodayStudyTime, StudyStreak } = await import('../widgets/study');
  const { LearningHeatmap } = await import('../widgets/more');
  const { StatsCards, StatsChart, StatsShows, useStats } =
    await import('../components/stats/StatsContent');

  localStorage.setItem(statsKey(), JSON.stringify({
    days,
    books: {
      'book-1': { title: '02 クビシメロマンチスト', seconds: 7200, chars: 96_000, lastRead: Date.now() },
    },
    shows: anyWatch
      ? Object.fromEntries(SHOWS.map(([id, title, seconds], i) => [
          id,
          { title, seconds, lastWatched: Date.now() - i * 3_600_000 },
        ]))
      : {},
  }));

  function StatsPage() {
    const state = useStats();
    return createElement(
      'div',
      { className: 'sl-page' },
      createElement('p', { className: 'sl-label' }, 'Statistics — cards, 14-day chart, by show'),
      createElement(StatsCards, { state }),
      createElement('section', { className: 'stats-section' },
        createElement('h2', null, 'Last 14 days'),
        createElement(StatsChart, { state })),
      state.summary.shows.length > 0
        ? createElement('section', { className: 'stats-section' },
            createElement('h2', null, 'By show'),
            createElement(StatsShows, { state }))
        : null,
    );
  }

  // Reused across Vite's HMR re-evaluations. A second `createRoot` on the same container
  // logs a React error that outlives the edit that caused it and reads, next session, like
  // a defect in the surface under test.
  const slot = window as unknown as { __studyLedgerRoot?: ReturnType<typeof createRoot> };
  const root = slot.__studyLedgerRoot
    ?? (slot.__studyLedgerRoot = createRoot(document.getElementById('root') as HTMLElement));
  root.render(
    createElement(
      Fragment,
      null,
      createElement(
        'div',
        { className: 'sl-harness' },
        createElement(
          'div',
          { className: 'sl-row' },
          // Registry: today-study-time is 220×160 default, 160×130 minimum. The minimum
          // is the one that matters — it is where the split bar plus its legend either
          // fits or, as the first cut did, collapses the bar to 0px and clips the rest.
          createElement(Frame, {
            key: 'a',
            label: "Today's study time — default 220 × 160",
            w: 220,
            h: 160,
            body: createElement(TodayStudyTime, widgetProps(220, 160)),
          }),
          createElement(Frame, {
            key: 'b',
            label: "Today's study time — minimum 160 × 130",
            w: 160,
            h: 130,
            body: createElement(TodayStudyTime, widgetProps(160, 130)),
          }),
          createElement(Frame, {
            key: 'c',
            label: 'Study streak — 200 × 160',
            w: 200,
            h: 160,
            body: createElement(StudyStreak),
          }),
          createElement(Frame, {
            key: 'd',
            label: 'Learning heatmap — 300 × 150',
            w: 300,
            h: 150,
            body: createElement(LearningHeatmap),
          }),
        ),
        createElement('div', { className: 'sl-row' }, createElement(StatsPage)),
      ),
    ),
  );
})();
