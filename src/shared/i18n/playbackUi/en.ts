// Seamless playback (playback.) — the player's opening frame and the one failure screen it
// can show (media/PlayerFrame.tsx, media/MediaWorkspaceHost.tsx, Blanc's study player).
// While the media server starts, restarts or connects the player says only that the video
// is opening; words about the server appear only when it has really failed, with a Retry.
// English source of truth.

import type { Catalog } from '../core';

export const PLAYBACK_UI_EN: Catalog = {
  'playback.frame.opening': 'Opening {title}…',
  'playback.frame.openingVideo': 'Opening video…',
  'playback.frame.slow': 'Still getting the player ready…',

  'playback.failed.title': 'This video can’t play right now',
  'playback.failed.retry': 'Try again',
  'playback.failed.retrying': 'Trying again…',
  'playback.failed.back': 'Back',
  'playback.failed.details': 'Technical details',
  'playback.failed.crashed': 'The media server stopped several times in a row. Try again — if it keeps happening, restart Gum.',
  'playback.failed.unhealthy': 'The media server took too long to start. Try again.',
  'playback.failed.spawn-failed': 'Windows wouldn’t start Gum’s media server — security software may be blocking it. Allow Gum in your antivirus, then try again.',
  'playback.failed.missing-exe': 'Gum’s media server is missing from this install. Reinstall Gum to restore it.',
  'playback.failed.port': 'Gum couldn’t get a local port for video. Try again.',
  'playback.failed.disabled': 'Video playback is switched off for this session.',
  'playback.failed.connect': 'Gum couldn’t connect to its media server. Try again.',
  'playback.failed.player': 'The player couldn’t open this video. It may be damaged, or in a format Gum can’t play.',
};
