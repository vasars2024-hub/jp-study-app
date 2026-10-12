// Product pass 6: key sequences, palette scopes and search-by-key (kbd6.) — en.

import type { Catalog } from '../core';

export const KBD6_UI_EN: Catalog = {
  'kbd6.keys.sequence': '{first}, then {next}',
  'kbd6.seq.waiting': '{keys} pressed. Waiting for the next key…',
  'kbd6.seq.noCommand': '{keys} is not a shortcut.',
  'kbd6.palette.group.here': 'In this view',
  'kbd6.palette.group.keys': 'Bound to {keys}',
  'kbd6.palette.worksHere': 'Works here',
  'kbd6.palette.switchTo': 'Switch to {place} first',
  'kbd6.palette.openFirst': 'Open {place} first',
  'kbd6.conflict.startsTheirs': '{lead} starts the sequence {sequence} for {name}',
  'kbd6.conflict.startsMine': '{name} uses {lead}, which starts this sequence',
  'kbd6.settings.sequenceStart': 'Press the first key of the sequence…',
  'kbd6.settings.stepsSoFar': '{keys} … press the next key, or pause to save',
  'kbd6.settings.recordSequence': 'Record a sequence',
  'kbd6.settings.recordSequenceHint': 'Several keys in a row, like Ctrl+K then S. Saved after a pause; Esc cancels.',
  'kbd6.settings.findByKeys': 'Find by keys',
  'kbd6.settings.findByKeysHint': 'Press a shortcut to see what it is bound to',
  'kbd6.settings.findListening': 'Press the keys to look up, then pause. Esc cancels.',
  'kbd6.settings.findListeningShort': 'Listening…',
  'kbd6.settings.keyFilter': 'Keys: {keys}',
  'kbd6.settings.clearKeyFilter': 'Clear the key filter ({keys})',
  'kbd6.settings.keyFilterCount': { one: '{count} shortcut uses {keys}', other: '{count} shortcuts use {keys}' },
};
