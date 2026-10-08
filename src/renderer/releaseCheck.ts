import { compareVersions } from '../shared/release';
import { t } from './i18n';
import { notify } from './notificationStore';
import { showOsToast } from './components/ToastHost';
import type { AppUpdateStatus } from '../shared/appUpdate';

const SEEN_APP_KEY = 'jp-release-seen-version';
const SEEN_EXT_REMOTE_KEY = 'jp-extension-seen-remote-version';
const LAST_EXT_LOCAL_KEY = 'jp-extension-last-local-version';
const LAST_CHECK_KEY = 'jp-release-last-check';
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

function shouldCheckNow(): boolean {
  const last = parseInt(localStorage.getItem(LAST_CHECK_KEY) ?? '0', 10) || 0;
  return Date.now() - last >= CHECK_INTERVAL_MS;
}

function markChecked(): void {
  localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
}

function alreadySeen(key: string, version: string): boolean {
  return localStorage.getItem(key) === version;
}

function markSeen(key: string, version: string): void {
  localStorage.setItem(key, version);
}

/**
 * When the app rewrites the load-unpacked folder with a newer manifest, tell
 * the user to reload Chrome — unpacked extensions do not auto-update.
 */
async function checkLocalExtensionBump(): Promise<void> {
  try {
    const status = await window.api.extensionStatus();
    const installed = String(status?.extensionVersion || '').trim();
    if (!installed) return;

    const previous = localStorage.getItem(LAST_EXT_LOCAL_KEY) || '';
    if (previous && compareVersions(installed, previous) > 0) {
      notify({
        id: `extension-local-${installed}`,
        title: t('notifications.release.extensionLocalTitle', { version: installed }),
        message: t('notifications.release.extensionLocalBody'),
        kind: 'info',
        source: 'release',
        clientAction: 'extension-settings',
      });
    }
    markSeen(LAST_EXT_LOCAL_KEY, installed);
  } catch (err) {
    console.warn('[release] local extension check failed:', err);
  }
}

export async function checkForAppRelease(options?: { force?: boolean }): Promise<void> {
  if (!options?.force && !shouldCheckNow()) {
    // Still pick up a local extension rewrite that happened since last session.
    await checkLocalExtensionBump();
    return;
  }
  markChecked();
  await checkLocalExtensionBump();

  try {
    const release = await window.api.checkAppRelease();
    if (!release) return;

    // Prefer explicit flag from main; older builds omit it and always mean app update.
    const isAppUpdate = release.appUpdate === true || release.appUpdate == null;
    const extVersion = release.extensionUpdate?.version;

    if (isAppUpdate && release.version && (options?.force || !alreadySeen(SEEN_APP_KEY, release.version))) {
      markSeen(SEEN_APP_KEY, release.version);
      let message = release.summary;
      if (extVersion && (options?.force || !alreadySeen(SEEN_EXT_REMOTE_KEY, extVersion))) {
        markSeen(SEEN_EXT_REMOTE_KEY, extVersion);
        message = `${message} ${t('notifications.release.extensionAlso', { version: extVersion })}`.trim();
      }
      notify({
        id: `release-${release.version}`,
        title: t('notifications.release.appTitle', { title: release.title }),
        message,
        kind: 'info',
        source: 'release',
        actionUrl: release.url,
      });
      return;
    }

    if (extVersion && (options?.force || !alreadySeen(SEEN_EXT_REMOTE_KEY, extVersion))) {
      markSeen(SEEN_EXT_REMOTE_KEY, extVersion);
      notify({
        id: `extension-remote-${extVersion}`,
        title: t('notifications.release.extensionRemoteTitle', { version: extVersion }),
        message: t('notifications.release.extensionRemoteBody', { summary: release.summary }),
        kind: 'info',
        source: 'release',
        actionUrl: release.url,
      });
    }
  } catch (err) {
    console.warn('[release] check failed:', err);
  }
}

/**
 * An installed (Squirrel) copy downloads updates itself (main/squirrelUpdater.ts).
 * Once one is staged, say so once — a notice that persists in the center and a toast
 * — both carrying "Restart to update". The portable zip never reaches `downloaded`.
 */
export function announceDownloadedUpdate(status: AppUpdateStatus): boolean {
  if (status.install !== 'installed' || status.state !== 'downloaded') return false;
  const version = status.version ?? '';
  const title = version
    ? t('install.update.readyTitle', { version })
    : t('install.update.readyTitleNoVersion');
  notify({
    id: `app-update-ready-${version || 'staged'}`,
    title,
    message: t('install.update.readyBody'),
    kind: 'success',
    source: 'release',
    clientAction: 'restart-to-update',
    i18n: {
      title: version ? 'install.update.readyTitle' : 'install.update.readyTitleNoVersion',
      message: 'install.update.readyBody',
      vars: version ? { version } : undefined,
    },
  });
  showOsToast(title, 'ok', {
    label: t('install.update.restart'),
    run: () => void window.api.appUpdateRestart?.(),
  });
  return true;
}

let watchingUpdates = false;
function watchInstalledUpdates(): void {
  if (watchingUpdates || !window.api.onAppUpdateChanged || !window.api.appUpdateStatus) return;
  watchingUpdates = true;
  let announced = false;
  const onStatus = (status: AppUpdateStatus) => {
    if (!announced && announceDownloadedUpdate(status)) announced = true;
  };
  window.api.onAppUpdateChanged(onStatus);
  void window.api.appUpdateStatus().then(onStatus).catch(() => undefined);
}

/** Fire-and-forget check shortly after the desktop boots. */
export function startReleaseCheck(): void {
  watchInstalledUpdates();
  const run = () => {
    void checkForAppRelease();
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 12_000 });
  } else {
    window.setTimeout(run, 4000);
  }
}
