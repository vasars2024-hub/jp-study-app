/**
 * Blanc's library and arcade tool surfaces: novels, discover, games, immersion,
 * visualizer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OWNERSHIP: this file belongs to the **Library & Arcade** work stream.
 * The Media & Cards stream must not edit it. See BLANC_REFINEMENT_PLAN.md,
 * "Parallel split".
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Pillar 0 rule: never mount a Study OS `*View` inside Blanc. Each panel here
 * composes a shared `*Content.tsx` (hook + presentation-neutral blocks) wrapped
 * in Blanc chrome (`blanc-tool-detail` + `fieldset`/`legend`). `AppChrome`,
 * `MenuBar`, and `StatusBar` must never be imported here. New CSS goes in
 * `theme/blanc-library.css`, using the existing Blanc tokens.
 */
import Icon from '../Icons';
import {
  BLANC_VIZ_CLASSES,
  VizStage,
  useVisualizer,
  type VizSettings,
} from '../visualizer/VisualizerContent';
import {
  NovelsFilters,
  NovelsInspector,
  NovelsTable,
  useNovels,
} from '../novels/NovelsContent';
import { GameArena } from '../games/GameArenaContent';
import {
  DiscoveryControls,
  DiscoveryInspector,
  DiscoveryResults,
  DiscoveryTabs,
  useDiscovery,
} from '../discover/DiscoverContent';
import { useT } from '../../i18n';
import {
  ImmersionBody,
  ImmersionPopups,
  ImmersionToolbar,
  WK_HIGHLIGHT_CSS,
  useImmersion,
} from '../immersion/ImmersionContent';

// This panel renders Study OS class names, whose rules live in styles.css.
// Imported here rather than in the boot entry so the 468 KB sheet rides this
// lazy chunk instead of Blanc's boot. See theme/studyos-compat.css.
void import('../../theme/studyos-compat.css');

/**
 * Pillar 2 port of `NovelsView` — Blanc previously had only `NovelReader`
 * (reading), no catalogue. Composes the shared `useNovels` state and the
 * `jiten-*` workbench blocks; the toolbar is Blanc-native. The three-pane
 * `jiten-workbench` grid is kept so a wide Blanc window matches Study OS, while
 * the `blanc-tool-detail` chrome replaces the aero `AppChrome`.
 */
export function BlancNovelsPanel() {
  const state = useNovels();
  const {
    query, setQuery, planOnly, setPlanOnly, showSources, setShowSources,
    loadingJiten, refreshingNovels, status, store, jitenDecks,
    candidates, refreshJiten, refreshNovels,
  } = state;

  return (
    <div className="blanc-tool-detail blanc-novels">
      <fieldset>
        <legend>Find</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            value={query}
            lang="ja"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void refreshJiten();
            }}
            placeholder="Search title, author, genre, or tag"
          />
          <button type="button" disabled={loadingJiten} onClick={() => void refreshJiten()}>
            <Icon name="refresh" size={12} />
            {loadingJiten ? 'Searching…' : 'Search Jiten'}
          </button>
          <button type="button" disabled={refreshingNovels} onClick={() => void refreshNovels()}>
            <Icon name="library" size={12} />
            Local
          </button>
        </div>
        <div className="blanc-status-row">
          <span>{candidates.length} titles</span>
          <span>{jitenDecks.length} from Jiten</span>
          <button type="button" className={planOnly ? 'active' : ''} onClick={() => setPlanOnly((v) => !v)}>
            Plan {store?.plan.length ? `(${store.plan.length})` : ''}
          </button>
          <button type="button" className={showSources ? 'active' : ''} onClick={() => setShowSources((v) => !v)}>
            <Icon name="settings" size={12} />
            Sources
          </button>
        </div>
        {status && <p className="blanc-note">{status}</p>}
      </fieldset>

      <div className="jiten-workbench blanc-jiten-workbench">
        <aside className="jiten-filters" aria-label="Novel filters">
          <NovelsFilters state={state} />
        </aside>
        <main className="jiten-table-wrap" aria-label="Plan to Read titles">
          <NovelsTable state={state} />
        </main>
        <aside className="jiten-inspector" aria-label="Novel details">
          <NovelsInspector state={state} />
        </aside>
      </div>
    </div>
  );
}

/**
 * Pillar 2 port of `ImmersionView` — Blanc previously had only
 * `immersion-tracker` (read-only totals). This is the full browser: live
 * <webview> guest, Reader Mode, the sites rail, and dictionary/translate
 * popups, all feeding the same stats and known-words the tracker reads. It
 * composes the classic (non-aero) immersion blocks inside `blanc-tool-detail`;
 * the toolbar is the classic `immersion-toolbar`, which reads well in Blanc.
 *
 * Live mode depends on the Blanc window enabling the `<webview>` tag; Reader
 * Mode extraction and the sites rail work regardless.
 */
export function BlancImmersionPanel() {
  const state = useImmersion();
  return (
    <div className="blanc-tool-detail blanc-immersion">
      <div className={`immersion-root immersion-mode-${state.mode}`} data-mode={state.mode}>
        {state.showChrome && <ImmersionToolbar state={state} />}
        {state.mode === 'focus' && (
          <button
            type="button"
            className="immersion-focus-exit btn small"
            onClick={() => state.applyMode('reader')}
          >
            {state.t('immersion.exitFocus')}
          </button>
        )}
        <ImmersionBody state={state} />
        <style>{WK_HIGHLIGHT_CSS}</style>
        <ImmersionPopups state={state} />
      </div>
    </div>
  );
}

/**
 * Pillar 2 port of `GameArenaView` — Blanc previously had only `mono-blocks`.
 * The arena is chrome-free and identical in both shells, so it renders the same
 * `GameArena` implementation, wrapped in Blanc's `blanc-tool-detail`. The arena
 * reuses the app-wide `useT`, deck, level, and progress services, so a game
 * played in Blanc feeds the same XP, streak, and mistake-mining as Study OS.
 */
export function BlancGamesPanel() {
  return (
    <div className="blanc-tool-detail blanc-games">
      <GameArena />
    </div>
  );
}

/**
 * Pillar 2 port of the Scraper app's Discover page — the one study-relevant
 * surface inside `ScraperView`. Blanc deliberately does not mirror the rest of
 * that app (job runner, torrent and source managers, selector/regex tools): it
 * is an acquisition shell with its own chrome and its own mock port, and
 * pulling it in would defeat Pillar 1. What Blanc wants is the console that
 * answers "what should I watch next at my level, and why", which
 * `discover/DiscoverContent.tsx` already isolates as a hook plus four
 * presentation-neutral blocks — written that way for exactly this port.
 *
 * The shortlist is the shared `discoveryShortlistStore`, so a title bookmarked
 * here is the same one Study OS's Discover page shows, and the level is seeded
 * from the same media library.
 */
export function BlancDiscoverPanel() {
  const { t } = useT();
  const state = useDiscovery();

  return (
    <div className="blanc-tool-detail blanc-discover">
      <fieldset>
        <legend>{t('scraper.search.label')}</legend>
        <DiscoveryControls state={state} />
        <div className="blanc-status-row">
          <span>{t('scraper.count.results', { count: state.results.length })}</span>
          <span>{t('scraper.count.library', { count: state.libraryCount })}</span>
          <button
            type="button"
            className={state.tab === 'shortlist' ? 'active' : ''}
            onClick={() => state.setTab(state.tab === 'shortlist' ? 'browse' : 'shortlist')}
          >
            <Icon name="bookmark" size={12} />
            {t('scraper.tab.shortlist')}
            {state.shortlist.length > 0 ? ` (${state.shortlist.length})` : ''}
          </button>
        </div>
      </fieldset>

      <div className="disc-view blanc-disc-workbench">
        <DiscoveryTabs state={state} />
        <div className="disc-body">
          <div className="disc-main">
            <DiscoveryResults state={state} />
          </div>
          <DiscoveryInspector state={state} />
        </div>
      </div>
    </div>
  );
}

const VIZ_STYLES: { id: VizSettings['style']; label: string }[] = [
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'wave', label: 'Waveform' },
  { id: 'particles', label: 'Particles' },
  { id: 'xp-classic', label: 'XP Classic' },
  { id: 'vista-aero', label: 'Vista Aero' },
];

const VIZ_FREQ: { id: VizSettings['freqTarget']; label: string }[] = [
  { id: 'full', label: 'Full spectrum' },
  { id: 'bass', label: 'Bass only' },
];

const VIZ_COLORS: { id: VizSettings['colorTheme']; label: string }[] = [
  { id: 'accent', label: 'Accent' },
  { id: 'album', label: 'Album art' },
  { id: 'custom', label: 'Custom' },
];

const FFT_SIZES: VizSettings['fftSize'][] = [256, 512, 1024, 2048];

/**
 * Pillar 2 port of the music visualizer. Study OS exposes it only as a wallpaper
 * layer and a pop-out widget; Blanc gives it a live preview plus the controls
 * that otherwise live in Settings. Playback and analyser data come from the
 * shared `audioBus`/`playerBus`, so the preview reacts to whatever the app is
 * already playing — no second audio graph.
 */
export function BlancVisualizerPanel() {
  const { viz, playing, patchViz } = useVisualizer();

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>Preview</legend>
        <VizStage settings={viz} playing={playing} classes={BLANC_VIZ_CLASSES} />
        <div className="blanc-status-row">
          <span>{playing ? 'Reacting to the current song' : 'Idle — start a song in Music'}</span>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('toolbox:open-tool', { detail: 'music' }))}
          >
            Open Music
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>Style</legend>
        <div className="blanc-segmented">
          {VIZ_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={viz.style === s.id ? 'active' : ''}
              onClick={() => patchViz({ style: s.id })}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>React to</legend>
        <div className="blanc-segmented">
          {VIZ_FREQ.map((f) => (
            <button
              key={f.id}
              type="button"
              className={viz.freqTarget === f.id ? 'active' : ''}
              onClick={() => patchViz({ freqTarget: f.id })}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="blanc-viz-control">
          <label htmlFor="blanc-viz-intensity">Sensitivity</label>
          <input
            id="blanc-viz-intensity"
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={viz.intensity}
            onChange={(e) => patchViz({ intensity: Number(e.target.value) })}
          />
          <span>{Math.round(viz.intensity * 100)}%</span>
        </div>
        <div className="blanc-viz-control">
          <label htmlFor="blanc-viz-fft">Detail</label>
          <select
            id="blanc-viz-fft"
            value={viz.fftSize}
            onChange={(e) => patchViz({ fftSize: Number(e.target.value) as VizSettings['fftSize'] })}
          >
            {FFT_SIZES.map((n) => (
              <option key={n} value={n}>
                FFT {n}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset>
        <legend>Colors</legend>
        <div className="blanc-segmented">
          {VIZ_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={viz.colorTheme === c.id ? 'active' : ''}
              onClick={() => patchViz({ colorTheme: c.id })}
            >
              {c.label}
            </button>
          ))}
        </div>
        {viz.colorTheme === 'custom' && (
          <div className="blanc-viz-control">
            <label>Gradient</label>
            <input
              type="color"
              value={viz.customColors[0]}
              onChange={(e) => patchViz({ customColors: [e.target.value, viz.customColors[1]] })}
              aria-label="Gradient start colour"
            />
            <input
              type="color"
              value={viz.customColors[1]}
              onChange={(e) => patchViz({ customColors: [viz.customColors[0], e.target.value] })}
              aria-label="Gradient end colour"
            />
          </div>
        )}
        <p className="blanc-note">
          These settings are shared with the desktop wallpaper visualizer and the pop-out widget — one
          configuration, three surfaces.
        </p>
      </fieldset>
    </div>
  );
}
