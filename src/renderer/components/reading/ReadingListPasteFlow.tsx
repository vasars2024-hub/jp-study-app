/**
 * Paste → preview → the list. The one place the §2.5 sheet is joined to the
 * main-owned store, so no surface has to know that the write is compare-and-swap.
 *
 * Why this is a component and not a call inside the dialog: the dialog is a pure
 * function of a draft and stays testable without a bridge, and the write has to
 * survive a refusal by RE-RUNNING its intent (`readingListsClient.ts`'s whole
 * reason for existing). Those are two different jobs with two different failure
 * modes, and the receipt below is the seam between them.
 *
 * Two things here are load-bearing:
 *
 *   · **The mutation context is minted inside the mutator**, one per attempt.
 *     Reusing a context across a retry re-issues ids the refused attempt already
 *     spent, and a deterministic minter then hands two records the same id — a
 *     failure this repo has already paid for once.
 *   · **The receipt is what actually landed, not what was sent.**
 *     `applyReadingListImport` skips a work already on the list, so "pasted 12,
 *     added 9, 3 already here" is sayable; rounding that to "added 12" is the
 *     dishonest state §2.5 exists to prevent.
 */
import { useCallback, useState } from 'react';
import { ReadingListPastePreview } from './ReadingListPastePreview';
import { useT } from '../../i18n';
import {
  applyReadingListsMutation,
  latestReadingListsSnapshot,
  loadReadingLists,
} from '../../readingListsClient';
import {
  applyReadingListImport,
  createReadingListsMutationContext,
} from '../../../shared/readingListMutations';
import type { ReadingListsDocument } from '../../../shared/readingLists';
import type { ReadingListsFailureCode } from '../../../shared/readingListsBridge';
import type { ReadingPreviewImport } from '../../../shared/readingListPreview';

export interface ReadingListPasteReceipt {
  added: number;
  skipped: number;
  importId: string | null;
}

export interface ReadingListPasteFlowProps {
  open: boolean;
  /** Exactly what was pasted. */
  rawText: string;
  /** The list the entries land on. It must already exist. */
  listId: string;
  listName: string;
  onClose: () => void;
  /** Fired once, with what actually landed. */
  onImported?: (receipt: ReadingListPasteReceipt) => void;
}

type FlowState =
  | { phase: 'editing' }
  | { phase: 'writing' }
  | { phase: 'failed'; code: ReadingListsFailureCode | 'no-list' };

const FAILURE_KEYS: Record<string, string> = {
  'bridge-unavailable': 'readingLists.paste.failed.bridge',
  'read-failed': 'readingLists.paste.failed.read',
  'write-failed': 'readingLists.paste.failed.write',
  'invalid-request': 'readingLists.paste.failed.write',
  conflict: 'readingLists.paste.failed.conflict',
  'no-list': 'readingLists.paste.failed.noList',
};

/**
 * The document a write starts from, or the reason there is none.
 *
 * The client keeps the freshest snapshot it has seen and re-bases a refused
 * write onto whatever main hands back, so a stale base costs at most one extra
 * round trip.
 *
 * **A failed load must not degrade to an empty document.** It did in the first
 * draft, and the flow then diagnosed a missing bridge as "that list no longer
 * exists" — the mutation found no list on the empty fallback and never reached
 * IPC at all, so the true cause could not surface. The test that caught it is
 * `readingListPasteFlow.test.tsx`'s bridge case.
 */
async function baseDocument(): Promise<
  { ok: true; document: ReadingListsDocument } | { ok: false; code: ReadingListsFailureCode }
> {
  const known = latestReadingListsSnapshot();
  if (known) return { ok: true, document: known.document };
  const loaded = await loadReadingLists();
  if (!loaded.ok) return { ok: false, code: loaded.code };
  return { ok: true, document: loaded.snapshot.document };
}

export function ReadingListPasteFlow({
  open,
  rawText,
  listId,
  listName,
  onClose,
  onImported,
}: ReadingListPasteFlowProps) {
  const { t } = useT();
  const [state, setState] = useState<FlowState>({ phase: 'editing' });

  const commit = useCallback(
    async (payload: ReadingPreviewImport) => {
      setState({ phase: 'writing' });
      const base = await baseDocument();
      if (!base.ok) {
        setState({ phase: 'failed', code: base.code });
        return;
      }
      const excluded = new Set(payload.excludeLineIndexes);
      const candidateCount = payload.parsed.entries.filter(
        (entry) => !excluded.has(entry.lineIndex),
      ).length;

      // The last attempt's numbers, not the first's — a retry re-runs the whole
      // import against a document that may already hold some of these works.
      let landed: { added: number; skipped: number; importId: string | null } = {
        added: 0,
        skipped: 0,
        importId: null,
      };

      const result = await applyReadingListsMutation(base.document, (document) => {
        const context = createReadingListsMutationContext();
        const imported = applyReadingListImport(
          document,
          listId,
          payload.parsed,
          { rawText: payload.rawText, excludeLineIndexes: payload.excludeLineIndexes },
          context,
        );
        landed = {
          added: imported.added,
          skipped: imported.skipped,
          importId: imported.importId,
        };
        return imported;
      });

      if (!result.ok) {
        setState({ phase: 'failed', code: result.code });
        return;
      }
      // The mutation declined while it had rows to add: the only way that
      // happens is a list id that is not in the document any more. Guarding on
      // `candidateCount` matters — an import where the preview excluded
      // everything is also a no-op, and blaming the list for it would be wrong.
      if (!result.changed && landed.importId === null && candidateCount > 0) {
        setState({ phase: 'failed', code: 'no-list' });
        return;
      }
      onImported?.(landed);
      setState({ phase: 'editing' });
      onClose();
    },
    [listId, onClose, onImported],
  );

  if (!open) return null;

  return (
    <ReadingListPastePreview
      open
      rawText={rawText}
      listName={listName}
      busy={state.phase === 'writing'}
      onCancel={onClose}
      onConfirm={(payload) => {
        void commit(payload);
      }}
      // Inside the sheet, not beside it: the dialog is a fixed overlay, so a
      // sibling banner paints underneath it and the user never sees the reason.
      notice={
        state.phase === 'failed' ? (
          <div className="rl-preview__blocked" role="alert">
            {t(FAILURE_KEYS[state.code] ?? 'readingLists.paste.failed.write')}
          </div>
        ) : null
      }
    />
  );
}

export default ReadingListPasteFlow;
