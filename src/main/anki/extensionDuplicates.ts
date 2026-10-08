/**
 * "Already in your deck?" for the Chrome extension's popup entries.
 *
 * Asks AnkiConnect `canAddNotes` with the term in the note type's first (sort)
 * field — the field Anki's own duplicate check compares, so `false` here is
 * exactly the refusal a later `addNote` with `allowDuplicate: false` would meet.
 * Kept out of anki/index.ts (under active edit elsewhere); it only reads.
 */
import { invoke, isUnreachable } from './client';
import { escapeForAnki } from './fieldMapper';

export interface DuplicateCheckResult {
  ok: boolean;
  /** term -> true when Anki already has a note with that sort field. */
  duplicates: Record<string, boolean>;
  error?: string;
  unreachable?: boolean;
}

export async function checkAnkiDuplicates(
  terms: readonly string[],
  target: { deckName: string; modelName: string },
): Promise<DuplicateCheckResult> {
  const list = [...new Set(terms.map((t) => String(t || '').trim()).filter(Boolean))].slice(0, 50);
  if (!list.length || !target.deckName || !target.modelName) return { ok: true, duplicates: {} };
  try {
    const fields = (await invoke('modelFieldNames', { modelName: target.modelName })) ?? [];
    const sortField = fields[0];
    if (!sortField) return { ok: false, duplicates: {}, error: 'model has no fields' };
    const verdicts = await invoke('canAddNotes', {
      notes: list.map((term) => ({
        deckName: target.deckName,
        modelName: target.modelName,
        fields: { [sortField]: escapeForAnki(term) },
        tags: [],
        options: { allowDuplicate: false as const },
      })),
    });
    const duplicates: Record<string, boolean> = {};
    list.forEach((term, i) => {
      duplicates[term] = Array.isArray(verdicts) ? verdicts[i] === false : false;
    });
    return { ok: true, duplicates };
  } catch (err) {
    return {
      ok: false,
      duplicates: {},
      unreachable: isUnreachable(err),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
