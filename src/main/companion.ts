/**
 * The desktop companion — Gum over every other app on the computer.
 *
 * The Chrome extension reaches Gum from a web page; this reaches it from any
 * Windows program (a PDF reader, a game, a video player, a chat app). It owns
 * three small always-on-top surfaces, built like the popup dictionary's
 * overlay (frameless, transparent, reused rather than rebuilt per use):
 *
 *  - the radial wheel (`?companion=wheel`) at the cursor: look up, word under
 *    the cursor, Lens region, card preview, save sentence, translate, record
 *    audio (when live captions registered its command), open Gum;
 *  - the card preview (`?companion=preview`): the drafted card with its
 *    source window and picture, editable, with Add;
 *  - a notice (`?companion=notice`): a pill that says what just happened
 *    ("Added to your deck", "Capture started") without taking focus.
 *
 * Mining runs in the main window's renderer (its deck lives in that window's
 * storage), so an Add here is forwarded there and the answer comes back.
 * A request made while the main window is closed or still loading waits in a
 * queue and is re-sent when the window says it is ready; mining is idempotent
 * per card, so a re-send never makes two cards.
 */

import { BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import {
  captureSelection,
  lastCompanionLookup,
  noteCompanionLookup,
  quickForegroundInfo,
  type ForegroundInfo,
} from './companionContext';
import {
  getGlobalCommandChord,
  getGlobalCommandStatus,
  refreshGlobalCommands,
  registerGlobalCommand,
  runGlobalCommand,
} from './globalCommands';
import { lookUpSelection } from './systemDictionary';
import { openReadingLens } from './readingLens';
import {
  buildWheelActions,
  CAPTIONS_CAPTURE_COMMAND_IDS,
  draftFromText,
  normalizeDraft,
  type CompanionDraft,
  type CompanionMineOutcome,
  type CompanionMineRequest,
  type CompanionWheelActionId,
  type CompanionWheelInit,
} from '../shared/companion';

type RendererUrlFn = (query?: string) => string;
type WindowHook = (win: BrowserWindow) => void;

export interface CompanionNotice {
  /** An i18n key the notice window resolves in the UI language. */
  messageKey: string;
  vars?: Record<string, string | number>;
  tone?: 'ok' | 'muted' | 'warn';
}

interface CompanionDeps {
  rendererUrl: RendererUrlFn;
  forwardConsole?: WindowHook;
  attachNavGuards?: WindowHook;
  isDevServer: boolean;
  /** The primary Study OS window, when it exists. */
  getMainWindow: () => BrowserWindow | null;
  /** Create the main window (hidden) so a queued mine has somewhere to land. */
  ensureMainWindow: () => void;
}

let deps: CompanionDeps | null = null;

export function configureCompanion(next: CompanionDeps): void {
  deps = next;
}

// ---- Window factory -------------------------------------------------------

type Kind = 'wheel' | 'preview' | 'notice';

const SIZE: Record<Kind, { width: number; height: number }> = {
  wheel: { width: 320, height: 320 },
  preview: { width: 392, height: 520 },
  notice: { width: 360, height: 72 },
};

const windows: Record<Kind, BrowserWindow | null> = { wheel: null, preview: null, notice: null };
/** What each surface should show next, pulled on load and pushed afterwards. */
let wheelInit: CompanionWheelInit | null = null;
let wheelSource: ForegroundInfo | null = null;
let wheelCenter: { x: number; y: number } | null = null;
let previewDraft: CompanionDraft | null = null;
let notice: CompanionNotice | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

function preloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function clampToWorkArea(
  box: { x: number; y: number; width: number; height: number },
  point: { x: number; y: number },
): { x: number; y: number } {
  const area = screen.getDisplayNearestPoint(point).workArea;
  return {
    x: Math.round(Math.min(Math.max(area.x, box.x), area.x + area.width - box.width)),
    y: Math.round(Math.min(Math.max(area.y, box.y), area.y + area.height - box.height)),
  };
}

function placeFor(kind: Kind, cursor: { x: number; y: number }): { x: number; y: number } {
  const { width, height } = SIZE[kind];
  if (kind === 'wheel') return clampToWorkArea({ x: cursor.x - width / 2, y: cursor.y - height / 2, width, height }, cursor);
  if (kind === 'notice') {
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    return { x: Math.round(area.x + (area.width - width) / 2), y: Math.round(area.y + area.height - height - 24) };
  }
  return clampToWorkArea({ x: cursor.x + 16, y: cursor.y + 16, width, height }, cursor);
}

/** Push the surface's current payload (after load, and on every reuse). */
function pushPayload(kind: Kind): void {
  const win = windows[kind];
  if (!win || win.isDestroyed()) return;
  if (kind === 'wheel') win.webContents.send('companion:wheel', wheelInit);
  else if (kind === 'preview') win.webContents.send('companion:preview', previewDraft);
  else win.webContents.send('companion:notice', notice);
}

function surface(kind: Kind, at: { x: number; y: number }, opts: { focus: boolean }): BrowserWindow | null {
  if (!deps) return null;
  const { width, height } = SIZE[kind];
  const { x, y } = placeFor(kind, at);
  const existing = windows[kind];
  if (existing && !existing.isDestroyed()) {
    existing.setBounds({ x, y, width, height });
    pushPayload(kind);
    if (opts.focus) {
      existing.show();
      existing.focus();
    } else {
      existing.showInactive();
    }
    return existing;
  }
  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    focusable: kind !== 'notice',
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: { preload: preloadPath(), backgroundThrottling: false },
  });
  windows[kind] = win;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  if (kind === 'notice') win.setIgnoreMouseEvents(true);
  deps.attachNavGuards?.(win);
  if (deps.isDevServer) deps.forwardConsole?.(win);
  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    if (opts.focus) {
      win.show();
      win.focus();
    } else {
      win.showInactive();
    }
  });
  // The wheel is a popup: clicking anywhere else dismisses it.
  if (kind === 'wheel') win.on('blur', () => hideSurface('wheel'));
  win.on('closed', () => {
    if (windows[kind] === win) windows[kind] = null;
  });
  win.webContents.on('did-finish-load', () => pushPayload(kind));
  void win.loadURL(deps.rendererUrl(`companion=${kind}`));
  return win;
}

function hideSurface(kind: Kind): void {
  const win = windows[kind];
  if (win && !win.isDestroyed()) win.hide();
}

export function isCompanionSurfaceOpen(kind: Kind): boolean {
  const win = windows[kind];
  return Boolean(win && !win.isDestroyed() && win.isVisible());
}

// ---- Notice ----------------------------------------------------------------

/** A short, non-focusing confirmation near the bottom of the screen. */
export function showCompanionNotice(next: CompanionNotice, ms = 2400): void {
  notice = next;
  surface('notice', screen.getCursorScreenPoint(), { focus: false });
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => hideSurface('notice'), ms);
}

// ---- Card preview ---------------------------------------------------------

/** Open the card preview on a draft (from the wheel, the popup dictionary or the Lens). */
export function openCardPreview(draft: CompanionDraft): void {
  previewDraft = draft;
  noteCompanionLookup({
    text: draft.word,
    ...(draft.sentence ? { sentence: draft.sentence } : {}),
    ...(draft.sourceTitle ? { sourceTitle: draft.sourceTitle } : {}),
    ...(draft.sourceApp ? { sourceApp: draft.sourceApp } : {}),
  });
  surface('preview', screen.getCursorScreenPoint(), { focus: true });
}

async function previewFromSelection(target?: ForegroundInfo | null): Promise<void> {
  const source = target === undefined ? await quickForegroundInfo() : target;
  const captured = await captureSelection(source);
  const from = captured.source ?? source;
  const draft = draftFromText(captured.text, {
    origin: target === undefined ? 'selection' : 'wheel',
    sourceTitle: from?.title,
    sourceApp: from?.process,
  });
  if (!draft) {
    showCompanionNotice({ messageKey: 'companion.notice.nothingSelected', tone: 'muted' });
    return;
  }
  openCardPreview(draft);
}

// ---- Mining through the main window ---------------------------------------

interface Waiter {
  request: CompanionMineRequest;
  resolve: (outcome: CompanionMineOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

let seq = 0;
const inFlight = new Map<string, Waiter>();
let readyWebContentsId: number | null = null;
/** How long an Add waits for the main window before answering "waiting". */
const MINE_TIMEOUT_MS = 20_000;

function readyMainWindow(): BrowserWindow | null {
  const win = deps?.getMainWindow() ?? null;
  if (!win || win.isDestroyed()) return null;
  return win.webContents.id === readyWebContentsId ? win : null;
}

function send(id: string, request: CompanionMineRequest): boolean {
  const win = readyMainWindow();
  if (!win) return false;
  win.webContents.send('companion:mine', { requestId: id, request });
  return true;
}

/**
 * Hand a card to the main window's `mineToStudy`. Resolves with what happened;
 * a main window that is not up within the timeout answers `waiting`, and the
 * request stays queued until it is.
 */
export function forwardCompanionMine(request: CompanionMineRequest): Promise<CompanionMineOutcome> {
  const id = `m${++seq}`;
  return new Promise<CompanionMineOutcome>((resolve) => {
    const timer = setTimeout(() => {
      const waiter = inFlight.get(id);
      if (!waiter) return;
      // Still queued: it is sent the moment the window is ready; the caller
      // hears "waiting" now instead of hanging.
      waiter.resolve = () => undefined;
      resolve({ status: 'waiting' });
    }, MINE_TIMEOUT_MS);
    inFlight.set(id, { request, resolve, timer });
    if (!send(id, request)) {
      const win = deps?.getMainWindow() ?? null;
      if (!win || win.isDestroyed()) deps?.ensureMainWindow();
    }
  });
}

function settleMine(id: string, outcome: CompanionMineOutcome): void {
  const waiter = inFlight.get(id);
  if (!waiter) return;
  clearTimeout(waiter.timer);
  inFlight.delete(id);
  waiter.resolve(outcome);
  if (outcome.status === 'added' || outcome.status === 'exists') {
    showCompanionNotice({
      messageKey:
        outcome.status === 'exists'
          ? 'companion.notice.exists'
          : outcome.anki === 'added'
            ? 'companion.notice.addedAnki'
            : outcome.anki === 'queued'
              ? 'companion.notice.addedQueued'
              : 'companion.notice.added',
      vars: { word: waiter.request.draft.word.slice(0, 40) },
      tone: 'ok',
    });
  } else if (outcome.status === 'failed') {
    showCompanionNotice({ messageKey: 'companion.notice.failed', tone: 'warn' });
  }
}

/** The main window's renderer is listening: (re-)send everything not yet answered. */
function onMainReady(webContentsId: number): void {
  // Pop-outs and secondary desktops run the same App and say "ready" too; only
  // the primary window's renderer owns the deck this forwards to.
  const main = deps?.getMainWindow() ?? null;
  if (!main || main.isDestroyed() || main.webContents.id !== webContentsId) return;
  readyWebContentsId = webContentsId;
  for (const [id, waiter] of inFlight) send(id, waiter.request);
  for (const command of pendingRendererCommands.splice(0)) sendRendererCommand(command);
}

async function mineDraft(draft: CompanionDraft, attachImage = true): Promise<CompanionMineOutcome> {
  return forwardCompanionMine({ draft, attachImage });
}

async function mineLastLookup(): Promise<void> {
  const last = lastCompanionLookup();
  const draft = last
    ? draftFromText(last.text, {
      origin: 'last',
      sentence: last.sentence,
      sourceTitle: last.sourceTitle,
      sourceApp: last.sourceApp,
    })
    : null;
  if (!draft) {
    showCompanionNotice({ messageKey: 'companion.notice.nothingLookedUp', tone: 'muted' });
    return;
  }
  const outcome = await mineDraft(draft, false);
  if (outcome.status === 'waiting') showCompanionNotice({ messageKey: 'companion.notice.waiting', tone: 'muted' });
}

async function saveSentence(target: ForegroundInfo | null): Promise<void> {
  const captured = await captureSelection(target);
  const from = captured.source ?? target;
  const text = captured.text.replace(/\s+/g, ' ').trim();
  const draft = text
    ? normalizeDraft({
      ...draftFromText(text, { origin: 'wheel', sourceTitle: from?.title, sourceApp: from?.process }),
      kind: 'sentence',
      word: text.slice(0, 200),
      sentence: text,
    })
    : null;
  if (!draft) {
    showCompanionNotice({ messageKey: 'companion.notice.nothingSelected', tone: 'muted' });
    return;
  }
  const outcome = await mineDraft(draft, false);
  if (outcome.status === 'waiting') showCompanionNotice({ messageKey: 'companion.notice.waiting', tone: 'muted' });
}

// ---- Commands the main window's renderer runs ------------------------------

const pendingRendererCommands: string[] = [];

function sendRendererCommand(command: string): void {
  const win = readyMainWindow();
  if (!win) {
    pendingRendererCommands.push(command);
    return;
  }
  win.webContents.send('companion:runInRenderer', command);
}

// ---- Radial wheel -----------------------------------------------------------

function audioCommandId(): string | null {
  return CAPTIONS_CAPTURE_COMMAND_IDS.find((id) => getGlobalCommandStatus(id)?.hasHandler) ?? null;
}

export async function openCompanionWheel(): Promise<void> {
  const source = await quickForegroundInfo();
  wheelSource = source;
  wheelCenter = screen.getCursorScreenPoint();
  const actions = buildWheelActions({ audioCommandId: audioCommandId() }).map((a) => ({
    ...a,
    chord: a.commandId ? getGlobalCommandChord(a.commandId) : '',
  }));
  wheelInit = { actions, ...(source?.title ? { sourceTitle: source.title } : {}) };
  surface('wheel', wheelCenter, { focus: true });
}

/** A wheel slot was picked (click, key 1–8). The wheel hides before the action runs. */
export async function runWheelAction(id: CompanionWheelActionId): Promise<boolean> {
  const action = wheelInit?.actions.find((a) => a.id === id);
  if (!action) return false;
  hideSurface('wheel');
  const source = wheelSource;
  const at = wheelCenter ?? undefined;
  switch (id) {
    case 'lookup':
      await lookUpSelection({ target: source });
      return true;
    case 'translate':
      await lookUpSelection({ target: source, mode: 'translate' });
      return true;
    case 'cursor':
      await openReadingLens('cursor', source, at);
      return true;
    case 'lens':
      await openReadingLens('select', source);
      return true;
    case 'preview':
      await previewFromSelection(source);
      return true;
    case 'sentence':
      await saveSentence(source);
      return true;
    case 'audio':
    case 'open':
      return runGlobalCommand(action.commandId);
    default:
      return false;
  }
}

// ---- Global commands ---------------------------------------------------------

let started = false;
let commandsRegistered = false;

function ensureCommands(): void {
  if (commandsRegistered) return;
  commandsRegistered = true;
  const available = (): boolean => started;
  registerGlobalCommand('companion.wheel', () => openCompanionWheel(), { available });
  registerGlobalCommand('companion.cardPreview', () => previewFromSelection(), { available });
  registerGlobalCommand('companion.mineLast', () => mineLastLookup(), { available });
  registerGlobalCommand('app.toggleMiniView', () => {
    runGlobalCommand('app.focus');
    sendRendererCommand('miniView.toggle');
  }, { available });
}

export function startCompanion(): void {
  started = true;
  ensureCommands();
  // `available` is a function; one reconcile re-reads it.
  refreshGlobalCommands();
}

export function stopCompanion(): void {
  started = false;
  refreshGlobalCommands();
  for (const kind of Object.keys(windows) as Kind[]) {
    const win = windows[kind];
    if (win && !win.isDestroyed()) win.destroy();
    windows[kind] = null;
  }
}

export function registerCompanionIpc(): void {
  ensureCommands();
  ipcMain.handle('companion:getWheel', (): CompanionWheelInit | null => wheelInit);
  ipcMain.handle('companion:wheelRun', (_e, id: unknown): Promise<boolean> =>
    typeof id === 'string' ? runWheelAction(id as CompanionWheelActionId) : Promise.resolve(false),
  );
  ipcMain.handle('companion:wheelClose', (): void => hideSurface('wheel'));
  ipcMain.handle('companion:getPreview', (): CompanionDraft | null => previewDraft);
  ipcMain.handle('companion:openPreview', (_e, raw: unknown): boolean => {
    const draft = normalizeDraft(raw);
    if (!draft) return false;
    openCardPreview(draft);
    return true;
  });
  ipcMain.handle('companion:previewClose', (): void => hideSurface('preview'));
  ipcMain.handle('companion:mine', (_e, raw: unknown): Promise<CompanionMineOutcome> => {
    const r = (raw ?? {}) as Partial<CompanionMineRequest>;
    const draft = normalizeDraft(r.draft);
    if (!draft) return Promise.resolve({ status: 'failed', error: 'invalid-draft' });
    return forwardCompanionMine({ draft, attachImage: r.attachImage !== false });
  });
  ipcMain.handle('companion:getNotice', (): CompanionNotice | null => notice);
  // The main window's side of the forward.
  ipcMain.handle('companion:ready', (e): void => onMainReady(e.sender.id));
  ipcMain.handle('companion:mineResult', (_e, id: unknown, outcome: unknown): void => {
    if (typeof id !== 'string' || !outcome || typeof outcome !== 'object') return;
    const o = outcome as CompanionMineOutcome;
    settleMine(id, {
      status: o.status === 'added' || o.status === 'exists' || o.status === 'failed' ? o.status : 'failed',
      ...(o.anki ? { anki: o.anki } : {}),
      ...(typeof o.error === 'string' ? { error: o.error.slice(0, 300) } : {}),
    });
  });
}

export const __companionTestables = {
  onMainReady,
  settleMine,
  inFlight,
  reset(): void {
    for (const waiter of inFlight.values()) clearTimeout(waiter.timer);
    inFlight.clear();
    readyWebContentsId = null;
    pendingRendererCommands.length = 0;
    wheelInit = null;
    previewDraft = null;
  },
};
