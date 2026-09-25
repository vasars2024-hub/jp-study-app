/**
 * The application menu — deliberately none on Windows and Linux.
 *
 * No window here shows a menu bar, but `autoHideMenuBar` only hid Electron's
 * default one: Alt still revealed File/Edit/View/Window, and its role accelerators
 * stayed live underneath the app's own shortcuts — Ctrl+W closed the whole window,
 * Ctrl+R reloaded the renderer (dropping unsaved state), F11 and Ctrl+=/-/0 did
 * Chromium's fullscreen and page zoom whenever the renderer did not claim the key
 * first. The app binds every one of those itself (`keyboardShortcuts.ts`).
 *
 * Text editing does not need a menu on Windows or Linux: Chromium handles
 * Ctrl+C/V/X/Z/Y/A in editable fields natively. macOS routes those through the menu,
 * so there the menu is the minimal app + Edit + Window set of roles.
 *
 * DevTools lost its default Ctrl+Shift+I with the menu; unpackaged (development)
 * runs get it back, with F12, through `before-input-event` on every window.
 */
import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';

/** Minimal macOS menu: the roles that make Cmd+C/V/X/Z/A and Cmd+Q/W/M work. */
export function macMenuTemplate(): MenuItemConstructorOptions[] {
  return [{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }];
}

/** The menu for a platform: `null` means no application menu at all. */
export function appMenuTemplate(platform: NodeJS.Platform): MenuItemConstructorOptions[] | null {
  return platform === 'darwin' ? macMenuTemplate() : null;
}

interface KeyInput {
  type: string;
  key: string;
  control: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
}

/** True for the development-only DevTools toggles: Ctrl+Shift+I (Cmd+Alt+I on macOS) and F12. */
export function isDevToolsChord(input: KeyInput, platform: NodeJS.Platform = process.platform): boolean {
  if (input.type !== 'keyDown') return false;
  if (input.key === 'F12' && !input.control && !input.shift && !input.alt && !input.meta) return true;
  if (input.key.toLowerCase() !== 'i') return false;
  return platform === 'darwin'
    ? input.meta && input.alt && !input.control && !input.shift
    : input.control && input.shift && !input.alt && !input.meta;
}

/** Give a window the development DevTools toggle; every other key passes through untouched. */
export function attachDevToolsAccelerator(win: Pick<BrowserWindow, 'webContents'>): void {
  win.webContents.on('before-input-event', (event, input) => {
    if (!isDevToolsChord(input)) return;
    event.preventDefault();
    win.webContents.toggleDevTools();
  });
}

/** Install the application menu. Call once, after `app` is ready. */
export function installAppMenu(opts: { devTools?: boolean } = {}): void {
  const template = appMenuTemplate(process.platform);
  Menu.setApplicationMenu(template ? Menu.buildFromTemplate(template) : null);
  const devTools = opts.devTools ?? !app.isPackaged;
  if (devTools) {
    app.on('browser-window-created', (_event, win) => attachDevToolsAccelerator(win));
  }
}
