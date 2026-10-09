/**
 * "Already in your deck?" for the Chrome extension's popup entries.
 *
 * Asks AnkiConnect `canAddNotes` with the term in the note type's first (sort)
 * field — the field Anki's own duplicate check compares, so `false` here is
 * exactly the refusal a later `addNote` with `allowDuplicate: false` would meet.
 * Kept out of anki/index.ts (under active edit elsewhere); it only reads.
 *
 * A profile that maps the term to some other field (`fieldMap.term`) keeps the
 * word where `canAddNotes` never looks, so for that target the check is a
 * read-only `findNotes` on that field within the note type instead.
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

export interface DuplicateCheckTarget {
  deckName: string;
  modelName: string;
  /** The field the term is written into, when it is not the note type's first field. */
  termField?: string;
}

/**
 * `checkAnkiDuplicates` for an IPC caller (the dictionary's "in Anki" marker):
 * the arguments arrive untyped from the renderer, so anything that is not a
 * string list and a deck/note-type pair is treated as empty rather than trusted.
 */
export function checkAnkiDuplicatesFromIpc(terms: unknown, target: unknown): Promise<DuplicateCheckResult> {
  const list = Array.isArray(terms) ? terms.filter((term): term is string => typeof term === 'string') : [];
  const t = target && typeof target === 'object'
    ? (target as { deckName?: unknown; modelName?: unknown; termField?: unknown })
    : {};
  const termField = typeof t.termField === 'string' ? t.termField.trim().slice(0, 120) : '';
  return checkAnkiDuplicates(list, {
    deckName: typeof t.deckName === 'string' ? t.deckName : '',
    modelName: typeof t.modelName === 'string' ? t.modelName : '',
    ...(termField ? { termField } : {}),
  });
}

/**
 * One value for an Anki search: quoted, with the characters the search syntax
 * gives meaning to (`"`, `\`, `*`, `_`) escaped so the word is matched literally.
 */
export function ankiSearchLiteral(field: string, value: string): string {
  const escape = (text: string): string => text.replace(/[\\"*_]/g, (ch) => `\\${ch}`);
  return `"${escape(field)}:${escape(value)}"`;
}

export async function checkAnkiDuplicates(
  terms: readonly string[],
  target: DuplicateCheckTarget,
): Promise<DuplicateCheckResult> {
  const list = [...new Set(terms.map((t) => String(t || '').trim()).filter(Boolean))].slice(0, 50);
  if (!list.length || !target.deckName || !target.modelName) return { ok: true, duplicates: {} };
  try {
    const fields = (await invoke('modelFieldNames', { modelName: target.modelName })) ?? [];
    const sortField = fields[0];
    if (!sortField) return { ok: false, duplicates: {}, error: 'model has no fields' };
    const termField = target.termField && fields.includes(target.termField) ? target.termField : sortField;
    const duplicates: Record<string, boolean> = {};
    if (termField !== sortField) {
      // Same scope as `canAddNotes`' default (the whole collection, this note
      // type), only on the field the profile actually writes the term into.
      for (const term of list) {
        const query = `${ankiSearchLiteral('note', target.modelName)} ${ankiSearchLiteral(termField, term)}`;
        const ids = await invoke('findNotes', { query });
        duplicates[term] = Array.isArray(ids) && ids.length > 0;
      }
      return { ok: true, duplicates };
    }
    const verdicts = await invoke('canAddNotes', {
      notes: list.map((term) => ({
        deckName: target.deckName,
        modelName: target.modelName,
        fields: { [sortField]: escapeForAnki(term) },
        tags: [],
        options: { allowDuplicate: false as const },
      })),
    });
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
