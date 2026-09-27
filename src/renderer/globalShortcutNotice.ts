/**
 * The one notice for system-wide shortcuts Windows would not register.
 *
 * `syncGlobalCommands` (keyboardShortcuts.ts) pushes every `global: true` chord
 * to main's registry and gets a status per command back. When another program
 * (or a second Gum) already holds the chords, a fresh launch used to post one
 * toast PER refused command — seven at once was measured — each composed in
 * English when the boot sync ran before the UI catalog had loaded, and stored in
 * the Notification Center as a frozen string that stayed English after a
 * language switch.
 *
 * Now a sync produces at most one notice:
 *  - one line with the count ("3 shortcuts couldn't be registered …") and an
 *    "Open Shortcuts" action; each row in Settings → Shortcuts still names its
 *    own reason;
 *  - composed only after the live language's catalog is loaded, and recorded in
 *    the Notification Center as keys + vars, so the center re-translates it;
 *  - not re-posted on the next boot for the same unchanged set: the reported
 *    set is remembered, and only a failure not in it raises the notice again.
 *    Once every chord registers the memory is cleared, so a later refusal is news.
 */
import { t, getUiLang } from './i18n';
import { ensureCatalog } from '../shared/i18n/catalogs';
import { notify } from './notificationStore';
import { writeLocalStorageJson } from './localStorageWrite';
import { openShortcutSettings } from './extensionBridgeUi';
import type { GlobalCommandStatus } from '../shared/globalCommands';

const REPORTED_KEY = 'jp-global-shortcut-refusals-v1';
/** Stable Notification Center id: a newer notice replaces the older one. */
export const GLOBAL_SHORTCUT_NOTICE_ID = 'global-shortcuts-refused';

function readReported(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(REPORTED_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function failureKey(status: GlobalCommandStatus): string {
  return `${status.id}:${status.error}:${status.chord}`;
}

/** The message key for a set of failures: "another app is using them" only when that is what Windows said. */
export function globalShortcutNoticeKey(failures: readonly Pick<GlobalCommandStatus, 'error'>[]): string {
  return failures.every((s) => s.error === 'in-use')
    ? 'shortcut.notice.refused.inUse'
    : 'shortcut.notice.refused.mixed';
}

/**
 * Report what one sync left unregistered. `chords` is what was pushed; a status
 * for an id outside it (a feature's own command) is not the Shortcuts page's to
 * report. Resolves once the notice (if any) has been posted.
 */
export async function reportGlobalShortcutFailures(
  list: readonly GlobalCommandStatus[] | null | undefined,
  chords: Record<string, string>,
): Promise<void> {
  const failures = (list ?? []).filter((s) => s.error && s.id in chords);
  const keys = failures.map(failureKey).sort();
  const reported = readReported();
  if (keys.length === 0) {
    if (reported.length) writeLocalStorageJson(REPORTED_KEY, []);
    return;
  }
  const known = new Set(reported);
  const fresh = keys.some((k) => !known.has(k));
  if (keys.length !== reported.length || fresh) writeLocalStorageJson(REPORTED_KEY, keys);
  if (!fresh) return;

  // The boot sync can run before `initI18n` has the UI catalog; composing now
  // would freeze English into the toast.
  await ensureCatalog(getUiLang());
  const messageKey = globalShortcutNoticeKey(failures);
  const vars = { count: failures.length };
  notify({
    id: GLOBAL_SHORTCUT_NOTICE_ID,
    message: t(messageKey, vars),
    i18n: { message: messageKey, vars },
    kind: 'warning',
    source: 'system',
    clientAction: 'open-shortcuts',
  });
  window.dispatchEvent(
    new CustomEvent('os:toast', {
      detail: {
        message: t(messageKey, vars),
        kind: 'warn',
        // Already in the Notification Center (translatable), not a second frozen copy.
        record: false,
        action: { label: t('shortcut.notice.refused.open'), run: openShortcutSettings },
      },
    }),
  );
}

export const __globalShortcutNoticeTestables = { REPORTED_KEY };
