/**
 * "A video is likely next": a media view (the Media Center, the YouTube app, a Continue
 * Watching row under the pointer) asks the window's player host to get ready before the
 * click — the media server warmed, the player surface mounted hidden with its connection.
 *
 * An event rather than a call so the asking view does not import the host (which is lazy
 * about the adopted bundle) and a window without a host simply has no listener.
 */
export const PLAYER_WARM_EVENT = 'gum:player-warm';
