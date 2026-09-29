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
  const { t } = useT();
  const state = useNovels();
  const {
    query, setQuery, planOnly, setPlanOnly, showSources, setShowSources,
    loadingJiten, refreshingNovels, status, store, jitenDecks,
    candidates, refreshJiten, refreshNovels,
  } = state;

  return (
    <div className="blanc-tool-detail blanc-novels">
      <fieldset>
        <legend>{t('blanc.library.find')}</legend>
        <div className="blanc-command-row">
          <input
            type="text"
            value={query}
            lang="ja"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Enter confirms an IME conversion; it must not search yet.
              if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
              if (e.key === 'Enter') void refreshJiten();
            }}
            placeholder={t('novelsView.searchPlaceholder')}
          />
          <button type="button" disabled={loadingJiten} onClick={() => void refreshJiten()}>
            <Icon name="refresh" size={12} />
            {loadingJiten ? t('blanc.library.searching') : t('novelsView.searchJiten')}
          </button>
          <button type="button" disabled={refreshingNovels} onClick={() => void refreshNovels()}>
            <Icon name="library" size={12} />
            {t('novelsView.local')}
          </button>
        </div>
        <div className="blanc-status-row">
          <span>{t('novelsView.status.titles', { count: candidates.length })}</span>
          <span>{t('blanc.library.fromJiten', { count: jitenDecks.length })}</span>
          <button type="button" className={planOnly ? 'active' : ''} aria-pressed={planOnly} onClick={() => setPlanOnly((v) => !v)}>
            {store?.plan.length
              ? t('blanc.library.planCount', { count: store.plan.length })
              : t('novelsView.plan')}
          </button>
          <button type="button" className={showSources ? 'active' : ''} aria-pressed={showSources} onClick={() => setShowSources((v) => !v)}>
            <Icon name="settings" size={12} />
            {t('novelsView.sources')}
          </button>
        </div>
        {status && <p className="blanc-note">{status}</p>}
      </fieldset>

      <div className="jiten-workbench blanc-jiten-workbench">
        <aside className="jiten-filters" aria-label={t('novelsView.aria.filters')}>
          <NovelsFilters state={state} />
        </aside>
        <main className="jiten-table-wrap" aria-label={t('novelsView.aria.table')}>
          <NovelsTable state={state} />
        </main>
        <aside className="jiten-inspector" aria-label={t('novelsView.aria.inspector')}>
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

// Catalog KEYS, resolved with t() at render. The style and colour names are
// the same strings Settings > Visualizer shows for these options.
const VIZ_STYLES: { id: VizSettings['style']; labelKey: string }[] = [
  { id: 'spectrum', labelKey: 'settings.visualizer.style.spectrum' },
  { id: 'wave', labelKey: 'settings.visualizer.style.wave' },
  { id: 'particles', labelKey: 'settings.visualizer.style.particles' },
  { id: 'xp-classic', labelKey: 'settings.visualizer.style.xpClassic' },
  { id: 'vista-aero', labelKey: 'settings.visualizer.style.vistaAero' },
];

const VIZ_FREQ: { id: VizSettings['freqTarget']; labelKey: string }[] = [
  { id: 'full', labelKey: 'blanc.library.viz.fullSpectrum' },
  { id: 'bass', labelKey: 'settings.visualizer.freq.bass' },
];

const VIZ_COLORS: { id: VizSettings['colorTheme']; labelKey: string }[] = [
  { id: 'accent', labelKey: 'settings.visualizer.color.accent' },
  { id: 'album', labelKey: 'settings.visualizer.color.album' },
  { id: 'custom', labelKey: 'settings.visualizer.color.custom' },
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
  const { t } = useT();
  const { viz, playing, patchViz } = useVisualizer();

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.library.viz.preview')}</legend>
        <VizStage settings={viz} playing={playing} classes={BLANC_VIZ_CLASSES} />
        <div className="blanc-status-row">
          <span>{playing ? t('blanc.library.viz.reacting') : t('blanc.library.viz.idle')}</span>
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent('toolbox:open-tool', { detail: 'music' }))}
          >
            {t('commands.nav.open.music')}
          </button>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('settings.visualizer.label.style')}</legend>
        <div className="blanc-segmented">
          {VIZ_STYLES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={viz.style === s.id ? 'active' : ''}
              onClick={() => patchViz({ style: s.id })}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('settings.visualizer.label.reactTo')}</legend>
        <div className="blanc-segmented">
          {VIZ_FREQ.map((f) => (
            <button
              key={f.id}
              type="button"
              className={viz.freqTarget === f.id ? 'active' : ''}
              onClick={() => patchViz({ freqTarget: f.id })}
            >
              {t(f.labelKey)}
            </button>
          ))}
        </div>
        <div className="blanc-viz-control">
          <label htmlFor="blanc-viz-intensity">{t('settings.visualizer.label.sensitivity')}</label>
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
          <label htmlFor="blanc-viz-fft">{t('settings.visualizer.label.detail')}</label>
          <select
            id="blanc-viz-fft"
            value={viz.fftSize}
            onChange={(e) => patchViz({ fftSize: Number(e.target.value) as VizSettings['fftSize'] })}
          >
            {FFT_SIZES.map((n) => (
              <option key={n} value={n}>
                {t('blanc.library.viz.fft', { size: String(n) })}
              </option>
            ))}
          </select>
        </div>
      </fieldset>

      <fieldset>
        <legend>{t('settings.visualizer.label.colors')}</legend>
        <div className="blanc-segmented">
          {VIZ_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              className={viz.colorTheme === c.id ? 'active' : ''}
              onClick={() => patchViz({ colorTheme: c.id })}
            >
              {t(c.labelKey)}
            </button>
          ))}
        </div>
        {viz.colorTheme === 'custom' && (
          <div className="blanc-viz-control">
            <label>{t('blanc.library.viz.gradient')}</label>
            <input
              type="color"
              value={viz.customColors[0]}
              onChange={(e) => patchViz({ customColors: [e.target.value, viz.customColors[1]] })}
              aria-label={t('blanc.library.viz.gradientStart')}
            />
            <input
              type="color"
              value={viz.customColors[1]}
              onChange={(e) => patchViz({ customColors: [viz.customColors[0], e.target.value] })}
              aria-label={t('blanc.library.viz.gradientEnd')}
            />
          </div>
        )}
        <p className="blanc-note">{t('blanc.library.viz.sharedNote')}</p>
      </fieldset>
    </div>
  );
}
