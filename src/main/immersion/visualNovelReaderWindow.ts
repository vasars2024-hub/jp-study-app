/**
 * The VN reader: a small always-on-top window that sits next to the game and
 * shows the last captured lines, with click-a-word lookup, sentence translate
 * and one-click mining.
 *
 * It exists because the reading loop was unusable inside the Immersion window:
 * the captured-line list was the fourth thing down a 3,699 px workspace in a
 * 318 px view, below 52 buttons and 10 disclosures, and switching to that window
 * put it on top of the game. Modelled on `main/systemDictionary.ts`'s overlay
 * (frameless, always-on-top, same renderer bundle on a query flag), except that
 * this one is a place you keep open rather than a popup: it is movable and
 * resizable, does not hide on blur, and remembers where you left it.
 */
import { BrowserWindow, screen } from 'electron';
import path from 'node:path';
import type { VisualNovelReaderSettings } from '../../shared/visualNovel';

type RendererUrlFn = (query?: string) => string;

let rendererUrl: RendererUrlFn = () => 'app://bundle/index.html';
let forwardConsole: ((win: BrowserWindow) => void) | null = null;
let attachNavGuards: ((win: BrowserWindow) => void) | null = null;
let isDev = false;
let reader: BrowserWindow | null = null;
let targetId = '';

export const READER_DEFAULT_WIDTH = 460;
export const READER_DEFAULT_HEIGHT = 300;

export function configureVisualNovelReader(options: {
  rendererUrl: RendererUrlFn;
  forwardConsole?: (win: BrowserWindow) => void;
  attachNavGuards?: (win: BrowserWindow) => void;
  isDevServer: boolean;
}): void {
  rendererUrl = options.rendererUrl;
  forwardConsole = options.forwardConsole ?? null;
  attachNavGuards = options.attachNavGuards ?? null;
  isDev = options.isDevServer;
}

/** The novel the reader follows. */
export function readerTarget(): string {
  return targetId;
}

export function isReaderOpen(): boolean {
  return !!reader && !reader.isDestroyed() && reader.isVisible();
}

/**
 * Default placement: the bottom-right of the display under the cursor, where a
 * VN's own text box usually is NOT (most put it bottom-centre).
 */
function defaultBounds(): { x: number; y: number; width: number; height: number } {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return {
    width: READER_DEFAULT_WIDTH,
    height: READER_DEFAULT_HEIGHT,
    x: area.x + area.width - READER_DEFAULT_WIDTH - 24,
    y: area.y + area.height - READER_DEFAULT_HEIGHT - 24,
  };
}

/** Keep a remembered position on a display that still exists. */
function visibleBounds(bounds: VisualNovelReaderSettings['bounds']) {
  if (!bounds) return defaultBounds();
  const onScreen = screen.getAllDisplays().some(({ workArea }) => (
    bounds.x + 40 < workArea.x + workArea.width
    && bounds.x + bounds.width - 40 > workArea.x
    && bounds.y >= workArea.y - 10
    && bounds.y + 30 < workArea.y + workArea.height
  ));
  return onScreen ? bounds : defaultBounds();
}

function broadcastTarget(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('visual-novel:readerTarget', targetId);
  }
}

export function openVisualNovelReader(
  visualNovelId: string,
  settings: VisualNovelReaderSettings,
  onBoundsChanged: (bounds: { x: number; y: number; width: number; height: number }) => void,
): void {
  if (visualNovelId) targetId = visualNovelId;
  broadcastTarget();
  if (reader && !reader.isDestroyed()) {
    reader.setOpacity(settings.opacity);
    reader.showInactive();
    return;
  }
  const bounds = visibleBounds(settings.bounds);
  const win = new BrowserWindow({
    ...bounds,
    minWidth: 280,
    minHeight: 150,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    minimizable: true,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#15141a',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });
  reader = win;
  // Above a borderless-windowed game. An exclusive-fullscreen game owns the
  // display and nothing can float over it; the reader says so in its setup text.
  win.setAlwaysOnTop(true, 'floating');
  win.setOpacity(settings.opacity);
  attachNavGuards?.(win);
  if (isDev) forwardConsole?.(win);
  // `showInactive`: opening the reader must not steal focus from the game the
  // user just launched.
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.showInactive();
  });
  let saveTimer: NodeJS.Timeout | null = null;
  const remember = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!win.isDestroyed()) onBoundsChanged(win.getBounds());
    }, 400);
  };
  win.on('moved', remember);
  win.on('resized', remember);
  win.on('closed', () => {
    if (saveTimer) clearTimeout(saveTimer);
    if (reader === win) reader = null;
  });
  void win.loadURL(rendererUrl('vnReader=1'));
}

export function setReaderOpacity(opacity: number): void {
  if (reader && !reader.isDestroyed()) reader.setOpacity(opacity);
}

export function closeVisualNovelReader(): void {
  if (reader && !reader.isDestroyed()) reader.close();
  reader = null;
}
