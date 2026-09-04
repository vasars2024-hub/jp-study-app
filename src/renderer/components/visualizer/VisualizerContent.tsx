/**
 * Presentation-neutral pieces of the music visualizer, shared by the Study OS
 * `VisualizerWidget` (in `AppSection.tsx`) and Blanc's `visualizer` tool.
 *
 * The visualizer never had a `*View` — it is a widget — so there is no
 * `AppChrome` to strip. The genuinely shared parts are the live
 * `VisualizerCanvas` (already presentation-neutral: it takes settings as a prop)
 * and the `visualizerSettings` data layer. The stage's wrapper class names are
 * parameterised because the `viz-widget*` rules live in Study OS's `styles.css`,
 * which Blanc's bundle deliberately does not load — Blanc passes its own classes
 * from `theme/blanc-library.css`.
 */
import { useEffect, useState } from 'react';
import VisualizerCanvas from '../VisualizerCanvas';
import Icon from '../Icons';
import { ContextualSurface } from '../liquid/LiquidSurface';
import { useT } from '../../i18n';
import { isPlaying as isMusicPlaying, onPlayingChanged } from '../../audioBus';
import {
  loadVizSettings,
  onVizSettingsChanged,
  saveVizSettings,
  type VizSettings,
} from '../../visualizerSettings';
import './visualizerWidgetLiquid.css';

export type { VizSettings };

/** Live visualizer settings plus whether a song is currently playing. */
export function useVisualizer() {
  const [viz, setViz] = useState(loadVizSettings);
  const [playing, setPlaying] = useState(isMusicPlaying);
  useEffect(() => onVizSettingsChanged(setViz), []);
  useEffect(() => onPlayingChanged(setPlaying), []);
  const patchViz = (patch: Partial<VizSettings>): void => {
    saveVizSettings({ ...viz, ...patch });
  };
  return { viz, playing, patchViz };
}

export interface VizStageClasses {
  root: string;
  canvas: string;
  hint: string;
}

const OS_VIZ_CLASSES: VizStageClasses = {
  root: 'viz-widget',
  canvas: 'viz-widget-canvas',
  hint: 'viz-widget-hint muted',
};

/** Blanc's stage classes; rules live in `theme/blanc-library.css`. */
export const BLANC_VIZ_CLASSES: VizStageClasses = {
  root: 'blanc-viz-stage',
  canvas: 'blanc-viz-canvas',
  hint: 'blanc-viz-hint',
};

/** The live canvas plus the idle "play a song" hint, shared by both shells. */
export function VizStage({
  settings,
  playing,
  classes = OS_VIZ_CLASSES,
  onOpenMusic,
  onOpenSettings,
}: {
  settings: VizSettings;
  playing: boolean;
  classes?: VizStageClasses;
  onOpenMusic?: () => void;
  onOpenSettings?: () => void;
}) {
  const { t } = useT();
  const settingsLabel = `${t('settings.nav.visualizer')} — ${t('settings.visualizer.options')}`;
  const hint = (
    <>
      <Icon name="music" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
      {t('commands.nav.open.music')}
    </>
  );
  return (
    <div className={classes.root}>
      <VisualizerCanvas className={classes.canvas} settings={settings} idleBaseline />
      {!playing && <span className={classes.hint}>{hint}</span>}
      {(onOpenMusic || onOpenSettings) && (
        <ContextualSurface
          className="viz-widget-dock"
          role="toolbar"
          aria-label={t('settings.nav.visualizer')}
        >
          {onOpenMusic && (
            <button
              type="button"
              className="viz-widget-action lq-hit"
              data-viz-action="music"
              title={t('commands.nav.open.music')}
              aria-label={t('commands.nav.open.music')}
              onClick={onOpenMusic}
            >
              <Icon name="music" size={14} />
            </button>
          )}
          {onOpenSettings && (
            <button
              type="button"
              className="viz-widget-action lq-hit"
              data-viz-action="settings"
              title={settingsLabel}
              aria-label={settingsLabel}
              onClick={onOpenSettings}
            >
              <Icon name="settings" size={14} />
            </button>
          )}
        </ContextualSurface>
      )}
    </div>
  );
}
