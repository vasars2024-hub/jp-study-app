import Icon from '../../Icons';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import type { ColorTheme, FreqTarget, VizMode, VizSettings, VizStyle } from '../../../visualizerSettings';
import { useT } from '../../../i18n';
import { Toggle } from '../../ui';

const VIZ_MODES: { id: VizMode; labelKey: string }[] = [
  { id: 'wallpaper', labelKey: 'settings.visualizer.mode.wallpaper' },
  { id: 'widget', labelKey: 'settings.visualizer.mode.widget' },
  { id: 'both', labelKey: 'settings.visualizer.mode.both' },
];
/*
  All five of `VizStyle`, and the last two are not new work: `VisualizerCanvas.tsx`
  has drawn them since it shipped and Blanc has always offered them. Listing three
  here meant Study OS could not represent its own persisted state -- `viz.style` is
  validated against all five in `visualizerSettings.ts`, so a user who picked XP
  Classic in Blanc came back to a style row where NO button was `primary` and the
  only way out was to pick a different style. Proper names stay untranslated in all
  four catalogs, the precedent being `settings.reader.theme.wired`.
*/
const VIZ_STYLES: { id: VizStyle; labelKey: string }[] = [
  { id: 'spectrum', labelKey: 'settings.visualizer.style.spectrum' },
  { id: 'wave', labelKey: 'settings.visualizer.style.wave' },
  { id: 'particles', labelKey: 'settings.visualizer.style.particles' },
  { id: 'xp-classic', labelKey: 'settings.visualizer.style.xpClassic' },
  { id: 'vista-aero', labelKey: 'settings.visualizer.style.vistaAero' },
];
const VIZ_FREQ: { id: FreqTarget; labelKey: string }[] = [
  { id: 'full', labelKey: 'settings.visualizer.freq.full' },
  { id: 'bass', labelKey: 'settings.visualizer.freq.bass' },
];
const VIZ_COLORS: { id: ColorTheme; labelKey: string }[] = [
  { id: 'accent', labelKey: 'settings.visualizer.color.accent' },
  { id: 'album', labelKey: 'settings.visualizer.color.album' },
  { id: 'custom', labelKey: 'settings.visualizer.color.custom' },
];
const FFT_SIZES = [256, 512, 1024, 2048] as const;

export default function VisualizerPage() {
  const { t } = useT();
  const s = useSettings();
  const { viz, patchViz, lyricsSettings, setLyricsAlbumSearch, focusSettingId } = s;

  return (
    <>
      <SettingsCard
        id="visualizer"
        title={t('search.visualizer')}
        description={t('search.visualizer.desc')}
        highlight={focusSettingId === 'visualizer'}
        trailing={
          <Toggle
            className="os-toggle os-toggle-compact"
            checked={viz.enabled}
            onChange={() => patchViz({ enabled: !viz.enabled })}
            aria-label={t('settings.visualizer.enableAria')}
            label={viz.enabled ? t('settings.visualizer.on') : t('settings.visualizer.off')}
          />
        }
        advanced={
          viz.enabled ? (
            <>
              <div className="os-viz-row">
                <span className="os-viz-label muted">{t('settings.visualizer.label.where')}</span>
                {VIZ_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`btn small ${viz.mode === m.id ? 'primary' : ''}`}
                    aria-pressed={viz.mode === m.id}
                    onClick={() => patchViz({ mode: m.id })}
                  >
                    {t(m.labelKey)}
                  </button>
                ))}
              </div>
              <div className="os-viz-row">
                <span className="os-viz-label muted">{t('settings.visualizer.label.style')}</span>
                {VIZ_STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    className={`btn small ${viz.style === st.id ? 'primary' : ''}`}
                    aria-pressed={viz.style === st.id}
                    /* The one control that re-drives the live canvas, so it is named the way
                       the dock's routes already are (`data-viz-action`). A style row addressed
                       by position or by its translated label is a different control in each of
                       the four locales. */
                    data-viz-style={st.id}
                    onClick={() => patchViz({ style: st.id })}
                  >
                    {t(st.labelKey)}
                  </button>
                ))}
              </div>
              <div className="os-viz-row">
                <span className="os-viz-label muted">{t('settings.visualizer.label.reactTo')}</span>
                {VIZ_FREQ.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`btn small ${viz.freqTarget === f.id ? 'primary' : ''}`}
                    aria-pressed={viz.freqTarget === f.id}
                    onClick={() => patchViz({ freqTarget: f.id })}
                  >
                    {t(f.labelKey)}
                  </button>
                ))}
              </div>
              <div className="os-viz-row">
                <span className="os-viz-label muted">{t('settings.visualizer.label.sensitivity')}</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={viz.intensity}
                  onChange={(e) => patchViz({ intensity: Number(e.target.value) })}
                  aria-label={t('a11y.slider.visualizerSensitivity')}
                />
                <span className="muted">{Math.round(viz.intensity * 100)}%</span>
              </div>
              <div className="os-viz-row">
                <span className="os-viz-label muted">{t('settings.visualizer.label.detail')}</span>
                <select
                  className="os-viz-select"
                  value={viz.fftSize}
                  onChange={(e) => patchViz({ fftSize: Number(e.target.value) as VizSettings['fftSize'] })}
                  title={t('settings.visualizer.fftTitle')}
                >
                  {FFT_SIZES.map((n) => (
                    <option key={n} value={n}>
                      {t('musicUi.viz.fftOption', { size: n })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="os-viz-row">
                <span className="os-viz-label muted">{t('settings.visualizer.label.colors')}</span>
                {VIZ_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`btn small ${viz.colorTheme === c.id ? 'primary' : ''}`}
                    aria-pressed={viz.colorTheme === c.id}
                    onClick={() => patchViz({ colorTheme: c.id })}
                  >
                    {t(c.labelKey)}
                  </button>
                ))}
                {viz.colorTheme === 'custom' && (
                  <>
                    <input
                      type="color"
                      value={viz.customColors[0]}
                      onChange={(e) => patchViz({ customColors: [e.target.value, viz.customColors[1]] })}
                      title={t('settings.visualizer.gradStart')}
                    />
                    <input
                      type="color"
                      value={viz.customColors[1]}
                      onChange={(e) => patchViz({ customColors: [viz.customColors[0], e.target.value] })}
                      title={t('settings.visualizer.gradEnd')}
                    />
                  </>
                )}
              </div>
              <div className="os-set-btns">
                {(viz.mode === 'widget' || viz.mode === 'both') && (
                  <button type="button" className="btn small" onClick={s.onOpenVisualizer}>
                    <Icon name="monitor" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                    {t('settings.visualizer.openViz')}
                  </button>
                )}
                <button type="button" className="btn small" onClick={s.onOpenMusicWidget}>
                  <Icon name="music" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                  {t('settings.visualizer.openMusic')}
                </button>
              </div>
            </>
          ) : null
        }
        advancedLabel={t('settings.visualizer.options')}
      />

      <SettingsCard
        id="lyrics"
        title={t('search.lyrics')}
        description={t('search.lyrics.desc')}
        highlight={focusSettingId === 'lyrics'}
      >
        <Toggle
          className="os-toggle"
          checked={lyricsSettings.useAlbumInSearch}
          onChange={(e) => setLyricsAlbumSearch(e.target.checked)}
          label={t('settings.visualizer.lyricsUseAlbum')}
        />
      </SettingsCard>
    </>
  );
}
