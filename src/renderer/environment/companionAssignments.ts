/**
 * Reconciling companion routine assignments across windows. Audit item 6.2.
 *
 * `CompanionLayer` keeps its working companion list in a ref and autosaves it — positions,
 * motion, mood. Routine assignments are not its data: they are edited in Settings ›
 * Companions, which writes them into the same `companions` array on `jp-os-environment-v1`.
 *
 * That makes the key a two-owner key, and the autosave the last writer. Item 3.3 fixed the
 * same-window case with a resync effect keyed on the assignment fields. It cannot fix the
 * cross-window case: `environmentStore` notifies same-window listeners only (it has no
 * `storage` listener, unlike `toolboxSettings`), while `main/desktopWindows.ts` opens one
 * Study OS window per configured display. On a multi-monitor setup each window holds an
 * independent list, so an assignment made in one window is invisible to the other — whose
 * next position autosave writes its stale copy straight back over it.
 *
 * Hence this: applied at write time, in every window, on every persist.
 */
import type { CompanionInstance } from './companionCatalog';

/**
 * The companion fields this layer does **not** own. Kept as an explicit list because the
 * correctness of the merge is exactly the claim "these are the fields another owner writes":
 * `CompanionsPage.tsx` writes these three and nothing else into `companions`, and everything
 * else on a `CompanionInstance` is motion/presentation state the layer just produced and must
 * not read back from the copy it is superseding.
 */
export const FOREIGN_COMPANION_FIELDS = [
  'primaryRoutineId',
  'secondaryRoutineId',
  'holdRoutineId',
] as const;

/**
 * Overlay the assignments currently in storage onto a list held in memory.
 *
 * Deliberately preserves `next`'s membership exactly — same ids, same order. A companion
 * present in storage but absent from `next` is *not* re-added: the layer dismissing an
 * instance is a real removal, and resurrecting it here would undo it.
 */
export function withLiveRoutineAssignments(
  next: readonly CompanionInstance[],
  live: readonly CompanionInstance[],
): CompanionInstance[] {
  const byId = new Map(live.map((c) => [c.id, c]));
  return next.map((c) => {
    const src = byId.get(c.id);
    if (!src) return c;
    return {
      ...c,
      primaryRoutineId: src.primaryRoutineId,
      secondaryRoutineId: src.secondaryRoutineId,
      holdRoutineId: src.holdRoutineId,
    };
  });
}
