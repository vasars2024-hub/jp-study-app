/**
 * Drop anything, anywhere on the desktop, and it goes where it belongs.
 *
 * Replaces the two-bucket handler this shell used to carry, which understood
 * books and A/V and silently discarded everything else — including files the
 * app has a perfectly good importer for. Three things are new: a visible drop
 * affordance (there was none), a triage sheet for genuinely ambiguous files,
 * and an undo.
 *
 * Dispatch is renderer-side rather than in main because every importer it calls
 * is an `ipcMain.handle` with no exported function behind it; see the note at
 * the top of `main/fileRouter.ts`. The dispatch table itself now lives in
 * `renderer/fileImportExecute.ts`, shared with the Files app's scan-and-review
 * sheet — one importer, for the same reason there is one classifier.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DropPlan } from '../../main/fileRouter';
import type { DropTargetId } from '../../shared/fileRouting';
import { extOf } from '../../shared/mediaKind';
import { useModalKeyboard } from './ui/useModalKeyboard';
import { useT } from '../i18n';
import { loadFileDropPrefs, onFileDropPrefsChanged, type FileDropPrefs } from '../fileDropPrefs';
import { announceFilesIndexChanged } from '../filesIndexBus';
import { showOsToast } from './ToastHost';
import Icon from './Icons';
import { executeImport, undoImports, type ImportReceipt } from '../fileImportExecute';
import { requestMediaCenterPlay } from '../mediaCenterIntent';

/**
 * One routed file, ready to reverse.
 *
 * The dispatch table itself moved to `renderer/fileImportExecute.ts` so the
 * Files app's scan-and-review sheet imports through the same calls a drop does;
 * all this adds is the resolved label the toast prints.
 */
interface UndoEntry extends ImportReceipt {
  label: string;
}

const TARGETS_IN_TRIAGE: DropTargetId[] = [
  'library-book',
  'library-manga',
  'media',
  'subtitle',
  'wallpaper',
  'anki-cards',
  'anki-level',
  'dictionary-yomitan',
  'frequency-dict',
  'shortcut',
];

export default function DropRouter({
  onOpenSection,
}: {
  /** Focus the app that just received the file. */
  onOpenSection?: (section: string) => void;
}) {
  const { t, lang } = useT();
  const [prefs, setPrefs] = useState<FileDropPrefs>(loadFileDropPrefs);
  const [dragging, setDragging] = useState(false);
  const [triage, setTriage] = useState<DropPlan[] | null>(null);
  const [choices, setChoices] = useState<Record<string, DropTargetId>>({});
  const [busy, setBusy] = useState(false);
  // Nested dragenter/dragleave fire per element; count them so the affordance
  // does not flicker as the cursor crosses child nodes.
  const dragDepth = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => onFileDropPrefsChanged(setPrefs), []);

  /*
   * The triage sheet declares `aria-modal` and, until 2026-09-06, had no
   * keyboard code at all (register row D9). Escape now cancels it, which is the
   * same thing the visible Cancel button does — and, like that button, is
   * refused while the import is running rather than abandoning it half-done.
   */
  useModalKeyboard({
    panelRef: sheetRef,
    onEscape: busy ? null : () => setTriage(null),
    enabled: triage != null,
  });

  const execute = useCallback(
    async (plan: DropPlan, target: DropTargetId, single = false): Promise<UndoEntry | null> => {
      const receipt = await executeImport(plan, target, {
        onOpenSection,
        // One video dropped: open it in the player, as the "→ Media player" toast says.
        onPlayMedia: single ? requestMediaCenterPlay : undefined,
        // The refusals this component always showed, now named by the importer
        // rather than decided twice. `emptyFolder` is new and was previously a
        // silent `null` — a folder drop that imported nothing and said nothing.
        onRefused: (reasonKey, subject) => {
          // `warn`, not `err`, for the refusals that are a next step rather than
          // a failure: nothing here can open it yet, and the subtitle whose video
          // is not in the library yet. Both are answered by one more drop, and
          // colouring them as errors tells the user something broke when it did
          // not. Every other refusal keeps `err`.
          const actionable = reasonKey === 'fileDrop.toast.noDestination'
            || reasonKey === 'fileDrop.toast.subtitleNoOwner';
          showOsToast(t(reasonKey, { name: subject.name }), actionable ? 'warn' : 'err');
        },
      });
      if (!receipt) return null;
      return { ...receipt, label: t(`fileDrop.target.${target}`) };
    },
    [onOpenSection, t],
  );

  const undo = useCallback(async (entries: UndoEntry[]) => {
    await undoImports(entries);
    // Gate 11 in reverse: the Files tree has to lose the row again, or an undo
    // leaves a window showing an item that no longer exists.
    announceFilesIndexChanged();
    showOsToast(t('fileDrop.toast.undone'), 'ok');
  }, [t]);

  const runPlans = useCallback(
    async (plans: DropPlan[], explicit?: Record<string, DropTargetId>) => {
      setBusy(true);
      const done: UndoEntry[] = [];
      try {
        for (const plan of plans) {
          const override = explicit?.[plan.path] ?? prefs.overrides[extOf(plan.name)];
          const target = override ?? plan.candidates[0]?.target ?? 'unknown';
          const entry = await execute(plan, target, plans.length === 1);
          if (entry) done.push(entry);
        }
      } finally {
        setBusy(false);
      }

      if (!done.length) return;
      // Gate 11: fired AFTER the imports resolve, never optimistically. A tree
      // that added a row and then had to take it away is worse than a stale one.
      announceFilesIndexChanged();
      const summary =
        done.length === 1
          ? [t('fileDrop.toast.routedOne', { name: plans[0]?.name ?? '', target: done[0].label }), done[0].notice]
              .filter(Boolean)
              .join(' ')
          : t('fileDrop.toast.routedMany', { count: String(done.length) });
      showOsToast(
        summary,
        'ok',
        prefs.undoDepth > 0
          ? { label: t('fileDrop.action.undo'), run: () => void undo(done) }
          : undefined,
      );
    },
    [execute, prefs.overrides, prefs.undoDepth, t, undo],
  );

  /** Classify real paths, then route them silently or ask in the triage sheet. */
  const routePaths = useCallback(
    async (paths: string[]) => {
      const plans = await window.api.fileDropClassify(paths);
      if (!plans.length) {
        showOsToast(t('fileDrop.toast.notClassified', { count: paths.length }), 'err');
        return;
      }
      const mustAsk =
        !prefs.autoRoute ||
        prefs.alwaysTriage ||
        plans.some((p) => {
          if (prefs.overrides[extOf(p.name)]) return false;
          const top = p.candidates[0];
          return !top || top.confidence === 'ambiguous' || top.target === 'unknown';
        });
      if (mustAsk) {
        setChoices(
          Object.fromEntries(
            plans.map((p) => [p.path, prefs.overrides[extOf(p.name)] ?? p.candidates[0]?.target ?? 'unknown']),
          ),
        );
        setTriage(plans);
        return;
      }
      await runPlans(plans);
    },
    // `lang` for the same reason as the listener effect below.
    [prefs, runPlans, t, lang],
  );

  useEffect(() => {
    const hasFiles = (e: DragEvent): boolean => Boolean(e.dataTransfer?.types.includes('Files'));

    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent): void => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      dragDepth.current = 0;
      setDragging(false);
      if (!files.length) return;
      e.preventDefault();
      const paths = files
        .map((f) => {
          try {
            return window.api.getFilePath(f);
          } catch {
            return '';
          }
        })
        .filter(Boolean);
      /*
       * Gate 11: "a file the router cannot place gets a named refusal, not a
       * silent drop." These two returns WERE the silent drop — real files were
       * released onto the window and nothing whatever happened, which reads as
       * a broken app rather than as a refusal.
       *
       * They are distinct failures and get distinct sentences. No path means
       * Electron would not give one for the dragged object (a virtual item from
       * an archive or a mail client is the usual cause); no plan means the
       * router itself returned nothing, which is a fault on this side.
       */
      if (!paths.length) {
        showOsToast(t('fileDrop.toast.noPath', { count: files.length }), 'warn');
        return;
      }

      void routePaths(paths);
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
    // `lang`, never `t`: `t`'s identity is stable by design, so a listener
    // closed over it keeps the language it was registered with and the two new
    // refusals below would speak the old one after a UI-language switch.
  }, [prefs, routePaths, t, lang]);

  /*
   * Files Windows opened with Gum ("Open with Gum", a double-clicked associated
   * type, a file dropped on the shortcut) — main/fileOpenRouter.ts queues them.
   * They take exactly the drop path above: same classifier, same triage sheet,
   * same importers, same undo. Drained once on mount (a cold start's files
   * arrive before this component exists), then pushed.
   */
  const routePathsRef = useRef(routePaths);
  routePathsRef.current = routePaths;
  useEffect(() => {
    const api = window.api;
    if (!api.fileOpenDrain || !api.onFileOpenPaths) return;
    const off = api.onFileOpenPaths((paths) => void routePathsRef.current(paths));
    void api.fileOpenDrain().then((paths) => {
      if (paths.length) void routePathsRef.current(paths);
    }).catch(() => undefined);
    return off;
  }, []);

  return (
    <>
      {dragging && !triage && (
        <div className="dropr-affordance" aria-hidden>
          <div className="dropr-affordance-card">
            <Icon name="download" />
            <div className="dropr-affordance-title">{t('fileDrop.affordance.title')}</div>
            <div className="dropr-affordance-hint">{t('fileDrop.affordance.hint')}</div>
          </div>
        </div>
      )}

      {triage && (
        <div className="dropr-sheet-scrim" role="presentation">
          <div
            ref={sheetRef}
            tabIndex={-1}
            className="dropr-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('fileDrop.triage.title')}
          >
            <h2 className="dropr-sheet-title">{t('fileDrop.triage.title')}</h2>
            <p className="dropr-sheet-sub">{t('fileDrop.triage.subtitle')}</p>
            <div className="dropr-rows">
              {triage.map((plan) => (
                <div className="dropr-row" key={plan.path}>
                  <div className="dropr-row-name" title={plan.path}>
                    {plan.name}
                    {plan.folderSummary && (
                      <span className="dropr-row-meta">
                        {t('fileDrop.triage.folderMeta', {
                          images: String(plan.folderSummary.images),
                          media: String(plan.folderSummary.media),
                          books: String(plan.folderSummary.books),
                        })}
                      </span>
                    )}
                    {plan.candidates[0] && (
                      <span className="dropr-row-reason">{t(plan.candidates[0].reasonKey)}</span>
                    )}
                  </div>
                  <label className="dropr-row-pick">
                    <span className="sr-only">{t('fileDrop.triage.destinationFor', { name: plan.name })}</span>
                    <select
                      value={choices[plan.path] ?? 'unknown'}
                      onChange={(e) =>
                        setChoices((prev) => ({ ...prev, [plan.path]: e.target.value as DropTargetId }))
                      }
                    >
                      {/* Candidates the classifier proposed come first, then
                          every other destination, so the user is never boxed in
                          by a wrong guess. */}
                      {plan.candidates.map((c) => (
                        <option key={`c-${c.target}`} value={c.target}>
                          {t(`fileDrop.target.${c.target}`)}
                        </option>
                      ))}
                      {TARGETS_IN_TRIAGE.filter(
                        (id) => !plan.candidates.some((c) => c.target === id),
                      ).map((id) => (
                        <option key={`o-${id}`} value={id}>
                          {t(`fileDrop.target.${id}`)}
                        </option>
                      ))}
                      <option value="unknown">{t('fileDrop.target.skip')}</option>
                    </select>
                  </label>
                </div>
              ))}
            </div>
            <div className="dropr-sheet-actions">
              <button type="button" className="btn" onClick={() => setTriage(null)} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy}
                onClick={() => {
                  const plans = triage;
                  const picked = choices;
                  setTriage(null);
                  void runPlans(plans, picked);
                }}
              >
                {t('fileDrop.triage.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
