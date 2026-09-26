// Desktop shell chrome: Start menu, taskbar, windows, quick settings, toasts, calendar and theme editor (round-2 a11y/visual pass). — English source of truth.

import type { Catalog } from '../core';

export const SHELL_UI_EN: Catalog = {
  // Shared shell verbs.
  'shell.undo': 'Undo',
  'shell.window.reopen': 'Reopen {name}',

  // Widgets ▸ Reset workspace layout: a destructive action, so it asks first and can be undone.
  'shell.widgets.reset.title': 'Reset the widget layout?',
  'shell.widgets.reset.message': {
    one: 'This removes {count} widget from the desktop. You can undo it right after.',
    other: 'This removes all {count} widgets from the desktop. You can undo it right after.',
  },
  'shell.widgets.reset.confirm': 'Reset layout',
  'shell.widgets.reset.done': 'Widget layout reset',
  'shell.widgets.reset.restored': 'Widget layout restored',

  // The empty-desktop "Start here" card shown once the tour is over.
  'shell.startHere.title': 'Start here',
  'shell.startHere.lead': 'Pick one to begin.',
  'shell.startHere.videos': 'Add videos',
  'shell.startHere.videosHint': 'Watch with subtitles and save new words',
  'shell.startHere.deck': 'Import a deck',
  'shell.startHere.deckHint': 'Bring in an Anki or CSV deck',
  'shell.startHere.book': 'Open a book',
  'shell.startHere.bookHint': 'Read an EPUB with instant lookup',
  'shell.startHere.dismiss': 'Dismiss',

  // Byte-size units, used by formatBytes through the UI locale.
  'shell.unit.byte': 'B',
  'shell.unit.kb': 'KB',
  'shell.unit.mb': 'MB',
  'shell.unit.gb': 'GB',
  'shell.unit.tb': 'TB',

  // Theme editor: readable names for the customisable tokens (the CSS name stays beside them).
  'shell.themeToken.accent-weak': 'Accent (soft)',
  'shell.themeToken.bg': 'Background',
  'shell.themeToken.panel': 'Panel',
  'shell.themeToken.panel-2': 'Panel (raised)',
  'shell.themeToken.sidebar': 'Sidebar',
  'shell.themeToken.text': 'Text',
  'shell.themeToken.muted': 'Secondary text',
  'shell.themeToken.border': 'Border',
  'shell.themeToken.glass-tint': 'Glass tint',
  'shell.themeToken.glass-border': 'Glass edge',
  'shell.themeToken.font-display': 'Display font',
  'shell.themeToken.font-mono': 'Monospace font',
  'shell.themeToken.font-size-2xs': 'Text size: smallest',
  'shell.themeToken.font-size-xs': 'Text size: extra small',
  'shell.themeToken.font-size-sm': 'Text size: small',
  'shell.themeToken.font-size-md': 'Text size: medium',
  'shell.themeToken.font-size-lg': 'Text size: large',
  'shell.themeToken.line-height-normal': 'Line height',
  'shell.themeToken.control-radius': 'Control corners',
  'shell.themeToken.glass-blur': 'Glass blur',
  'shell.themeToken.motion-duration': 'Animation length',
  'shell.themeToken.dur-fast': 'Fast transition',
  'shell.themeToken.dur-normal': 'Normal transition',
  'shell.themeToken.scrollbar-size': 'Scrollbar width',
};
