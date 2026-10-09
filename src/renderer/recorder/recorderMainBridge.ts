/**
 * Main window half of "open a finished recording in the study player".
 *
 * Main (`regionRecorder.ts` `openJob`) cannot open the adopted media workspace
 * itself: that is an in-window DOM event (`MEDIA_WORKSPACE_OPEN_EVENT`). So it
 * asks this window, which answers with whether the workspace could be reached;
 * on `no-host` / `unavailable` main falls back to direct playback.
 *
 * The workspace bridge is loaded on the first request, so a Blanc window that
 * installs the study bridges pays nothing for it at boot.
 */
import { onWhisperDownloadsChanged } from '../whisperDownloadSignal';

/**
 * The workspace's own availability rule treats every non-`disabled` sidecar as present,
 * because the host explains `stopped` / `starting` / `failed` itself once opened. For a
 * recording that is the wrong trade when the sidecar binary is simply not installed: the
 * workspace can only say "the media server is not installed", the job reported "opened in
 * the player", and the recording just made played nowhere (measured live 2026-10-08 on a
 * checkout without `seanime.exe`). A missing binary therefore sends the file to the system
 * player instead; every recoverable state still opens the workspace.
 */
export function recordingPlayerReach(
  reach: string,
  status: { kind?: string; errorCode?: string | null } | null | undefined,
): string {
  if (reach !== 'ready') return reach;
  if (status?.kind === 'failed' && status.errorCode === 'missing-exe') return 'unavailable';
  return reach;
}

/**
 * The main window's other recorder duties, each loading its code on first use:
 *
 * - file a finished recording under its study day (Calendar + Statistics,
 *   `recordingStudyTag.ts`) when main asks;
 * - answer "is the Whisper model downloaded?" for recordings waiting on it;
 * - tell main when a model download finishes anywhere in the app (and once
 *   shortly after start), so recordings waiting for the model start on their own.
 */
function installRecorderStudyDuties(): Array<() => void> {
  const offs: Array<() => void> = [];
  const api = window.api;
  if (typeof api?.onRecorderStudyTag === 'function') {
    offs.push(api.onRecorderStudyTag((request) => {
      void (async () => {
        let ok = false;
        try {
          const { fileRecordingOnStudyDay } = await import('./recordingStudyTag');
          ok = fileRecordingOnStudyDay(request);
        } catch {
          ok = false;
        }
        api.recorderStudyTagReply({ requestId: request.requestId, ok });
      })();
    }));
  }
  if (typeof api?.onRecorderModelCheck === 'function') {
    offs.push(api.onRecorderModelCheck(({ requestId, lang }) => {
      void (async () => {
        let ready = false;
        try {
          const [{ isDownloadedIn, loadDownloaded }, { loadWhisperDevice, loadWhisperModelTier }, { isStudyLang }] = await Promise.all([
            import('../whisperModelCache'),
            import('../whisperSettings'),
            import('../../shared/studyLang'),
          ]);
          const study = isStudyLang(lang) ? lang : 'ja';
          ready = isDownloadedIn(loadDownloaded(), loadWhisperModelTier(study), loadWhisperDevice());
        } catch {
          ready = false;
        }
        api.recorderModelCheckReply({ requestId, ready });
      })();
    }));
  }
  if (typeof api?.recorderModelChanged === 'function') {
    offs.push(onWhisperDownloadsChanged(() => api.recorderModelChanged()));
    // A hello after boot: recordings left waiting by an earlier run start now if the
    // model arrived meanwhile, and untagged ones get their study day.
    const hello = window.setTimeout(() => api.recorderModelChanged(), 8000);
    offs.push(() => window.clearTimeout(hello));
  }
  return offs;
}

export function installRecorderMainBridge(): () => void {
  if (typeof window.api?.onRecorderOpenInPlayer !== 'function') return () => undefined;
  const duties = installRecorderStudyDuties();
  const offOpen = window.api.onRecorderOpenInPlayer(({ requestId, path }) => {
    void (async () => {
      let reach = 'unavailable';
      try {
        const { openMediaWorkspace, reachMediaWorkspace } = await import('../mediaWorkspaceBridge');
        reach = await reachMediaWorkspace();
        if (reach === 'ready') {
          let status = await window.api.seanimeStatus().catch(() => null);
          // A sidecar nobody has started yet has not looked for its binary; the workspace
          // would start it on open anyway, and a missing binary answers at once.
          if (status?.kind === 'stopped') status = await window.api.seanimeStart().catch(() => status);
          reach = recordingPlayerReach(reach, status);
        }
        if (reach === 'ready') openMediaWorkspace({ localFilePath: path });
      } catch {
        reach = 'unavailable';
      }
      window.api.recorderOpenInPlayerReply({ requestId, reach });
    })();
  });
  return () => {
    offOpen();
    for (const off of duties) off();
  };
}
