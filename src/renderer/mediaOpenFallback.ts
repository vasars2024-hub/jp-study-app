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
}

/**
 * Where an opened video can go. A sidecar nobody has started has not looked for its
 * binary yet, so it is started here (the workspace would start it on open anyway). A
 * missing binary answers at once; a start still running after `waitMs` therefore has
 * a binary, and the workspace — which shows "starting" — is the right place for it.
 */
export async function probeMediaServer(api: MediaServerProbeApi, waitMs = 1500): Promise<MediaServerReach> {
  let status = await api.seanimeStatus().catch(() => null);
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
