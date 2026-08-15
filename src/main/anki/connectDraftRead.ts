// Read a live Anki collection into a draft over AnkiConnect — Phase 1 source
// adapter 2 of ANKI_DECK_WORKBENCH_PLAN.md, the transport half of
// `shared/ankiConnectDraft.ts`.
//
// Everything here is read-only: `findNotes`, `notesInfo`, `cardsInfo`,
// `deckNamesAndIds`, `findModelsByName` and `getDeckConfig`. Nothing in this file
// can mutate a collection, which is what makes it safe to run against the user's
// real Anki before the workbench has any confirmation UI.

import {
  buildAnkiConnectCollection,
  CONNECT_FILTERED_PROBE_LIMIT,
  CONNECT_READ_CHUNK,
  type AnkiConnectModel,
  type AnkiConnectNoteInfo,
  type ConnectDraftRequest,
  type ConnectDraftResult,
} from '../../shared/ankiConnectDraft';
import { ANKI_DRAFT_PAGE_SIZE, buildAnkiDraft } from '../../shared/ankiDraft';
import { stripFieldHtml } from '../../shared/apkgParse';
import { invoke, toUiError } from './client';

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Which of these deck names are filtered decks.
 *
 * `deckNamesAndIds` does not report `dyn`, and there is no bulk action that
 * does, so this is one round trip per deck — bounded, and only over the decks
 * the page's cards actually live in rather than the whole collection. A probe
 * that fails is treated as "not filtered": refusing the whole read because one
 * deck's options could not be fetched would be worse than a deck that misses its
 * read-only marking, and `filteredProbeTruncated` says when the list is partial.
 */
async function probeFilteredDecks(
  deckNames: readonly string[],
): Promise<{ filtered: string[]; truncated: boolean }> {
  const probed = deckNames.slice(0, CONNECT_FILTERED_PROBE_LIMIT);
  const filtered: string[] = [];
  for (const deck of probed) {
    try {
      const config = await invoke('getDeckConfig', { deck });
      if (Number(config?.dyn ?? 0) === 1) filtered.push(deck);
    } catch {
      // Left out of `filtered`, deliberately. See the note above.
    }
  }
  return { filtered, truncated: deckNames.length > probed.length };
}

export async function readConnectDraft(
  request: ConnectDraftRequest = {},
): Promise<ConnectDraftResult> {
  // An empty query is the whole collection. `deck:*` rather than `''` because
  // AnkiConnect answers an empty `findNotes` query with an error, not with
  // everything.
  const query = request.query?.trim() || 'deck:*';
  const offset = Math.max(0, Math.floor(request.noteOffset ?? 0));
  const limit = Math.max(1, Math.floor(request.noteLimit ?? ANKI_DRAFT_PAGE_SIZE));

  try {
    const apiVersion = await invoke('version', undefined);
    const noteIds = await invoke('findNotes', { query });
    const page = noteIds.slice(offset, offset + limit);

    const notes: AnkiConnectNoteInfo[] = [];
    for (const part of chunk(page, CONNECT_READ_CHUNK)) {
      notes.push(...((await invoke('notesInfo', { notes: part })) as AnkiConnectNoteInfo[]));
    }

    const cardIds = notes.flatMap((note) => note.cards ?? []);
    const cards = [];
    for (const part of chunk(cardIds, CONNECT_READ_CHUNK)) {
      cards.push(...(await invoke('cardsInfo', { cards: part })));
    }

    const deckNamesAndIds = await invoke('deckNamesAndIds', undefined);

    // Only the note types this page references. A collection here has 35 models
    // whose templates carry full HTML; fetching all of them to show 500 notes
    // would be most of the payload for none of the value.
    const modelNames = [...new Set(notes.map((note) => String(note.modelName ?? '')).filter(Boolean))];
    const models: AnkiConnectModel[] = modelNames.length
      ? await invoke('findModelsByName', { modelNames })
      : [];

    const referencedDecks = [...new Set(cards.map((card) => String(card.deckName ?? '')).filter(Boolean))];
    const { filtered, truncated } = await probeFilteredDecks(referencedDecks);

    const shape = buildAnkiConnectCollection({
      deckNamesAndIds,
      models,
      notes,
      cards,
      filteredDeckNames: filtered,
    });

    const draft = buildAnkiDraft(shape.raw, {
      source: {
        kind: 'ankiconnect',
        // Never a URL and never a path: this is displayed, and the endpoint is
        // the user's own machine.
        label: notes.find((note) => note.profile)?.profile ?? 'Anki',
        modifiedAtMs: Date.now(),
        // The matched note count plus the highest `mod` in the page: a commit
        // re-reads and refuses when either moved, which is what catches an edit
        // made in Anki while the preview was open.
        fingerprint: `connect:${noteIds.length}:${Math.max(0, ...notes.map((n) => Number(n.mod ?? 0)))}`,
      },
      normalize: stripFieldHtml,
    });

    return {
      ok: true,
      draft,
      noteOffset: offset,
      totalNotes: noteIds.length,
      connect: {
        query,
        apiVersion,
        profile: notes.find((note) => note.profile)?.profile,
        matchedNotes: noteIds.length,
        modelsRead: models.length,
        decksRead: Object.keys(deckNamesAndIds).length,
        filteredDecks: filtered,
        filteredProbeTruncated: truncated,
        unknownModelNames: shape.unknownModelNames,
        unknownDeckNames: shape.unknownDeckNames,
      },
    };
  } catch (err) {
    // `toUiError` is the repo's one mapping rule for this transport: unreachable
    // and collection-unavailable become their own messages rather than a raw
    // ECONNREFUSED the user cannot act on.
    return { ok: false, error: toUiError(err) };
  }
}
