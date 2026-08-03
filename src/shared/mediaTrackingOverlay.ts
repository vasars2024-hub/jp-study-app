/**
 * Pure §6/§7 bridge: attach stored tracking state to resolved media identities.
 *
 * Identity IDs are the join key. The content-type check is intentional: it keeps a
 * stale or malformed record from crossing an identity partition if IDs ever collide.
 * This module performs no storage access, clock access, or provider execution.
 */
import type { MergedMediaResult } from './mediaResultPresentation';
import {
  normalizeMediaTrackingDocument,
  summarizeMediaTrackingProgress,
  type MediaTrackingDocument,
  type MediaTrackingProgressSummary,
  type MediaTrackingRecord,
} from './mediaTracking';

export interface MediaTrackingOverlay {
  record: MediaTrackingRecord | null;
  progress: MediaTrackingProgressSummary | null;
}

export interface TrackedMergedMediaResult extends MergedMediaResult {
  tracking: MediaTrackingOverlay;
}

/**
 * Returns one immutable tracking overlay per merged identity, preserving result order.
 * Invalid tracking input is normalized locally and duplicate records resolve using the
 * tracking model's deterministic first-record rule.
 */
export function overlayMediaTracking(
  results: readonly MergedMediaResult[],
  trackingDocument: MediaTrackingDocument | unknown,
): TrackedMergedMediaResult[] {
  const tracking = normalizeMediaTrackingDocument(trackingDocument).value;
  const recordByIdentity = new Map(tracking.records.map((record) => [record.identityId, record]));

  return results.map((result) => {
    const candidate = recordByIdentity.get(result.identityId) ?? null;
    const record = candidate?.contentType === result.contentType ? candidate : null;
    return Object.freeze({
      ...result,
      tracking: Object.freeze({
        record,
        progress: record ? Object.freeze(summarizeMediaTrackingProgress(record)) : null,
      }),
    });
  });
}
