/**
 * In-place updates for an installed (Squirrel) Gum. See `main/squirrelUpdater.ts`.
 *
 * `install` says which update path applies:
 *   installed  Squirrel install: downloads in the background, then "Restart to update".
 *   portable   the zip build: no self-update; the GitHub release notice is the path.
 *   dev        `npm start`: neither.
 */
export type InstallKind = 'installed' | 'portable' | 'dev';

export type AppUpdateStateKind = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'error';

export interface AppUpdateStatus {
  install: InstallKind;
  state: AppUpdateStateKind;
  /** The downloaded release's name (its version) once `state` is `downloaded`. */
  version?: string;
}

/**
 * Why the last check failed, as a code the UI translates (`upd2.error.<code>`):
 *   network          offline, DNS, a proxy, a timeout
 *   no-feed          the latest release carries no RELEASES / nupkg (a zip-only release)
 *   updater-missing  Update.exe could not be started (a damaged install)
 *   unknown          anything else; the raw text is in the diagnostics log
 */
export type AppUpdateErrorCode = 'network' | 'no-feed' | 'updater-missing' | 'unknown';

/** Only GitHub's latest non-prerelease today; the field exists so a beta feed has a place. */
export type AppUpdateChannel = 'stable';

/**
 * Everything Settings -> Help -> Updates shows. A superset of `AppUpdateStatus`
 * on its own channel (`appUpdate:details`), so the toast path keeps its shape.
 */
export interface AppUpdateDetails extends AppUpdateStatus {
  /** The running build (`app.getVersion()`). */
  current: string;
  channel: AppUpdateChannel;
  /** The Squirrel feed; `<feedUrl>/RELEASES` is what Update.exe reads. */
  feedUrl: string;
  /** When a check last ran (automatic or "Check now"); null = never on this install. */
  lastCheckedAt: number | null;
  /**
   * When the running download began. Squirrel.Windows reports no byte progress
   * through Electron's `autoUpdater`, so the UI shows an indeterminate bar and
   * how long it has been going rather than a percentage it would have to invent.
   */
  downloadStartedAt?: number;
  error?: AppUpdateErrorCode;
  /** The last automatic check was skipped because Windows reports a metered connection. */
  skippedMetered?: boolean;
}

export type AppReleaseNotes =
  | {
      ok: true;
      version: string;
      title: string;
      /** Release notes as GitHub returned them (Markdown, shown as plain text). */
      body: string;
      url: string;
      publishedAt?: string;
      /** The body was cut to `RELEASE_NOTES_MAX_CHARS`. */
      truncated: boolean;
    }
  | { ok: false; reason: 'none' | 'failed' };

export const RELEASE_NOTES_MAX_CHARS = 20_000;

/** Map an updater error message to a code the UI can translate. */
export function classifyUpdateError(message: string): AppUpdateErrorCode {
  const s = String(message || '');
  if (/\b404\b|not found|RELEASES|nupkg|no releases/i.test(s)) return 'no-feed';
  if (/Update\.exe|spawn|ENOENT|EACCES/i.test(s)) return 'updater-missing';
  if (/ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|network|getaddrinfo|timed? ?out|WebException|proxy|offline|unable to connect|remote name could not be resolved/i.test(s)) {
    return 'network';
  }
  return 'unknown';
}

export type AppUpdateTone = 'muted' | 'busy' | 'ok' | 'warn';

/** What the update panel renders for a given state — pure, so a node test can drive it. */
export interface AppUpdateView {
  tone: AppUpdateTone;
  /** An `upd2.*` key. */
  messageKey: string;
  vars?: Record<string, string | number>;
  progress: 'indeterminate' | null;
  /** "Check now" is offered (and not already running). */
  canCheck: boolean;
  canRestart: boolean;
}

export function describeAppUpdate(d: AppUpdateDetails): AppUpdateView {
  if (d.install !== 'installed') {
    return {
      tone: 'muted',
      messageKey: d.install === 'portable' ? 'upd2.state.portable' : 'upd2.state.dev',
      progress: null,
      canCheck: true,
      canRestart: false,
    };
  }
  switch (d.state) {
    case 'checking':
      return { tone: 'busy', messageKey: 'upd2.state.checking', progress: 'indeterminate', canCheck: false, canRestart: false };
    case 'downloading':
      return { tone: 'busy', messageKey: 'upd2.state.downloading', progress: 'indeterminate', canCheck: false, canRestart: false };
    case 'downloaded':
      return d.version
        ? { tone: 'ok', messageKey: 'upd2.state.ready', vars: { version: d.version }, progress: null, canCheck: false, canRestart: true }
        : { tone: 'ok', messageKey: 'upd2.state.readyNoVersion', progress: null, canCheck: false, canRestart: true };
    case 'error':
      return { tone: 'warn', messageKey: `upd2.error.${d.error ?? 'unknown'}`, progress: null, canCheck: true, canRestart: false };
    case 'idle':
    default:
      if (d.skippedMetered) {
        return { tone: 'muted', messageKey: 'upd2.state.meteredSkipped', progress: null, canCheck: true, canRestart: false };
      }
      return d.lastCheckedAt
        ? { tone: 'ok', messageKey: 'upd2.state.upToDate', vars: { version: d.current }, progress: null, canCheck: true, canRestart: false }
        : { tone: 'muted', messageKey: 'upd2.state.notChecked', progress: null, canCheck: true, canRestart: false };
  }
}
