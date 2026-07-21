// The renderer's live console instance and its capture points (Pillar 5).
//
// `shared/blancConsole.ts` holds the buffer and the pure helpers; this owns the
// singleton, the subscription, and the wiring to real events.
//
// Deliberately session-only — nothing is persisted. The console exists to answer
// "what just happened", and writing every mined card and IPC failure to
// localStorage would grow without bound and put user content somewhere it was
// never asked to go. `formatEntriesForReport` covers taking a copy out.

import {
  ConsoleBuffer,
  type ConsoleCategory,
  type ConsoleEntry,
  type ConsoleLevel,
} from '../shared/blancConsole';

const buffer = new ConsoleBuffer();
const listeners = new Set<() => void>();
let installed = false;

function emit(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      // A broken subscriber must not take down logging — that would lose the
      // record of whatever caused the break.
      console.error('[blanc-console] listener threw:', err);
    }
  }
}

/** Record an event. Safe to call from anywhere in the renderer. */
export function logBlanc(
  level: ConsoleLevel,
  category: ConsoleCategory,
  message: string,
  detail?: unknown,
  correlationId?: string,
): ConsoleEntry {
  const entry = buffer.push({ level, category, message, detail, correlationId });
  emit();
  return entry;
}

export function getBlancConsole(): ConsoleEntry[] {
  return buffer.list();
}

export function getBlancConsoleDropped(): number {
  return buffer.droppedCount;
}

export function clearBlancConsole(): void {
  buffer.clear();
  emit();
}

export function onBlancConsoleChanged(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Correlation ids for a flow. Short and readable — these get pasted into reports. */
let correlationSeq = 0;
export function newCorrelationId(prefix: string): string {
  correlationSeq += 1;
  return `${prefix}-${correlationSeq}`;
}

function toastLevel(kind: unknown): ConsoleLevel {
  if (kind === 'error') return 'error';
  if (kind === 'warning' || kind === 'warn') return 'warn';
  return 'info';
}

/**
 * Capture the app's existing event buses.
 *
 * Same emitters `notificationStore` listens to, on purpose: the notification
 * centre keeps showing the toast-shaped summary, and this records the same
 * events with structure and no 100-entry cap. Install once, at boot.
 */
export function installBlancConsoleCapture(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  for (const bus of ['os:toast', 'ui:toast'] as const) {
    window.addEventListener(bus, (e: Event) => {
      const d = (e as CustomEvent<{ title?: unknown; message?: unknown; kind?: unknown }>).detail;
      if (!d || typeof d.message !== 'string') return; // ui/Toast allows ReactNode
      logBlanc(toastLevel(d.kind), 'ui', d.message, {
        bus,
        title: typeof d.title === 'string' ? d.title : undefined,
      });
    });
  }

  // Renderer crashes and unhandled rejections. blancMain.tsx already forwards
  // these to the main-process log; recording them here too is what makes the
  // console usable for "it broke, what happened just before".
  window.addEventListener('error', (event) => {
    logBlanc('error', 'system', event.message || 'Uncaught error', {
      source: `${event.filename}:${event.lineno}`,
      stack: event.error instanceof Error ? event.error.stack : undefined,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = (event as PromiseRejectionEvent).reason;
    logBlanc('error', 'system', 'Unhandled promise rejection', {
      detail: reason instanceof Error ? reason.stack || reason.message : String(reason),
    });
  });

  logBlanc('debug', 'system', 'Console capture installed');
}
