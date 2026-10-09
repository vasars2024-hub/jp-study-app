/**
 * How dictionary results are laid out once the lookup has ordered them:
 * Yomitan's "group by term" versus "merge", and whether the dictionaries after
 * the first are collapsed until asked for.
 *
 * Which dictionaries answer, and in which order, is not decided here — that is
 * the source list in Settings (enable/disable, up/down, drag), which the lookup
 * itself applies (`dictionaries.priority`, `dict_pair_priority`). This module is
 * the presentation half, shared by the Dictionary page, the popup and the
 * browser extension's `/v1/scan` and `/v1/lookup` answers, so the three cannot
 * disagree about what "merged" means.
 *
 *  - `grouped` (Yomitan's default, "group by term"): one card per headword
 *    (written form + reading), and inside it one section per dictionary, in the
 *    user's dictionary order. With `collapseSecondary`, only the first section
 *    is open; the rest sit behind "show N more dictionaries".
 *  - `merged`: one card per headword with a single numbered list of every
 *    dictionary's senses, each sense labelled with the dictionary it came from.
 */

export type DictResultMode = 'grouped' | 'merged';

export interface DictDisplayPrefs {
  mode: DictResultMode;
  /** Grouped mode: show only the first dictionary of each headword until expanded. */
  collapseSecondary: boolean;
}

export const DEFAULT_DICT_DISPLAY_PREFS: DictDisplayPrefs = Object.freeze({
  mode: 'grouped',
  collapseSecondary: true,
}) as DictDisplayPrefs;

/** Anything read from disk or IPC, reduced to a valid preference set. */
export function normalizeDictDisplayPrefs(raw: unknown): DictDisplayPrefs {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    mode: o.mode === 'merged' ? 'merged' : 'grouped',
    collapseSecondary: typeof o.collapseSecondary === 'boolean'
      ? o.collapseSecondary
      : DEFAULT_DICT_DISPLAY_PREFS.collapseSecondary,
  };
}

/** The fields this module reads from a sense. */
export interface DisplaySense {
  partsOfSpeech?: string[];
  definitions?: string[];
  tags?: string[];
  /** Dictionary the sense came from, when the lookup merged several into one entry. */
  source?: string;
  /** Per-sense structured HTML, when the dictionary marked its senses. */
  html?: string;
}

/** The fields this module reads from an entry. */
export interface DisplayEntry<S extends DisplaySense = DisplaySense> {
  word: string;
  reading: string;
  source?: string;
  senses: S[];
  glossaryHtml?: string;
}

export interface DictSection<S extends DisplaySense = DisplaySense> {
  /** Dictionary title, or '' when the source could not name one. */
  source: string;
  senses: S[];
  /** A whole-entry structured glossary, kept with the dictionary that wrote it. */
  glossaryHtml?: string;
  /** Index (into the caller's list) of the entry this section came from first. */
  entryIndex: number;
}

export interface DictCard<S extends DisplaySense = DisplaySense> {
  key: string;
  /** Indexes of every entry folded into this card, first = the headline entry. */
  entryIndexes: number[];
  sections: DictSection<S>[];
}

/** Headword identity: a card per written form + reading. */
export function headwordKey(entry: { word: string; reading?: string }): string {
  return `${entry.word.normalize('NFC').trim()}\u0000${(entry.reading || entry.word).normalize('NFC').trim()}`;
}

/** A rank per dictionary title from an ordered title list; unknown titles sort after known ones, stably. */
export function dictionaryRanker(orderedTitles: readonly string[] | undefined): (title: string) => number {
  const rank = new Map<string, number>();
  (orderedTitles ?? []).forEach((title, index) => {
    if (!rank.has(title)) rank.set(title, index);
  });
  return (title: string) => rank.get(title) ?? Number.MAX_SAFE_INTEGER;
}

/**
 * One card per headword, in first-appearance order (the lookup's own ranking),
 * each split into per-dictionary sections in dictionary order.
 *
 * A merged database entry carries `source` on its senses; a plain entry is one
 * section credited to its own `source`. Two entries for the same headword from
 * the same dictionary become one section.
 */
export function buildDictCards<E extends DisplayEntry>(
  items: ReadonlyArray<{ entry: E; index: number }>,
  rankOf: (title: string) => number = () => 0,
): DictCard<E['senses'][number]>[] {
  type S = E['senses'][number];
  const cards = new Map<string, DictCard<S>>();
  for (const { entry, index } of items) {
    const key = headwordKey(entry);
    const card: DictCard<S> = cards.get(key) ?? { key, entryIndexes: [], sections: [] };
    cards.set(key, card);
    card.entryIndexes.push(index);
    const primary = entry.source ?? '';
    const sectionFor = (source: string): DictSection<S> => {
      let section = card.sections.find((candidate) => candidate.source === source);
      if (!section) {
        section = { source, senses: [], entryIndex: index };
        card.sections.push(section);
      }
      return section;
    };
    if (entry.glossaryHtml) {
      const section = sectionFor(primary);
      section.glossaryHtml = section.glossaryHtml ? `${section.glossaryHtml}<br>${entry.glossaryHtml}` : entry.glossaryHtml;
    }
    for (const sense of entry.senses) sectionFor(sense.source || primary).senses.push(sense);
    if (!entry.senses.length && !entry.glossaryHtml) sectionFor(primary);
  }
  return [...cards.values()].map((card) => {
    const order = card.sections.map((section, position) => ({ section, position }));
    order.sort((a, b) => rankOf(a.section.source) - rankOf(b.section.source) || a.position - b.position);
    return { ...card, sections: order.map(({ section }) => section) };
  });
}

/** The sections a grouped card shows before "show N more", and how many wait behind it. */
export function visibleSections<S extends DisplaySense>(
  card: DictCard<S>,
  prefs: DictDisplayPrefs,
  expanded: boolean,
): { shown: DictSection<S>[]; hidden: number } {
  if (prefs.mode !== 'grouped' || !prefs.collapseSecondary || expanded || card.sections.length <= 1) {
    return { shown: card.sections, hidden: 0 };
  }
  return { shown: card.sections.slice(0, 1), hidden: card.sections.length - 1 };
}

/** The entry fields the wire arrangement reads; any other field passes through untouched. */
export interface WireEntry extends DisplayEntry {
  isCommon?: boolean;
  frequency?: number;
  jlpt?: string[];
  /** Grouped mode with collapsing on: a secondary dictionary the popup may fold away. */
  collapsed?: boolean;
}

/**
 * The extension's entry list under the user's display settings.
 *
 * Entries of one headword are brought together (first-appearance order between
 * headwords, dictionary order within one). Grouped mode keeps them as separate
 * entries and marks every one after the first `collapsed` when collapsing is on;
 * merged mode folds them into a single entry whose senses each name their
 * dictionary.
 */
export function arrangeWireEntries<E extends WireEntry>(
  entries: readonly E[],
  prefs: DictDisplayPrefs,
  orderedTitles?: readonly string[],
): Array<E & { collapsed?: boolean }> {
  const rankOf = dictionaryRanker(orderedTitles);
  const groups = new Map<string, Array<{ entry: E; position: number }>>();
  entries.forEach((entry, position) => {
    const key = headwordKey(entry);
    const list = groups.get(key) ?? [];
    list.push({ entry, position });
    groups.set(key, list);
  });
  const out: Array<E & { collapsed?: boolean }> = [];
  for (const list of groups.values()) {
    list.sort((a, b) => rankOf(a.entry.source ?? '') - rankOf(b.entry.source ?? '') || a.position - b.position);
    if (prefs.mode === 'merged' && list.length > 1) {
      const [first, ...rest] = list.map(({ entry }) => entry);
      const senses = list.flatMap(({ entry }) =>
        entry.senses.map((sense) => (sense.source || !entry.source ? sense : { ...sense, source: entry.source })));
      const html = list.map(({ entry }) => entry.glossaryHtml).filter((value): value is string => Boolean(value));
      const merged = {
        ...first,
        senses,
        ...(html.length ? { glossaryHtml: html.join('<br>') } : {}),
        isCommon: list.some(({ entry }) => entry.isCommon === true),
      } as E;
      const ranks = list.map(({ entry }) => entry.frequency).filter((n): n is number => typeof n === 'number');
      if (ranks.length) merged.frequency = Math.min(...ranks);
      const jlpt = [...new Set([first, ...rest].flatMap((entry) => entry.jlpt ?? []))];
      if (jlpt.length) merged.jlpt = jlpt;
      out.push(merged);
      continue;
    }
    list.forEach(({ entry }, index) => {
      out.push(prefs.mode === 'grouped' && prefs.collapseSecondary && index > 0 ? { ...entry, collapsed: true } : entry);
    });
  }
  return out;
}
