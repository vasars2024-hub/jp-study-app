// Write a workbench change set into the user's live Anki collection — the
// transport half of `shared/ankiConnectCommit.ts` and the second destination of
// Phase 6 (ANKI_DECK_WORKBENCH_PLAN.md).
//
// Unlike `connectDraftRead.ts`, everything here mutates. The order is fixed and
// the reason for each step is that this is the one path in the workbench that
// cannot be undone by deleting a file:
//
//   1. re-read the same window the draft came from and compare fingerprints;
//   2. plan every write against that fresh read, refusing before write #1;
//   3. write, collecting per-item failures rather than aborting the batch;
//   4. re-read again and confirm every change actually landed.
//
// Step 3 does not stop on the first failure on purpose. A half-written batch is
// the state the plan's gate 7 is about: the honest answer is `partial` with
// every failing id named, not a rollback this transport cannot guarantee and
// not a generic error that hides how far it got.

import {
  planConnectCommit,
  verifyConnectCommit,
  ConnectCommitRefusal,
  type ConnectCommitFailure,
  type ConnectCommitRequest,
  type ConnectCommitResult,
} from '../../shared/ankiConnectCommit';
import { exportChangesEmpty } from '../../shared/ankiApkgExport';
import type { ConnectDraftRequest } from '../../shared/ankiConnectDraft';
import { invoke, isCollectionUnavailable, isUnreachable, toUiError } from './client';
import { readConnectDraft, recallConnectRead } from './connectDraftRead';

function transportCode(err: unknown): ConnectCommitResult['errorCode'] {
  if (isUnreachable(err)) return 'unreachable';
  if (isCollectionUnavailable(err)) return 'collection-unavailable';
  return 'io';
}

/** The read the fingerprint came from, or the caller's explicit override. */
function resolveRead(request: ConnectCommitRequest): ConnectDraftRequest | undefined {
  return request.read ?? recallConnectRead(request.fingerprint);
}

export async function commitConnectDraft(
  request: ConnectCommitRequest,
): Promise<ConnectCommitResult> {
  if (!request?.changes || exportChangesEmpty(request.changes)) {
    return { ok: false, errorCode: 'nothing-to-commit', error: 'The change set is empty.' };
  }

  const read = resolveRead(request);
  if (!read) {
    return {
      ok: false,
      errorCode: 'no-source',
      error: 'This build no longer remembers how the collection was read. Reopen it in the workbench and redo the edits there.',
    };
  }

  // --- 1. precondition: the collection has not moved under the draft
  const before = await readConnectDraft(read);
  if (!before.ok || !before.draft) {
    return { ok: false, errorCode: 'unreachable', error: before.error ?? 'unknown' };
  }
  if (before.draft.source.fingerprint !== request.fingerprint) {
    return {
      ok: false,
      errorCode: 'source-changed',
      error:
        'The collection changed in Anki since it was read. Reopen it in the workbench and redo the edits there.',
    };
  }

  // --- 2. plan: throws before any write when something no longer lines up
  let plan;
  try {
    plan = planConnectCommit(request.changes, before.draft);
  } catch (err) {
    if (err instanceof ConnectCommitRefusal) {
      return { ok: false, errorCode: err.code, error: err.message };
    }
    return { ok: false, errorCode: 'io', error: err instanceof Error ? err.message : String(err) };
  }

  // --- 3. write
  const failures: ConnectCommitFailure[] = [];
  let notesUpdated = 0;
  let cardsUpdated = 0;

  for (const write of plan.noteWrites) {
    const id = String(write.noteId);
    try {
      if (write.fields) await invoke('updateNoteFields', { note: { id: write.noteId, fields: write.fields } });
      if (write.removeTags.length) {
        await invoke('removeTags', { notes: [write.noteId], tags: write.removeTags.join(' ') });
      }
      if (write.addTags.length) {
        await invoke('addTags', { notes: [write.noteId], tags: write.addTags.join(' ') });
      }
      notesUpdated += 1;
    } catch (err) {
      if (isUnreachable(err) || isCollectionUnavailable(err)) {
        // Anki went away mid-batch: say how far it got and stop, rather than
        // grinding through the rest collecting the same message N times.
        return {
          ok: false,
          errorCode: transportCode(err),
          error: toUiError(err),
          notesUpdated,
          cardsUpdated,
          failures: [...failures, { kind: 'note', id, reason: toUiError(err) }],
        };
      }
      failures.push({ kind: 'note', id, reason: toUiError(err) });
    }
  }

  for (const move of plan.cardWrites) {
    const id = String(move.cardId);
    try {
      await invoke('setSpecificValueOfCard', {
        card: move.cardId,
        keys: ['due'],
        newValues: [String(move.due)],
        warning_check: true,
      });
      cardsUpdated += 1;
    } catch (err) {
      if (isUnreachable(err) || isCollectionUnavailable(err)) {
        return {
          ok: false,
          errorCode: transportCode(err),
          error: toUiError(err),
          notesUpdated,
          cardsUpdated,
          failures: [...failures, { kind: 'card', id, reason: toUiError(err) }],
        };
      }
      failures.push({ kind: 'card', id, reason: toUiError(err) });
    }
  }

  // --- 4. re-read and verify what actually landed
  const after = await readConnectDraft(read);
  if (!after.ok || !after.draft) {
    return {
      ok: false,
      errorCode: 'verify-failed',
      error: `The writes were sent but the collection could not be re-read: ${after.error ?? 'unknown'}`,
      notesUpdated,
      cardsUpdated,
      failures: failures.length ? failures : undefined,
    };
  }

  const verdict = verifyConnectCommit(request.changes, after.draft);
  let profile: string | undefined;
  try {
    profile = await invoke('getActiveProfile', undefined);
  } catch {
    // Cosmetic. A commit that landed is not a failure because the profile name
    // could not be fetched afterwards.
  }

  if (failures.length) {
    return {
      ok: false,
      errorCode: 'partial',
      error: `${failures.length} of ${plan.noteWrites.length + plan.cardWrites.length} changes did not commit.`,
      notesUpdated,
      cardsUpdated,
      verified: verdict.ok,
      fingerprint: after.draft.source.fingerprint,
      profile,
      failures,
    };
  }

  if (!verdict.ok) {
    return {
      ok: false,
      errorCode: 'verify-failed',
      error: `Anki reported success but the re-read disagrees: ${verdict.mismatches.slice(0, 5).join('; ')}`,
      notesUpdated,
      cardsUpdated,
      verified: false,
      fingerprint: after.draft.source.fingerprint,
      profile,
    };
  }

  return {
    ok: true,
    notesUpdated,
    cardsUpdated,
    verified: true,
    fingerprint: after.draft.source.fingerprint,
    profile,
  };
}
