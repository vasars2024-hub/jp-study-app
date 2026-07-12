import { guessColumnMapping, type DeckColumnMapping, type DeckFieldKey } from '../../../shared/deckImport';

/** Re-map deck column indices after a column reorder. */
export function remapMappingOnReorder(
  mapping: DeckColumnMapping,
  fromIndex: number,
  toIndex: number,
): DeckColumnMapping {
  if (fromIndex === toIndex) return mapping;
  const width = Math.max(
    ...Object.keys(mapping).map(Number),
    fromIndex,
    toIndex,
    0,
  ) + 1;
  const arr: DeckFieldKey[] = Array.from({ length: width }, (_, i) => mapping[i] ?? 'skip');
  const [moved] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, moved);
  const next: DeckColumnMapping = {};
  arr.forEach((field, i) => {
    next[i] = field;
  });
  return next;
}

/** Re-map after deleting a column. */
export function remapMappingOnDelete(mapping: DeckColumnMapping, deletedIndex: number): DeckColumnMapping {
  const next: DeckColumnMapping = {};
  for (const [key, field] of Object.entries(mapping)) {
    const col = Number(key);
    if (col < deletedIndex) next[col] = field;
    else if (col > deletedIndex) next[col - 1] = field;
  }
  return next;
}

/** Re-map after inserting a column at index. */
export function remapMappingOnInsert(mapping: DeckColumnMapping, atIndex: number): DeckColumnMapping {
  const next: DeckColumnMapping = {};
  for (const [key, field] of Object.entries(mapping)) {
    const col = Number(key);
    if (col < atIndex) next[col] = field;
    else next[col + 1] = field;
  }
  next[atIndex] = 'skip';
  return next;
}

/** Merge mapping after split: original column becomes two, second is skip. */
export function remapMappingOnSplit(mapping: DeckColumnMapping, colIndex: number): DeckColumnMapping {
  const next: DeckColumnMapping = {};
  for (const [key, field] of Object.entries(mapping)) {
    const col = Number(key);
    if (col < colIndex) next[col] = field;
    else if (col === colIndex) {
      next[col] = field;
      next[col + 1] = 'skip';
    } else next[col + 1] = field;
  }
  return next;
}

/** Preserve user mappings where possible, then guess gaps from headers. */
export function refreshMapping(
  headers: string[],
  prev: DeckColumnMapping,
): DeckColumnMapping {
  const guessed = guessColumnMapping(headers);
  const next: DeckColumnMapping = { ...guessed };
  for (let i = 0; i < headers.length; i++) {
    if (prev[i] && prev[i] !== 'skip') next[i] = prev[i];
  }
  return next;
}
