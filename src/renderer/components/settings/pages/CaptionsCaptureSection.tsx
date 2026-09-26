/**
 * Settings → Transcription → Live captions and system audio.
 *
 * Main owns these settings (`main/systemAudioCapture.ts`, stored in
 * `live-captions/overlay.json` — never any audio); this page reads and writes
 * them over IPC and follows the live state, so turning capture on here, from
 * the overlay, the tray or a shortcut all show the same switch.
 */
import { useEffect, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import { LANG_TAGS } from '../../../../shared/i18n/core';
import { ControlRow, FormRow, Group, Select, Slider, SwitchRow } from '../../ui';
import { WHISPER_MODEL_SPECS, type WhisperModelTier } from '../../../../shared/whisperModels';
import { isDownloadedIn, loadDownloaded, onDownloadedChanged } from '../../../whisperModelCache';
import {
  CAPTIONS_GLOBAL_COMMANDS,
  OVERLAY_FONT_MAX,
  OVERLAY_FONT_MIN,
  type CaptionSource,
  type CaptionsSettings,
  type CaptionsState,
} from '../../../../shared/captionsOverlay';
import {
  CAPTURE_SECONDS_MAX,
  CAPTURE_SECONDS_MIN,
  MINE_SECONDS_MAX,
  MINE_SECONDS_MIN,
} from '../../../../shared/systemAudioRing';
import { COMMAND_CATALOG, effectiveKeys, onShortcutsChanged } from '../../../keyboardShortcuts';
import { commandLabel } from '../../../commandI18n';

const SOURCES: readonly { id: CaptionSource; labelKey: string; descKey: string }[] = [
  { id: 'windows', labelKey: 'captions.source.windows', descKey: 'settings.captions.source.windowsDesc' },
  { id: 'gum', labelKey: 'captions.source.gum', descKey: 'settings.captions.source.gumDesc' },
  { id: 'off', labelKey: 'captions.source.off', descKey: 'settings.captions.source.offDesc' },
];

/** Bytes the ring holds at 24 kHz mono 16-bit — what "Keep the last" costs in memory. */
function bufferMegabytes(seconds: number): number {
  return Math.round(((seconds * 24_000 * 2) / (1024 * 1024)) * 10) / 10;
}

function useShortcutChords(): Record<string, string> {
  const read = (): Record<string, string> =>
    Object.fromEntries(CAPTIONS_GLOBAL_COMMANDS.map((id) => [id, effectiveKeys(id)]));
  const [chords, setChords] = useState(read);
  useEffect(() => onShortcutsChanged(() => setChords(read())), []);
  return chords;
}

export default function CaptionsCaptureSection() {
  const { t, lang } = useT();
  const { whisperDevice, whisperModelTier, chooseWhisperModelTier } = useSettings();
  const [state, setState] = useState<CaptionsState | null>(null);
  const [downloaded, setDownloaded] = useState(loadDownloaded);
  const chords = useShortcutChords();

  useEffect(() => onDownloadedChanged(setDownloaded), []);
  useEffect(() => {
    if (typeof window.api?.captionsGetState !== 'function') return undefined;
    let alive = true;
    void window.api.captionsGetState().then((s) => alive && s && setState(s)).catch(() => undefined);
    const off = window.api.onCaptionsState((s) => setState(s));
    return () => {
      alive = false;
      off();
    };
  }, []);

  if (!state) return null;
  const s = state.settings;
  const update = (patch: Partial<CaptionsSettings>): void => {
    setState((prev) => (prev ? { ...prev, settings: { ...prev.settings, ...patch } } : prev));
    void window.api.captionsSetSettings(patch).then((next) => next && setState(next));
  };
  const capturing = state.capture === 'on' || state.capture === 'starting';
  const studyTier = whisperModelTier as WhisperModelTier;
  const modelReady = isDownloadedIn(downloaded, studyTier, whisperDevice);
  const selectedDescKey = (SOURCES.find((src) => src.id === s.source) ?? SOURCES[0])?.descKey ?? '';

  return (
    <SettingsCard id="live-captions" title={t('settings.captions.title')} description={t('settings.captions.desc')}>
      <SwitchRow
        title={t('settings.captions.capture')}
        description={
          state.capture === 'error'
            ? t(state.captureErrorKey || 'captions.error.streamFailed')
            : !state.supported
              ? t('captions.status.unsupported')
              : t('settings.captions.captureDesc', { seconds: s.captureSeconds })
        }
        checked={capturing}
        disabled={!state.supported || state.capture === 'starting'}
        onChange={(e) => void window.api.captionsSetCapture(e.target.checked).then(setState)}
      />
      <p className="ui-group__desc">{t('settings.captions.privacy')}</p>
      <SwitchRow
        title={t('settings.captions.overlay')}
        description={t('settings.captions.overlayDesc')}
        checked={state.overlayOpen}
        onChange={(e) => void window.api.captionsToggleOverlay(e.target.checked).then(setState)}
      />

      <Group title={t('settings.captions.group.audio')}>
        <FormRow label={t('settings.captions.keep')} htmlFor="captions-keep" hint={t('settings.captions.keepHint', { mb: bufferMegabytes(s.captureSeconds) })}>
          <ControlRow>
            <Slider
              id="captions-keep"
              aria-label={t('settings.captions.keep')}
              min={CAPTURE_SECONDS_MIN}
              max={CAPTURE_SECONDS_MAX}
              step={10}
              value={s.captureSeconds}
              onChange={(e) => update({ captureSeconds: Number(e.target.value) })}
            />
            <span className="muted">{t('settings.captions.secondsValue', { seconds: s.captureSeconds })}</span>
          </ControlRow>
        </FormRow>
        <FormRow label={t('settings.captions.mineLength')} htmlFor="captions-mine">
          <ControlRow>
            <Slider
              id="captions-mine"
              aria-label={t('settings.captions.mineLength')}
              min={MINE_SECONDS_MIN}
              max={MINE_SECONDS_MAX}
              step={1}
              value={s.mineSeconds}
              onChange={(e) => update({ mineSeconds: Number(e.target.value) })}
            />
            <span className="muted">{t('settings.captions.secondsValue', { seconds: s.mineSeconds })}</span>
          </ControlRow>
        </FormRow>
        <SwitchRow
          title={t('settings.captions.transcribe')}
          description={modelReady ? t('settings.captions.transcribeDesc') : t('settings.captions.transcribeNoModel')}
          checked={s.transcribeMined}
          onChange={(e) => update({ transcribeMined: e.target.checked })}
        />
        <FormRow label={t('settings.captions.model')} htmlFor="captions-model" hint={modelReady ? t('storage.state.installed') : t('settings.captions.modelMissingHint')}>
          <Select
            id="captions-model"
            value={whisperModelTier}
            onChange={(e) => chooseWhisperModelTier(e.target.value as WhisperModelTier)}
            options={WHISPER_MODEL_SPECS.map((spec) => ({
              value: spec.id,
              label: `${t(`media.model.${spec.id}`)}${isDownloadedIn(downloaded, spec.id, whisperDevice) ? ` · ${t('storage.state.installed')}` : ''}`,
            }))}
          />
        </FormRow>
      </Group>

      <Group title={t('settings.captions.group.captions')}>
        <FormRow label={t('settings.captions.source')} hint={selectedDescKey ? t(selectedDescKey) : undefined}>
          <div className="sp-seg" role="group" aria-label={t('settings.captions.source')}>
            {SOURCES.map((src) => (
              <button
                key={src.id}
                type="button"
                className={`sp-seg-btn ${s.source === src.id ? 'active' : ''}`}
                aria-pressed={s.source === src.id}
                onClick={() => update({ source: src.id })}
              >
                {t(src.labelKey)}
              </button>
            ))}
          </div>
        </FormRow>
        <FormRow label={t('settings.captions.opacity')} htmlFor="captions-opacity">
          <ControlRow>
            <Slider
              id="captions-opacity"
              aria-label={t('settings.captions.opacity')}
              min={20}
              max={100}
              step={5}
              value={Math.round(s.overlayOpacity * 100)}
              onChange={(e) => update({ overlayOpacity: Number(e.target.value) / 100 })}
            />
            <span className="muted">{new Intl.NumberFormat(LANG_TAGS[lang], { style: 'percent' }).format(s.overlayOpacity)}</span>
          </ControlRow>
        </FormRow>
        <FormRow label={t('settings.captions.fontSize')} htmlFor="captions-font">
          <ControlRow>
            <Slider
              id="captions-font"
              aria-label={t('settings.captions.fontSize')}
              min={OVERLAY_FONT_MIN}
              max={OVERLAY_FONT_MAX}
              step={1}
              value={s.fontSize}
              onChange={(e) => update({ fontSize: Number(e.target.value) })}
            />
            <span className="muted">{t('settings.captions.pxValue', { px: s.fontSize })}</span>
          </ControlRow>
        </FormRow>
        <FormRow label={t('settings.captions.position')} hint={t('settings.captions.positionHint')}>
          <button type="button" className="btn small" disabled={!s.bounds} onClick={() => update({ bounds: null })}>
            {t('settings.captions.resetPosition')}
          </button>
        </FormRow>
      </Group>

      <Group title={t('settings.captions.group.shortcuts')} description={t('settings.captions.shortcutsDesc')}>
        {CAPTIONS_GLOBAL_COMMANDS.map((id) => {
          const command = COMMAND_CATALOG.find((c) => c.id === id);
          return (
            <FormRow key={id} label={commandLabel(id, command?.label ?? id, t)}>
              {chords[id] ? <kbd>{chords[id]}</kbd> : <span className="muted">{t('settings.captions.unbound')}</span>}
            </FormRow>
          );
        })}
        <ControlRow>
          <button
            type="button"
            className="btn small"
            onClick={() =>
              window.dispatchEvent(new CustomEvent('settings:navigate', { detail: { page: 'shortcuts' } }))}
          >
            {t('settings.captions.openShortcuts')}
          </button>
        </ControlRow>
      </Group>
    </SettingsCard>
  );
}
