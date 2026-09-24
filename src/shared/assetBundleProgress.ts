/**
 * One status line for a SET of assets a feature needs.
 *
 * Features rarely need one asset: Japanese web OCR is a detector, a recognizer
 * and a charset; Manga OCR is four files. The download manager reports each on
 * its own, and a feature that showed only its "main" asset would sit at 0% while
 * a companion downloaded, or claim "installed" while one was still missing. This
 * folds the set into what a prompt actually needs to say: missing, working
 * (with bytes), failed (with the reason), or ready.
 *
 * Pure, so the prompt's wording decisions are testable without the manager.
 */

import { isBusy, type AssetError, type AssetStatus } from './assetRegistry';

export type AssetBundleState = 'installed' | 'busy' | 'failed' | 'missing';

export interface AssetBundleSummary {
  state: AssetBundleState;
  /** Bytes received across every asset in the set that is not yet installed. */
  receivedBytes: number;
  /** Bytes the not-yet-installed assets add up to. */
  totalBytes: number;
  /** 0–1, or null when there is nothing to measure. */
  fraction: number | null;
  /** Ids that are queued, downloading or verifying — what Cancel acts on. */
  busyIds: string[];
  /** The first failure's reason, when the set failed. */
  error?: AssetError;
}

/**
 * Summarize a set of statuses. A `null` status is an asset the manager has not
 * reported yet, and counts as missing — never as installed.
 *
 * Failed outranks busy only when nothing is still moving: a companion that
 * failed while the main file is mid-download is a retry the user makes after
 * the download settles, not a reason to hide the progress bar.
 */
export function summarizeAssetBundle(
  statuses: ReadonlyArray<AssetStatus | null | undefined>,
): AssetBundleSummary {
  let receivedBytes = 0;
  let totalBytes = 0;
  const busyIds: string[] = [];
  let error: AssetError | undefined;
  let installed = 0;

  for (const status of statuses) {
    if (!status) continue;
    if (status.state === 'installed') {
      installed += 1;
      continue;
    }
    receivedBytes += Math.max(0, status.receivedBytes || 0);
    totalBytes += Math.max(0, status.totalBytes || 0);
    if (isBusy(status.state)) busyIds.push(status.id);
    if (!error && (status.state === 'failed' || status.error)) error = status.error;
  }

  const fraction = totalBytes > 0 ? Math.min(1, receivedBytes / totalBytes) : null;
  let state: AssetBundleState;
  if (statuses.length > 0 && installed === statuses.length) state = 'installed';
  else if (busyIds.length > 0) state = 'busy';
  else if (error) state = 'failed';
  else state = 'missing';

  return { state, receivedBytes, totalBytes, fraction, busyIds, ...(error ? { error } : null) };
}
