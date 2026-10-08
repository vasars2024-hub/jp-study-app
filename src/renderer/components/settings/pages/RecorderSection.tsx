/**
 * Settings → Transcription → Screen recorder (the Region Recorder).
 *
 * Main owns these settings (`main/regionRecorder.ts`, stored in
 * `region-recorder.json`); this card reads and writes them over IPC and
 * follows the live state, so a recording started from a shortcut shows here.
 */
import { useEffect, useMemo, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useT } from '../../../i18n';
import { ControlRow, FormRow, Group, Select, Slider, SwitchRow } from '../../ui';
import {
  RECORDER_FPS_CHOICES,
  RECORDER_MAX_MINUTES_LIMIT,
  type RecorderAudioSource,
  type RecorderQuality,
  type RecorderSettings,
  type RecorderState,
} from '../../../../shared/regionRecorder';
import { COMMAND_CATALOG, effectiveKeys, onShortcutsChanged } from '../../../keyboardShortcuts';
import { commandLabel } from '../../../commandI18n';

const RECORDER_COMMANDS = ['recorder.region', 'recorder.repeatRegion', 'recorder.stop'] as const;
const AUDIO: readonly RecorderAudioSource[] = ['system', 'mic', 'both', 'none'];
const QUALITY: readonly RecorderQuality[] = ['high', 'standard', 'small'];

function useChords(): Record<string, string> {
  const read = (): Record<string, string> => Object.fromEntries(RECORDER_COMMANDS.map((id) => [id, effectiveKeys(id)]));
  const [chords, setChords] = useState(read);
  useEffect(() => onShortcutsChanged(() => setChords(read())), []);
  return chords;
}

function useMicrophones(): MediaDeviceInfo[] {
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);
  useEffect(() => {
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices) return undefined;
    const load = (): void => {
      void md.enumerateDevices().then((all) => setMics(all.filter((d) => d.kind === 'audioinput'))).catch(() => undefined);
    };
    load();
    md.addEventListener?.('devicechange', load);
    return () => md.removeEventListener?.('devicechange', load);
  }, []);
  return mics;
}

export default function RecorderSection() {
  const { t, lang } = useT();
  const [state, setState] = useState<RecorderState | null>(null);
  const chords = useChords();
  const mics = useMicrophones();

  useEffect(() => {
    if (typeof window.api?.recorderGetState !== 'function') return undefined;
    let alive = true;
    void window.api.recorderGetState().then((s) => alive && s && setState(s)).catch(() => undefined);
    const off = window.api.onRecorderState((s) => setState(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  const micOptions = useMemo(
    () => [
      { value: '', label: t('recorder.settings.micDefault') },
      ...mics.filter((m) => m.deviceId && m.deviceId !== 'default').map((m, i) => ({
        value: m.deviceId,
        label: m.label || t('recorder.settings.micNumbered', { n: i + 1 }),
      })),
    ],
    [mics, lang],
  );

  if (!state) return null;
  const s = state.settings;
  const update = (patch: Partial<RecorderSettings>): void => {
    setState((prev) => (prev ? { ...prev, settings: { ...prev.settings, ...patch } } : prev));
    void window.api.recorderSetSettings(patch).then((next) => next && setState(next));
  };
  const busy = state.phase === 'starting' || state.phase === 'recording' || state.phase === 'paused';
  const wantsMic = s.audio === 'mic' || s.audio === 'both';
  const wantsSystem = s.audio === 'system' || s.audio === 'both';

  return (
    <SettingsCard id="region-recorder" title={t('recorder.settings.title')} description={t('recorder.settings.desc')}>
      <ControlRow>
        <button type="button" className="btn small" onClick={() => void window.api.recorderStart('select')}>
          {busy ? t('recorder.pill.stop') : t('recorder.settings.start')}
        </button>
        <button type="button" className="btn small" disabled={busy || !s.lastRegion} onClick={() => void window.api.recorderStart('repeat')}>
          {t('recorder.settings.repeat')}
        </button>
        <button type="button" className="btn small" disabled={busy} onClick={() => void window.api.recorderStart('full')}>
          {t('recorder.settings.full')}
        </button>
      </ControlRow>
      <p className="ui-group__desc">{t('recorder.settings.privacy')}</p>

      <Group title={t('recorder.settings.group.audio')}>
        <FormRow
          label={t('recorder.settings.audio')}
          hint={wantsSystem ? (state.loopbackSupported ? t('recorder.settings.loopbackNote') : t('recorder.settings.windowsOnly')) : undefined}
        >
          <div className="sp-seg" role="group" aria-label={t('recorder.settings.audio')}>
            {AUDIO.map((id) => (
              <button
                key={id}
                type="button"
                className={`sp-seg-btn ${s.audio === id ? 'active' : ''}`}
                aria-pressed={s.audio === id}
                onClick={() => update({ audio: id })}
              >
                {t(`recorder.settings.audio.${id}`)}
              </button>
            ))}
          </div>
        </FormRow>
        {wantsMic && (
          <FormRow label={t('recorder.settings.mic')} htmlFor="recorder-mic">
            <Select id="recorder-mic" value={s.micDeviceId} onChange={(e) => update({ micDeviceId: e.target.value })} options={micOptions} />
          </FormRow>
        )}
        {wantsSystem && (
          <FormRow label={t('recorder.settings.systemGain')} htmlFor="recorder-sys-gain">
            <ControlRow>
              <Slider id="recorder-sys-gain" aria-label={t('recorder.settings.systemGain')} min={0} max={200} step={5}
                value={Math.round(s.systemGain * 100)} onChange={(e) => update({ systemGain: Number(e.target.value) / 100 })} />
              <span className="muted">{t('recorder.settings.percent', { n: Math.round(s.systemGain * 100) })}</span>
            </ControlRow>
          </FormRow>
        )}
        {wantsMic && (
          <FormRow label={t('recorder.settings.micGain')} htmlFor="recorder-mic-gain">
            <ControlRow>
              <Slider id="recorder-mic-gain" aria-label={t('recorder.settings.micGain')} min={0} max={200} step={5}
                value={Math.round(s.micGain * 100)} onChange={(e) => update({ micGain: Number(e.target.value) / 100 })} />
              <span className="muted">{t('recorder.settings.percent', { n: Math.round(s.micGain * 100) })}</span>
            </ControlRow>
          </FormRow>
        )}
      </Group>

      <Group title={t('recorder.settings.group.video')}>
        <FormRow label={t('recorder.settings.quality')} htmlFor="recorder-quality">
          <Select id="recorder-quality" value={s.quality} onChange={(e) => update({ quality: e.target.value as RecorderQuality })}
            options={QUALITY.map((q) => ({ value: q, label: t(`recorder.settings.quality.${q}`) }))} />
        </FormRow>
        <FormRow label={t('recorder.settings.fps')} htmlFor="recorder-fps">
          <Select id="recorder-fps" value={String(s.fps)} onChange={(e) => update({ fps: Number(e.target.value) })}
            options={RECORDER_FPS_CHOICES.map((f) => ({ value: String(f), label: t('recorder.settings.fpsValue', { n: f }) }))} />
        </FormRow>
        <FormRow label={t('recorder.settings.maxMinutes')} htmlFor="recorder-max">
          <ControlRow>
            <Slider id="recorder-max" aria-label={t('recorder.settings.maxMinutes')} min={5} max={RECORDER_MAX_MINUTES_LIMIT} step={5}
              value={s.maxMinutes} onChange={(e) => update({ maxMinutes: Number(e.target.value) })} />
            <span className="muted">{t('recorder.settings.minutes', { count: s.maxMinutes })}</span>
          </ControlRow>
        </FormRow>
        <FormRow label={t('recorder.settings.folder')} hint={s.folder || state.defaultFolder}>
          <ControlRow>
            <button type="button" className="btn small" onClick={() => void window.api.recorderChooseFolder().then(setState)}>
              {t('recorder.settings.folderChange')}
            </button>
            <button type="button" className="btn small" disabled={!s.folder} onClick={() => update({ folder: '' })}>
              {t('recorder.settings.folderReset')}
            </button>
          </ControlRow>
        </FormRow>
      </Group>

      <Group title={t('recorder.settings.group.after')}>
        <SwitchRow title={t('recorder.settings.autoTranscribe')} description={t('recorder.settings.autoTranscribeDesc')}
          checked={s.autoTranscribe} onChange={(e) => update({ autoTranscribe: e.target.checked })} />
        <SwitchRow title={t('recorder.settings.autoOpen')} description={t('recorder.settings.autoOpenDesc')}
          checked={s.autoOpen} onChange={(e) => update({ autoOpen: e.target.checked })} />
      </Group>

      <Group title={t('recorder.settings.group.shortcuts')} description={t('recorder.settings.shortcutsDesc')}>
        {RECORDER_COMMANDS.map((id) => {
          const command = COMMAND_CATALOG.find((c) => c.id === id);
          return (
            <FormRow key={id} label={commandLabel(id, command?.label ?? id, t)}>
              {chords[id] ? <kbd>{chords[id]}</kbd> : <span className="muted">{t('recorder.settings.unbound')}</span>}
            </FormRow>
          );
        })}
        <ControlRow>
          <button type="button" className="btn small"
            onClick={() => window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'shortcuts' } }))}>
            {t('recorder.settings.openShortcuts')}
          </button>
        </ControlRow>
      </Group>
    </SettingsCard>
  );
}
