/**
 * Notification store (Phase 2 · M6) — persistent notification history for the
 * Notification Center. Captures the app's existing transient toast buses
 * (`os:toast`, `ui:toast`) into a stored history without changing those
 * emitters, and exposes a `notify()` API for shell/app code.
 *
 * Persisted to localStorage `jp-os-notifications-v1` (capped). DND is a stored
 * flag (future-ready: it suppresses the tray badge, history is still kept).
 */

import { writeLocalStorage } from './localStorageWrite';

export type NotificationKind = 'default' | 'success' | 'warning' | 'error' | 'info';
export type NotificationPriority = 'low' | 'normal' | 'high';

export interface ShellNotification {
  id: number;
  title?: string;
  message: string;
  kind: NotificationKind;
  ts: number;
  read: boolean;
  source?: string;
  priority?: NotificationPriority;
  /** Optional deep-link / release page opened from the notification center. */
  actionUrl?: string;
  /** In-app action when the notice is not an external URL. */
  clientAction?: NotificationClientAction;
  /** Stable client key used to replace an earlier notice for the same event. */
  clientId?: string;
  /**
   * Catalog keys the center renders in the live language. `title`/`message`
   * stay as the text composed at post time (older builds, logs, search).
   */
  i18n?: NotificationI18n;
}

export type NotificationClientAction =
  | 'extension-settings'
  | 'open-calendar'
  | 'open-shortcuts'
  | 'restart-to-update'
  /** risk4: start the CC-CEDICT download (renderer/cedictMissingPrompt.ts). */
  | 'download-cedict';

export interface NotificationI18n {
  title?: string;
  message: string;
  vars?: Record<string, string | number>;
}

const LS_KEY = 'jp-os-notifications-v1';
const LS_DND = 'jp-os-dnd';
const CAP = 100;
const EVENT = 'shell:notifications-changed';
const SOUND_EVENT = 'shell:notification';

function load(): ShellNotification[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
    return Array.isArray(raw) ? (raw as ShellNotification[]) : [];
  } catch {
    return [];
  }
}

let items: ShellNotification[] = load();
let seq = items.reduce((m, n) => Math.max(m, n.id), 0);

function persist(): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(0, CAP)));
  } catch {
    /* storage full/unavailable */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getNotifications(): ShellNotification[] {
  return items;
}

export function unreadCount(): number {
  return items.reduce((n, x) => (x.read ? n : n + 1), 0);
}

/**
 * `jp-os-dnd` holds `'1'` (on until turned off), `'0'` (off), or — shell2 —
 * `'until:<epoch ms>'` for a timed quiet period. One key, so a build that only
 * knows `'1'`/`'0'` reads a timed value as off rather than as stuck on.
 */
function readDndRaw(): string | null {
  try {
    return localStorage.getItem(LS_DND);
  } catch {
    return null;
  }
}

/** When a timed Do not disturb ends, or null (off, or on with no end). */
export function dndUntil(now = Date.now()): number | null {
  const raw = readDndRaw();
  if (!raw?.startsWith('until:')) return null;
  const until = Number(raw.slice('until:'.length));
  return Number.isFinite(until) && until > now ? until : null;
}

/** The switch or a timed period — what the Do not disturb toggle shows and turns off. */
export function isManualDnd(now = Date.now()): boolean {
  return readDndRaw() === '1' || dndUntil(now) !== null;
}

/** Quiet now, for any reason: the switch, a timed period, or the nightly schedule. */
export function isDnd(now = Date.now()): boolean {
  return isManualDnd(now) || inQuietHours(now);
}

/* ------------------------------------------------------------------ *
 * Quiet hours — Do not disturb on a daily schedule.
 *
 * The manual switch and the timed "for 1 hour / until morning" periods cover a
 * moment; a nightly window covers every night without remembering to press
 * anything. It feeds `isDnd`, so everything that already respects Do not
 * disturb (sounds, the badge, pop-ups, calendar reminder banners) respects it.
 * ------------------------------------------------------------------ */

export interface QuietHours {
  on: boolean;
  /** Local `HH:MM`. An end earlier than the start wraps past midnight. */
  start: string;
  end: string;
}

const LS_QUIET_HOURS = 'jp-os-quiet-hours';
export const DEFAULT_QUIET_HOURS: QuietHours = { on: false, start: '22:00', end: '07:00' };
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function loadQuietHours(): QuietHours {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_QUIET_HOURS) ?? 'null') as Partial<QuietHours> | null;
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_QUIET_HOURS };
    return {
      on: raw.on === true,
      start: typeof raw.start === 'string' && HHMM.test(raw.start) ? raw.start : DEFAULT_QUIET_HOURS.start,
      end: typeof raw.end === 'string' && HHMM.test(raw.end) ? raw.end : DEFAULT_QUIET_HOURS.end,
    };
  } catch {
    return { ...DEFAULT_QUIET_HOURS };
  }
}

export function setQuietHours(patch: Partial<QuietHours>): QuietHours {
  const current = loadQuietHours();
  const next: QuietHours = {
    on: typeof patch.on === 'boolean' ? patch.on : current.on,
    start: typeof patch.start === 'string' && HHMM.test(patch.start) ? patch.start : current.start,
    end: typeof patch.end === 'string' && HHMM.test(patch.end) ? patch.end : current.end,
  };
  writeLocalStorage(LS_QUIET_HOURS, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent(EVENT));
  return next;
}

function minutesOfDay(hhmm: string): number {
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** Whether `now` (local time) falls inside the nightly quiet window. */
export function inQuietHours(now = Date.now(), hours: QuietHours = loadQuietHours()): boolean {
  if (!hours.on || hours.start === hours.end) return false;
  const d = new Date(now);
  const at = d.getHours() * 60 + d.getMinutes();
  const start = minutesOfDay(hours.start);
  const end = minutesOfDay(hours.end);
  return start < end ? at >= start && at < end : at >= start || at < end;
}

/** When the current quiet window ends (local wall clock), or null outside one. */
export function quietHoursEndAt(now = Date.now(), hours: QuietHours = loadQuietHours()): number | null {
  if (!inQuietHours(now, hours)) return null;
  const end = new Date(now);
  end.setHours(Number(hours.end.slice(0, 2)), Number(hours.end.slice(3, 5)), 0, 0);
  if (end.getTime() <= now) end.setDate(end.getDate() + 1);
  return end.getTime();
}

function writeDnd(value: string): void {
  try {
    localStorage.setItem(LS_DND, value);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function setDnd(on: boolean): void {
  writeDnd(on ? '1' : '0');
}

let dndExpiryTimer: ReturnType<typeof setTimeout> | null = null;

/** Quiet for `ms` from now; the badge and pop-ups come back by themselves. */
export function setDndFor(ms: number, now = Date.now()): void {
  const until = now + Math.max(0, Math.round(ms));
  writeDnd(`until:${until}`);
  if (dndExpiryTimer) clearTimeout(dndExpiryTimer);
  // Tell the bell and the center when the period ends in this session; a later
  // session reads the expiry from the value itself.
  dndExpiryTimer = setTimeout(() => {
    dndExpiryTimer = null;
    window.dispatchEvent(new CustomEvent(EVENT));
  }, until - now + 50);
}

/** Milliseconds until the next local `hour`:00 (for "until tomorrow morning"). */
export function msUntilHour(hour: number, now = new Date()): number {
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/**
 * Whether a transient pop-up should be shown now. Do not disturb holds back
 * the informational ones; errors, warnings and anything asking the user to
 * act (an Undo) still interrupt, because hiding those loses something.
 */
export function shouldShowToast(kind: string | undefined, hasAction: boolean, now = Date.now()): boolean {
  if (!isDnd(now)) return true;
  if (hasAction) return true;
  return kind === 'err' || kind === 'error' || kind === 'warn' || kind === 'warning';
}

export interface NotifyInput {
  title?: string;
  message: string;
  kind?: NotificationKind;
  source?: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  clientAction?: NotificationClientAction;
  i18n?: NotificationI18n;
  /**
   * When set, replaces any existing unread/read notice with the same clientId
   * so repeated release checks do not spam the center.
   */
  id?: string;
  /**
   * Passive log-only entry (WIRED ARCHIVE bulletin fiction): recorded in the
   * center's history already-read, with no sound/arc dispatch and no badge.
   */
  silent?: boolean;
}

export function notify(input: NotifyInput): ShellNotification {
  const { silent, id: clientId, ...rest } = input;
  if (clientId) {
    items = items.filter((n) => n.clientId !== clientId);
  }
  const item: ShellNotification = {
    id: ++seq,
    ts: Date.now(),
    read: !!silent,
    kind: 'default',
    clientId,
    ...rest,
  };
  items = [item, ...items].slice(0, CAP);
  persist();
  if (!silent && !isDnd()) {
    window.dispatchEvent(new CustomEvent<ShellNotification>(SOUND_EVENT, { detail: item }));
  }
  return item;
}

export function dismiss(id: number): void {
  items = items.filter((n) => n.id !== id);
  persist();
}

/** Dismiss several at once (a collapsed row, or one day's group). */
export function dismissMany(ids: readonly number[]): void {
  if (ids.length === 0) return;
  const drop = new Set(ids);
  const next = items.filter((n) => !drop.has(n.id));
  if (next.length === items.length) return;
  items = next;
  persist();
}

export function clearAll(): void {
  items = [];
  persist();
}

export function markAllRead(): void {
  if (items.every((n) => n.read)) return;
  items = items.map((n) => (n.read ? n : { ...n, read: true }));
  persist();
}

export function onNotificationsChanged(cb: () => void): () => void {
  const h = (): void => cb();
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

function normalizeKind(k?: string): NotificationKind {
  switch (k) {
    case 'ok':
    case 'success':
      return 'success';
    case 'warn':
    case 'warning':
      return 'warning';
    case 'err':
    case 'error':
      return 'error';
    case 'info':
      return 'info';
    default:
      return 'default';
  }
}

let installed = false;

/** Capture the existing transient toast buses into history. Call once at boot. */
export function installNotificationCapture(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('os:toast', (e: Event) => {
    const d = (e as CustomEvent<{ message?: string; kind?: string; record?: boolean }>).detail;
    // `record: false` — the sender already put a translatable entry in the center.
    if (d?.record === false) return;
    if (d?.message && typeof d.message === 'string') {
      notify({ message: d.message, kind: normalizeKind(d.kind) });
    }
  });
  window.addEventListener('ui:toast', (e: Event) => {
    const d = (e as CustomEvent<{ title?: unknown; message?: unknown; kind?: string }>).detail;
    // Only capture string content (ui/Toast allows ReactNode — skip those).
    if (d && typeof d.message === 'string') {
      notify({
        title: typeof d.title === 'string' ? d.title : undefined,
        message: d.message,
        kind: normalizeKind(d.kind),
      });
    }
  });
}
