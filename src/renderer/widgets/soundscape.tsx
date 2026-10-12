import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import Icon from '../components/Icons';
import './widgets.css';
import { Input, Select, Slider, Toggle } from '../components/ui';
import { useT } from '../i18n';
import {
  BUILT_IN_SCENES,
  FADE_SCHEDULES,
  MAX_SAVED_MIXES,
  MODE_PRESET_KEEP,
  MODE_PRESET_PAUSE,
  MUSIC_STYLES,
  SLEEP_TIMER_MINUTES,
  SOUND_LAYERS,
  SOUND_LAYER_GROUPS,
  STUDY_MODES,
  isMusicStyleId,
  isMixSilent,
  isNeutralShape,
  shapeOf,
  type FadeScheduleId,
  type LayerShape,
  type MixesImportError,
  type SoundLayerId,
  type StudyModePresets,
} from '../soundscape/soundscapeModel';
import {
  loadStudyModePresets,
  onStudyModePresetsChanged,
  saveStudyModePresets,
} from '../soundscape/studyModePresets';
import {
  applySoundscapeScene,
  clearSoundscape,
  deleteSoundscapeMix,
  exportSoundscapeMixes,
  getSoundscape,
  importSoundscapeMixes,
  saveSoundscapeMix,
  setSoundLayerLevel,
  setSoundLayerShape,
  setSoundscapeDuck,
  setSoundscapeDuckForSpeech,
  setSoundscapeFade,
  setSoundscapeMaster,
  setSoundscapeMusic,
  setSoundscapeMusicVolume,
  setSoundscapeTimer,
  subscribeSoundscape,
  toggleSoundLayer,
  toggleSoundscape,
  type SoundscapeSnapshot,
} from '../soundscape/soundscapeStore';
import {
  focusSoundSecondsOn,
  loadFocusSoundscape,
  onFocusSoundscapeChanged,
  saveFocusSoundscape,
  type FocusSoundscapeSettings,
} from '../soundscape/focusSoundscape';

const percent = (value: number): number => Math.round(value * 100);

type TFn = (key: string, vars?: Record<string, string | number>) => string;

/** snd6: what a screen reader says for a tone position ("Darker, 40%"). */
function toneText(tone: number, t: TFn): string {
  if (tone === 0) return t('snd6.shape.toneNeutral');
  return tone < 0 ? t('snd6.shape.darker', { percent: percent(-tone) }) : t('snd6.shape.brighter', { percent: percent(tone) });
}

function panText(pan: number, t: TFn): string {
  if (pan === 0) return t('snd6.shape.centre');
  return pan < 0 ? t('snd6.shape.left', { percent: percent(-pan) }) : t('snd6.shape.right', { percent: percent(pan) });
}

function importErrorText(error: MixesImportError, t: TFn): string {
  if (error === 'notJson') return t('snd6.mixes.error.notJson');
  if (error === 'empty') return t('snd6.mixes.error.empty');
  return t('snd6.mixes.error.notMixes');
}

/**
 * snd6: one layer's tone and pan, opened under its row. Sliders run -100..100
 * with the centre as neutral; Reset puts both back.
 */
function LayerShapeControls({ id, label, shape, t }: { id: SoundLayerId; label: string; shape: LayerShape; t: TFn }) {
  return (
    <div className="wgt-sound-shape" role="group" aria-label={t('snd6.shape.groupOf', { name: label })}>
      <label className="wgt-sound-shape-row">
        <span>{t('snd6.shape.tone')}</span>
        <Slider
          min={-100}
          max={100}
          step={5}
          value={Math.round(shape.tone * 100)}
          aria-label={t('snd6.shape.toneOf', { name: label })}
          aria-valuetext={toneText(shape.tone, t)}
          onChange={(event) => setSoundLayerShape(id, { tone: Number(event.target.value) / 100 })}
        />
      </label>
      <label className="wgt-sound-shape-row">
        <span>{t('snd6.shape.pan')}</span>
        <Slider
          min={-100}
          max={100}
          step={5}
          value={Math.round(shape.pan * 100)}
          aria-label={t('snd6.shape.panOf', { name: label })}
          aria-valuetext={panText(shape.pan, t)}
          onChange={(event) => setSoundLayerShape(id, { pan: Number(event.target.value) / 100 })}
        />
      </label>
      <button
        type="button"
        className="wgt-btn wgt-sound-shape-reset"
        disabled={isNeutralShape(shape)}
        onClick={() => setSoundLayerShape(id, { tone: 0, pan: 0 })}
      >
        {t('snd6.shape.reset')}
      </button>
    </div>
  );
}

/**
 * Soundscape — a mixer of generated study sounds. The widget is only the controls:
 * playback belongs to soundscapeStore, so collapsing or removing the widget does
 * not stop the sound.
 */
export function SoundscapeWidget() {
  const { t } = useT();
  const [snap, setSnap] = useState<SoundscapeSnapshot>(() => getSoundscape());
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [, setClock] = useState(0);
  /** snd6: the one layer whose tone/pan controls are open. */
  const [shaping, setShaping] = useState<SoundLayerId | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [mixMsg, setMixMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const shapeIdBase = useId();

  useEffect(() => subscribeSoundscape(setSnap), []);
  const [focus, setFocus] = useState<FocusSoundscapeSettings>(() => loadFocusSoundscape());
  useEffect(() => onFocusSoundscapeChanged(setFocus), []);
  const [modes, setModes] = useState<StudyModePresets>(() => loadStudyModePresets());
  useEffect(() => onStudyModePresetsChanged(setModes), []);
  // Re-read on every mixer change and once a minute: the tally moves while sound plays.
  const [focusMinutes, setFocusMinutes] = useState(() => Math.floor(focusSoundSecondsOn() / 60));
  useEffect(() => {
    const read = (): void => setFocusMinutes(Math.floor(focusSoundSecondsOn() / 60));
    read();
    const handle = setInterval(read, 60_000);
    return () => clearInterval(handle);
  }, [snap.playing]);

  // The remaining time is derived from the clock, so re-render while a timer runs.
  const timerRunning = snap.timerEndsAt !== null;
  useEffect(() => {
    if (!timerRunning) return undefined;
    const handle = setInterval(() => setClock((tick) => tick + 1), 20_000);
    return () => clearInterval(handle);
  }, [timerRunning]);

  const { state, playing, sceneId, timerEndsAt } = snap;
  const silent = isMixSilent(state);
  const savedSelected = state.saved.some((mix) => mix.id === sceneId);
  const minutesLeft = timerEndsAt === null ? 0 : Math.max(1, Math.ceil((timerEndsAt - Date.now()) / 60_000));

  const commitName = (): void => {
    if (saveSoundscapeMix(name)) {
      setNaming(false);
      setName('');
    }
  };
  // ---- snd6: saved mixes as a file -------------------------------------------
  const reportImport = (text: string): boolean => {
    const result = importSoundscapeMixes(text);
    if (!result.ok) {
      setMixMsg(t('snd6.mixes.importFailed', { error: importErrorText(result.error, t) }));
      return false;
    }
    const parts = [t('snd6.mixes.added', { count: result.added })];
    if (result.duplicates) parts.push(t('snd6.mixes.duplicates', { count: result.duplicates }));
    if (result.overflow) parts.push(t('snd6.mixes.overflow', { count: result.overflow, max: MAX_SAVED_MIXES }));
    setMixMsg(parts.join(' '));
    return true;
  };
  const exportFile = (): void => {
    const name = `gum-soundscape-mixes-${new Date().toISOString().slice(0, 10)}.json`;
    try {
      const url = URL.createObjectURL(new Blob([exportSoundscapeMixes()], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = name;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMixMsg(t('snd6.mixes.exported', { name }));
    } catch {
      setMixMsg(t('snd6.mixes.exportFailed'));
    }
  };
  const copyMixes = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(exportSoundscapeMixes());
      setMixMsg(t('snd6.mixes.copied', { count: state.saved.length }));
    } catch {
      setMixMsg(t('snd6.mixes.copyFailed'));
    }
  };
  const loadFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      reportImport(await file.text());
    } catch {
      setMixMsg(t('snd6.mixes.importFailed', { error: importErrorText('notJson', t) }));
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const onNameKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    // Enter also confirms an IME conversion; that Enter must not save the mix.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter') commitName();
    if (event.key === 'Escape') setNaming(false);
  };

  return (
    <div className="wgt wgt-sound">
      <div className="wgt-row">
        <button
          type="button"
          className="wgt-btn-icon lg"
          disabled={silent}
          aria-pressed={playing}
          aria-label={playing ? t('soundscape.pause') : t('soundscape.play')}
          title={playing ? t('soundscape.pause') : t('soundscape.play')}
          onClick={() => toggleSoundscape()}
        >
          <Icon name={playing ? 'pause' : 'player'} size={15} />
        </button>
        <span className="wgt-vol-ic" aria-hidden>
          <Icon name="volume" size={13} />
        </span>
        <Slider
          min={0}
          max={100}
          value={percent(state.master)}
          onChange={(event) => setSoundscapeMaster(Number(event.target.value) / 100)}
          aria-label={t('soundscape.master')}
        />
      </div>

      <div className="wgt-row">
        <Select
          className="wgt-sound-scene"
          aria-label={t('soundscape.scene.label')}
          value={sceneId ?? ''}
          onChange={(event) => {
            if (event.target.value) applySoundscapeScene(event.target.value);
          }}
        >
          <option value="">{silent ? t('soundscape.scene.pick') : t('soundscape.scene.custom')}</option>
          <optgroup label={t('soundscape.scene.builtIn')}>
            {BUILT_IN_SCENES.map((scene) => (
              <option key={scene.id} value={scene.id}>
                {t(scene.labelKey)}
              </option>
            ))}
          </optgroup>
          {state.saved.length > 0 && (
            <optgroup label={t('soundscape.scene.saved')}>
              {state.saved.map((mix) => (
                <option key={mix.id} value={mix.id}>
                  {mix.name}
                </option>
              ))}
            </optgroup>
          )}
        </Select>
        {savedSelected ? (
          <button
            type="button"
            className="wgt-btn-icon"
            aria-label={t('soundscape.deleteMix')}
            title={t('soundscape.deleteMix')}
            onClick={() => sceneId && deleteSoundscapeMix(sceneId)}
          >
            <Icon name="trash" size={13} />
          </button>
        ) : (
          <button
            type="button"
            className="wgt-btn-icon"
            disabled={silent || sceneId !== null || state.saved.length >= MAX_SAVED_MIXES}
            aria-label={t('soundscape.saveMix')}
            title={t('soundscape.saveMix')}
            onClick={() => setNaming(true)}
          >
            <Icon name="plus" size={13} />
          </button>
        )}
      </div>

      {naming && (
        <div className="wgt-row">
          <Input
            autoFocus
            value={name}
            maxLength={60}
            placeholder={t('soundscape.mixName')}
            aria-label={t('soundscape.mixName')}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={onNameKey}
          />
          <button type="button" className="wgt-btn primary" disabled={!name.trim()} onClick={commitName}>
            {t('common.save')}
          </button>
          <button type="button" className="wgt-btn" onClick={() => setNaming(false)}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      <div className="wgt-sound-list">
        {SOUND_LAYER_GROUPS.map((group) => (
          <div key={group.id} className="wgt-sound-group" role="group" aria-label={t(group.labelKey)}>
            <div className="wgt-sound-heading">{t(group.labelKey)}</div>
            {SOUND_LAYERS.filter((layer) => layer.group === group.id).map((layer) => {
              const on = state.active.includes(layer.id);
              const label = t(layer.labelKey);
              const shape = shapeOf(state, layer.id);
              const shaped = !isNeutralShape(shape);
              const open = shaping === layer.id;
              const shapeId = `${shapeIdBase}-${layer.id}`;
              return (
                <div key={layer.id} className="wgt-sound-layer">
                  <div className={`wgt-sound-row${on ? ' is-on' : ''}`}>
                    <button
                      type="button"
                      className="wgt-sound-name"
                      aria-pressed={on}
                      onClick={() => toggleSoundLayer(layer.id)}
                    >
                      {label}
                    </button>
                    <Slider
                      min={0}
                      max={100}
                      value={on ? percent(state.levels[layer.id]) : 0}
                      onChange={(event) => setSoundLayerLevel(layer.id, Number(event.target.value) / 100)}
                      aria-label={t('soundscape.layerVolume', { name: label })}
                    />
                    <button
                      type="button"
                      className={`wgt-btn-icon wgt-sound-shape-btn${shaped ? ' is-shaped' : ''}`}
                      aria-expanded={open}
                      aria-controls={open ? shapeId : undefined}
                      aria-label={shaped ? t('snd6.shape.openShaped', { name: label }) : t('snd6.shape.open', { name: label })}
                      title={shaped ? t('snd6.shape.openShaped', { name: label }) : t('snd6.shape.open', { name: label })}
                      onClick={() => setShaping(open ? null : layer.id)}
                    >
                      <Icon name="wrench" size={11} />
                    </button>
                  </div>
                  {open && (
                    <div id={shapeId}>
                      <LayerShapeControls id={layer.id} label={label} shape={shape} t={t} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div className="wgt-sound-group" role="group" aria-label={t('soundscape.music.label')}>
          <div className="wgt-sound-heading">{t('soundscape.music.label')}</div>
          <div className={`wgt-sound-row${state.music !== 'off' ? ' is-on' : ''}`}>
            <Select
              className="wgt-sound-style"
              aria-label={t('soundscape.music.style')}
              value={state.music}
              onChange={(event) => {
                if (isMusicStyleId(event.target.value)) setSoundscapeMusic(event.target.value);
              }}
            >
              {MUSIC_STYLES.map((style) => (
                <option key={style.id} value={style.id}>
                  {t(style.labelKey)}
                </option>
              ))}
            </Select>
            <Slider
              min={0}
              max={100}
              disabled={state.music === 'off'}
              value={state.music === 'off' ? 0 : percent(state.musicVolume)}
              onChange={(event) => setSoundscapeMusicVolume(Number(event.target.value) / 100)}
              aria-label={t('soundscape.music.volume')}
            />
          </div>
        </div>

        {/* snd6: saved mixes to a file and back — keep them, move them, share them. */}
        <div className="wgt-sound-group wgt-sound-mixes" role="group" aria-label={t('snd6.mixes.heading')}>
          <div className="wgt-sound-heading">{t('snd6.mixes.heading')}</div>
          <div className="wgt-sound-mixes-actions">
            <button type="button" className="wgt-btn" disabled={!state.saved.length} onClick={exportFile}>
              {t('snd6.mixes.export')}
            </button>
            <button type="button" className="wgt-btn" disabled={!state.saved.length} onClick={() => void copyMixes()}>
              {t('snd6.mixes.copy')}
            </button>
            <button type="button" className="wgt-btn" onClick={() => fileRef.current?.click()}>
              {t('snd6.mixes.import')}
            </button>
            <button type="button" className="wgt-btn" aria-expanded={pasting} onClick={() => setPasting((open) => !open)}>
              {t('snd6.mixes.paste')}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              aria-hidden="true"
              tabIndex={-1}
              data-snd6-mix-file
              onChange={(event) => void loadFile(event.target.files?.[0])}
            />
          </div>
          {pasting && (
            <div className="wgt-sound-paste">
              <textarea
                value={pasteText}
                aria-label={t('snd6.mixes.pasteLabel')}
                placeholder={t('snd6.mixes.pastePlaceholder')}
                onChange={(event) => setPasteText(event.target.value)}
              />
              <button
                type="button"
                className="wgt-btn primary"
                disabled={!pasteText.trim()}
                onClick={() => {
                  if (reportImport(pasteText)) {
                    setPasteText('');
                    setPasting(false);
                  }
                }}
              >
                {t('snd6.mixes.importPasted')}
              </button>
            </div>
          )}
          {mixMsg && (
            <div className="wgt-sound-duck" role="status">
              {mixMsg}
            </div>
          )}
        </div>

        {/* snd2: the mixer follows Pomodoro work blocks and Focus Mode (focusSoundscape.ts). */}
        <div className="wgt-sound-group wgt-sound-focus" role="group" aria-label={t('snd2.focus.heading')}>
          <div className="wgt-sound-heading">{t('snd2.focus.heading')}</div>
          <Toggle
            checked={focus.enabled}
            onChange={(event) => saveFocusSoundscape({ enabled: event.target.checked })}
            label={t('snd2.focus.enable')}
          />
          {focus.enabled && (
            <>
              <Select
                className="wgt-sound-scene"
                aria-label={t('snd2.focus.scene')}
                value={focus.sceneId}
                onChange={(event) => saveFocusSoundscape({ sceneId: event.target.value })}
              >
                <option value="">{t('snd2.focus.currentMix')}</option>
                <optgroup label={t('soundscape.scene.builtIn')}>
                  {BUILT_IN_SCENES.map((scene) => (
                    <option key={scene.id} value={scene.id}>
                      {t(scene.labelKey)}
                    </option>
                  ))}
                </optgroup>
                {state.saved.length > 0 && (
                  <optgroup label={t('soundscape.scene.saved')}>
                    {state.saved.map((mix) => (
                      <option key={mix.id} value={mix.id}>
                        {mix.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </Select>
              <Toggle
                checked={focus.withPomodoro}
                onChange={(event) => saveFocusSoundscape({ withPomodoro: event.target.checked })}
                label={t('snd2.focus.pomodoro')}
              />
              <Toggle
                checked={focus.withFocusMode}
                onChange={(event) => saveFocusSoundscape({ withFocusMode: event.target.checked })}
                label={t('snd2.focus.focusMode')}
              />
              <Toggle
                checked={focus.fadeOnBreak}
                onChange={(event) => saveFocusSoundscape({ fadeOnBreak: event.target.checked })}
                label={t('snd2.focus.fadeOnBreak')}
              />
            </>
          )}
          {focusMinutes > 0 && (
            <div className="wgt-sound-duck" role="status">
              {t('snd2.focus.today', { minutes: focusMinutes })}
            </div>
          )}
        </div>

        {/* snd5: a scene per study mode (studyModeSoundscape.ts), off by default. */}
        <div className="wgt-sound-group wgt-sound-modes" role="group" aria-label={t('snd5.modes.heading')}>
          <div className="wgt-sound-heading">{t('snd5.modes.heading')}</div>
          <Toggle
            checked={modes.enabled}
            onChange={(event) => saveStudyModePresets({ enabled: event.target.checked })}
            label={t('snd5.modes.enable')}
          />
          {modes.enabled &&
            STUDY_MODES.map((mode) => (
              <label key={mode.id} className="wgt-sound-mode">
                <span>{t(mode.labelKey)}</span>
                <Select
                  value={modes[mode.id]}
                  onChange={(event) => saveStudyModePresets({ [mode.id]: event.target.value })}
                >
                  <option value={MODE_PRESET_KEEP}>{t('snd5.modes.keep')}</option>
                  <option value={MODE_PRESET_PAUSE}>{t('snd5.modes.pause')}</option>
                  <optgroup label={t('soundscape.scene.builtIn')}>
                    {BUILT_IN_SCENES.map((scene) => (
                      <option key={scene.id} value={scene.id}>
                        {t(scene.labelKey)}
                      </option>
                    ))}
                  </optgroup>
                  {state.saved.length > 0 && (
                    <optgroup label={t('soundscape.scene.saved')}>
                      {state.saved.map((mix) => (
                        <option key={mix.id} value={mix.id}>
                          {mix.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </Select>
              </label>
            ))}
        </div>

        {/* snd5: how sound arrives and leaves; the sleep timer and focus breaks follow it. */}
        <div className="wgt-sound-group" role="group" aria-label={t('snd5.fade.label')}>
          <div className="wgt-sound-heading">{t('snd5.fade.label')}</div>
          <Select
            aria-label={t('snd5.fade.label')}
            value={state.fade}
            onChange={(event) => setSoundscapeFade(event.target.value as FadeScheduleId)}
          >
            {FADE_SCHEDULES.map((schedule) => (
              <option key={schedule.id} value={schedule.id}>
                {t(schedule.labelKey)}
              </option>
            ))}
          </Select>
          {sceneId !== null && state.sceneVolumes[sceneId] !== undefined && (
            <div className="wgt-sound-duck">{t('snd5.sceneVolume.remembered')}</div>
          )}
        </div>
      </div>

      <div className="wgt-row wgt-sound-foot">
        <Select
          aria-label={t('soundscape.timer.label')}
          value=""
          onChange={(event) => setSoundscapeTimer(Number(event.target.value))}
        >
          <option value="" disabled hidden>
            {timerRunning ? t('soundscape.timer.remaining', { minutes: minutesLeft }) : t('soundscape.timer.label')}
          </option>
          <option value="0">{t('soundscape.timer.off')}</option>
          {SLEEP_TIMER_MINUTES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {t('soundscape.timer.minutes', { minutes })}
            </option>
          ))}
        </Select>
        <button type="button" className="wgt-btn" disabled={silent} onClick={() => clearSoundscape()}>
          {t('soundscape.clear')}
        </button>
      </div>
      <Toggle
        className="wgt-sound-duck"
        checked={state.duckWithMedia}
        onChange={(event) => setSoundscapeDuck(event.target.checked)}
        label={t('soundscape.duck')}
      />
      {/* snd6: duck under speech, a card's clip or a video — in this window or a pop-out. */}
      <Toggle
        className="wgt-sound-duck"
        checked={state.duckForSpeech}
        onChange={(event) => setSoundscapeDuckForSpeech(event.target.checked)}
        label={t('snd6.duck.speech')}
      />
      <div className="wgt-sound-duck wgt-sound-ducking" role="status">
        {snap.ducking === 'speech' ? t('snd6.duck.nowSpeech') : snap.ducking === 'music' ? t('snd6.duck.nowMusic') : ''}
      </div>
    </div>
  );
}
