/**
 * Gate 27's surface — "Ambiguity goes to review, not into the library."
 *
 * Point it at a folder, and it shows what gate 23's scan found, split three
 * ways by `shared/filesApp/ingest.ts`: what the router is certain about and
 * will bring in unattended, what it only guessed at and is therefore waiting
 * on you, and what has no home at all. Confirming imports through
 * `renderer/fileImportExecute.ts` — the same dispatch table a desktop drop
 * uses, so nothing can land here by a path a drop never takes.
 *
 * **The root is typed, not browsed.** A "Browse…" button opens a native OS
 * directory dialog, which nothing on this side can drive, so gate 27's own
 * evidence would then depend on a human clicking. A path field works today,
 * costs nothing, and a Browse button can be added beside it later without
 * moving any of this. The last root is remembered so it is typed once.
 *
 * **Nothing imports until Import is pressed.** Even the `auto` pile. "May
 * auto-import" is the router's permission, not a licence for a scan to write
 * to the library while the user is still reading the report — the scan itself
 * stays read-only (gate 24), and the one write is the confirm.
 *
 * **The settings are here rather than in Settings** (gates 31 and 36). They
 * decide what this sheet's next scan does, and both gates are demonstrated by
 * changing one and watching the piles move — a control two screens away from
 * its own effect would be adjustable in name only. They persist per profile,
 * so the panel is a view onto the document, never a copy of it.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useModalKeyboard } from '../ui/useModalKeyboard';
import { useT } from '../../i18n';
import {
  INGEST_CONFIDENCE_POLICIES,
  INGEST_OVERRIDABLE_TARGETS,
  planIngest,
  type IngestCategoryPolicy,
  type IngestConfidencePolicy,
  type IngestItem,
  type IngestPlan,
  type IngestSettings,
} from '../../../shared/filesApp/ingest';
import {
  commitIngestCategoryPolicy,
  commitIngestConfidence,
  commitIngestStabilityMs,
  commitIngestWatchRootAdded,
  commitIngestWatchRootRemoved,
  loadIngestSettings,
  onIngestSettingsChanged,
} from '../../filesIngestSettingsStore';
import { MAX_STABILITY_MS } from '../../../shared/filesApp/stability';
import type { FilesScanReportWithArchives } from '../../../shared/filesApp/archive';
import type { DropCandidate, DropTargetId } from '../../../shared/fileRouting';
import { executeImport, undoImports, type ImportReceipt } from '../../fileImportExecute';
import { announceFilesIndexChanged } from '../../filesIndexBus';
import {
  forgetImportedFiles,
  loadImportLedger,
  recordImportedFiles,
} from '../../filesImportLedgerStore';
import type { ImportLedger } from '../../../shared/filesApp/importLedger';

const LAST_ROOT_KEY = 'jp-filesapp-scan-root-v1';

/** Skipping is a real answer for a reviewed row, so it needs a value. */
const SKIP = 'skip' as const;

interface ImportOutcome {
  path: string;
  name: string;
  sizeBytes: number;
  target: DropTargetId;
  ok: boolean;
  /** Present on a refusal. Never a bare false. */
  reasonKey?: string;
}

type SheetState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'error'; reasonKey: string }
  | {
      status: 'report';
      report: FilesScanReportWithArchives;
      candidates: Map<string, DropCandidate[]>;
    }
  | { status: 'importing'; done: number; total: number }
  | { status: 'imported'; outcomes: ImportOutcome[]; receipts: ImportReceipt[] }
  | { status: 'undone'; count: number };

export interface ScanReviewSheetProps {
  onClose: () => void;
  /**
   * An override, for a caller that has its own settings. Absent — which is the
   * production case — means the persisted document, read live.
   */
  settings?: IngestSettings;
  /** Fired after anything actually lands, so a caller can re-read its own state. */
  onImported?: () => void;
}

function readLastRoot(): string {
  try {
    return localStorage.getItem(LAST_ROOT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function ScanReviewSheet({ onClose, settings, onImported }: ScanReviewSheetProps) {
  const { t } = useT();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [root, setRoot] = useState<string>(readLastRoot);
  const [state, setState] = useState<SheetState>({ status: 'idle' });
  /** Per-review-row decision: a destination, or SKIP. */
  const [picks, setPicks] = useState<Record<string, DropTargetId | typeof SKIP>>({});
  /*
   * Gate 29. Read once per scan rather than per render: the plan is a `useMemo`
   * and a ledger object whose identity changed every render would rebuild it
   * every time, which on a 5,000-row report is a scan's worth of work per
   * keystroke in the root field.
   */
  const [ledger, setLedger] = useState<ImportLedger>(loadImportLedger);
  /*
   * Gates 31 and 36. The document is the source of truth and this is a view of
   * it: every control commits and then re-reads, so a refused write leaves the
   * control showing what is actually stored rather than what was clicked.
   */
  const [stored, setStored] = useState<IngestSettings>(loadIngestSettings);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  /** What the number field currently holds, which may not yet be a legal value. */
  const [stabilityDraft, setStabilityDraft] = useState<string>(() =>
    String(loadIngestSettings().stabilityMs),
  );

  // A second Files window editing the same document must not leave this one
  // scanning with a window it no longer has.
  useEffect(() => onIngestSettingsChanged(() => setStored(loadIngestSettings())), []);

  const effectiveSettings = settings ?? stored;

  const plan: IngestPlan | null = useMemo(() => {
    if (state.status !== 'report') return null;
    return planIngest(state.report, effectiveSettings, state.candidates, ledger);
  }, [state, effectiveSettings, ledger]);

  /*
   * `explicitRoot` exists because of a trap this repo has been bitten by more
   * than once: `setRoot(folder)` followed by `onScan()` reads the PREVIOUS
   * `root`, since a state update is not visible until the next render. The
   * paste path therefore hands the folder straight in rather than routing it
   * through state and hoping.
   */
  const onScan = useCallback(async (explicitRoot?: string) => {
    const target = (explicitRoot ?? root).trim();
    if (!target) {
      setState({ status: 'error', reasonKey: 'filesApp.review.error.noRoot' });
      return;
    }
    setState({ status: 'scanning' });
    try {
      localStorage.setItem(LAST_ROOT_KEY, target);
    } catch {
      /* a remembered path is a convenience, never a requirement */
    }
    try {
      /*
       * Gate 31's product half: the window the user set travels with the call.
       * Main re-normalises it — the renderer is not trusted to turn the
       * completeness check off — but nothing in main knows this preference
       * otherwise, so omitting it here would leave the control decorative.
       */
      const report = await window.api.filesScan([target], {
        stabilityMs: effectiveSettings.stabilityMs,
      });
      if (!report || !report.roots.length) {
        // An unreadable root produces a report with no roots. Saying "0 files"
        // for a folder that does not exist would be a false negative.
        setState({ status: 'error', reasonKey: 'filesApp.review.error.unreadableRoot' });
        return;
      }
      /*
       * The report carries a candidate COUNT, not the list — a 5,000-file
       * report has to stay small. The review rows need the actual candidates to
       * offer a choice, so they are re-fetched through the same classifier the
       * scan used. Capped at the classify handler's own 200-path limit.
       */
      const fresh = loadImportLedger();
      setLedger(fresh);
      const provisional = planIngest(report, effectiveSettings, undefined, fresh);
      const reviewPaths = provisional.review.map((i) => i.entry.path).slice(0, 200);
      const plans = reviewPaths.length ? await window.api.fileDropClassify(reviewPaths) : [];
      const candidates = new Map<string, DropCandidate[]>(
        plans.map((p) => [p.path, p.candidates]),
      );
      setPicks(
        Object.fromEntries(
          provisional.review.map((item) => [item.entry.path, item.entry.target]),
        ),
      );
      setState({ status: 'report', report, candidates });
    } catch {
      setState({ status: 'error', reasonKey: 'filesApp.review.error.scanFailed' });
    }
  }, [root, effectiveSettings]);

  /**
   * Gate 28 — "paste a folder".
   *
   * The clipboard is read in MAIN: a folder copied in Explorer arrives as
   * Windows' `FileNameW` format, which the DOM's own paste event cannot see at
   * all, so a renderer-only handler would find an empty `clipboardData` and the
   * feature would look broken rather than absent.
   *
   * One folder is scanned immediately, because that is the whole gesture. More
   * than one fills the field with the first and says so rather than silently
   * picking — the scan takes one root at a time and choosing for the user would
   * be the kind of quiet decision the report exists to avoid.
   */
  const onPasteFolder = useCallback(async () => {
    let folders: string[] = [];
    try {
      folders = (await window.api.filesClipboardFolders?.()) ?? [];
    } catch {
      folders = [];
    }
    if (!folders.length) {
      setState({ status: 'error', reasonKey: 'filesApp.review.error.clipboardNoFolder' });
      return;
    }
    const first = folders[0];
    setRoot(first);
    if (folders.length > 1) {
      // Stated, not scanned. The user pasted several and gets to say which.
      setState({ status: 'error', reasonKey: 'filesApp.review.error.clipboardManyFolders' });
      return;
    }
    await onScan(first);
  }, [onScan]);

  const onConfirm = useCallback(async () => {
    if (!plan || state.status !== 'report') return;
    // Auto rows import as classified; review rows import as picked, unless the
    // pick is SKIP — which is the honest outcome for "I do not know either".
    const jobs: { item: IngestItem; target: DropTargetId }[] = [
      ...plan.auto.map((item) => ({ item, target: item.entry.target })),
      ...plan.review.flatMap((item) => {
        const pick = picks[item.entry.path] ?? SKIP;
        return pick === SKIP ? [] : [{ item, target: pick }];
      }),
    ];
    if (!jobs.length) {
      setState({ status: 'imported', outcomes: [], receipts: [] });
      return;
    }

    const outcomes: ImportOutcome[] = [];
    const receipts: ImportReceipt[] = [];
    setState({ status: 'importing', done: 0, total: jobs.length });
    for (const job of jobs) {
      const subject = {
        path: job.item.entry.path,
        name: job.item.entry.name,
        isDirectory: false,
      };
      let refusal: string | undefined;
      try {
        const receipt = await executeImport(subject, job.target, {
          onRefused: (reasonKey) => {
            refusal = reasonKey;
          },
        });
        if (receipt) {
          receipts.push(receipt);
          outcomes.push({
            path: subject.path,
            name: subject.name,
            sizeBytes: job.item.entry.sizeBytes,
            target: job.target,
            ok: true,
          });
        } else {
          outcomes.push({
            path: subject.path,
            name: subject.name,
            sizeBytes: job.item.entry.sizeBytes,
            target: job.target,
            ok: false,
            reasonKey: refusal ?? 'fileDrop.toast.noDestination',
          });
        }
      } catch {
        // Gate 20's rule, applied here too: one failure does not abort the rest.
        outcomes.push({
          path: subject.path,
          name: subject.name,
          sizeBytes: job.item.entry.sizeBytes,
          target: job.target,
          ok: false,
          reasonKey: 'fileDrop.toast.failed',
        });
      }
      setState({ status: 'importing', done: outcomes.length, total: jobs.length });
    }

    if (receipts.length) {
      /*
       * Gate 29: only what actually landed is recorded. A refused row must stay
       * offerable — recording it would make the second scan claim the app
       * already holds a file no importer ever accepted.
       */
      setLedger(
        recordImportedFiles(
          outcomes
            .filter((o) => o.ok)
            .map((o) => ({ path: o.path, sizeBytes: o.sizeBytes, target: o.target })),
        ),
      );
      // After the imports resolve, never optimistically.
      announceFilesIndexChanged();
      onImported?.();
    }
    setState({ status: 'imported', outcomes, receipts });
  }, [plan, state, picks, onImported]);

  const onUndo = useCallback(async () => {
    if (state.status !== 'imported' || !state.receipts.length) return;
    const count = state.receipts.length;
    await undoImports(state.receipts);
    // An undo has to forget, or the next scan reports a reversed import as held.
    setLedger(forgetImportedFiles(state.outcomes.filter((o) => o.ok).map((o) => o.path)));
    announceFilesIndexChanged();
    onImported?.();
    setState({ status: 'undone', count });
  }, [state, onImported]);

  /**
   * One place where a commit becomes visible state, so no control can report
   * success on a write that was refused or that did not land.
   */
  const applyCommit = useCallback(
    (commit: { doc: IngestSettings; errorKey?: string; storageErrorKey?: string }) => {
      setStored(commit.doc);
      setStabilityDraft(String(commit.doc.stabilityMs));
      setSettingsError(commit.errorKey ?? commit.storageErrorKey ?? null);
    },
    [],
  );

  const onConfidenceChange = useCallback(
    (policy: IngestConfidencePolicy) => applyCommit(commitIngestConfidence(policy)),
    [applyCommit],
  );

  const onCategoryChange = useCallback(
    (target: DropTargetId, policy: IngestCategoryPolicy) =>
      applyCommit(commitIngestCategoryPolicy(target, policy)),
    [applyCommit],
  );

  /**
   * Committed on blur and on Enter rather than per keystroke: "3000" is typed
   * through "3", "30" and "300", and committing those would store three
   * windows nobody asked for and refuse the empty field mid-edit.
   */
  const onStabilityCommit = useCallback(() => {
    const raw = stabilityDraft.trim();
    if (raw === '') {
      // An empty field is not a zero window. Put the stored value back rather
      // than silently storing the most permissive setting there is.
      setStabilityDraft(String(stored.stabilityMs));
      setSettingsError(null);
      return;
    }
    applyCommit(commitIngestStabilityMs(Number(raw)));
  }, [applyCommit, stabilityDraft, stored.stabilityMs]);

  const renderSettings = () => (
    <details className="fa-review-settings">
      <summary>{t('filesApp.settings.title')}</summary>
      <div className="fa-review-settings-body">
        <label className="fa-review-setting">
          <span>{t('filesApp.settings.confidenceLabel')}</span>
          <select
            className="fa-review-confidence"
            value={effectiveSettings.confidence}
            onChange={(e) => onConfidenceChange(e.target.value as IngestConfidencePolicy)}
          >
            {INGEST_CONFIDENCE_POLICIES.map((policy) => (
              <option key={policy} value={policy}>
                {t(`filesApp.settings.confidence.${policy}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="fa-review-setting">
          <span>{t('filesApp.settings.stabilityLabel')}</span>
          <input
            className="fa-review-stability"
            type="number"
            min={0}
            max={MAX_STABILITY_MS}
            step={500}
            value={stabilityDraft}
            onChange={(e) => setStabilityDraft(e.target.value)}
            onBlur={onStabilityCommit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onStabilityCommit();
            }}
          />
        </label>
        <p className="fa-review-note">{t('filesApp.settings.stabilityHint')}</p>

        <fieldset className="fa-review-categories">
          <legend>{t('filesApp.settings.categoriesTitle')}</legend>
          {INGEST_OVERRIDABLE_TARGETS.map((target) => (
            <label className="fa-review-category" key={target}>
              <span>{t(`fileDrop.target.${target}`)}</span>
              <select
                data-target={target}
                value={effectiveSettings.byTarget[target] ?? 'inherit'}
                onChange={(e) =>
                  onCategoryChange(target, e.target.value as IngestCategoryPolicy)
                }
              >
                {(['inherit', 'auto', 'review'] as const).map((policy) => (
                  <option key={policy} value={policy}>
                    {t(`filesApp.settings.policy.${policy}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </fieldset>

        <fieldset className="fa-review-watched">
          <legend>{t('filesApp.watch.title')}</legend>
          {effectiveSettings.watchRoots.length === 0 ? (
            <p className="fa-review-note">{t('filesApp.watch.none')}</p>
          ) : (
            <ul className="fa-watch-list">
              {effectiveSettings.watchRoots.map((watched) => (
                <li className="fa-watch-row" key={watched}>
                  <span className="fa-watch-path" title={watched}>
                    {watched}
                  </span>
                  <button
                    type="button"
                    className="fa-action fa-watch-remove"
                    data-root={watched}
                    onClick={() => applyCommit(commitIngestWatchRootRemoved(watched))}
                  >
                    {t('filesApp.watch.remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {/* The folder being scanned is the one a user wants watched, so the
              button takes the path already typed above rather than asking for
              it twice. */}
          <button
            type="button"
            className="fa-action fa-watch-add"
            onClick={() => applyCommit(commitIngestWatchRootAdded(root))}
          >
            {t('filesApp.watch.addRoot')}
          </button>
        </fieldset>

        {settingsError ? (
          <p className="fa-review-error" role="status">
            {t(settingsError)}
          </p>
        ) : null}
      </div>
    </details>
  );

  const renderReviewRow = (item: IngestItem) => {
    const pick = picks[item.entry.path] ?? item.entry.target;
    const choices: DropCandidate[] = item.choices ?? [];
    return (
      <li className="fa-review-row" key={item.entry.path}>
        <span className="fa-review-name" title={item.entry.path}>
          {item.entry.name}
        </span>
        <span className="fa-review-reason">{t(item.decision.reasonKey)}</span>
        <label className="fa-review-pick">
          <span className="fa-visually-hidden">
            {t('filesApp.review.destinationFor', { name: item.entry.name })}
          </span>
          <select
            value={pick}
            onChange={(e) =>
              setPicks((prev) => ({
                ...prev,
                [item.entry.path]: e.target.value as DropTargetId | typeof SKIP,
              }))
            }
          >
            {(choices.length
              ? choices.map((c) => c.target)
              : [item.entry.target]
            ).map((target) => (
              <option key={target} value={target}>
                {t(`fileDrop.target.${target}`)}
              </option>
            ))}
            <option value={SKIP}>{t('filesApp.review.skip')}</option>
          </select>
        </label>
      </li>
    );
  };

  const willImport =
    plan
      ? plan.autoCount +
        plan.review.filter((i) => (picks[i.entry.path] ?? SKIP) !== SKIP).length
      : 0;

  /*
   * Register row D9. Escape is refused while `importing`, and only then: that
   * status is the window in which files are actually being moved on disk, and
   * a reflex Escape must not take the only progress readout off screen. Every
   * other status — including `scanning`, which writes nothing — dismisses, the
   * same as the Close button beneath.
   */
  useModalKeyboard({
    panelRef: sheetRef,
    onEscape: state.status === 'importing' ? null : onClose,
  });

  return (
    <div className="fa-review-scrim" role="presentation">
      <div
        ref={sheetRef}
        tabIndex={-1}
        className="fa-review-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('filesApp.review.title')}
        /*
         * Ctrl+V anywhere in the sheet EXCEPT the root field. Inside the field
         * a paste is ordinary text editing and is left alone — intercepting it
         * would make the field impossible to correct by pasting a fragment.
         * Everywhere else there is nothing to paste INTO, so the gesture can
         * only mean the folder, and it is routed to main because the event's
         * own `clipboardData` is empty for a folder copied in Explorer.
         */
        onPaste={(e) => {
          if ((e.target as HTMLElement | null)?.id === 'fa-review-root-input') return;
          if (state.status === 'scanning' || state.status === 'importing') return;
          e.preventDefault();
          void onPasteFolder();
        }}
      >
        <h2 className="fa-review-title">{t('filesApp.review.title')}</h2>
        <p className="fa-review-sub">{t('filesApp.review.subtitle')}</p>

        <div className="fa-review-root">
          <label className="fa-review-root-label" htmlFor="fa-review-root-input">
            {t('filesApp.review.rootLabel')}
          </label>
          <input
            id="fa-review-root-input"
            className="fa-review-root-input"
            type="text"
            value={root}
            spellCheck={false}
            placeholder={t('filesApp.review.rootPlaceholder')}
            onChange={(e) => setRoot(e.target.value)}
          />
          {/*
            * Gate 28's first three words. Ctrl+V anywhere in the sheet does the
            * same thing; this button exists because a paste target with no
            * visible affordance is a feature nobody finds.
            */}
          <button
            type="button"
            className="fa-action fa-review-paste"
            disabled={state.status === 'scanning' || state.status === 'importing'}
            onClick={() => void onPasteFolder()}
            title={t('filesApp.review.pasteHint')}
          >
            {t('filesApp.review.paste')}
          </button>
          <button
            type="button"
            className="fa-action fa-review-scan"
            disabled={state.status === 'scanning' || state.status === 'importing'}
            onClick={() => void onScan()}
          >
            {state.status === 'scanning'
              ? t('filesApp.review.scanning')
              : t('filesApp.review.scan')}
          </button>
        </div>

        {renderSettings()}

        {state.status === 'error' ? (
          <p className="fa-review-error" role="status">
            {t(state.reasonKey)}
          </p>
        ) : null}

        {state.status === 'importing' ? (
          <p className="fa-review-progress" role="status">
            {t('filesApp.review.importing', { done: state.done, total: state.total })}
          </p>
        ) : null}

        {state.status === 'report' && plan ? (
          <div className="fa-review-body">
            <p className="fa-review-summary" role="status">
              {t('filesApp.scan.summary', {
                found: state.report.found,
                placed: state.report.placed,
                ambiguous: state.report.ambiguous,
                unplaced: state.report.unplaced,
                skipped: state.report.skipped,
              })}
            </p>
            {state.report.truncated ? (
              <p className="fa-review-note">{t('filesApp.scan.truncated')}</p>
            ) : null}

            <ul className="fa-review-destinations">
              {state.report.byDestination.map((row) => (
                <li key={row.target} className="fa-review-destination">
                  <span>{t(row.labelKey)}</span>
                  <span className="fa-review-destination-count">
                    {t('filesApp.review.destinationCount', {
                      total: row.total,
                      placed: row.placed,
                      ambiguous: row.ambiguous,
                    })}
                  </span>
                </li>
              ))}
            </ul>

            <section className="fa-review-group fa-review-auto">
              <h3>{t('filesApp.review.autoHeading', { count: plan.autoCount })}</h3>
              {plan.warnedCount > 0 ? (
                <p className="fa-review-warn">
                  {t('filesApp.review.warned', { count: plan.warnedCount })}
                </p>
              ) : null}
              <ul>
                {plan.auto.map((item) => (
                  <li className="fa-review-row" key={item.entry.path}>
                    <span className="fa-review-name" title={item.entry.path}>
                      {item.entry.name}
                    </span>
                    <span className="fa-review-target">
                      {t(`fileDrop.target.${item.entry.target}`)}
                    </span>
                    <span className="fa-review-reason">{t(item.decision.reasonKey)}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="fa-review-group fa-review-queue">
              <h3>{t('filesApp.review.reviewHeading', { count: plan.reviewCount })}</h3>
              <ul>{plan.review.map(renderReviewRow)}</ul>
            </section>

            {plan.knownCount > 0 ? (
              <section className="fa-review-group fa-review-known">
                <h3>{t('filesApp.review.knownHeading', { count: plan.knownCount })}</h3>
                <ul>
                  {plan.known.map((item) => (
                    <li className="fa-review-row" key={item.entry.path}>
                      <span className="fa-review-name" title={item.entry.path}>
                        {item.entry.name}
                      </span>
                      <span className="fa-review-reason">{t(item.decision.reasonKey)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {plan.refusedCount > 0 ? (
              <section className="fa-review-group fa-review-refused">
                <h3>{t('filesApp.review.refusedHeading', { count: plan.refusedCount })}</h3>
                <ul>
                  {plan.refused.map((item) => (
                    <li className="fa-review-row" key={item.entry.path}>
                      <span className="fa-review-name" title={item.entry.path}>
                        {item.entry.name}
                      </span>
                      <span className="fa-review-reason">{t(item.decision.reasonKey)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/*
              * Gate 28. Contents, never rows to import: a member's path is
              * `pack.zip!/ep01.srt`, which no importer can open, so this section
              * deliberately offers no control. It reports what is inside so a
              * user can decide about the archive ITSELF with the facts in hand.
              */}
            {(state.report.archives ?? []).length > 0 ? (
              <section className="fa-review-group fa-review-archives">
                <h3>
                  {t('filesApp.review.archivesHeading', {
                    count: (state.report.archives ?? []).length,
                  })}
                </h3>
                {(state.report.archives ?? []).map((finding) => (
                  <div className="fa-review-archive" key={finding.path}>
                    <p className="fa-review-archive-name" title={finding.path}>
                      {finding.path.replace(/^.*[\\/]/, '')}
                    </p>
                    {finding.report.unreadable ? (
                      <p className="fa-review-reason">{t('filesApp.scan.skip.archiveUnreadable')}</p>
                    ) : (
                      <>
                        <p className="fa-review-reason">
                          {t('filesApp.review.archiveSummary', {
                            found: finding.report.found,
                            placed: finding.report.placed,
                            ambiguous: finding.report.ambiguous,
                            // Named, not dropped: `found` counts these too, so
                            // omitting them makes the sentence's own arithmetic
                            // fail to add up in exactly the archives where
                            // something had nowhere to go.
                            unplaced: finding.report.unplaced,
                            skipped: finding.report.skipped,
                          })}
                        </p>
                        {finding.report.dominantTarget ? (
                          <p className="fa-review-reason">
                            {t('filesApp.review.archiveDominant', {
                              target: t(`fileDrop.target.${finding.report.dominantTarget}`),
                            })}
                          </p>
                        ) : null}
                        {finding.report.truncated ? (
                          <p className="fa-review-note">{t('filesApp.review.archiveTruncated')}</p>
                        ) : null}
                        <ul>
                          {finding.report.byDestination.map((row) => (
                            <li key={row.target} className="fa-review-destination">
                              <span>{t(row.labelKey)}</span>
                              <span className="fa-review-destination-count">
                                {t('filesApp.review.destinationCount', {
                                  total: row.total,
                                  placed: row.placed,
                                  ambiguous: row.ambiguous,
                                })}
                              </span>
                            </li>
                          ))}
                        </ul>
                        {finding.report.skips.length > 0 ? (
                          <ul>
                            {finding.report.skips.map((skip) => (
                              <li className="fa-review-row" key={skip.path}>
                                <span className="fa-review-name" title={skip.path}>
                                  {skip.path.replace(/^.*[\\/]/, '')}
                                </span>
                                <span className="fa-review-reason">{t(skip.reasonKey)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </>
                    )}
                  </div>
                ))}
              </section>
            ) : null}

            {state.report.skips.length > 0 ? (
              <section className="fa-review-group fa-review-skips">
                <h3>{t('filesApp.review.skippedHeading', { count: state.report.skips.length })}</h3>
                <ul>
                  {state.report.skips.map((skip) => (
                    <li className="fa-review-row" key={skip.path}>
                      <span className="fa-review-name" title={skip.path}>
                        {skip.path.replace(/^.*[\\/]/, '')}
                      </span>
                      <span className="fa-review-reason">{t(skip.reasonKey)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        ) : null}

        {state.status === 'imported' ? (
          <div className="fa-review-body fa-review-outcomes" role="status">
            <p className="fa-review-summary">
              {t('filesApp.review.importedSummary', {
                succeeded: state.outcomes.filter((o) => o.ok).length,
                total: state.outcomes.length,
              })}
            </p>
            <ul>
              {state.outcomes.map((outcome) => (
                <li className="fa-review-row" key={outcome.path}>
                  <span className="fa-review-name" title={outcome.path}>
                    {outcome.name}
                  </span>
                  <span className="fa-review-reason">
                    {outcome.ok
                      ? t('filesApp.review.outcomeOk')
                      : t(outcome.reasonKey ?? 'fileDrop.toast.failed', { name: outcome.name })}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {state.status === 'undone' ? (
          <p className="fa-review-summary" role="status">
            {t('filesApp.review.undone', { count: state.count })}
          </p>
        ) : null}

        <div className="fa-review-actions">
          <button type="button" className="fa-action fa-review-close" onClick={onClose}>
            {t('common.close')}
          </button>
          {state.status === 'imported' && state.receipts.length > 0 ? (
            <button
              type="button"
              className="fa-action fa-review-undo"
              onClick={() => void onUndo()}
            >
              {t('filesApp.review.undo', { count: state.receipts.length })}
            </button>
          ) : null}
          {state.status === 'report' ? (
            <button
              type="button"
              className="fa-action fa-review-confirm"
              disabled={willImport === 0}
              onClick={() => void onConfirm()}
            >
              {t('filesApp.review.confirm', { count: willImport })}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default ScanReviewSheet;
