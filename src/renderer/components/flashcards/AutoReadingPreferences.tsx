/**
 * The one place automatic readings are switched on, for every mining flow.
 *
 * Same shape and the same honesty rule as the narration panel next to it: it
 * reports what the last run actually did, including the cards it could not read,
 * because a card left with an empty reading looks exactly like a card that never
 * needed one.
 */
import { useEffect, useState, type ChangeEvent } from 'react';
import type {
  AutoReadingForm,
  AutoReadingPreferences,
  AutoReadingSource,
} from '../../../shared/flashcardAutoReading';
import {
  loadAutoReadingPreferences,
  onAutoReadingReport,
  saveAutoReadingPreferences,
  type AutoReadingReport,
} from '../../flashcardAutoReading';
import { useT } from '../../i18n';
import './autoAudio.css';

const SOURCES: Array<{ key: AutoReadingSource; label: string }> = [
  { key: 'epub', label: 'flash.autoAudio.epub' },
  { key: 'extension', label: 'flash.autoAudio.extension' },
  { key: 'media', label: 'flash.autoAudio.media' },
  { key: 'import', label: 'flash.autoAudio.import' },
];

const FORMS: Array<{ key: AutoReadingForm; label: string }> = [
  { key: 'furigana', label: 'flash.autoReading.form.furigana' },
  { key: 'kana', label: 'flash.autoReading.form.kana' },
];

export default function AutoReadingPreferencesPanel() {
  const { t } = useT();
  const [preferences, setPreferences] = useState<AutoReadingPreferences>(loadAutoReadingPreferences);
  const [report, setReport] = useState<AutoReadingReport | null>(null);

  useEffect(() => onAutoReadingReport(setReport), []);

  const toggle = (key: AutoReadingSource) => (event: ChangeEvent<HTMLInputElement>): void => {
    setPreferences(saveAutoReadingPreferences({ ...preferences, [key]: event.currentTarget.checked }));
  };
  const setForm = (event: ChangeEvent<HTMLSelectElement>): void => {
    setPreferences(saveAutoReadingPreferences({
      ...preferences,
      form: event.currentTarget.value === 'kana' ? 'kana' : 'furigana',
    }));
  };
  const setCap = (event: ChangeEvent<HTMLInputElement>): void => {
    setPreferences(saveAutoReadingPreferences({
      ...preferences,
      maxPerBatch: Number(event.currentTarget.value),
    }));
  };

  return (
    <fieldset className="auto-reading-options">
      <legend>{t('flash.autoReading.title')}</legend>
      <p className="muted">{t('flash.autoReading.lead')}</p>
      {SOURCES.map((entry) => (
        <label key={entry.key}>
          <input type="checkbox" checked={preferences[entry.key]} onChange={toggle(entry.key)} />
          {t(entry.label)}
        </label>
      ))}
      <label className="auto-reading-options__form">
        {t('flash.autoReading.form')}
        <select value={preferences.form} onChange={setForm}>
          {FORMS.map((form) => (
            <option key={form.key} value={form.key}>
              {t(form.label)}
            </option>
          ))}
        </select>
      </label>
      <label className="auto-reading-options__cap">
        {t('flash.autoReading.cap')}
        <input
          type="number"
          min={1}
          max={2000}
          value={preferences.maxPerBatch}
          onChange={setCap}
        />
      </label>
      {report && (
        <p className="auto-reading-options__report" aria-live="polite">
          {t('flash.autoReading.report', { added: report.added, failed: report.failed })}
          {report.deferred > 0 && ` ${t('flash.autoReading.deferred', { count: report.deferred })}`}
          {report.tokenizerUnavailable && ` ${t('flash.autoReading.tokenizerFailed')}`}
        </p>
      )}
    </fieldset>
  );
}
