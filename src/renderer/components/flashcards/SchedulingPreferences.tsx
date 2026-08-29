/**
 * The one place the local scheduler is chosen, and the only place its two
 * deck-wide operations can be run.
 *
 * A setting nothing can reach is the dead control this repo keeps finding, so
 * this panel exists in the same commit that the setting starts affecting
 * reviews. Three things it is careful about:
 *
 * - Switching the algorithm does NOT rewrite the deck. Cards adapt as they come
 *   up for review; converting the whole deck is a separate, explicit button
 *   that reports how many cards it actually changed. A toggle that silently
 *   rewrote thousands of cards would be unreversible by accident.
 * - Reset asks first and says what it will destroy, because the review history
 *   lives nowhere else and there is no undo on this side.
 * - The forecast is read from stored due dates, never derived from interval
 *   lengths, and unscheduled cards are shown as due rather than quietly
 *   excluded — the panel must agree with the button the user is about to press.
 */
import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  MAX_DESIRED_RETENTION,
  MIN_DESIRED_RETENTION,
  type SchedulingConfig,
} from '../../../shared/flashcardScheduling';
import type { LocalSrsAlgorithm } from '../../../shared/localSrs';
import { localDueForecast } from '../../../shared/reviewForecast';
import {
  convertDeckSchedule,
  loadDeck,
  onDeckChanged,
  resetDeckSchedule,
  type SchedulingSweepReport,
} from '../../flashcardDeck';
import { loadSchedulingConfig, saveSchedulingConfig } from '../../flashcardScheduling';
import { useT } from '../../i18n';
import './autoAudio.css';

const ALGORITHMS: Array<{ key: LocalSrsAlgorithm; label: string; about: string }> = [
  { key: 'sm2', label: 'flash.schedule.sm2', about: 'flash.schedule.sm2About' },
  { key: 'fsrs', label: 'flash.schedule.fsrs', about: 'flash.schedule.fsrsAbout' },
];

const FORECAST_DAYS = 7;

export default function SchedulingPreferencesPanel() {
  const { t } = useT();
  const [config, setConfig] = useState<SchedulingConfig>(loadSchedulingConfig);
  const [cards, setCards] = useState(loadDeck);
  const [report, setReport] = useState<{ kind: 'convert' | 'reset'; data: SchedulingSweepReport } | null>(null);
  /** Reset is destructive with no undo, so it takes two presses. */
  const [confirmingReset, setConfirmingReset] = useState(false);

  const refresh = useCallback(() => { setCards(loadDeck()); }, []);
  useEffect(() => onDeckChanged(refresh), [refresh]);

  const forecast = useMemo(() => localDueForecast(cards, FORECAST_DAYS), [cards]);
  const scheduled = useMemo(
    () => cards.filter((card) => card.srs !== undefined).length,
    [cards],
  );

  function update(next: Partial<SchedulingConfig>): void {
    setConfig(saveSchedulingConfig(next));
    setReport(null);
    setConfirmingReset(false);
  }

  const setRetention = (event: ChangeEvent<HTMLInputElement>): void => {
    update({ desiredRetention: Number(event.currentTarget.value) / 100 });
  };
  const setMaximum = (event: ChangeEvent<HTMLInputElement>): void => {
    update({ maximumIntervalDays: Number(event.currentTarget.value) });
  };

  function convert(): void {
    setReport({ kind: 'convert', data: convertDeckSchedule(config.algorithm) });
    setConfirmingReset(false);
    refresh();
  }

  function reset(): void {
    if (!confirmingReset) {
      setConfirmingReset(true);
      return;
    }
    setReport({ kind: 'reset', data: resetDeckSchedule() });
    setConfirmingReset(false);
    refresh();
  }

  return (
    <fieldset className="auto-reading-options">
      <legend>{t('flash.schedule.title')}</legend>
      <p className="muted">{t('flash.schedule.lead')}</p>

      {ALGORITHMS.map((entry) => (
        <label key={entry.key}>
          <input
            type="radio"
            name="flash-schedule-algorithm"
            checked={config.algorithm === entry.key}
            onChange={() => update({ algorithm: entry.key })}
          />
          {t(entry.label)}
          <span className="muted"> {t(entry.about)}</span>
        </label>
      ))}

      {config.algorithm === 'fsrs' && (
        <label className="auto-reading-options__cap">
          {t('flash.schedule.retention', { percent: Math.round(config.desiredRetention * 100) })}
          <input
            type="range"
            min={Math.round(MIN_DESIRED_RETENTION * 100)}
            max={Math.round(MAX_DESIRED_RETENTION * 100)}
            value={Math.round(config.desiredRetention * 100)}
            onChange={setRetention}
          />
        </label>
      )}

      <label className="auto-reading-options__cap">
        {t('flash.schedule.maximum')}
        <input
          type="number"
          min={1}
          max={36500}
          value={config.maximumIntervalDays}
          onChange={setMaximum}
        />
      </label>

      <p className="muted">{t('flash.schedule.switchNote')}</p>

      <div className="flash-match-actions">
        <button type="button" onClick={convert} disabled={scheduled === 0}>
          {t('flash.schedule.convert', { count: scheduled })}
        </button>
        <button type="button" onClick={reset} disabled={scheduled === 0}>
          {confirmingReset ? t('flash.schedule.resetConfirm') : t('flash.schedule.reset')}
        </button>
      </div>

      {confirmingReset && (
        <p className="auto-reading-options__report" aria-live="polite">
          {t('flash.schedule.resetWarning', { count: scheduled })}
        </p>
      )}

      {report && (
        <p className="auto-reading-options__report" aria-live="polite">
          {report.kind === 'convert'
            ? t('flash.schedule.convertReport', {
                changed: report.data.changed,
                unscheduled: report.data.unscheduled,
              })
            : t('flash.schedule.resetReport', { changed: report.data.changed })}
        </p>
      )}

      <p className="flash-write-progress">{t('flash.schedule.forecastTitle')}</p>
      <p className="muted">
        {t('flash.schedule.forecastDue', { count: forecast.overdue })}
        {forecast.beyond > 0 && ` ${t('flash.schedule.forecastBeyond', { count: forecast.beyond })}`}
      </p>
      <ul className="flash-test-sheet">
        {forecast.days.map((day) => (
          <li key={day.offsetDays} className="flash-test-line">
            <span className="flash-test-line__no">
              {day.offsetDays === 0
                ? t('flash.schedule.today')
                : t('flash.schedule.inDays', { count: day.offsetDays })}
            </span>
            <span className="flash-test-line__outcome">
              {t('flash.schedule.dayDue', { count: day.due })}
            </span>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}
