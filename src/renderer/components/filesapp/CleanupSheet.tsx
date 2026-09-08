/**
 * Gates 32-35 — the cleanup surface.
 *
 * Built around one rule the plan states four different ways: **nothing is
 * removed until a report has been read and confirmed.** Opening this sheet
 * plans; it does not act. The confirm sends back exactly the ids that are
 * ticked, and main re-derives the plan before touching anything, so the report
 * on screen and what is removed agree item for item (gate 32).
 *
 * **Protected rows are shown, not hidden.** Gate 33's evidence is a user being
 * able to see that their downloaded video was found by the orphan class and
 * deliberately spared — a report that silently omitted it would look identical
 * to one that had never considered it, and there would be no way to tell a
 * working guard from an absent class.
 *
 * **Relocate types a path rather than browsing to one**, the same decision the
 * scan sheet's root field records: a native directory dialog is undriveable
 * from this side, which would make gate 34's own evidence depend on a human
 * clicking. A Browse button can be added beside the field later.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { formatSize } from './format';
import {
  FILES_BROKEN_LINK_POLICIES,
  FILES_CLEANUP_CLASS_IDS,
  type FilesBrokenLinkPolicy,
  type FilesCleanupClassId,
  type FilesCleanupReport,
  type FilesCleanupRunResult,
  type FilesCleanupSettings,
} from '../../../shared/filesApp/cleanup';
import {
  commitBrokenLinkPolicy,
  commitCleanupClassEnabled,
  loadCleanupSettings,
  onCleanupSettingsChanged,
} from '../../filesCleanupSettingsStore';
import { announceFilesIndexChanged } from '../../filesIndexBus';

export interface CleanupSheetProps {
  onClose: () => void;
  /** Anything removed has to reach the caller's own list, not just the bus. */
  onChanged: () => void;
}

const CLASS_LABEL_KEY: Record<FilesCleanupClassId, string> = {
  'broken-links': 'filesApp.cleanup.class.brokenLinks',
  'partial-downloads': 'filesApp.cleanup.class.partialDownloads',
  'empty-files': 'filesApp.cleanup.class.emptyFiles',
  'orphan-files': 'filesApp.cleanup.class.orphanFiles',
};

const POLICY_LABEL_KEY: Record<FilesBrokenLinkPolicy, string> = {
  mark: 'filesApp.cleanup.policy.mark',
  prompt: 'filesApp.cleanup.policy.prompt',
  relocate: 'filesApp.cleanup.policy.relocate',
};

export function CleanupSheet({ onClose, onChanged }: CleanupSheetProps) {
  const { t, lang } = useT();
  const [settings, setSettings] = useState<FilesCleanupSettings>(() => loadCleanupSettings());
  const [report, setReport] = useState<FilesCleanupReport | null>(null);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [result, setResult] = useState<FilesCleanupRunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [relocateFor, setRelocateFor] = useState<string | null>(null);
  const [relocatePath, setRelocatePath] = useState('');
  const sheetRef = useRef<HTMLElement | null>(null);

  useEffect(() => onCleanupSettingsChanged(() => setSettings(loadCleanupSettings())), []);

  /**
   * The dry run. Re-runs whenever the settings change, because a class the user
   * just switched on is a question about what it would find — answering it
   * later, behind another button, is how a report goes stale on screen.
   */
  const plan = useCallback(async (): Promise<void> => {
    setBusy(true);
    setErrorKey(null);
    try {
      const next = await window.api.filesCleanupPlan(loadCleanupSettings());
      setReport(next);
      // Ticking every candidate by default would make the confirm a formality.
      // Nothing is ticked until the user ticks it.
      setTicked(new Set());
      setResult(null);
    } catch {
      setErrorKey('filesApp.cleanup.error.planFailed');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void plan();
  }, [plan, settings]);

  const run = useCallback(async (): Promise<void> => {
    if (!report || ticked.size === 0) return;
    setBusy(true);
    setErrorKey(null);
    try {
      const outcome = await window.api.filesCleanupRun({
        confirmedItemIds: [...ticked],
        reportBuiltAt: report.builtAt,
        settings: loadCleanupSettings(),
      });
      setResult(outcome);
      announceFilesIndexChanged();
      onChanged();
      await plan();
    } catch {
      setErrorKey('filesApp.cleanup.error.runFailed');
    } finally {
      setBusy(false);
    }
  }, [onChanged, plan, report, ticked]);

  const relocate = useCallback(async (): Promise<void> => {
    if (!relocateFor || !relocatePath.trim()) return;
    setBusy(true);
    setErrorKey(null);
    try {
      const outcome = await window.api.filesCleanupRelocate({
        itemId: relocateFor,
        path: relocatePath.trim(),
      });
      if (outcome.ok) {
        setRelocateFor(null);
        setRelocatePath('');
        announceFilesIndexChanged();
        onChanged();
        await plan();
      } else {
        setErrorKey(outcome.reasonKey);
      }
    } catch {
      setErrorKey('filesApp.cleanup.error.relocateFailed');
    } finally {
      setBusy(false);
    }
  }, [onChanged, plan, relocateFor, relocatePath]);

  const totals = useMemo(() => {
    if (!report) return { count: 0, bytes: 0, unknown: 0 };
    return {
      count: report.candidates.length,
      bytes: report.classes.reduce((sum, row) => sum + row.reclaimableBytes, 0),
      unknown: report.classes.reduce((sum, row) => sum + row.unknownSizeCount, 0),
    };
    // `lang` is deliberately absent: this memo produces numbers, not text.
  }, [report]);

  const tickedBytes = useMemo(() => {
    if (!report) return 0;
    return report.candidates
      .filter((candidate) => ticked.has(candidate.itemId))
      .reduce((sum, candidate) => sum + (candidate.sizeBytes ?? 0), 0);
  }, [report, ticked]);

  const toggle = (itemId: string): void => {
    setTicked((previous) => {
      const next = new Set(previous);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  /*
   * D346. Clicking "Clean up" appended this panel to the window body and left
   * it entirely below the fold: measured live, the panel's top landed at
   * exactly the window's bottom edge (580 px into an 820x580 window), the body
   * scroller went to 12,995 px against a 545 px viewport, `scrollTop` stayed 0
   * and **0 pixels of it were visible**. The user pressed the button and saw
   * nothing happen. So opening it brings it into view and puts the keyboard on
   * it, which is also what makes it reachable without a mouse.
   *
   * `role="region"` and NOT `dialog`/`aria-modal`: this is a `position: static`
   * section inside the window body, the list above it stays live and 113
   * controls behind it stay legitimately tabbable. Declaring it modal would
   * tell a screen reader the rest of the window is hidden when it is not —
   * that is the failure register row D9 is about, and claiming modality here
   * would be committing it rather than fixing it. The scan sheet next door IS
   * a real overlay and correctly uses `useModalKeyboard`.
   */
  useEffect(() => {
    const panel = sheetRef.current;
    if (!panel) return;
    panel.scrollIntoView({ block: 'start' });
    panel.focus({ preventScroll: true });
  }, []);

  return (
    <section
      ref={sheetRef}
      tabIndex={-1}
      className="fa-sheet fa-cleanup"
      role="region"
      aria-label={t('filesApp.cleanup.title')}
    >
      <div className="fa-sheet-head">
        <h2>{t('filesApp.cleanup.title')}</h2>
        <button type="button" className="fa-btn" onClick={onClose}>
          {t('filesApp.cleanup.close')}
        </button>
      </div>

      <p className="fa-sheet-note">{t('filesApp.cleanup.intro')}</p>

      <section className="fa-cleanup-settings">
        <fieldset>
          <legend>{t('filesApp.cleanup.classes.legend')}</legend>
          {FILES_CLEANUP_CLASS_IDS.map((classId) => (
            <label key={classId} className="fa-check">
              <input
                type="checkbox"
                checked={settings.enabledClasses.includes(classId)}
                onChange={(event) => {
                  const commit = commitCleanupClassEnabled(classId, event.target.checked);
                  setSettings(commit.doc);
                  setErrorKey(commit.errorKey ?? commit.storageErrorKey ?? null);
                }}
              />
              <span>{t(CLASS_LABEL_KEY[classId])}</span>
            </label>
          ))}
        </fieldset>

        <label className="fa-field">
          <span>{t('filesApp.cleanup.policy.legend')}</span>
          <select
            value={settings.brokenLinkPolicy}
            onChange={(event) => {
              const commit = commitBrokenLinkPolicy(event.target.value as FilesBrokenLinkPolicy);
              setSettings(commit.doc);
              setErrorKey(commit.errorKey ?? commit.storageErrorKey ?? null);
            }}
          >
            {FILES_BROKEN_LINK_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {t(POLICY_LABEL_KEY[policy])}
              </option>
            ))}
          </select>
        </label>
      </section>

      {errorKey ? (
        <p className="fa-error" role="alert">
          {t(errorKey)}
        </p>
      ) : null}

      {report ? (
        <>
          <section className="fa-cleanup-summary" aria-label={t('filesApp.cleanup.summary.label')}>
            <ul>
              {report.classes.map((row) => (
                <li key={row.classId} data-class={row.classId}>
                  <strong>{t(CLASS_LABEL_KEY[row.classId])}</strong>{' '}
                  <span data-count={row.count}>
                    {t('filesApp.cleanup.summary.count', { count: row.count })}
                  </span>{' '}
                  <span data-bytes={row.reclaimableBytes}>
                    {formatSize(row.reclaimableBytes, t, lang)}
                  </span>
                  {row.unknownSizeCount > 0 ? (
                    <span> {t('filesApp.cleanup.summary.unknown', { count: row.unknownSizeCount })}</span>
                  ) : null}
                  {row.protectedCount > 0 ? (
                    <span> {t('filesApp.cleanup.summary.protected', { count: row.protectedCount })}</span>
                  ) : null}
                </li>
              ))}
            </ul>
            <p data-total-count={totals.count} data-total-bytes={totals.bytes}>
              {t('filesApp.cleanup.summary.total', {
                count: totals.count,
                size: formatSize(totals.bytes, t, lang),
              })}
            </p>
          </section>

          <section className="fa-cleanup-candidates">
            <h3>{t('filesApp.cleanup.candidates.title')}</h3>
            {report.candidates.length === 0 ? (
              <p className="fa-empty">{t('filesApp.cleanup.candidates.empty')}</p>
            ) : (
              <ul>
                {report.candidates.map((candidate) => (
                  <li key={candidate.itemId}>
                    <label className="fa-check">
                      <input
                        type="checkbox"
                        checked={ticked.has(candidate.itemId)}
                        onChange={() => toggle(candidate.itemId)}
                      />
                      <span className="fa-cleanup-name">{candidate.name}</span>
                    </label>
                    <span className="fa-cleanup-meta">
                      {t(CLASS_LABEL_KEY[candidate.classId])} · {formatSize(candidate.sizeBytes, t, lang)} ·{' '}
                      {t(
                        candidate.mode === 'trash'
                          ? 'filesApp.cleanup.destination.recycleBin'
                          : 'filesApp.cleanup.destination.indexUndo',
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="fa-cleanup-protected">
            <h3>{t('filesApp.cleanup.protected.title')}</h3>
            <p className="fa-sheet-note">{t('filesApp.cleanup.protected.note')}</p>
            {report.protectedItems.length === 0 ? (
              <p className="fa-empty">{t('filesApp.cleanup.protected.empty')}</p>
            ) : (
              <ul>
                {report.protectedItems.map((row) => (
                  <li key={row.itemId} data-reason={row.reasonKey}>
                    <span className="fa-cleanup-name">{row.name}</span>
                    <span className="fa-cleanup-meta">{t(row.reasonKey)}</span>
                    {row.relocatable ? (
                      <button
                        type="button"
                        className="fa-btn"
                        onClick={() => {
                          setRelocateFor(row.itemId);
                          setRelocatePath('');
                        }}
                      >
                        {t('filesApp.cleanup.relocate.action')}
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {relocateFor ? (
            <section className="fa-cleanup-relocate">
              <label className="fa-field">
                <span>{t('filesApp.cleanup.relocate.label')}</span>
                <input
                  type="text"
                  value={relocatePath}
                  spellCheck={false}
                  onChange={(event) => setRelocatePath(event.target.value)}
                  placeholder={t('filesApp.cleanup.relocate.placeholder')}
                />
              </label>
              <button type="button" className="fa-btn" disabled={busy} onClick={() => void relocate()}>
                {t('filesApp.cleanup.relocate.confirm')}
              </button>
              <button type="button" className="fa-btn" onClick={() => setRelocateFor(null)}>
                {t('filesApp.cleanup.relocate.cancel')}
              </button>
            </section>
          ) : null}

          <div className="fa-sheet-actions">
            <button type="button" className="fa-btn" disabled={busy} onClick={() => void plan()}>
              {t('filesApp.cleanup.replan')}
            </button>
            <button
              type="button"
              className="fa-btn fa-btn-danger"
              disabled={busy || ticked.size === 0}
              onClick={() => void run()}
            >
              {t('filesApp.cleanup.confirm', {
                count: ticked.size,
                size: formatSize(tickedBytes, t, lang),
              })}
            </button>
          </div>
        </>
      ) : (
        <p className="fa-empty">{t('filesApp.cleanup.planning')}</p>
      )}

      {result ? (
        <section className="fa-cleanup-log" aria-label={t('filesApp.cleanup.log.title')}>
          <h3>{t('filesApp.cleanup.log.title')}</h3>
          <ul>
            {result.log.map((entry) => (
              <li key={`${entry.itemId}-${entry.at}`} data-destination={entry.destination}>
                <span className="fa-cleanup-name">{entry.name}</span>
                <span className="fa-cleanup-meta">
                  {t(
                    entry.destination === 'recycle-bin'
                      ? 'filesApp.cleanup.log.recycleBin'
                      : entry.destination === 'index-undo'
                        ? 'filesApp.cleanup.log.indexUndo'
                        : 'filesApp.cleanup.log.failed',
                  )}
                  {entry.path ? ` · ${entry.path}` : ''}
                </span>
                {entry.undoToken ? (
                  <button
                    type="button"
                    className="fa-btn"
                    onClick={() => {
                      void window.api
                        .filesCleanupUndo(entry.undoToken as string)
                        .then(() => {
                          announceFilesIndexChanged();
                          onChanged();
                          return plan();
                        });
                    }}
                  >
                    {t('filesApp.cleanup.log.undo')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          {result.log.length === 0 ? <p className="fa-empty">{t('filesApp.cleanup.log.empty')}</p> : null}
          <p>
            {t('filesApp.cleanup.log.reclaimed', { size: formatSize(result.removedBytes, t, lang) })}
          </p>
        </section>
      ) : null}
    </section>
  );
}

export default CleanupSheet;
