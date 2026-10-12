/**
 * "Import .ics": pick a calendar file, see what it would add, then add it.
 *
 * The preview is the point. A calendar file from Google or Outlook can hold hundreds of
 * events and repeats the calendar cannot express exactly, so nothing is written until the
 * user has seen how many are new, how many are already here (same UID — importing the same
 * file twice adds nothing), how many were left out and why, and what was approximated.
 */
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { importCalendarEvents, loadEvents, parseDateKey } from '../../calendar';
import {
  ICS_IMPORT_MAX_BYTES,
  icsImportEvents,
  parseIcsCalendar,
  planIcsImport,
  type IcsImportPlan,
  type IcsWarningCode,
} from '../../calendarIcsImport';

/** Rows of the preview list; the rest is counted, not hidden. */
const PREVIEW_ROWS = 30;

interface Preview {
  fileName: string;
  calendarName?: string;
  plan: IcsImportPlan;
  skipped: number;
  warnings: Partial<Record<IcsWarningCode, number>>;
}

type ImportError = 'tooLarge' | 'empty' | 'read';

const WARNING_CODES: readonly IcsWarningCode[] = ['repeat-unsupported', 'multi-day', 'timezone-unknown', 'reminder-rounded'];

/** Read one file into a preview, or the reason it cannot be imported. */
export async function readIcsImportPreview(file: File, untitled: string): Promise<Preview | ImportError> {
  if (file.size > ICS_IMPORT_MAX_BYTES) return 'tooLarge';
  let text: string;
  try {
    text = await file.text();
  } catch {
    return 'read';
  }
  const parsed = parseIcsCalendar(text, { untitled });
  const skipped = parsed.cancelled + parsed.invalid;
  if (!parsed.events.length && !skipped) return 'empty';
  const plan = planIcsImport(parsed, loadEvents());
  const warnings: Partial<Record<IcsWarningCode, number>> = {};
  for (const entry of plan.fresh) {
    for (const code of entry.warnings) warnings[code] = (warnings[code] ?? 0) + 1;
  }
  return { fileName: file.name, ...(parsed.calendarName ? { calendarName: parsed.calendarName } : {}), plan, skipped, warnings };
}

export function CalendarIcsImportButton() {
  const { t, lang } = useT();
  const input = useRef<HTMLInputElement | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<ImportError | null>(null);

  const close = (): void => {
    setPreview(null);
    setError(null);
  };

  useEffect(() => {
    if (!preview && !error) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, error]);

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const read = await readIcsImportPreview(file, t('calendar.modal.untitled'));
    if (typeof read === 'string') {
      setError(read);
      setPreview(null);
    } else {
      setPreview(read);
      setError(null);
    }
  };

  const commit = (): void => {
    if (!preview) return;
    const added = importCalendarEvents(icsImportEvents(preview.plan.fresh));
    window.dispatchEvent(new CustomEvent('os:toast', {
      detail: { message: t('planner.icsImport.done', { count: added.length }), kind: 'ok' },
    }));
    close();
  };

  const locale = LANG_TAGS[lang];
  const fresh = preview?.plan.fresh ?? [];

  return (
    <>
      <button
        type="button"
        className="btn small cal-import-ics"
        onClick={() => input.current?.click()}
        title={t('planner.icsImport.hint')}
      >
        {t('planner.icsImport.button')}
      </button>
      <input
        ref={input}
        type="file"
        accept=".ics,text/calendar"
        className="cal-import-input"
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          void onFile(file);
        }}
      />
      {(preview || error) && (
        <div className="cal-modal-backdrop" onMouseDown={close}>
          <div
            className="cal-modal cal-import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cal-import-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="cal-modal-head">
              <h3 id="cal-import-title">{t('planner.icsImport.title')}</h3>
            </div>
            {error ? (
              <p className="cal-field-error" role="alert">{t(`planner.icsImport.error.${error}`)}</p>
            ) : preview ? (
              <div className="cal-import-body">
                <p className="muted cal-import-file">
                  {preview.calendarName ? `${preview.calendarName} · ${preview.fileName}` : preview.fileName}
                </p>
                <ul className="cal-import-summary" role="status">
                  <li className="cal-import-fresh">{t('planner.icsImport.fresh', { count: fresh.length })}</li>
                  {preview.plan.duplicates.length > 0 && (
                    <li className="cal-import-duplicates">{t('planner.icsImport.duplicates', { count: preview.plan.duplicates.length })}</li>
                  )}
                  {preview.skipped > 0 && <li>{t('planner.icsImport.skipped', { count: preview.skipped })}</li>}
                  {WARNING_CODES.filter((code) => preview.warnings[code]).map((code) => (
                    <li key={code} className="muted">{t(`planner.icsImport.warning.${code}`, { count: preview.warnings[code] ?? 0 })}</li>
                  ))}
                </ul>
                {fresh.length > 0 && (
                  <ul className="cal-import-list">
                    {fresh.slice(0, PREVIEW_ROWS).map((entry) => (
                      <li key={entry.uid}>
                        <span className="cal-import-date">
                          {parseDateKey(entry.event.date).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })}
                        </span>
                        <span className="cal-import-time muted">
                          {entry.event.allDay ? t('calendar.allDay') : `${entry.event.startTime ?? ''}${entry.event.endTime ? `–${entry.event.endTime}` : ''}`}
                        </span>
                        <span className="cal-import-title">{entry.event.title}</span>
                        {entry.event.recurrence !== 'none' && (
                          <span className="cal-badge cal-import-repeat">{t(`calendar.modal.repeat.${entry.event.recurrence}`)}</span>
                        )}
                      </li>
                    ))}
                    {fresh.length > PREVIEW_ROWS && (
                      <li className="muted">{t('common.moreNotShown', { count: fresh.length - PREVIEW_ROWS })}</li>
                    )}
                  </ul>
                )}
              </div>
            ) : null}
            <div className="cal-modal-actions">
              <div className="cal-modal-spacer" />
              <button type="button" className="btn" onClick={close}>{t('common.cancel')}</button>
              {preview && (
                <button type="button" className="btn primary cal-import-confirm" onClick={commit} disabled={fresh.length === 0}>
                  {t('planner.icsImport.confirm', { count: fresh.length })}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
