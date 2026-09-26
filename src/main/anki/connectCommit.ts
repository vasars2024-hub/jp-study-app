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
//
// Gate 7's other half is the user stopping the batch themselves. The cancel is
// checked BETWEEN writes and never inside one, because AnkiConnect has no
// abortable request and a write already sent has already landed — pretending
// otherwise is the false success the gate exists to prevent. A cancel therefore
// stops sending and then still runs step 4: the numbers the surface shows are
// re-read out of the collection, so "some of it is in there" comes with exactly
// how much rather than a shrug.

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
import {
  invoke,
  isCollectionUnavailable,
  isUnreachable,
  settingsFailure,
  toUiError,
} from './client';
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

/**
 * Commit ids the user has asked to stop. A plain set rather than an
 * `AbortController` because nothing here is abortable: the flag is read between
 * writes and the in-flight request is always allowed to finish, which is the
 * only way the count of what landed can stay true.
 */
const cancelledCommits = new Set<string>();

/**
 * Stop an in-flight live commit after its current write. `false` means no commit
 * is running under that token — already finished, or never started — which is an
 * answer and not a failure, exactly as `cancelApkgDraftRead` reports it.
 */
export function cancelConnectCommit(commitId?: string): boolean {
  if (!commitId || !runningCommits.has(commitId)) return false;
  cancelledCommits.add(commitId);
  return true;
}

/** Tokens with a commit actually in flight, so a cancel can answer honestly. */
const runningCommits = new Set<string>();

export async function commitConnectDraft(
  request: ConnectCommitRequest,
): Promise<ConnectCommitResult> {
  const commitId = request?.commitId;
  if (commitId) runningCommits.add(commitId);
  try {
    return await commitConnectDraftInner(request, commitId);
  } finally {
    if (commitId) {
      runningCommits.delete(commitId);
      cancelledCommits.delete(commitId);
    }
  }
}

async function commitConnectDraftInner(
  request: ConnectCommitRequest,
  commitId: string | undefined,
): Promise<ConnectCommitResult> {
  const stopping = () => commitId !== undefined && cancelledCommits.has(commitId);
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
  // Distinct card ROWS written. A card both refiled by a split and repositioned
  // is one card in Anki, not two change-list entries — same rule the package
  // writer counts by, which is why this is a set and not a counter.
  const movedCardIds = new Set<string>();
  // Latched once and read by every loop below, so a cancel that arrives during
  // the note writes does not have to be re-noticed by the four write phases
  // after it. The phases still run their own check, because each one can be the
  // first to see it.
  let stopped = false;

  for (const write of plan.noteWrites) {
    if (stopping()) { stopped = true; break; }
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
          cardsUpdated: movedCardIds.size,
          failures: [...failures, { kind: 'note', id, reason: toUiError(err) }],
        };
      }
      failures.push({ kind: 'note', id, reason: toUiError(err) });
    }
  }

  // Recipe 13's split, before the `due` writes and after the note writes: a
  // card must never be pointed at a deck that does not exist yet, and creating
  // the deck is the one step here that can fail before anything has moved.
  for (const write of plan.deckWrites) {
    if (stopped || stopping()) { stopped = true; break; }
    const ids = write.cardIds.map(String);
    try {
      if (write.create) {
        await invoke('createDeck', { deck: write.deck });
        if (write.configId !== undefined) {
          // The preset is what keeps the split cards on the parent's review
          // limits. It used to be best effort — an exception swallowed and a
          // `false` answer never read — so a "successful" split could leave
          // cards on Anki's defaults with nothing said. Now a preset that did
          // not apply stops THIS group's move (the cards stay where they are,
          // on the limits they had) and is named as a partial result.
          let applied = false;
          let why = 'AnkiConnect answered false';
          try {
            applied = (await invoke('setDeckConfigId', { decks: [write.deck], configId: write.configId })) === true;
          } catch (err) {
            if (isUnreachable(err) || isCollectionUnavailable(err)) throw err;
            why = toUiError(err);
          }
          if (!applied) {
            for (const id of ids) {
              failures.push({
                kind: 'card',
                id,
                code: 'preset-not-applied',
                deck: write.deck,
                reason: `options preset ${write.configId} could not be applied to ${write.deck} (${why})`,
              });
            }
            continue;
          }
        }
      }
      await invoke('changeDeck', { cards: write.cardIds, deck: write.deck });
      for (const id of ids) movedCardIds.add(id);
    } catch (err) {
      if (isUnreachable(err) || isCollectionUnavailable(err)) {
        return {
          ok: false,
          errorCode: transportCode(err),
          error: toUiError(err),
          notesUpdated,
          cardsUpdated: movedCardIds.size,
          failures: [
            ...failures,
            ...ids.map((id) => ({ kind: 'card' as const, id, reason: toUiError(err) })),
          ],
        };
      }
      // One call carried the whole group, so nothing distinguishes the cards
      // inside it: every one is reported failed rather than guessing a subset.
      // The re-read below is what establishes which actually moved.
      for (const id of ids) failures.push({ kind: 'card', id, reason: toUiError(err) });
    }
  }

  for (const move of plan.cardWrites) {
    if (stopped || stopping()) { stopped = true; break; }
    const id = String(move.cardId);
    try {
      const verdict = await invoke('setSpecificValueOfCard', {
        card: move.cardId,
        // A NUMBER, and the per-key verdict has to be read: this action reports
        // its refusals inside a 200 body, so `invoke` cannot raise them. Sending
        // '7' here is what made the first live run report `cardsUpdated 1` while
        // the card had not moved — see `client.ts`'s note on the action.
        keys: ['due'],
        newValues: [move.due],
        warning_check: true,
      });
      const refused = settingsFailure(verdict);
      if (refused) {
        failures.push({ kind: 'card', id, reason: refused });
        continue;
      }
      movedCardIds.add(id);
    } catch (err) {
      if (isUnreachable(err) || isCollectionUnavailable(err)) {
        return {
          ok: false,
          errorCode: transportCode(err),
          error: toUiError(err),
          notesUpdated,
          cardsUpdated: movedCardIds.size,
          failures: [...failures, { kind: 'card', id, reason: toUiError(err) }],
        };
      }
      failures.push({ kind: 'card', id, reason: toUiError(err) });
    }
  }

  // Gate 5's suspend third. Two batched calls, so a failure cannot distinguish
  // the cards inside one — every id in the group is reported, exactly as the
  // split's `changeDeck` does, and the re-read below settles which really moved.
  for (const [action, ids] of [
    ['suspend', plan.suspendWrites.suspend],
    ['unsuspend', plan.suspendWrites.unsuspend],
  ] as const) {
    if (ids.length === 0) continue;
    if (stopped || stopping()) { stopped = true; break; }
    try {
      await invoke(action, { cards: ids });
      for (const id of ids) movedCardIds.add(String(id));
    } catch (err) {
      if (isUnreachable(err) || isCollectionUnavailable(err)) {
        return {
          ok: false,
          errorCode: transportCode(err),
          error: toUiError(err),
          notesUpdated,
          cardsUpdated: movedCardIds.size,
          failures: [
            ...failures,
            ...ids.map((id) => ({ kind: 'card' as const, id: String(id), reason: toUiError(err) })),
          ],
        };
      }
      for (const id of ids) failures.push({ kind: 'card', id: String(id), reason: toUiError(err) });
    }
  }

  // Gate 5's interval/ease third, through `card-due`'s own route — including its
  // two measured traps: numbers not strings, and a refusal that arrives inside a
  // 200 body where `invoke` cannot raise it.
  for (const write of plan.schedulingWrites) {
    if (stopped || stopping()) { stopped = true; break; }
    const id = String(write.cardId);
    try {
      const verdict = await invoke('setSpecificValueOfCard', {
        card: write.cardId,
        keys: ['ivl', 'factor'],
        newValues: [write.interval, write.easeFactor],
        warning_check: true,
      });
      const refused = settingsFailure(verdict);
      if (refused) {
        failures.push({ kind: 'card', id, reason: refused });
        continue;
      }
      movedCardIds.add(id);
    } catch (err) {
      if (isUnreachable(err) || isCollectionUnavailable(err)) {
        return {
          ok: false,
          errorCode: transportCode(err),
          error: toUiError(err),
          notesUpdated,
          cardsUpdated: movedCardIds.size,
          failures: [...failures, { kind: 'card', id, reason: toUiError(err) }],
        };
      }
      failures.push({ kind: 'card', id, reason: toUiError(err) });
    }
  }

  // The denominator counts the split's cards individually, because that is the
  // granularity `failures` reports them at — a batched `changeDeck` must not
  // make the total smaller than the number of failures it can add.
  const plannedChanges =
    plan.noteWrites.length
    + plan.cardWrites.length
    + plan.schedulingWrites.length
    + plan.suspendWrites.suspend.length
    + plan.suspendWrites.unsuspend.length
    + plan.deckWrites.reduce((total, write) => total + write.cardIds.length, 0);

  // --- 4. re-read and verify what actually landed. Runs after a cancel too:
  // the whole point of stopping honestly is being able to say how much is in
  // there, and only the collection knows that.
  const after = await readConnectDraft(read);
  if (!after.ok || !after.draft) {
    return {
      ok: false,
      // A cancel whose re-read failed is the most ambiguous state this path can
      // reach, so it says both halves out loud instead of picking one.
      errorCode: stopped ? 'cancelled' : 'verify-failed',
      error: stopped
        ? `You stopped the commit after ${notesUpdated + movedCardIds.size} of ${plannedChanges} changes, and the collection could not be re-read to confirm which landed: ${after.error ?? 'unknown'}`
        : `The writes were sent but the collection could not be re-read: ${after.error ?? 'unknown'}`,
      notesUpdated,
      cardsUpdated: movedCardIds.size,
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

  // Outranks `partial`, and deliberately: when the user stopped the batch, the
  // transport failures inside it are a detail of a state they chose, not the
  // explanation for it. They are still carried on `failures` and still named
  // individually — nothing is hidden, only ordered.
  if (stopped) {
    return {
      ok: false,
      errorCode: 'cancelled',
      error: `You stopped the commit. ${notesUpdated + movedCardIds.size} of ${plannedChanges} changes were written to your collection and the rest were never sent.`,
      notesUpdated,
      cardsUpdated: movedCardIds.size,
      // Never `verdict.ok` dressed up: the change set as a whole is not in the
      // collection, and that is the literal meaning of this field.
      verified: false,
      // The measured number, off the re-read. `plannedChanges - written` would
      // be a guess: a call can be sent and still not land, which is exactly the
      // gap between "how far the loop got" and "what is in there".
      unwritten: verdict.mismatches.length,
      fingerprint: after.draft.source.fingerprint,
      profile,
      failures: failures.length ? failures : undefined,
    };
  }

  if (failures.length) {
    return {
      ok: false,
      errorCode: 'partial',
      error: `${failures.length} of ${plannedChanges} changes did not commit.`,
      notesUpdated,
      cardsUpdated: movedCardIds.size,
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
      cardsUpdated: movedCardIds.size,
      verified: false,
      fingerprint: after.draft.source.fingerprint,
      profile,
    };
  }

  return {
    ok: true,
    notesUpdated,
    cardsUpdated: movedCardIds.size,
    verified: true,
    fingerprint: after.draft.source.fingerprint,
    profile,
  };
}
