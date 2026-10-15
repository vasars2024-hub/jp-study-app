/**
 * In-place updates for an installed (Squirrel) Gum. See `main/squirrelUpdater.ts`.
 *
 * `install` says which update path applies:
 *   installed  Squirrel install: downloads in the background, then "Restart to update".
 *   portable   the zip build: no self-update; the GitHub release notice is the path.
 *   dev        `npm start`: neither.
 */
import { isReleaseChannel, isReleaseVersion, normalizeVersion, type ReleaseChannel } from './release';

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
 *   checksum         a downloaded package did not match the SHA1 / size in RELEASES
 *   disk             not enough free space for the package
 *   unknown          anything else; the raw text is in the diagnostics log
 */
export type AppUpdateErrorCode = 'network' | 'no-feed' | 'updater-missing' | 'checksum' | 'disk' | 'unknown';

/** stable = GitHub's latest full release; beta = the newest release, pre-releases included. */
export type AppUpdateChannel = ReleaseChannel;

/** What the user chose in the Updates panel; kept in `app-update-state.json`. */
export interface AppUpdatePrefs {
  channel: AppUpdateChannel;
  /** A version the user said to skip: not offered, not downloaded. */
  skippedVersion: string | null;
  /**
   * "Check for updates automatically". Off: no timer check and no background
   * download; "Check now" still works.
   */
  autoCheck: boolean;
  /**
   * "Pause updates": automatic checks are skipped until this time (ms since the
   * epoch). null = not paused. "Check now" ignores it; it is the user's call.
   */
  pausedUntil: number | null;
}

export const DEFAULT_APP_UPDATE_PREFS: AppUpdatePrefs = { channel: 'stable', skippedVersion: null, autoCheck: true, pausedUntil: null };

/** "Pause updates" offers this long. */
export const APP_UPDATE_PAUSE_DAYS = 7;
export const APP_UPDATE_PAUSE_MS = APP_UPDATE_PAUSE_DAYS * 24 * 60 * 60 * 1000;
/** No pause is kept for longer than this (a clock set far ahead, a hand-edited file). */
export const APP_UPDATE_PAUSE_MAX_MS = 35 * 24 * 60 * 60 * 1000;

/** Validate prefs read from disk or sent over IPC; anything unknown falls back to the default. */
export function sanitizeAppUpdatePrefs(raw: unknown, base: AppUpdatePrefs = DEFAULT_APP_UPDATE_PREFS): AppUpdatePrefs {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const channel = isReleaseChannel(r.channel) ? r.channel : base.channel;
  let skippedVersion = base.skippedVersion;
  if (r.skippedVersion === null) skippedVersion = null;
  else if (typeof r.skippedVersion === 'string' && isReleaseVersion(r.skippedVersion)) skippedVersion = normalizeVersion(r.skippedVersion);
  // Older state files have neither field: the base (on by default, not paused) stays.
  const autoCheck = typeof r.autoCheck === 'boolean' ? r.autoCheck : base.autoCheck ?? true;
  let pausedUntil = base.pausedUntil ?? null;
  if (r.pausedUntil === null) pausedUntil = null;
  else if (typeof r.pausedUntil === 'number' && Number.isFinite(r.pausedUntil) && r.pausedUntil > 0) pausedUntil = Math.round(r.pausedUntil);
  return { channel, skippedVersion, autoCheck, pausedUntil };
}

/**
 * Whether the automatic (timer) check may run now. "Check now" never asks.
 * A pause longer than `APP_UPDATE_PAUSE_MAX_MS` from now is treated as over.
 */
export function automaticUpdateCheckAllowed(prefs: Pick<AppUpdatePrefs, 'autoCheck' | 'pausedUntil'>, now: number): boolean {
  if (!prefs.autoCheck) return false;
  return !isAppUpdatePaused(prefs, now);
}

/** A pause is in force at `now`. */
export function isAppUpdatePaused(prefs: Pick<AppUpdatePrefs, 'pausedUntil'>, now: number): boolean {
  const until = prefs.pausedUntil;
  return typeof until === 'number' && until > now && until - now <= APP_UPDATE_PAUSE_MAX_MS;
}

/**
 * What a restart would cut short (translated as `upd2.unsaved.<kind>`):
 *   recording           a screen recording is running or paused
 *   recording-finalize  a finished recording is still being written / imported
 *   note-editor         a note being edited with changes not saved yet
 *   card-editor         a card's fields open for editing
 *   writing-correction  an AI writing correction still being written
 *   review-session      a flashcard review session part-way through
 *   snip                a snip still being read and turned into cards
 *   ai-job              an AI job still running (Card Studio, an AI study helper)
 * Windows report theirs over IPC (main/unsavedWork.ts); the order here is the
 * order the warning lists them in.
 */
export const APP_UPDATE_UNSAVED_KINDS = [
  'recording',
  'recording-finalize',
  'note-editor',
  'card-editor',
  'writing-correction',
  'review-session',
  'snip',
  'ai-job',
] as const;
export type AppUpdateUnsavedKind = (typeof APP_UPDATE_UNSAVED_KINDS)[number];

export function isAppUpdateUnsavedKind(value: unknown): value is AppUpdateUnsavedKind {
  return typeof value === 'string' && (APP_UPDATE_UNSAVED_KINDS as readonly string[]).includes(value);
}

/**
 * `appUpdate:restart`'s answer. With `unsaved` the restart did NOT happen: the
 * caller shows what would be lost, and calls again with `force` if the user agrees.
 */
export type AppUpdateRestartResult =
  | { ok: true }
  | { ok: false; reason: 'not-downloaded' }
  | { ok: false; reason: 'unsaved'; unsaved: AppUpdateUnsavedKind[] };

/**
 * Gum's own download of the update (main/updateDownloader.ts), while `state` is
 * `downloading`. Absent when Squirrel is downloading by itself (no byte counts).
 *   manifest    reading RELEASES
 *   package     receiving the package(s): `received` of `total` bytes
 *   verifying   checking SHA1 and size against RELEASES
 *   installing  handed to Update.exe, which copies and unpacks it
 */
export interface AppUpdateDownload {
  phase: 'manifest' | 'package' | 'verifying' | 'installing';
  version: string;
  received: number;
  total: number | null;
  /** Delta packages (the difference only) rather than the full package. */
  deltas?: boolean;
}

/** A download the user cancelled: what is kept for "Resume". */
export interface AppUpdatePaused {
  version: string;
  received: number;
  total: number | null;
}

/** One version this copy has run. */
export interface AppUpdateHistoryEntry {
  version: string;
  /** When this copy first started as `version`. */
  at: number;
  /** The version it was updated from; absent for the first one seen. */
  from?: string;
}

/** The running version is newer than the last one that ran: "What's new" until dismissed. */
export interface AppUpdateWhatsNew {
  version: string;
  from: string;
  /** The one-time notice in the notification center has been posted. */
  announced?: boolean;
}

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
   * through Electron's `autoUpdater`; when Squirrel downloads by itself the UI
   * shows an indeterminate bar and how long it has been going rather than a
   * percentage it would have to invent. Gum's own download (`download`) has bytes.
   */
  downloadStartedAt?: number;
  error?: AppUpdateErrorCode;
  /** The last automatic check was skipped because Windows reports a metered connection. */
  skippedMetered?: boolean;
  /** The version the user chose to skip, if any. */
  skippedVersion?: string | null;
  /** "Check for updates automatically" (absent from an older main: on). */
  autoCheck?: boolean;
  /** Automatic checks are paused until this time; absent when not paused (or the pause is over). */
  pausedUntil?: number;
  /** The newest release the last check found on this channel (before any download). */
  latestVersion?: string;
  /** Gum's own download, with byte counts (installed copies). */
  download?: AppUpdateDownload;
  /** A cancelled download that "Resume" continues from where it stopped. */
  paused?: AppUpdatePaused;
  /** Bytes already on disk when the last download failed (a retry resumes from there). */
  partialBytes?: number;
  /** Versions this copy has run, newest first. */
  history?: AppUpdateHistoryEntry[];
  whatsNew?: AppUpdateWhatsNew | null;
}

export type AppReleaseNotes =
  | {
      ok: true;
      version: string;
      title: string;
      /** Release notes as GitHub returned them (Markdown; the panel renders a safe subset). */
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
  if (/^checksum:|\bSHA1\b/i.test(s)) return 'checksum';
  if (/^disk:|not enough free space|ENOSPC/i.test(s)) return 'disk';
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
  /** `determinate`: `bytes` has a total; `indeterminate`: busy without one. */
  progress: 'indeterminate' | 'determinate' | null;
  /** Byte counts of Gum's own download. */
  bytes?: { received: number; total: number | null };
  /** "Check now" is offered (and not already running). */
  canCheck: boolean;
  canRestart: boolean;
  /** The running download can be cancelled (and resumed later). */
  canCancel?: boolean;
  /** "Check now" continues a cancelled or failed download where it stopped. */
  resumes?: boolean;
}

function describeDownload(d: AppUpdateDetails, dl: AppUpdateDownload): AppUpdateView {
  const version = dl.version || d.latestVersion || '';
  const bytes = { received: dl.received, total: dl.total };
  const busy = { tone: 'busy' as const, vars: { version }, canCheck: false, canRestart: false };
  switch (dl.phase) {
    case 'manifest':
      return { ...busy, messageKey: 'upd3.state.preparing', progress: 'indeterminate', canCancel: true };
    case 'verifying':
      return { ...busy, messageKey: 'upd3.state.verifying', progress: 'indeterminate', bytes };
    case 'installing':
      return { ...busy, messageKey: 'upd3.state.installing', progress: 'indeterminate' };
    case 'package':
    default:
      return {
        ...busy,
        messageKey: dl.deltas ? 'upd3.state.downloadingDelta' : 'upd3.state.downloading',
        progress: dl.total ? 'determinate' : 'indeterminate',
        bytes,
        canCancel: true,
      };
  }
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
      if (d.download) return describeDownload(d, d.download);
      return { tone: 'busy', messageKey: 'upd2.state.downloading', progress: 'indeterminate', canCheck: false, canRestart: false };
    case 'downloaded':
      return d.version
        ? { tone: 'ok', messageKey: 'upd2.state.ready', vars: { version: d.version }, progress: null, canCheck: false, canRestart: true }
        : { tone: 'ok', messageKey: 'upd2.state.readyNoVersion', progress: null, canCheck: false, canRestart: true };
    case 'error':
      return {
        tone: 'warn',
        messageKey: `upd2.error.${d.error ?? 'unknown'}`,
        progress: null,
        canCheck: true,
        canRestart: false,
        ...(d.partialBytes ? { resumes: true } : {}),
      };
    case 'idle':
    default:
      if (d.paused) {
        return {
          tone: 'muted',
          messageKey: 'upd3.state.paused',
          vars: { version: d.paused.version },
          progress: null,
          bytes: { received: d.paused.received, total: d.paused.total },
          canCheck: true,
          canRestart: false,
          resumes: true,
        };
      }
      if (d.skippedMetered) {
        return { tone: 'muted', messageKey: 'upd2.state.meteredSkipped', progress: null, canCheck: true, canRestart: false };
      }
      if (d.skippedVersion && d.latestVersion && d.skippedVersion === d.latestVersion) {
        return { tone: 'muted', messageKey: 'upd2.state.skipped', vars: { version: d.skippedVersion }, progress: null, canCheck: true, canRestart: false };
      }
      if (d.lastCheckedAt) {
        return { tone: 'ok', messageKey: 'upd2.state.upToDate', vars: { version: d.current }, progress: null, canCheck: true, canRestart: false };
      }
      // "Gum checks a minute after it starts …" is not true with automatic checks off or paused.
      return d.autoCheck === false || typeof d.pausedUntil === 'number'
        ? { tone: 'muted', messageKey: 'upd3.state.manualOnly', progress: null, canCheck: true, canRestart: false }
        : { tone: 'muted', messageKey: 'upd2.state.notChecked', progress: null, canCheck: true, canRestart: false };
  }
}
