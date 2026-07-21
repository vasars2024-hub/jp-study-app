/**
 * Pure buddy-routine trigger helpers (safe for unit tests / main scheduler).
 */
import type { CompanionTypeId } from './companionCatalog';

export type BuddyTriggerKind = 'none' | 'timeOfDay' | 'musicPlaying' | 'idle';

export type BuddyTrigger =
  | { kind: 'none' }
  | { kind: 'timeOfDay'; startHour: number; endHour: number }
  | { kind: 'musicPlaying' }
  | { kind: 'idle'; afterMs: number };

export type BuddyTimeScheduleEntry = {
  routineId: string;
  forType?: CompanionTypeId | '*';
  startHour: number;
  endHour: number;
};

export interface BuddyRoutineTriggerFields {
  id: string;
  forType?: CompanionTypeId | '*';
  trigger?: BuddyTrigger;
}

/** Hour in [start, end) — supports overnight windows (e.g. 21→5). */
export function hourInTriggerWindow(hour: number, startHour: number, endHour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  if (startHour === endHour) return true;
  if (startHour < endHour) return h >= startHour && h < endHour;
  return h >= startHour || h < endHour;
}

export function sanitizeTrigger(raw: unknown): BuddyTrigger | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const t = raw as Record<string, unknown>;
  const kind = String(t.kind ?? '');
  if (kind === 'none') return { kind: 'none' };
  if (kind === 'musicPlaying') return { kind: 'musicPlaying' };
  if (kind === 'idle') {
    const afterMs =
      typeof t.afterMs === 'number' ? Math.max(15_000, Math.min(3_600_000, Math.round(t.afterMs))) : 90_000;
    return { kind: 'idle', afterMs };
  }
  if (kind === 'timeOfDay') {
    const startHour =
      typeof t.startHour === 'number' ? Math.max(0, Math.min(23, Math.round(t.startHour))) : 0;
    const endHour =
      typeof t.endHour === 'number' ? Math.max(0, Math.min(24, Math.round(t.endHour))) : 24;
    return { kind: 'timeOfDay', startHour, endHour };
  }
  return undefined;
}

export function routinesMatchingTrigger<T extends BuddyRoutineTriggerFields>(
  routines: T[],
  kind: BuddyTriggerKind,
  opts?: { afterMs?: number; hour?: number },
): T[] {
  const hour = opts?.hour ?? new Date().getHours();
  return routines.filter((r) => {
    const t = r.trigger;
    if (!t || t.kind === 'none') return false;
    if (t.kind !== kind) return false;
    if (t.kind === 'timeOfDay') return hourInTriggerWindow(hour, t.startHour, t.endHour);
    if (t.kind === 'idle') {
      const idleFor = opts?.afterMs ?? 0;
      return idleFor >= t.afterMs;
    }
    return true;
  });
}

export function timeScheduleFromRoutines(
  routines: BuddyRoutineTriggerFields[],
): BuddyTimeScheduleEntry[] {
  const out: BuddyTimeScheduleEntry[] = [];
  for (const r of routines) {
    if (r.trigger?.kind !== 'timeOfDay') continue;
    out.push({
      routineId: r.id,
      forType: r.forType,
      startHour: r.trigger.startHour,
      endHour: r.trigger.endHour,
    });
  }
  return out;
}
