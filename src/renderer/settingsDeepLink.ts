/**
 * Deep links into Settings (set2).
 *
 * Twenty-odd places open Settings at a page or card by opening the section and
 * firing `settings:navigate` ~80 ms later. That only worked while SettingsApp
 * was in the boot bundle and mounted within a frame. It is lazy now (perf2), so
 * on the FIRST open the event can arrive before the app exists and be lost —
 * the window opens on Home, not on the card the feature pointed at.
 *
 * The relay closes that gap for every caller at once, without touching them:
 * it is installed at boot, remembers the last `settings:navigate` for a few
 * seconds, and SettingsApp takes it on mount. SettingsApp marks an event it
 * handled itself as consumed, so a later mount never replays an old link.
 *
 * `openSettingsAt` is the one helper new feature links should use.
 */
import { openSectionSurface } from './sectionSurface';

export interface SettingsLink {
  page: string;
  settingId?: string;
}

const EVENT = 'settings:navigate';
/** Long enough for a lazy chunk on a cold disk; short enough never to surprise. */
const RELAY_TTL_MS = 6_000;

let last: { link: SettingsLink; at: number } | null = null;
let installed = false;

function onNavigate(event: Event): void {
  const detail = (event as CustomEvent<SettingsLink | undefined>).detail;
  if (!detail || typeof detail.page !== 'string' || !detail.page) return;
  last = {
    link: { page: detail.page, ...(typeof detail.settingId === 'string' && detail.settingId ? { settingId: detail.settingId } : {}) },
    at: Date.now(),
  };
}

/** Boot: start remembering deep links (main.tsx, every window). Idempotent. */
export function installSettingsLinkRelay(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener(EVENT, onNavigate);
}

/** SettingsApp, on mount: a link that fired before it existed, if still fresh. */
export function takeRelayedSettingsLink(now: number = Date.now()): SettingsLink | null {
  const pending = last;
  last = null;
  if (!pending || now - pending.at > RELAY_TTL_MS || pending.at > now + 1_000) return null;
  return pending.link;
}

/** SettingsApp, after handling a live event: nothing left to replay. */
export function markSettingsLinkConsumed(): void {
  last = null;
}

/** Open Settings at a page, and at one card on it when `settingId` is given. */
export function openSettingsAt(page: string, settingId?: string): void {
  if (typeof window === 'undefined') return;
  installSettingsLinkRelay();
  openSectionSurface('settings');
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { page, ...(settingId ? { settingId } : {}) } }));
  }, 80);
}

/** Test seam. */
export function resetSettingsLinkRelayForTests(): void {
  last = null;
}
