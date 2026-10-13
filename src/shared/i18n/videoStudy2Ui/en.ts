// Video study, round 2 (vstudy.) — clip padding, condensed audio, "this line starts now"
// subtitle alignment, the player's keyboard help and the frame a card gets. English source
// of truth.

import type { Catalog } from '../core';

export const VIDEO_STUDY2_UI_EN: Catalog = {
  // ---- Card audio padding ----
  'vstudy.pad.group': 'Card audio',
  'vstudy.pad.before': 'Lead-in',
  'vstudy.pad.after': 'Tail',
  'vstudy.pad.ms': '{ms} ms',
  'vstudy.pad.stopAtNeighbours': 'Never run into the previous or next line',
  'vstudy.pad.note': 'Used for mined audio and clips, and for condensed audio.',

  // ---- Condensed audio ----
  'vstudy.condensed.button': 'Condensed audio (MP3)',
  'vstudy.condensed.hint': 'Every spoken line of this episode, back to back, as one MP3 to listen to anywhere.',
  'vstudy.condensed.progress': 'Cutting lines… {done} of {total}',
  'vstudy.condensed.cancel': 'Stop',
  'vstudy.condensed.done': 'Condensed audio saved: {minutes} min of speech.',
  'vstudy.condensed.skipped': {
    one: '{count} line could not be cut and was left out.',
    other: '{count} lines could not be cut and were left out.',
  },
  'vstudy.condensed.failed': 'Condensed audio could not be made: no line could be cut from this file.',
  'vstudy.condensed.empty': 'This track has no spoken lines to condense.',
  'vstudy.condensed.cancelled': 'Condensed audio stopped.',

  // ---- "This line starts now" ----
  'vstudy.align.previous': 'Previous line starts now',
  'vstudy.align.next': 'Next line starts now',
  'vstudy.align.hint': 'Press while the line is being spoken: the subtitle delay is set so that line starts at this moment.',
  'vstudy.align.none': 'There is no line to line up here.',
  'vstudy.align.done': 'Subtitle delay set to {delay} s.',

  // ---- Keyboard help ----
  'vstudy.keys.title': 'Keyboard shortcuts',
  'vstudy.keys.study': 'Study keys',
  'vstudy.keys.unbound': 'not set',
  'vstudy.keys.note': 'Press ? to show or hide this list. Study keys are changed in Settings › Keyboard shortcuts.',

  // ---- The card's picture ----
  'vstudy.frame.notOnScreen': 'Play the line to take its picture: a stream has no file to cut a frame from.',
};
