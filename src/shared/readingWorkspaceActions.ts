/**
 * The one action set every Reading surface offers.
 *
 * Track 4 asks for "planning, import/download, web extraction, comprehension
 * analysis, Novel Reader, progress, dictionary, mining, and Jiten vocabulary"
 * as a *single* set rather than per-surface buttons, and the tree shows exactly
 * the shape it is complaining about: `NovelsContent` names them
 * `analyzeSelected` / `mineJitenSelected` / `planSelected`, the Finder's site
 * modal calls the same capabilities `reading.fetch.go` and
 * `reading.fetch.openInReader`, and the Library drawer offered only
 * `library.open`. The same capability therefore had three names, three icons
 * and three orderings depending on which door the user came through.
 *
 * This module is the vocabulary those doors share. It is deliberately pure and
 * host-free: it decides *which* actions a card can meaningfully offer, not how
 * any of them are performed. Performing them stays with the surface that owns
 * the wiring, which is what keeps this from becoming a second dispatch layer.
 *
 * ## The honesty rule
 *
 * `resolveReadingWorkspaceActions` intersects two things: what the *entry*
 * supports and what the *host* can actually perform. An action is rendered only
 * when both are true. It is never rendered permanently disabled, because a
 * button that can never be pressed is a claim the app cannot keep — this repo
 * has an entire audit vocabulary for that failure. A host that cannot yet
 * perform an action simply does not list it, and the action stays invisible
 * until the wiring exists.
 */

import type { ReadingWorkspaceEntry } from './readingWorkspace';

export const READING_WORKSPACE_ACTIONS = [
  'read',
  'progress',
  'import',
  'extract',
  'plan',
  'analyze',
  'dictionary',
  'mine',
  'jitenVocabulary',
] as const;

export type ReadingWorkspaceActionId = (typeof READING_WORKSPACE_ACTIONS)[number];

/**
 * Why an action exists, which is also how the set is ordered and separated.
 *
 * `read` is what you do with something you already have, `acquire` is how you
 * come to have it, `study` is what you do to it afterwards. Ordering by this
 * rather than alphabetically means the primary action of any card is always
 * first, on every surface.
 */
export type ReadingWorkspaceActionGroup = 'read' | 'acquire' | 'study';

export interface ReadingWorkspaceActionSpec {
  id: ReadingWorkspaceActionId;
  group: ReadingWorkspaceActionGroup;
  /** i18n key in all four catalogs. Never a literal — see CLAUDE.md's i18n rule. */
  labelKey: string;
  /** A name in `renderer/components/Icons.tsx`; kept here so one action looks the same everywhere. */
  icon: string;
  /** The one action a card leads with when it is available at all. */
  primary?: true;
}

/**
 * The registry, in render order.
 *
 * Order is data, not a per-surface decision: two surfaces that sort the same
 * capabilities differently are the per-surface problem in a subtler form.
 */
export const READING_WORKSPACE_ACTION_SPECS: readonly ReadingWorkspaceActionSpec[] = [
  { id: 'read', group: 'read', labelKey: 'reading.action.read', icon: 'novels', primary: true },
  { id: 'progress', group: 'read', labelKey: 'reading.action.progress', icon: 'bookmark' },
  { id: 'import', group: 'acquire', labelKey: 'reading.action.import', icon: 'download' },
  { id: 'extract', group: 'acquire', labelKey: 'reading.action.extract', icon: 'globe' },
  { id: 'plan', group: 'acquire', labelKey: 'reading.action.plan', icon: 'calendar' },
  { id: 'analyze', group: 'study', labelKey: 'reading.action.analyze', icon: 'scan' },
  { id: 'dictionary', group: 'study', labelKey: 'reading.action.dictionary', icon: 'dictionary' },
  { id: 'mine', group: 'study', labelKey: 'reading.action.mine', icon: 'flashcards' },
  {
    id: 'jitenVocabulary',
    group: 'study',
    labelKey: 'reading.action.jitenVocabulary',
    icon: 'sparkle',
  },
];

const SPEC_BY_ID = new Map<ReadingWorkspaceActionId, ReadingWorkspaceActionSpec>(
  READING_WORKSPACE_ACTION_SPECS.map((spec) => [spec.id, spec]),
);

export function readingWorkspaceActionSpec(
  id: ReadingWorkspaceActionId,
): ReadingWorkspaceActionSpec {
  const spec = SPEC_BY_ID.get(id);
  // The map is built from the same literal tuple the type comes from, so this
  // cannot be reached from typed code. It exists so an untyped IPC/plugin call
  // fails loudly rather than rendering a button with an undefined label.
  if (!spec) throw new Error(`unknown reading workspace action: ${id}`);
  return spec;
}

/** Formats whose bytes contain text a tokenizer can read without OCR first. */
function hasTextLayer(entry: ReadingWorkspaceEntry): boolean {
  const format = entry.edition?.format;
  return format === 'epub' || format === 'text';
}

function isWebOrigin(entry: ReadingWorkspaceEntry): boolean {
  return entry.source.kind === 'web' || entry.source.kind === 'curated-site';
}

/**
 * Does this action mean anything for this card?
 *
 * Every rule below is a real constraint, not a taste: mining and comprehension
 * analysis run over tokens, so a scanned page series has nothing to give them
 * until it has been OCR'd; importing something already in the library is a
 * no-op; a Jiten deck's vocabulary list only exists for a Jiten-sourced card.
 */
export function readingWorkspaceActionApplies(
  id: ReadingWorkspaceActionId,
  entry: ReadingWorkspaceEntry,
): boolean {
  switch (id) {
    case 'read':
      return entry.availability === 'readable';
    case 'progress':
      // Progress is recorded against a local item; a remote card has nowhere
      // to keep it.
      return entry.itemId !== null;
    case 'import':
      return entry.availability === 'importable';
    case 'extract':
      // Extraction turns a page of a site into readable text. Something already
      // readable has nothing left to extract.
      return isWebOrigin(entry) && entry.availability !== 'readable';
    case 'plan':
      return entry.availability !== 'unavailable';
    case 'analyze':
      return hasTextLayer(entry) || (isWebOrigin(entry) && entry.availability === 'external');
    case 'dictionary':
      return Boolean(entry.work.titleNative || entry.work.title);
    case 'mine':
      // Narrower than `hasTextLayer` on purpose: the mining pipeline reads an
      // EPUB's sections. A plain-text item has a token stream but no book
      // structure for it to walk, so it is analysable without being minable.
      return (
        entry.itemId !== null &&
        entry.availability === 'readable' &&
        entry.edition?.format === 'epub'
      );
    case 'jitenVocabulary':
      return entry.source.kind === 'jiten';
    default:
      return false;
  }
}

/**
 * The actions to render, in registry order.
 *
 * `hosted` is what the calling surface has real wiring for. Passing an id the
 * entry does not support is harmless — it is filtered — so a host may list its
 * whole repertoire once and let the card decide.
 */
export function resolveReadingWorkspaceActions(
  entry: ReadingWorkspaceEntry,
  hosted: Iterable<ReadingWorkspaceActionId>,
): ReadingWorkspaceActionSpec[] {
  const available = new Set(hosted);
  return READING_WORKSPACE_ACTION_SPECS.filter(
    (spec) => available.has(spec.id) && readingWorkspaceActionApplies(spec.id, entry),
  );
}

/** Groups the resolved set while preserving registry order inside each group. */
export function groupReadingWorkspaceActions(
  actions: readonly ReadingWorkspaceActionSpec[],
): Array<{ group: ReadingWorkspaceActionGroup; actions: ReadingWorkspaceActionSpec[] }> {
  const groups: ReadingWorkspaceActionGroup[] = ['read', 'acquire', 'study'];
  return groups
    .map((group) => ({ group, actions: actions.filter((spec) => spec.group === group) }))
    .filter((bucket) => bucket.actions.length > 0);
}
