/**
 * The one place automatic narration is switched on, for every mining flow.
 *
 * It reports what the last run actually did — added, failed, and how many the
 * per-batch cap deferred — because "automatic" is exactly the setting a user
 * cannot otherwise verify: nothing on screen changes when it silently fails.
 */
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { formatBytes } from '../../../shared/assetRegistry';
import { flashcardAudioErrorKey } from '../../../shared/flashcardAudioMessages';
import type { AutoAudioPreferences, AutoAudioSource } from '../../../shared/flashcardAutoAudio';
import {
  loadAutoAudioPreferences,
  onAutoAudioReport,
  saveAutoAudioPreferences,
  type AutoAudioReport,
} from '../../flashcardAutoAudio';
import { loadDeck } from '../../flashcardDeck';
import { useT } from '../../i18n';
import './autoAudio.css';

type Usage = Awaited<ReturnType<Window['api']['flashcardAudioUsage']>>;

const SOURCES: Array<{ key: AutoAudioSource; label: string }> = [
  { key: 'epub', label: 'flash.autoAudio.epub' },
  { key: 'extension', label: 'flash.autoAudio.extension' },
  { key: 'media', label: 'flash.autoAudio.media' },
  { key: 'import', label: 'flash.autoAudio.import' },
];

export default function AutoAudioPreferencesPanel() {
  const { t } = useT();
  const [preferences, setPreferences] = useState<AutoAudioPreferences>(loadAutoAudioPreferences);
  const [report, setReport] = useState<AutoAudioReport | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [armed, setArmed] = useState(false);
  const [swept, setSwept] = useState<{ removed: number; bytes: number } | null>(null);

  const refreshUsage = useCallback((): void => {
    void window.api.flashcardAudioUsage().then(setUsage).catch(() => setUsage(null));
  }, []);
  useEffect(() => onAutoAudioReport(setReport), []);
  useEffect(refreshUsage, [refreshUsage, report]);

  /**
   * The deck is the only place that knows which files are still wanted, so the
   * reference set is built here and main contributes what exists on disk.
   */
  const sweep = (): void => {
    const referenced = loadDeck()
      .map((card) => card.audioPath)
      .filter((entry): entry is string => Boolean(entry));
    setArmed(false);
    void window.api.flashcardSweepAudio(referenced).then((result) => {
      setSwept({ removed: result.removed, bytes: result.bytes });
      refreshUsage();
    });
  };

  const toggle = (key: AutoAudioSource) => (event: ChangeEvent<HTMLInputElement>): void => {
    setPreferences(saveAutoAudioPreferences({ ...preferences, [key]: event.currentTarget.checked }));
  };
  const setCap = (event: ChangeEvent<HTMLInputElement>): void => {
    setPreferences(saveAutoAudioPreferences({
      ...preferences,
      maxPerBatch: Number(event.currentTarget.value),
    }));
  };

  return (
    <fieldset className="auto-audio-options">
      <legend>{t('flash.autoAudio.title')}</legend>
      <p className="muted">{t('flash.autoAudio.lead')}</p>
      {SOURCES.map((entry) => (
        <label key={entry.key}>
          <input type="checkbox" checked={preferences[entry.key]} onChange={toggle(entry.key)} />
          {t(entry.label)}
        </label>
      ))}
      <label className="auto-audio-options__cap">
        {t('flash.autoAudio.cap')}
        <input
          type="number"
          min={1}
          max={500}
          value={preferences.maxPerBatch}
          onChange={setCap}
        />
      </label>
      {report && (
        <p className="auto-audio-options__report" aria-live="polite">
          {t('flash.autoAudio.report', { added: report.added, failed: report.failed })}
          {report.deferred > 0 && ` ${t('flash.autoAudio.deferred', { count: report.deferred })}`}
          {report.failed > 0 && ` ${t(flashcardAudioErrorKey(report.reason))}`}
        </p>
      )}
      {usage && (
        <div className="auto-audio-options__disk">
          <span className="muted">
            {t('flash.autoAudio.disk', {
              files: usage.total.files,
              size: formatBytes(usage.total.bytes),
              clips: formatBytes(usage.clips.bytes),
              speech: formatBytes(usage.speech.bytes),
            })}
          </span>
          {armed ? (
            <>
              <span className="muted">{t('flash.autoAudio.sweepConfirm')}</span>
              <button type="button" className="btn small danger" onClick={sweep}>
                {t('flash.autoAudio.sweepYes')}
              </button>
              <button type="button" className="btn small" onClick={() => setArmed(false)}>
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn small"
              disabled={usage.total.files === 0}
              onClick={() => setArmed(true)}
            >
              {t('flash.autoAudio.sweep')}
            </button>
          )}
          {swept && (
            <span className="muted" aria-live="polite">
              {t('flash.autoAudio.swept', {
                count: swept.removed,
                size: formatBytes(swept.bytes),
              })}
            </span>
          )}
        </div>
      )}
    </fieldset>
  );
}
