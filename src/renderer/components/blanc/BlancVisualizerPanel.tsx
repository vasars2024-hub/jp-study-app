/**
 * Blanc visualizer panel.
 *
 * One module per Blanc panel: a Blanc lazy chunk is a whole module, so panels
 * that shared a file loaded each other's content stacks (opening Clipboard used
 * to fetch the grammar data set). Pillar 0 still applies — compose the shared
 * content component in Blanc chrome, never a Study OS `*View`, and never
 * import `AppChrome`/`MenuBar`/`StatusBar` here. The Study OS class-name
 * stylesheet these blocks rely on is loaded by the shell's lazy loader
 * (`withStudyOsCompat` in BlancShell.tsx), before first render.
 */
import {
  BLANC_VIZ_CLASSES,
  VizStage,
  useVisualizer,
  type VizSettings,
} from '../visualizer/VisualizerContent';
import { useT } from '../../i18n';

// Catalog KEYS, resolved with t() at render. The style and colour names are
// the same strings Settings > Visualizer shows for these options.
const VIZ_STYLES: { id: VizSettings['style']; labelKey: string }[] = [
  { id: 'spectrum', labelKey: 'settings.visualizer.style.spectrum' },
  { id: 'wave', labelKey: 'settings.visualizer.style.wave' },
  { id: 'particles', labelKey: 'settings.visualizer.style.particles' },
  // 'xp-classic' and 'vista-aero' are Study OS's retro skins. Blanc offers only
  // the neutral styles, and previews a shared setting that names a retro skin
  // as the plain spectrum (see the panel below) — the setting itself
  // is left untouched for Study OS.
];

const RETRO_VIZ_STYLES = new Set<VizSettings['style']>(['xp-classic', 'vista-aero']);

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
  // Blanc must look neutral: a retro skin chosen in Study OS previews here as
  // the plain spectrum rather than painting XP/Aero chrome inside Blanc.
  const shown = RETRO_VIZ_STYLES.has(viz.style) ? { ...viz, style: 'spectrum' as const } : viz;

  return (
    <div className="blanc-tool-detail">
      <fieldset>
        <legend>{t('blanc.library.viz.preview')}</legend>
        <VizStage settings={shown} playing={playing} classes={BLANC_VIZ_CLASSES} />
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
