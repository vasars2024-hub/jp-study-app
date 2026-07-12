import Icon from '../../Icons';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import type { ColorTheme, FreqTarget, VizMode, VizSettings, VizStyle } from '../../../visualizerSettings';
import { setUseAlbumInSearch } from '../../../lyricsSettings';

const VIZ_MODES: { id: VizMode; label: string }[] = [
  { id: 'wallpaper', label: 'Wallpaper' },
  { id: 'widget', label: 'Widget' },
  { id: 'both', label: 'Both' },
];
const VIZ_STYLES: { id: VizStyle; label: string }[] = [
  { id: 'spectrum', label: 'Spectrum' },
  { id: 'wave', label: 'Waveform' },
  { id: 'particles', label: 'Particles' },
];
const VIZ_FREQ: { id: FreqTarget; label: string }[] = [
  { id: 'full', label: 'Whole track' },
  { id: 'bass', label: 'Bass only' },
];
const VIZ_COLORS: { id: ColorTheme; label: string }[] = [
  { id: 'accent', label: 'Accent' },
  { id: 'album', label: 'Album art' },
  { id: 'custom', label: 'Custom' },
];
const FFT_SIZES = [256, 512, 1024, 2048] as const;

export default function VisualizerPage() {
  const s = useSettings();
  const { viz, patchViz, lyricsSettings, setLyricsAlbumSearch, focusSettingId } = s;

  return (
    <>
      <SettingsCard
        id="visualizer"
        title="Music visualizer"
        description="React to music playing in the Music app."
        highlight={focusSettingId === 'visualizer'}
        trailing={
          <label className="os-toggle os-toggle-compact">
            <input
              type="checkbox"
              checked={viz.enabled}
              onChange={() => patchViz({ enabled: !viz.enabled })}
              aria-label="Enable music visualizer"
            />
            <span>{viz.enabled ? 'On' : 'Off'}</span>
          </label>
        }
        advanced={
          viz.enabled ? (
            <>
              <div className="os-viz-row">
                <span className="os-viz-label muted">Where</span>
                {VIZ_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`btn small ${viz.mode === m.id ? 'primary' : ''}`}
                    onClick={() => patchViz({ mode: m.id })}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="os-viz-row">
                <span className="os-viz-label muted">Style</span>
                {VIZ_STYLES.map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    className={`btn small ${viz.style === st.id ? 'primary' : ''}`}
                    onClick={() => patchViz({ style: st.id })}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
              <div className="os-viz-row">
                <span className="os-viz-label muted">React to</span>
                {VIZ_FREQ.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    className={`btn small ${viz.freqTarget === f.id ? 'primary' : ''}`}
                    onClick={() => patchViz({ freqTarget: f.id })}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="os-viz-row">
                <span className="os-viz-label muted">Sensitivity</span>
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  value={viz.intensity}
                  onChange={(e) => patchViz({ intensity: Number(e.target.value) })}
                />
                <span className="muted">{Math.round(viz.intensity * 100)}%</span>
              </div>
              <div className="os-viz-row">
                <span className="os-viz-label muted">Detail</span>
                <select
                  className="os-viz-select"
                  value={viz.fftSize}
                  onChange={(e) => patchViz({ fftSize: Number(e.target.value) as VizSettings['fftSize'] })}
                  title="FFT size"
                >
                  {FFT_SIZES.map((n) => (
                    <option key={n} value={n}>
                      FFT {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="os-viz-row">
                <span className="os-viz-label muted">Colors</span>
                {VIZ_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`btn small ${viz.colorTheme === c.id ? 'primary' : ''}`}
                    onClick={() => patchViz({ colorTheme: c.id })}
                  >
                    {c.label}
                  </button>
                ))}
                {viz.colorTheme === 'custom' && (
                  <>
                    <input
                      type="color"
                      value={viz.customColors[0]}
                      onChange={(e) => patchViz({ customColors: [e.target.value, viz.customColors[1]] })}
                      title="Gradient start"
                    />
                    <input
                      type="color"
                      value={viz.customColors[1]}
                      onChange={(e) => patchViz({ customColors: [viz.customColors[0], e.target.value] })}
                      title="Gradient end"
                    />
                  </>
                )}
              </div>
              <div className="os-set-btns">
                {(viz.mode === 'widget' || viz.mode === 'both') && (
                  <button type="button" className="btn small" onClick={s.onOpenVisualizer}>
                    <Icon name="monitor" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                    Open visualizer widget
                  </button>
                )}
                <button type="button" className="btn small" onClick={s.onOpenMusicWidget}>
                  <Icon name="music" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                  Open music widget
                </button>
              </div>
            </>
          ) : null
        }
        advancedLabel="options"
      />

      <SettingsCard
        id="lyrics"
        title="Lyrics lookup"
        description="When enabled, lyrics search uses album and parent folder names."
        highlight={focusSettingId === 'lyrics'}
      >
        <label className="os-toggle">
          <input
            type="checkbox"
            checked={lyricsSettings.useAlbumInSearch}
            onChange={(e) => setLyricsAlbumSearch(e.target.checked)}
          />
          <span>Use album / folder names in lyrics search</span>
        </label>
      </SettingsCard>
    </>
  );
}
