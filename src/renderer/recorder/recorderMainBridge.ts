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
export function installRecorderMainBridge(): () => void {
  if (typeof window.api?.onRecorderOpenInPlayer !== 'function') return () => undefined;
  return window.api.onRecorderOpenInPlayer(({ requestId, path }) => {
    void (async () => {
      let reach = 'unavailable';
      try {
        const { openMediaWorkspace, reachMediaWorkspace } = await import('../mediaWorkspaceBridge');
        reach = await reachMediaWorkspace();
        if (reach === 'ready') openMediaWorkspace({ localFilePath: path });
      } catch {
        reach = 'unavailable';
      }
      window.api.recorderOpenInPlayerReply({ requestId, reach });
    })();
  });
}
