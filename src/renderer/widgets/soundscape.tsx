import { useEffect, useState, type KeyboardEvent } from 'react';
import Icon from '../components/Icons';
import './widgets.css';
import { Input, Select, Slider, Toggle } from '../components/ui';
import { useT } from '../i18n';
import {
  BUILT_IN_SCENES,
  MAX_SAVED_MIXES,
  MUSIC_STYLES,
  SLEEP_TIMER_MINUTES,
  SOUND_LAYERS,
  SOUND_LAYER_GROUPS,
  isMusicStyleId,
  isSilent,
} from '../soundscape/soundscapeModel';
import {
  applySoundscapeScene,
  clearSoundscape,
  deleteSoundscapeMix,
  getSoundscape,
  saveSoundscapeMix,
  setSoundLayerLevel,
  setSoundscapeDuck,
  setSoundscapeMaster,
  setSoundscapeMusic,
  setSoundscapeMusicVolume,
  setSoundscapeTimer,
  subscribeSoundscape,
  toggleSoundLayer,
  toggleSoundscape,
  type SoundscapeSnapshot,
} from '../soundscape/soundscapeStore';

const percent = (value: number): number => Math.round(value * 100);

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

  useEffect(() => subscribeSoundscape(setSnap), []);

  // The remaining time is derived from the clock, so re-render while a timer runs.
  const timerRunning = snap.timerEndsAt !== null;
  useEffect(() => {
    if (!timerRunning) return undefined;
    const handle = setInterval(() => setClock((tick) => tick + 1), 20_000);
    return () => clearInterval(handle);
  }, [timerRunning]);

  const { state, playing, sceneId, timerEndsAt } = snap;
  const silent = isSilent(state);
  const savedSelected = state.saved.some((mix) => mix.id === sceneId);
  const minutesLeft = timerEndsAt === null ? 0 : Math.max(1, Math.ceil((timerEndsAt - Date.now()) / 60_000));

  const commitName = (): void => {
    if (saveSoundscapeMix(name)) {
      setNaming(false);
      setName('');
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
              return (
                <div key={layer.id} className={`wgt-sound-row${on ? ' is-on' : ''}`}>
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
    </div>
  );
}
