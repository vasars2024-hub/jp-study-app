import type { CollectedFolder, CollectedTool } from '../../../shared/collectedTools';
import type { LibraryItem } from '../../../shared/types';
import type { NormalizedGrammarPoint } from '../../data/grammar';
import type { DeckFlashcard } from '../../flashcardDeck';
import type { LookupHistoryEntry } from '../../lookupHistory';
import type { SavedWord } from '../../savedWords';
import type { BlancMasterSearchContent } from './BlancMasterSearch';

export interface BlancMasterSourceLabels {
  deckCard: string;
  dictionaryJa: string;
  dictionaryZh: string;
  grammarJa: string;
  grammarZh: string;
  library: string;
  unfiled: string;
  book: string;
  manga: string;
  lookupCount: (count: number) => string;
}

export function blancMasterSourceLabels(
  t: (key: string, vars?: Record<string, string | number>) => string,
): BlancMasterSourceLabels {
  return {
    deckCard: t('blanc.masterSearch.source.deckCard'),
    dictionaryJa: t('blanc.masterSearch.source.dictionaryJa'),
    dictionaryZh: t('blanc.masterSearch.source.dictionaryZh'),
    grammarJa: t('blanc.masterSearch.source.grammarJa'),
    grammarZh: t('blanc.masterSearch.source.grammarZh'),
    library: t('blanc.masterSearch.source.library'),
    unfiled: t('blanc.masterSearch.source.unfiled'),
    book: t('blanc.masterSearch.source.book'),
    manga: t('blanc.masterSearch.source.manga'),
    lookupCount: (count) => t('blanc.masterSearch.source.lookupCount', { count }),
  };
}

export const BLANC_DICTIONARY_QUERY_EVENT = 'blanc:dictionary-query';

/**
 * A dictionary query asked for from outside the Dictionary tool (Master search,
 * a deep link). Held as state as well as announced: a mounted panel takes the
 * event; a panel that mounts afterwards — the usual case, since the toolbox
 * renders the tool only once it is chosen — takes it from here on mount. The
 * old route re-dispatched on the next animation frame and lost the race
 * whenever the panel registered its listener later than that.
 */
let pendingDictionaryQuery: string | null = null;

export function requestBlancDictionaryQuery(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  pendingDictionaryQuery = trimmed;
  window.dispatchEvent(new CustomEvent(BLANC_DICTIONARY_QUERY_EVENT, { detail: trimmed }));
}

/** The query waiting for a Dictionary panel, cleared as it is taken. */
export function takePendingBlancDictionaryQuery(): string | null {
  const query = pendingDictionaryQuery;
  pendingDictionaryQuery = null;
  return query;
}

export const BLANC_TRANSLATE_REQUEST_EVENT = 'blanc:translate-request';

/**
 * Text to translate asked for from outside the Translate tool (the `t` verb).
 * Same hand-off as the dictionary query above: held for a panel that has not
 * mounted yet, announced to one that has.
 */
let pendingTranslate: string | null = null;

export function requestBlancTranslate(text: string): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  pendingTranslate = trimmed;
  window.dispatchEvent(new CustomEvent(BLANC_TRANSLATE_REQUEST_EVENT, { detail: trimmed }));
}

export function takePendingBlancTranslate(): string | null {
  const text = pendingTranslate;
  pendingTranslate = null;
  return text;
}

/**
 * Every Blanc settings section Master search can jump to. The English here is
 * the source text and stays searchable as keywords; what is SHOWN comes from
 * `blancMasterSettings(t)` in the UI language.
 */
export const BLANC_MASTER_SETTINGS: BlancMasterSearchContent[] = [
  { kind: 'setting', id: 'interface', title: 'Interface', detail: 'Language, dark mode, and advanced controls', category: 'Settings' },
  { kind: 'setting', id: 'study', title: 'Study settings', detail: 'Study language, Anki, dictionaries, extension, and updates', category: 'Settings' },
  { kind: 'setting', id: 'models', title: 'Models', detail: 'Local and remote model configuration', category: 'Settings' },
  { kind: 'setting', id: 'memory', title: 'Memory', detail: 'Last tab and reopening the last book', category: 'Settings' },
  { kind: 'setting', id: 'lockscreen', title: 'Lockscreen', detail: 'PIN and lock requirements', category: 'Settings' },
  { kind: 'setting', id: 'control-center', title: 'Control Center', detail: 'Search, import, export, and reset toolbox settings', category: 'Settings' },
  { kind: 'setting', id: 'theme', title: 'Theme', detail: 'Preset and color token customization', category: 'Settings' },
  { kind: 'setting', id: 'custom-css', title: 'Custom CSS', detail: 'Guarded custom Blanc styles', category: 'Settings' },
  { kind: 'setting', id: 'launcher-order', title: 'Launcher order', detail: 'Tool and category order', category: 'Settings' },
  { kind: 'setting', id: 'tool-visibility', title: 'Tool visibility', detail: 'Enabled and hidden toolbox modules', category: 'Settings' },
  { kind: 'setting', id: 'shortcuts', title: 'Keyboard shortcuts', detail: 'Toolbox command bindings and conflicts', category: 'Settings' },
  { kind: 'setting', id: 'mode', title: 'Blanc mode', detail: 'Start in Blanc only, open Study OS, or exit Blanc', category: 'Settings' },
  { kind: 'setting', id: 'mechanics', title: 'Speed & memory', detail: 'Warm tools, RAM budget, Flow sprint and Capture inbox', category: 'Settings' },
];

/** Settings whose labels live outside `blanc.refine.setting.*`. */
const SETTING_KEY_OVERRIDES: Record<string, string> = {
  mechanics: 'blanc.mech.setting',
};

/** The settings index in the UI language; the English source stays a search keyword. */
export function blancMasterSettings(
  t: (key: string, vars?: Record<string, string | number>) => string,
): BlancMasterSearchContent[] {
  const category = t('blanc.masterSearch.group.settings');
  return BLANC_MASTER_SETTINGS.map((setting) => {
    const titleKey = SETTING_KEY_OVERRIDES[setting.id] ?? `blanc.refine.setting.${setting.id}`;
    const detailKey = `${titleKey}.detail`;
    const title = t(titleKey);
    const detail = t(detailKey);
    return {
      ...setting,
      title: title === titleKey ? setting.title : title,
      detail: detail === detailKey ? setting.detail : detail,
      category,
      keywords: [setting.title, setting.detail],
    };
  });
}

function folderPath(folderId: string | null, folders: CollectedFolder[], unfiled = 'Unfiled'): string {
  if (!folderId) return unfiled;
  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  const folder = folderById.get(folderId);
  if (!folder) return unfiled;
  const parent = folder.parentFolderId ? folderById.get(folder.parentFolderId) : undefined;
  return parent ? `${parent.name} / ${folder.name}` : folder.name;
}

export function appDrawerMasterContent(
  tools: CollectedTool[],
  folders: CollectedFolder[],
  unfiled?: string,
): BlancMasterSearchContent[] {
  return tools.map((tool) => {
    const location = folderPath(tool.folderId, folders, unfiled);
    const tags = tool.tags ?? [];
    const note = tool.note?.trim();
    return {
      kind: 'shortcut',
      id: tool.id,
      title: tool.name,
      detail: [tool.kind, location, note].filter(Boolean).join(' · '),
      category: location,
      keywords: [tool.url, tool.kind, ...tags],
    };
  });
}

export function savedWordMasterContent(words: SavedWord[], category = 'Study word'): BlancMasterSearchContent[] {
  return words.map((word) => ({
    kind: 'saved-word',
    id: word.word,
    title: word.word,
    detail: [word.reading, word.meaning].filter(Boolean).join(' · '),
    category,
    keywords: [word.reading, word.meaning],
  }));
}

export function deckCardMasterContent(
  cards: readonly DeckFlashcard[],
  labels: BlancMasterSourceLabels,
): BlancMasterSearchContent[] {
  return cards.map((card) => ({
    kind: 'deck-card',
    id: card.id,
    title: card.word || card.front || card.id,
    detail: [card.reading, card.meaning || card.back, card.bookTitle || card.folder || labels.deckCard]
      .filter(Boolean)
      .join(' · '),
    category: labels.deckCard,
    keywords: [card.front, card.back, card.sentence, card.bookTitle, card.folder, card.source]
      .filter((value): value is string => Boolean(value)),
  }));
}

export function dictionaryEntryMasterContent(
  entries: readonly LookupHistoryEntry[],
  labels: BlancMasterSourceLabels,
): BlancMasterSearchContent[] {
  return entries.map((entry) => ({
    kind: 'dictionary-entry',
    id: `${entry.lang}:${entry.lemma}`,
    title: entry.lemma,
    detail: [entry.reading, entry.meaning, entry.jlptLevel, entry.count > 1 ? labels.lookupCount(entry.count) : '']
      .filter(Boolean)
      .join(' · '),
    category: entry.lang === 'zh' ? labels.dictionaryZh : labels.dictionaryJa,
    keywords: [entry.query, entry.context].filter((value): value is string => Boolean(value)),
    language: entry.lang,
  }));
}

export function grammarPointMasterContent(
  points: readonly NormalizedGrammarPoint[],
  labels: BlancMasterSourceLabels,
): BlancMasterSearchContent[] {
  return points.map((point) => ({
    kind: 'grammar-point',
    id: point.id,
    title: point.title,
    detail: `${point.level} · ${point.meaning}`,
    category: point.lang === 'zh' ? labels.grammarZh : labels.grammarJa,
    keywords: [point.structure, point.explanation, point.level, ...(point.categories ?? [])],
    language: point.lang === 'zh' ? 'zh' : 'ja',
  }));
}

export function libraryItemMasterContent(
  items: readonly LibraryItem[],
  labels: BlancMasterSourceLabels,
): BlancMasterSearchContent[] {
  return items.map((item) => ({
    kind: 'library-item',
    id: item.id,
    title: item.title,
    detail: [item.kind === 'manga' ? labels.manga : labels.book, item.folder || labels.unfiled]
      .filter(Boolean)
      .join(' · '),
    category: labels.library,
    keywords: [item.sourcePath, item.readingSource?.workTitle, item.readingSource?.chapterTitle]
      .filter((value): value is string => Boolean(value)),
  }));
}

export function readBlancDictionaryQuery(event: Event): string | null {
  const detail = (event as CustomEvent<unknown>).detail;
  return typeof detail === 'string' && detail.trim() ? detail.trim() : null;
}
