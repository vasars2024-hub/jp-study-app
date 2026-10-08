/**
 * Which Wired consoles are open, and the doors into them.
 *
 * The consoles (Navi terminal, Signal decrypt, intercept channel) are Wired
 * instruments that live in the mechanics host on the desktop — not desktop
 * sections. A section would join the persisted layout, the pop-out routes and
 * Blanc's section inventory in every theme; these exist only inside the
 * archive and vanish with it. Anything may ask to open one; the request is
 * honoured only while the host is mounted (= Wired is the live theme).
 */
import { useSyncExternalStore } from 'react';
import { loadWiredMechanicsSettings } from './settings';

export type WiredConsoleId = 'tty' | 'decrypt' | 'intercept';

let open: WiredConsoleId[] = [];
let hostMounted = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((fn) => fn());
}

export function setWiredConsoleHostMounted(mounted: boolean): void {
  hostMounted = mounted;
  if (!mounted && open.length) {
    open = [];
    emit();
  }
}

export function isWiredConsoleHostMounted(): boolean {
  return hostMounted;
}

function allowed(id: WiredConsoleId): boolean {
  const s = loadWiredMechanicsSettings();
  if (id === 'tty') return s.naviTerminal;
  if (id === 'decrypt') return s.signalDecrypt;
  // The intercept channel is gated where it is raised (interceptGate), so a
  // manual `intercept` still works with the automatic schedule switched off.
  return true;
}

/** Open (or raise) a console. False when Wired is not live or the console is switched off. */
export function openWiredConsole(id: WiredConsoleId): boolean {
  if (!hostMounted || !allowed(id)) return false;
  open = [...open.filter((c) => c !== id), id];
  emit();
  if (id !== 'intercept') {
    try {
      window.dispatchEvent(new CustomEvent('wired:route'));
    } catch {
      /* non-browser */
    }
  }
  return true;
}

export function closeWiredConsole(id: WiredConsoleId): void {
  if (!open.includes(id)) return;
  open = open.filter((c) => c !== id);
  emit();
}

/** Bring an open console to the top of the console stack. */
export function raiseWiredConsole(id: WiredConsoleId): void {
  if (!open.includes(id) || open[open.length - 1] === id) return;
  open = [...open.filter((c) => c !== id), id];
  emit();
}

export function isWiredConsoleOpen(id: WiredConsoleId): boolean {
  return open.includes(id);
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function snapshot(): WiredConsoleId[] {
  return open;
}

/** Open consoles, bottom → top. */
export function useWiredConsoles(): WiredConsoleId[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// ---------------------------------------------------------------------------
// A command to run as the terminal opens (the tray LAYER badge opens the TTY
// on `layer`). Taken once; an already-open terminal hears the event.
// ---------------------------------------------------------------------------

export const TTY_COMMAND_EVENT = 'wired:tty-command';
let pendingTtyCommand: string | null = null;

/** Open the terminal and run `command` in it. */
export function runInWiredTerminal(command: string): boolean {
  pendingTtyCommand = command;
  const opened = openWiredConsole('tty');
  if (!opened) {
    pendingTtyCommand = null;
    return false;
  }
  try {
    window.dispatchEvent(new CustomEvent(TTY_COMMAND_EVENT));
  } catch {
    /* non-browser */
  }
  return true;
}

export function takePendingTtyCommand(): string | null {
  const cmd = pendingTtyCommand;
  pendingTtyCommand = null;
  return cmd;
}

// ---------------------------------------------------------------------------
// Intercept trigger — registered by the host, called by the `intercept` command.
// ---------------------------------------------------------------------------

type InterceptTriggerFn = () => string;
let interceptTrigger: InterceptTriggerFn | null = null;

export function registerInterceptTrigger(fn: InterceptTriggerFn | null): void {
  interceptTrigger = fn;
}

/** Ask the host to raise an intercept now. Returns 'ok' or the gate reason. */
export function triggerIntercept(): string {
  return interceptTrigger ? interceptTrigger() : 'disabled';
}
