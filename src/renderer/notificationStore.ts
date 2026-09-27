/**
 * Notification store (Phase 2 · M6) — persistent notification history for the
 * Notification Center. Captures the app's existing transient toast buses
 * (`os:toast`, `ui:toast`) into a stored history without changing those
 * emitters, and exposes a `notify()` API for shell/app code.
 *
 * Persisted to localStorage `jp-os-notifications-v1` (capped). DND is a stored
 * flag (future-ready: it suppresses the tray badge, history is still kept).
 */

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

export type NotificationClientAction = 'extension-settings' | 'open-calendar' | 'open-shortcuts';

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

export function isDnd(): boolean {
  try {
    return localStorage.getItem(LS_DND) === '1';
  } catch {
    return false;
  }
}

export function setDnd(on: boolean): void {
  try {
    localStorage.setItem(LS_DND, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
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
