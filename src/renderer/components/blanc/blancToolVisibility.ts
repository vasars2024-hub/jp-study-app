/**
 * Which Blanc toolbox tools the launcher rail may list.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * The defect this exists to fix, measured live on `/blanc-harness.html`
 * (2026-09-06): the rail listed **32 of Blanc's 42 tools**. Absent, by name:
 * Notebook, Translate, Music, Novels, Discover, Games, Immersion, Visualizer
 * and Local AI Agent.
 *
 * All nine are the Pillar 2 ports — the whole point of the Blanc track — and
 * none of them could be opened from the launcher. They were reachable only by
 * a `toolbox:open-tool` deep link or by having been the last tool open, which
 * is why the gap survived: every turn that verified one of these panels drove
 * it through a deep link and saw it render perfectly.
 *
 * The cause is a representation gap, not a filter anyone wrote wrong.
 * `ToolboxSettings.enabledTools`, `hiddenTools` and `favoriteTools` are typed
 * `ToolboxModuleId[]` and `sanitizeModuleList` re-filters them against
 * `TOOLBOX_MODULES` on every load. A Blanc-only id has no `TOOLBOX_MODULES`
 * entry, so it can never be a member of any of those lists — and the rail
 * gated on `enabledTools.includes(id)`. `coverage` was carved out of that gate
 * by name and was the only Blanc-only tool that survived.
 *
 * So the exemption is derived from the registry rather than re-listed here: a
 * tool the registry does not govern cannot be governed by the user's
 * visibility settings, and a port that later earns a `TOOLBOX_MODULES` entry
 * starts obeying them the same day, with no edit to this file.
 *
 * What this deliberately does NOT do: surface a tool the registry DOES govern
 * and marks unavailable. `automation-builder` is `status: 'experimental'`, so
 * it is absent from `READY_MODULE_IDS`, absent from the default `enabledTools`
 * and stays out of the rail. That is the negative control for this whole
 * change — if it appears, the exemption is too wide.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { getToolboxModule, type ToolboxModuleId } from '../../../shared/toolboxRegistry';
import { isDeveloperOnlyTool } from './blancDeveloperTools';

/**
 * Is this tool id governed by `TOOLBOX_MODULES`, and therefore by the user's
 * enabled/hidden module lists?
 *
 * `false` means Blanc-only: the settings schema has no way to name it.
 */
export function isRegistryGovernedTool(id: string): boolean {
  return getToolboxModule(id as ToolboxModuleId) !== undefined;
}

/** The parts of `ToolboxSettings` that decide whether a tool may be listed. */
export interface ToolVisibilitySettings {
  enabledTools: readonly string[];
  hiddenTools: readonly string[];
  showHiddenToolsInSearch: boolean;
  /**
   * Blanc's developer flag (blancDeveloperTools.ts). Developer-only tools such
   * as `coverage` are listed only when it is on; absent means off.
   */
  developerTools?: boolean;
}

/**
 * May the launcher list this tool?
 *
 * `searching` is whether the user has typed a query, which is the only state
 * in which a hidden tool may come back — and only when they asked for that.
 */
export function isToolLaunchable(
  id: string,
  settings: ToolVisibilitySettings,
  searching: boolean,
): boolean {
  if (isDeveloperOnlyTool(id)) return settings.developerTools === true;
  if (!isRegistryGovernedTool(id)) return true;
  if (!settings.enabledTools.includes(id)) return false;
  if (settings.hiddenTools.includes(id) && !(searching && settings.showHiddenToolsInSearch)) {
    return false;
  }
  return true;
}

/**
 * The pinned-tools list, reassembled from the two stores that between them can
 * hold it.
 *
 * The same representation gap bites here, and it is why this merge exists
 * rather than one list winning. `ToolboxSettings.favoriteTools` cannot name a
 * Blanc-only tool, so pinning Discover wrote it to both stores, the settings
 * write was sanitised away, the change event fired, and the effect that
 * re-reads `toolboxSettings.favoriteTools` put the sanitised list back — the
 * pin visibly reverted a tick after the click. `coverage` was the one tool
 * spared, by refusing to pin it at all.
 *
 * So each store is authoritative for exactly what it can represent:
 *   - a registry-governed id is pinned iff `fromSettings` says so, which keeps
 *     the Settings UI in charge of the tools it can actually see;
 *   - a Blanc-only id is pinned iff Blanc's own list says so, that being the
 *     only store able to hold one.
 *
 * Order follows Blanc's local list, which is rewritten on every toggle and so
 * records the user's most-recent-first arrangement; anything pinned elsewhere
 * and not yet seen locally is appended rather than dropped.
 */
export function mergeFavoriteTools(
  fromSettings: readonly string[],
  fromBlancLocal: readonly string[],
  limit = 8,
): string[] {
  const governed = new Set(fromSettings.filter(isRegistryGovernedTool));
  const pinned = (id: string): boolean =>
    isRegistryGovernedTool(id) ? governed.has(id) : true;

  const merged: string[] = [];
  const seen = new Set<string>();
  for (const id of fromBlancLocal) {
    if (seen.has(id) || !pinned(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  for (const id of governed) {
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(id);
  }
  return merged.slice(0, limit);
}
