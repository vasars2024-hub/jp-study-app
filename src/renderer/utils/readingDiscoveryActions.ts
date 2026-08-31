/**
 * What Discover can genuinely perform for one discovery result.
 *
 * This is the host half of `resolveReadingWorkspaceActions`'s intersection, the
 * same shape `libraryHostedActions` plays for the Library drawer: the shared
 * registry decides which actions an *entry* supports, this decides which of
 * them this *surface* can actually carry out. Nothing is ever listed and
 * disabled — a button that can never fire is a claim the app does not keep.
 *
 * It is a function of the whole result rather than of the entry because
 * Discover's reach is decided by the provider's own `action`: the library
 * provider hands back an item id it can open, the curated-site provider hands
 * back a site whose detail modal *is* the web-extraction panel, and the two
 * remaining shapes are navigation to somewhere else entirely.
 */

import type { ReadingDiscoveryResult } from '../../shared/readingDiscovery';
import type { ReadingWorkspaceActionId } from '../../shared/readingWorkspaceActions';

/**
 * The Jiten deck id behind a result, or null when there is no usable one.
 *
 * `entry.source.id` is a string by schema and the mining handoff is typed
 * `deckId?: number` — `FlashcardsContent` ignores anything else, so a result
 * whose id does not parse must not offer the action at all rather than open the
 * mining panel onto nothing.
 */
export function discoveryJitenDeckId(result: ReadingDiscoveryResult): number | null {
  if (result.entry.source.kind !== 'jiten') return null;
  const deckId = Number(result.entry.source.id);
  return Number.isSafeInteger(deckId) && deckId > 0 ? deckId : null;
}

/**
 * The Jiten deck ids `JitenMiningPanel` would actually list.
 *
 * The panel's picker is `store.plan` filtered to entries with a `jitenDeckId`
 * (`JitenMiningPanel.tsx:39-42`), and its handoff intake looks the pending id
 * up in exactly that list. A deck that is not in the plan does not merely fail
 * to resolve — the fallback is `plan.find((entry) => entry.jitenDeckId != null)`
 * (`:56`), so the panel opens **silently pointed at a different title**.
 * Measured live: mining an unplanned deck from Discover selected an unrelated
 * planned deck without saying so.
 */
export function plannedJitenDeckIds(
  plan: readonly { jitenDeckId?: number | null }[] | null | undefined,
): Set<number> {
  const ids = new Set<number>();
  for (const entry of plan ?? []) {
    const deckId = entry?.jitenDeckId;
    if (typeof deckId === 'number' && Number.isSafeInteger(deckId)) ids.add(deckId);
  }
  return ids;
}

/**
 * The actions this surface has real wiring for, for this result.
 *
 * `import`, `plan`, `analyze`, `progress` and `mine` are absent because nothing
 * on Discover performs them. Planning in particular is deliberate: `plan` is
 * labelled "Add to plan", and Discover can only *navigate* to the planner — it
 * has no plan entry to upsert, since a discovery card is not a `NovelCandidate`
 * and building one here would fork `NovelsContent.ensurePlanned`'s mechanism.
 * That navigation stays outside the set, under its own honest label.
 *
 * `planned` is required rather than defaulted: a caller that has not loaded the
 * plan must say so, instead of silently getting a surface with one action
 * quietly missing from every Jiten card.
 */
export function discoveryHostedActions(
  result: ReadingDiscoveryResult,
  planned: ReadonlySet<number>,
): ReadingWorkspaceActionId[] {
  const hosted: ReadingWorkspaceActionId[] = [];
  // The library provider supplies the item id, and opening it is the same call
  // Continue Reading already makes.
  if (result.action.type === 'open-library') hosted.push('read');
  // `ReadingSiteDetail`'s fetch panel takes a chapter URL and turns it into
  // readable text; "Extract text" is what that surface does, under its name.
  if (result.action.type === 'inspect-site') hosted.push('extract');
  // The dictionary overlay is app-wide, so every card can be looked up.
  hosted.push('dictionary');
  // Same rule `libraryHostedActions` applies to mining: offer it only for the
  // decks the receiving panel would list. Erring towards withholding is the
  // safe direction — a plan changed elsewhere just means the action reappears
  // on the next search rather than opening onto the wrong book.
  const deckId = discoveryJitenDeckId(result);
  if (deckId !== null && planned.has(deckId)) hosted.push('jitenVocabulary');
  return hosted;
}

export interface ReadingDiscoveryNavigation {
  /** i18n key in all four catalogs. Never a literal — see CLAUDE.md's i18n rule. */
  labelKey: string;
  /** A name in `renderer/components/Icons.tsx`. */
  icon: string;
}

/**
 * The one navigation no registry id covers, or null when the set covers it.
 *
 * Two result shapes lead somewhere rather than doing something: an external
 * source page, and the planner. Neither is a Reading capability, so neither
 * gets a registry id — the same way the Library keeps "set cover from a page"
 * and "remove" outside the set. Label and icon travel together here for the
 * same reason they do in the registry: two call sites that pick them
 * separately are how one capability ends up with two faces.
 *
 * `open-plan` used to be painted with `novels.action.plan` ("Add to plan"),
 * which is the label of the Novels button that genuinely upserts a plan entry.
 * Clicking it here only opens the planner, so it is named for what it does.
 */
export function discoveryNavigation(
  result: ReadingDiscoveryResult,
): ReadingDiscoveryNavigation | null {
  if (result.action.type === 'open-external') {
    return { labelKey: 'novels.action.openSource', icon: 'external' };
  }
  if (result.action.type === 'open-plan') {
    return { labelKey: 'reading.discovery.openPlanner', icon: 'calendar' };
  }
  return null;
}
