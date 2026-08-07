/**
 * Running a buddy routine from Mini View (v1.0 audit 3.5).
 *
 * Mini cannot relay `buddy:run` the way the OS pet host does. That relay lands on
 * `CompanionLayer`, and while Mini is on there is no layer anywhere: the main
 * window renders `MiniMainBridge` instead of `DesktopShell`, and the floating
 * widget is a window of its own that never mounted the living layer. Measured
 * before this change — with Mini active, `buddy:run {c-bonzi, br-miko-cheer}`
 * produced no toast and no mood change, while the same dispatch on the desktop
 * ran the routine.
 *
 * So the widget runs routines itself, against its own `BuddyRunContext`. The
 * engine is unchanged; only the context and the side-effect sinks are Mini's.
 */
import type { CompanionInstance, CompanionMood } from './environment/companionCatalog';
import { loadEnvironment, saveEnvironment } from './environment/environmentStore';
import {
  getDefaultBuddyRoutines,
  routinesForType,
  runBuddyRoutine,
  type BuddyRoutine,
  type BuddyRunContext,
} from './environment/buddyRoutines';

export type MiniCompanionPatch = {
  mood?: CompanionMood;
  status?: string;
  speechBubble?: string | null;
};

/** Every routine the app knows about — user-edited list, or the builtins. */
export function miniRoutineCatalog(): BuddyRoutine[] {
  const env = loadEnvironment();
  return env.buddyRoutines?.length ? env.buddyRoutines : getDefaultBuddyRoutines();
}

/**
 * Pinned ids → routines, in pinned order. Ids that no longer resolve are
 * dropped rather than rendered as buttons that cannot run.
 */
export function resolveMiniRoutines(ids: string[]): BuddyRoutine[] {
  const byId = new Map(miniRoutineCatalog().map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((r): r is BuddyRoutine => !!r);
}

/**
 * Only routines some live companion can actually run are offerable — the same
 * rule the pet menu uses in 3.4. `runBuddyRoutine` refuses a routine whose
 * `forType` does not match its companion, so a wider list would pin buttons that
 * silently do nothing.
 */
export function offerableMiniRoutines(companions: CompanionInstance[]): BuddyRoutine[] {
  const all = miniRoutineCatalog();
  const seen = new Set<string>();
  const out: BuddyRoutine[] = [];
  for (const c of companions) {
    for (const r of routinesForType(all, c.typeId)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push(r);
    }
  }
  return out;
}

/** First companion the routine will accept, mirroring the `buddy:trigger` rule. */
export function miniRoutineCompanion(
  routine: BuddyRoutine,
  companions: CompanionInstance[],
): CompanionInstance | null {
  const now = Date.now();
  return (
    companions.find(
      (c) =>
        (!c.hiddenUntil || c.hiddenUntil <= now) &&
        (!routine.forType || routine.forType === '*' || routine.forType === c.typeId),
    ) ?? null
  );
}

/**
 * Write mood/status back so the pet carries it when the desktop comes back.
 *
 * Reads the stored list fresh on every call and never a list captured when the
 * widget mounted — persisting a stale companion array over a live one is exactly
 * how routine assignments were being erased before item 3.3.
 *
 * `speechBubble` is deliberately not persisted: it is a bubble drawn above a pet
 * Mini does not render, and storing one would leave it hanging over the pet the
 * next time the desktop comes up.
 */
function persistCompanionPatch(companionId: string, patch: MiniCompanionPatch): void {
  const durable: { mood?: CompanionMood; status?: string } = {};
  if (patch.mood) durable.mood = patch.mood;
  if (patch.status !== undefined) durable.status = patch.status;
  if (!Object.keys(durable).length) return;
  const list = loadEnvironment().companions ?? [];
  if (!list.some((c) => c.id === companionId)) return;
  saveEnvironment({
    companions: list.map((c) => (c.id === companionId ? { ...c, ...durable } : c)),
  });
}

export type MiniRoutineResult = { ok: boolean; error?: string };

/**
 * Run one pinned routine. `onPatch` is how the widget shows `setMood` happening
 * — without it every miko routine (which is nothing but mood steps) would look
 * like a button that does nothing.
 */
export async function runMiniRoutine(
  routine: BuddyRoutine,
  onPatch: (patch: MiniCompanionPatch) => void,
): Promise<MiniRoutineResult> {
  const env = loadEnvironment();
  if (!env.enabled || !env.companionsEnabled) {
    return { ok: false, error: 'companionsOff' };
  }
  const companion = miniRoutineCompanion(routine, env.companions ?? []);
  if (!companion) return { ok: false, error: 'noCompanion' };

  const ctx: BuddyRunContext = {
    companionId: companion.id,
    typeId: companion.typeId,
    patchCompanion: (patch) => {
      onPatch(patch);
      persistCompanionPatch(companion.id, patch);
    },
  };
  return runBuddyRoutine(routine.id, ctx);
}
