/**
 * The one place automatic narration is switched on, for every mining flow.
 *
 * It reports what the last run actually did — added, failed, and how many the
 * per-batch cap deferred — because "automatic" is exactly the setting a user
 * cannot otherwise verify: nothing on screen changes when it silently fails.
 */
import { useEffect, useState, type ChangeEvent } from 'react';
import { flashcardAudioErrorKey } from '../../../shared/flashcardAudioMessages';
import type { AutoAudioPreferences, AutoAudioSource } from '../../../shared/flashcardAutoAudio';
import {
  loadAutoAudioPreferences,
  onAutoAudioReport,
  saveAutoAudioPreferences,
  type AutoAudioReport,
} from '../../flashcardAutoAudio';
import { useT } from '../../i18n';
import './autoAudio.css';

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
  useEffect(() => onAutoAudioReport(setReport), []);

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
    </fieldset>
  );
}
