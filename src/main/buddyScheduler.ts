/**
 * Single main-process scheduler for buddy time-of-day routine triggers.
 * Renderer pushes the schedule; we fire each entry once per day-window.
 */
import { BrowserWindow, ipcMain } from 'electron';

export type BuddyScheduleEntry = {
  routineId: string;
  forType?: string;
  startHour: number;
  endHour: number;
};

let schedule: BuddyScheduleEntry[] = [];
/** `${routineId}:${YYYY-M-D}:${startHour}` already fired. */
const firedKeys = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;
let registered = false;

function hourInWindow(hour: number, startHour: number, endHour: number): boolean {
  const h = ((hour % 24) + 24) % 24;
  if (startHour === endHour) return true;
  if (startHour < endHour) return h >= startHour && h < endHour;
  return h >= startHour || h < endHour;
}

function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function broadcastTrigger(entry: BuddyScheduleEntry): void {
  const payload = { routineId: entry.routineId, forType: entry.forType ?? '*' };
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    w.webContents.send('buddy:trigger', payload);
  }
}

function tick(): void {
  if (!schedule.length) return;
  const now = new Date();
  const hour = now.getHours();
  const day = dayKey(now);
  for (const entry of schedule) {
    if (!hourInWindow(hour, entry.startHour, entry.endHour)) continue;
    const key = `${entry.routineId}:${day}:${entry.startHour}`;
    if (firedKeys.has(key)) continue;
    firedKeys.add(key);
    broadcastTrigger(entry);
  }
  // Prune old keys (keep today only)
  for (const k of [...firedKeys]) {
    if (!k.includes(`:${day}:`)) firedKeys.delete(k);
  }
}

function ensureTimer(): void {
  if (timer) return;
  timer = setInterval(tick, 30_000);
  tick();
}

function stopTimer(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function registerBuddySchedulerIpc(): void {
  if (registered) return;
  registered = true;

  ipcMain.on('buddyScheduler:sync', (_e, raw: unknown) => {
    if (!Array.isArray(raw)) {
      schedule = [];
      stopTimer();
      return;
    }
    const next: BuddyScheduleEntry[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      if (typeof r.routineId !== 'string' || !r.routineId) continue;
      const startHour =
        typeof r.startHour === 'number' ? Math.max(0, Math.min(23, Math.round(r.startHour))) : 0;
      const endHour =
        typeof r.endHour === 'number' ? Math.max(0, Math.min(24, Math.round(r.endHour))) : 24;
      next.push({
        routineId: r.routineId,
        forType: typeof r.forType === 'string' ? r.forType : '*',
        startHour,
        endHour,
      });
    }
    schedule = next;
    if (schedule.length) ensureTimer();
    else stopTimer();
  });

  ipcMain.handle('buddyScheduler:testFire', (_e, routineId: unknown): { ok: boolean } => {
    if (typeof routineId !== 'string' || !routineId) return { ok: false };
    const entry = schedule.find((s) => s.routineId === routineId) ?? {
      routineId,
      forType: '*',
      startHour: 0,
      endHour: 24,
    };
    broadcastTrigger(entry);
    return { ok: true };
  });
}

export function stopBuddyScheduler(): void {
  stopTimer();
  schedule = [];
  firedKeys.clear();
}
