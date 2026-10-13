/**
 * A video opened from outside the app ("Open with Gum", a double-click on an
 * associated .mp4, a dropped file) when the media server cannot play it.
 *
 * The study player lives in the media workspace, which needs the Seanime sidecar.
 * The workspace's availability rule (`mediaWorkspaceAvailability.ts`) counts every
 * non-`disabled` sidecar as present, because the host explains `stopped` /
 * `starting` / `failed` itself once it is open — but when the BINARY is missing
 * the only thing it can say is "not installed", so an opened file dead-ended in
 * a notice (2026-10 hardware run: the file was imported, nothing played, and the
 * user was given nothing to do). `recorderMainBridge.ts` already made the same
 * call for finished recordings.
 *
 * So the opened-file path asks first. A missing binary or a disabled sidecar keeps
 * the import (it already happened) and offers the system player, saying why;
 * every recoverable state still opens the workspace, which explains itself.
 */
import type { SeanimeStatus } from '../shared/seanime';

export type MediaServerReach = 'workspace' | 'missing' | 'disabled';

type StatusLike = Pick<SeanimeStatus, 'kind'> & { errorCode?: SeanimeStatus['errorCode'] | null };

export function mediaServerReachFor(status: StatusLike | null | undefined): MediaServerReach {
  if (status?.kind === 'disabled') return 'disabled';
  if (status?.kind === 'failed' && status.errorCode === 'missing-exe') return 'missing';
  return 'workspace';
}

export interface MediaServerProbeApi {
  seanimeStatus(): Promise<StatusLike | null>;
  seanimeStart(): Promise<StatusLike | null>;
  /** Start without waiting (main/seanime/lifecycle.ts). Absent on an older preload. */
  seanimeWarm?(delayMs?: number): Promise<StatusLike | null>;
}

/**
 * Where an opened video can go.
 *
 * Main now answers "is there a binary?" before anything is spawned
 * (`primeSeanimeStatus`), so a `stopped` sidecar HAS one: it is warmed here without
 * waiting and the workspace — which holds the request and plays it the moment the server
 * is up — is the right place at once. This used to start it and wait up to `waitMs`
 * (1.5 s) on every open of a file while the server was down.
 *
 * Without `seanimeWarm` (an older preload) the old rule stands: start it, and a start
 * still running after `waitMs` has a binary.
 */
export async function probeMediaServer(api: MediaServerProbeApi, waitMs = 1500): Promise<MediaServerReach> {
  let status = await api.seanimeStatus().catch(() => null);
  if (status?.kind === 'stopped' && typeof api.seanimeWarm === 'function') {
    void api.seanimeWarm(0).catch(() => null);
    return mediaServerReachFor(status);
  }
  if (status?.kind === 'stopped') {
    const started = await Promise.race([
      api.seanimeStart().catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), waitMs)),
    ]);
    if (started) status = started;
  }
  return mediaServerReachFor(status);
}

export interface NoServerNotice {
  messageKey: 'mediaWorkspace.openFile.serverMissing' | 'mediaWorkspace.openFile.serverOff';
  actionKey: 'mediaWorkspace.openFile.systemPlayer';
  /** Where the Media Center lands: the inline player only exists without a sidecar. */
  tab: 'video' | 'library';
}

export function noServerNotice(reach: Exclude<MediaServerReach, 'workspace'>): NoServerNotice {
  return reach === 'disabled'
    ? { messageKey: 'mediaWorkspace.openFile.serverOff', actionKey: 'mediaWorkspace.openFile.systemPlayer', tab: 'video' }
    : { messageKey: 'mediaWorkspace.openFile.serverMissing', actionKey: 'mediaWorkspace.openFile.systemPlayer', tab: 'library' };
}
