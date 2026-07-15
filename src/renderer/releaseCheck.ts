import { notify } from './notificationStore';

const SEEN_KEY = 'jp-release-seen-version';
const LAST_CHECK_KEY = 'jp-release-last-check';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function shouldCheckNow(): boolean {
  const last = parseInt(localStorage.getItem(LAST_CHECK_KEY) ?? '0', 10) || 0;
  return Date.now() - last >= CHECK_INTERVAL_MS;
}

function markChecked(): void {
  localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
}

function markSeen(version: string): void {
  localStorage.setItem(SEEN_KEY, version);
}

function alreadySeen(version: string): boolean {
  return localStorage.getItem(SEEN_KEY) === version;
}

export async function checkForAppRelease(options?: { force?: boolean }): Promise<void> {
  if (!options?.force && !shouldCheckNow()) return;
  markChecked();

  try {
    const release = await window.api.checkAppRelease();
    if (!release) return;
    if (!options?.force && alreadySeen(release.version)) return;

    markSeen(release.version);
    notify({
      id: `release-${release.version}`,
      title: `Update available: ${release.title}`,
      message: release.summary,
      kind: 'info',
      actionUrl: release.url,
    });
  } catch (err) {
    console.warn('[release] check failed:', err);
  }
}

/** Fire-and-forget check shortly after the desktop boots. */
export function startReleaseCheck(): void {
  const run = () => {
    void checkForAppRelease();
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 12_000 });
  } else {
    window.setTimeout(run, 4000);
  }
}
