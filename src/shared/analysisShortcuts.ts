/**
 * Keyboard control for an analysis panel.
 *
 * The panel is something a reader keeps open while working through a page, so
 * every action it offers needs a key — reaching for the mouse to mine a word is
 * the difference between mining and not bothering. The mapping is a pure
 * function of the event so it can be unit-tested, and so the Lens overlay, the
 * in-app panel and the extension's injected panel cannot end up with three
 * different key layouts.
 *
 * Single unmodified letters are used deliberately: the panel is a focused
 * surface, not a document, and the guard below is what keeps that safe.
 */

export type AnalysisCommand =
  | 'next'
  | 'prev'
  | 'copy'
  | 'mine'
  | 'saveSentence'
  | 'snapshot'
  | 'listen'
  | 'dictionary'
  | 'translations'
  | 'reanalyze'
  | 'close'
  /** Jump straight to the Nth highlighted span, 0-based. */
  | { select: number };

/** The event fields the mapping needs — kept structural so tests need no DOM. */
export interface ShortcutEvent {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

const LETTER_COMMANDS: Record<string, AnalysisCommand> = {
  c: 'copy',
  a: 'mine',
  s: 'snapshot',
  w: 'saveSentence',
  l: 'listen',
  d: 'dictionary',
  t: 'translations',
  r: 'reanalyze',
};

/**
 * Is this element one where a keystroke means "type a character"?
 *
 * Without this, pressing "a" while editing the OCR text or a deck name would
 * mine a card instead of typing a letter. `isContentEditable` catches the
 * rich-text hosts that are not inputs at all.
 */
export function isTextEntryTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName.toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

/**
 * The command a key press means, or null for "not ours — let it through".
 *
 * Any modifier other than Shift disqualifies the press: Ctrl+C must stay copy,
 * Alt+D must stay the browser's address bar, and a shortcut that stole them
 * would be a bug report rather than a feature.
 */
export function analysisCommandForKey(e: ShortcutEvent): AnalysisCommand | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (e.key === 'Escape') return 'close';
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') return 'next';
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') return 'prev';
  // 1–9 pick a span directly; 0 is not used because there is no zeroth span on
  // screen and "0 means the tenth" is a rule nobody remembers.
  if (/^[1-9]$/.test(e.key)) return { select: Number(e.key) - 1 };
  const letter = e.key.length === 1 ? e.key.toLowerCase() : '';
  return LETTER_COMMANDS[letter] ?? null;
}

/** Display rows for the panel's shortcut legend, in the order shown. */
export const ANALYSIS_SHORTCUT_HINTS: readonly { command: string; keys: string }[] = [
  { command: 'select', keys: '1–9' },
  { command: 'next', keys: '→' },
  { command: 'prev', keys: '←' },
  { command: 'copy', keys: 'C' },
  { command: 'mine', keys: 'A' },
  { command: 'saveSentence', keys: 'W' },
  { command: 'snapshot', keys: 'S' },
  { command: 'listen', keys: 'L' },
  { command: 'dictionary', keys: 'D' },
  { command: 'translations', keys: 'T' },
  { command: 'reanalyze', keys: 'R' },
  { command: 'close', keys: 'Esc' },
];
