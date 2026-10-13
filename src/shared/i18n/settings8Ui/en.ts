// Settings pass 8 and widgets pass 7 (set8., wid7.) — en.
// Section resets that can be undone, the desktop reset that keeps sticky notes,
// translated custom-shortcut errors, and the widget options menu's name.

import type { Catalog } from '../core';

export const SETTINGS8_UI_EN: Catalog = {
  'set8.reset.dialogMessage': 'Every option in this section goes back to its default. You can undo it right after.',
  'set8.reset.done': '{section} is back to its defaults.',
  'set8.reset.undo': 'Undo',
  'set8.reset.undone': '{section} is restored.',
  'set8.reset.undoFailed': '{section} could not be restored.',
  'set8.desktopReset.dialogTitle': 'Reset this desktop?',
  'set8.desktopReset.dialogMessage': 'Closes every window and puts the icons, widgets and wallpaper of the active desktop back to their defaults. Sticky notes are kept. You can undo it right after.',
  'set8.desktopReset.desc': 'Closes windows and resets icons, widgets and wallpaper on the active desktop only. Sticky notes are kept. Desktop 1 and Desktop 2 keep separate layouts.',
  'set8.desktopReset.popoutHint': 'Reset the desktop from Settings in the main window — this pop-out has no desktop of its own.',
  'set8.monitors.dialogMessage': 'Forget every per-screen setting? Desktops and everything on them are kept, and each desktop returns to no assigned display. You can undo it right after.',
  'set8.shortcuts.error.nameRequired': 'Give the shortcut a name.',
  'set8.shortcuts.error.pickAction': 'Pick an action.',
  'set8.shortcuts.error.notFound': 'That custom shortcut no longer exists.',
  'set8.shortcuts.error.generic': 'The shortcut could not be saved.',
  'wid7.menu.label': 'Options for {name}',
};
