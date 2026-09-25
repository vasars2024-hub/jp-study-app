/**
 * Watched folders, the importing half (audit r2 #3).
 *
 * Main watches the roots from app start and sends each batch that finished
 * arriving to the MAIN window only (`filesapp:watch-import`); this runs there,
 * whichever shell that window is showing. The piles come from
 * `planWatchImports`, i.e. the same disposition the scan-and-review sheet
 * gives a file, and the imports go through `executeImport` — the one importer
 * the drop router and the review sheet already share. So a watched file lands
 * exactly where a dropped file would, with the same undo.
 *
 * The same host also runs any Files delete whose undo window passed while no
 * Files window was open, so a delete never waits on the user re-opening Files.
 */
import { useEffect } from 'react';
import { useT } from '../../i18n';
import { executeImport, undoImports, type ImportReceipt } from '../../fileImportExecute';
import { forgetImportedFiles, loadImportLedger, recordImportedFiles } from '../../filesImportLedgerStore';
import { loadIngestSettings } from '../../filesIngestSettingsStore';
import { announceFilesIndexChanged } from '../../filesIndexBus';
import { showOsToast } from '../ToastHost';
import {
  planWatchImports,
  type FilesWatchImportArrival,
  type FilesWatchImportPlan,
} from '../../../shared/filesApp/watchImport';
import { createWindowFilesDeletionSession } from './filesDeletionSession';
import { runOwnerDelete } from './filesOwnerDeleters';

export interface WatchImportOutcome {
  plan: FilesWatchImportPlan;
  imported: { path: string; name: string }[];
  receipts: ImportReceipt[];
  failed: number;
}

export interface WatchImportDeps {
  importOne?: typeof executeImport;
  record?: typeof recordImportedFiles;
}

/** Import the auto pile of one batch. Sequential, so two arrivals cannot race a store. */
export async function runWatchImports(
  arrivals: readonly FilesWatchImportArrival[],
  deps: WatchImportDeps = {},
): Promise<WatchImportOutcome> {
  const plan = planWatchImports(arrivals, loadIngestSettings(), loadImportLedger());
  const importOne = deps.importOne ?? executeImport;
  const record = deps.record ?? recordImportedFiles;
  const imported: WatchImportOutcome['imported'] = [];
  const receipts: ImportReceipt[] = [];
  const landed: { path: string; sizeBytes: number; target: FilesWatchImportPlan['auto'][number]['target'] }[] = [];
  let failed = 0;
  for (const entry of plan.auto) {
    try {
      const receipt = await importOne({ path: entry.path, name: entry.name, isDirectory: false }, entry.target);
      if (receipt) {
        receipts.push(receipt);
        imported.push({ path: entry.path, name: entry.name });
        landed.push({ path: entry.path, sizeBytes: entry.sizeBytes, target: entry.target });
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }
  // Only what actually landed is recorded, as in the review sheet (gate 29).
  if (landed.length) record(landed);
  return { plan, imported, receipts, failed };
}

/**
 * Mounted once per window by `App`. Imports only ever arrive in the main
 * window (main sends them nowhere else); `isMainWindow` keeps the delete
 * sweep there too, so a pop-out does not race the main window to the same
 * owner delete.
 */
export function useFilesWatchAutoImport(isMainWindow: boolean): void {
  const { t } = useT();

  useEffect(() => {
    const api = window.api as typeof window.api & {
      onFilesWatchImport?: (cb: (arrivals: FilesWatchImportArrival[]) => void) => () => void;
    };
    if (typeof api?.onFilesWatchImport !== 'function') return undefined;
    let queue = Promise.resolve();
    return api.onFilesWatchImport((arrivals) => {
      queue = queue.then(async () => {
        const outcome = await runWatchImports(arrivals);
        if (outcome.receipts.length) {
          announceFilesIndexChanged();
          const last = outcome.imported[outcome.imported.length - 1];
          showOsToast(
            t('filesApp.watch.imported', { count: outcome.imported.length, name: last?.name ?? '' }),
            'ok',
            {
              label: t('filesApp.watch.undoImport'),
              run: () => {
                void undoImports(outcome.receipts).then(() => {
                  forgetImportedFiles(outcome.imported.map((entry) => entry.path));
                  announceFilesIndexChanged();
                });
              },
            },
          );
        }
        if (outcome.plan.review.length) {
          showOsToast(t('filesApp.watch.needsReview', { count: outcome.plan.review.length }), 'ok');
        }
        if (outcome.failed) {
          showOsToast(t('filesApp.watch.importFailed', { count: outcome.failed }), 'err');
        }
      });
    });
    // `t` is stable by design; the toasts are built at the moment they are shown.
  }, [t]);

  useEffect(() => {
    if (!isMainWindow) return;
    // Deletes whose undo window ran out while Files was closed.
    let session: ReturnType<typeof createWindowFilesDeletionSession> | null = null;
    try {
      session = createWindowFilesDeletionSession();
    } catch {
      return;
    }
    void session.commitDue((itemId, commit) => runOwnerDelete(itemId, commit)).then((result) => {
      if (result.committed) announceFilesIndexChanged();
    });
  }, [isMainWindow]);
}
