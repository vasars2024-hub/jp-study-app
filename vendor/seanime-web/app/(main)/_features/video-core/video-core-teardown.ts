// Gum: one release path for the player's managers, shared by "the stream ended" and "the
// player unmounted".
//
// The managers live in atoms scoped to `VideoCoreProvider`, so the atoms themselves go away
// with the provider, but three of them also register with globals that do not:
//   - the PiP manager listens on `document` (enterpictureinpicture / leavepictureinpicture),
//   - the media-session manager installs `navigator.mediaSession` action handlers,
//   - the preview manager owns a detached <video> that keeps its source loaded.
// Each reaches the player's <video>, and through its React fiber the whole player. VideoCore
// released them only when `playbackInfo` turned null while it was still mounted; the study
// host unmounts the player with a stream loaded (the video window closes), so every video
// watched left one player behind: measured on the packaged build 2026-09-26, about +500
// detached DOM nodes and +110 JS listeners per video, one more `enterpictureinpicture`
// listener on `document` each time, retainer paths `document -> V8EventListener -> PiP
// manager -> video` and `navigator.mediaSession -> action handler -> media-session manager ->
// video`.

type Destroyable = { destroy?: () => void } | null | undefined
type Cleanable = { cleanup?: () => void } | null | undefined
type MediaSessionLike = { setVideo: (video: null) => void, destroy: () => void } | null | undefined

export type VideoCoreReleasableManagers = {
    subtitleManager?: Destroyable
    mediaCaptionsManager?: Destroyable
    previewManager?: Cleanable
    anime4kManager?: Destroyable
    pipManager?: Destroyable
    mediaSessionManager?: MediaSessionLike
}

/** Destroy every manager that holds a global registration or a media resource. Idempotent. */
export function releaseVideoCoreManagers(managers: VideoCoreReleasableManagers): void {
    managers.subtitleManager?.destroy?.()
    managers.mediaCaptionsManager?.destroy?.()
    managers.previewManager?.cleanup?.()
    managers.anime4kManager?.destroy?.()
    managers.pipManager?.destroy?.()
    if (managers.mediaSessionManager) {
        managers.mediaSessionManager.setVideo(null)
        managers.mediaSessionManager.destroy()
    }
}
