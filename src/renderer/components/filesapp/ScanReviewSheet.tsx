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
 */
import { useCallback, useMemo, useState } from 'react';
import { useT } from '../../i18n';
import {
  DEFAULT_INGEST_SETTINGS,
  planIngest,
  type IngestItem,
  type IngestPlan,
  type IngestSettings,
} from '../../../shared/filesApp/ingest';
import type { FilesScanReport } from '../../../shared/filesApp/scan';
import type { DropCandidate, DropTargetId } from '../../../shared/fileRouting';
import { executeImport, undoImports, type ImportReceipt } from '../../fileImportExecute';
import { announceFilesIndexChanged } from '../../filesIndexBus';

const LAST_ROOT_KEY = 'jp-filesapp-scan-root-v1';

/** Skipping is a real answer for a reviewed row, so it needs a value. */
const SKIP = 'skip' as const;

interface ImportOutcome {
  path: string;
  name: string;
  ok: boolean;
  /** Present on a refusal. Never a bare false. */
  reasonKey?: string;
}

type SheetState =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'error'; reasonKey: string }
  | { status: 'report'; report: FilesScanReport; candidates: Map<string, DropCandidate[]> }
  | { status: 'importing'; done: number; total: number }
  | { status: 'imported'; outcomes: ImportOutcome[]; receipts: ImportReceipt[] }
  | { status: 'undone'; count: number };

export interface ScanReviewSheetProps {
  onClose: () => void;
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
  const [root, setRoot] = useState<string>(readLastRoot);
  const [state, setState] = useState<SheetState>({ status: 'idle' });
  /** Per-review-row decision: a destination, or SKIP. */
  const [picks, setPicks] = useState<Record<string, DropTargetId | typeof SKIP>>({});

  const effectiveSettings = settings ?? DEFAULT_INGEST_SETTINGS;

  const plan: IngestPlan | null = useMemo(() => {
    if (state.status !== 'report') return null;
    return planIngest(state.report, effectiveSettings, state.candidates);
  }, [state, effectiveSettings]);

  const onScan = useCallback(async () => {
    const target = root.trim();
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
      const report = await window.api.filesScan([target]);
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
      const provisional = planIngest(report, effectiveSettings);
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
          outcomes.push({ path: subject.path, name: subject.name, ok: true });
        } else {
          outcomes.push({
            path: subject.path,
            name: subject.name,
            ok: false,
            reasonKey: refusal ?? 'fileDrop.toast.noDestination',
          });
        }
      } catch {
        // Gate 20's rule, applied here too: one failure does not abort the rest.
        outcomes.push({
          path: subject.path,
          name: subject.name,
          ok: false,
          reasonKey: 'fileDrop.toast.failed',
        });
      }
      setState({ status: 'importing', done: outcomes.length, total: jobs.length });
    }

    if (receipts.length) {
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
    announceFilesIndexChanged();
    onImported?.();
    setState({ status: 'undone', count });
  }, [state, onImported]);

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

  return (
    <div className="fa-review-scrim" role="presentation">
      <div
        className="fa-review-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('filesApp.review.title')}
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
