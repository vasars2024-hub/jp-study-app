/**
 * Persistent notification history for the taskbar Notification Center.
 */

export type NotificationKind = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface ShellNotification {
  id: string;
  title: string;
  message: string;
  kind: NotificationKind;
  createdAt: number;
  read: boolean;
  /** Optional link opened when the user clicks the notification row. */
  actionUrl?: string;
}

const LS_KEY = 'jp-os-notifications-v1';
const DND_KEY = 'jp-os-notifications-dnd';
const EVENT = 'shell:notifications-changed';
const MAX_ITEMS = 80;

function load(): ShellNotification[] {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
    return Array.isArray(raw) ? (raw as ShellNotification[]) : [];
  } catch {
    return [];
  }
}

function save(next: ShellNotification[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(next.slice(0, MAX_ITEMS)));
}

let items: ShellNotification[] = load();

function emit(): void {
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getNotifications(): ShellNotification[] {
  return items;
}

export function unreadCount(): number {
  return items.filter((n) => !n.read).length;
}

export function isDnd(): boolean {
  return localStorage.getItem(DND_KEY) === '1';
}

export function setDnd(on: boolean): void {
  localStorage.setItem(DND_KEY, on ? '1' : '0');
  emit();
}

export interface NotifyInput {
  id?: string;
  title: string;
  message: string;
  kind?: NotificationKind;
  actionUrl?: string;
}

export function notify(input: NotifyInput): ShellNotification {
  const item: ShellNotification = {
    id: input.id ?? `n-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: input.title,
    message: input.message,
    kind: input.kind ?? 'info',
    createdAt: Date.now(),
    read: false,
    actionUrl: input.actionUrl,
  };
  items = [item, ...items.filter((n) => n.id !== item.id)].slice(0, MAX_ITEMS);
  save(items);
  emit();
  return item;
}

export function dismiss(id: string): void {
  items = items.filter((n) => n.id !== id);
  save(items);
  emit();
}

export function markRead(id: string): void {
  items = items.map((n) => (n.id === id ? { ...n, read: true } : n));
  save(items);
  emit();
}

export function markAllRead(): void {
  items = items.map((n) => ({ ...n, read: true }));
  save(items);
  emit();
}

export function onNotificationsChanged(cb: () => void): () => void {
  const fn = () => cb();
  window.addEventListener(EVENT, fn);
  return () => window.removeEventListener(EVENT, fn);
}
