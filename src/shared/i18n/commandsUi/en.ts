// Command labels, command palette, keyboard shortcut help and player key names (round-2 keyboard pass). — English source of truth.

import type { Catalog } from '../core';

export const COMMANDS_UI_EN: Catalog = {
  // ---- shortcut manager: toasts, custom-shortcut descriptions, undo ----
  'shortcut.toast.toolboxGlobal': 'Toolbox global shortcut: {error}',
  'shortcut.toast.appToggle': 'Hide/show Gum shortcut: {error}',
  'shortcut.toast.appRestart': 'Full restart shortcut: {error}',
  'shortcut.toast.startupHelper': 'Startup helper: {error}',
  'shortcut.custom.opens': 'Opens {name}',
  'shortcut.custom.runs': 'Runs “{name}”',
  'shortcut.custom.stack': 'Stack: {names}',
  'shortcut.custom.dispatches': 'Dispatches {event}',
  'shortcut.custom.dispatchesDetail': 'Dispatches {event} ({detail})',
  'shortcut.undo.nothing': 'Nothing to undo',
  'shortcut.undo.done': 'Undid: {action}',
  'shortcut.undo.doneGeneric': 'Undone',
  // ---- Settings > Study: subtitle style (the searchable door to the player's own settings) ----
  'playerUi.subtitleStyle.title': 'Subtitle style',
  'playerUi.subtitleStyle.desc': 'How subtitles look in the video player',
  'playerUi.subtitleStyle.size': 'Subtitle size',
  'playerUi.subtitleStyle.px': '{size} px',
  'playerUi.subtitleStyle.more':
    'Position and background are in Watch > Media Settings. Colour, font and outline are under Study in the player while a video plays.',
  'playerUi.subtitleStyle.open': 'Open player subtitle settings',
};
