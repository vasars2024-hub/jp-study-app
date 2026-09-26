/**
 * The desktop companion's shared vocabulary: the card draft it builds over
 * another app, the radial wheel's actions, and the result of a mine. Pure —
 * main (`main/companion.ts`) and the renderer surfaces both use it.
 */

import { isStudyLang, type StudyLang } from './studyLang';

/** A card drafted outside Gum, before the user presses Add. */
export interface CompanionDraft {
  id: string;
  kind: 'word' | 'sentence';
  /** The expression (a word card) or the sentence itself (a sentence card). */
  word: string;
  reading?: string;
  meaning?: string;
  /** The line it came from; for a sentence card, the same text as `word`. */
  sentence?: string;
  /** The window it came from — a card's source, like a page title for the extension. */
  sourceTitle?: string;
  sourceApp?: string;
  /** A picture of where it came from (the Lens region), `data:image/…;base64,`. */
  imageDataUrl?: string;
  /** Known when the surface knew it (the Lens reads one study language). */
  studyLang?: StudyLang;
  origin: 'selection' | 'lookup' | 'lens' | 'wheel' | 'last';
  createdAt: number;
}

export interface CompanionMineRequest {
  draft: CompanionDraft;
  /** Attach `imageDataUrl` to the card (the preview's toggle). */
  attachImage: boolean;
}

export type CompanionMineStatus =
  /** Card created; `anki` says what happened on the Anki side. */
  | 'added'
  /** The same card already existed. */
  | 'exists'
  /** The main window was not up yet; the card is created as soon as it is. */
  | 'waiting'
  | 'failed';

export interface CompanionMineOutcome {
  status: CompanionMineStatus;
  anki?: 'added' | 'duplicate' | 'queued' | 'failed' | 'local';
  error?: string;
}

// ---------------------------------------------------------------------------
// Drafts

const MAX_WORD = 200;
const MAX_SENTENCE = 2000;
/** ~900 KB of JPEG, the same bound the Lens puts on its screenshots. */
const MAX_IMAGE_DATA_URL = 1_300_000;

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;

/**
 * Word or sentence? A selection with sentence punctuation, a long CJK run, or
 * four or more space-separated words (Russian, romaji) is a sentence card;
 * anything else is a word to look up. Deliberately language-neutral: the
 * same rule has to hold for a Japanese, Chinese or Russian learner.
 */
export function isSentenceText(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (/[。．！？!?…]/.test(t)) return true;
  if (/[.;:]\s*$/.test(t) && !CJK.test(t)) return true;
  if (CJK.test(t)) return t.replace(/\s+/g, '').length > 12;
  return t.split(/\s+/).filter(Boolean).length >= 4;
}

let draftSeq = 0;

export function newDraftId(now = Date.now()): string {
  draftSeq = (draftSeq + 1) % 1_000_000;
  return `cd-${now.toString(36)}-${draftSeq.toString(36)}`;
}

/** A first draft from captured text and the window it came from. */
export function draftFromText(
  text: string,
  opts: {
    origin: CompanionDraft['origin'];
    sentence?: string;
    sourceTitle?: string;
    sourceApp?: string;
    imageDataUrl?: string;
    studyLang?: StudyLang;
    now?: number;
  },
): CompanionDraft | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const now = opts.now ?? Date.now();
  const sentence = isSentenceText(clean);
  const context = opts.sentence?.replace(/\s+/g, ' ').trim();
  return normalizeDraft({
    id: newDraftId(now),
    kind: sentence ? 'sentence' : 'word',
    word: sentence ? clean : clean.slice(0, 80),
    sentence: sentence ? clean : context && context !== clean ? context : undefined,
    sourceTitle: opts.sourceTitle,
    sourceApp: opts.sourceApp,
    imageDataUrl: opts.imageDataUrl,
    studyLang: opts.studyLang,
    origin: opts.origin,
    createdAt: now,
  });
}

function str(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const t = value.trim();
  return t ? t.slice(0, max) : undefined;
}

const ORIGINS = new Set<CompanionDraft['origin']>(['selection', 'lookup', 'lens', 'wheel', 'last']);

/** A draft that crossed IPC, checked field by field; null when it cannot make a card. */
export function normalizeDraft(raw: unknown): CompanionDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const word = str(r.word, MAX_WORD);
  if (!word) return null;
  const image =
    typeof r.imageDataUrl === 'string' &&
    /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(r.imageDataUrl) &&
    r.imageDataUrl.length <= MAX_IMAGE_DATA_URL
      ? r.imageDataUrl
      : undefined;
  const origin = ORIGINS.has(r.origin as CompanionDraft['origin']) ? (r.origin as CompanionDraft['origin']) : 'selection';
  const createdAt = Number(r.createdAt);
  const out: CompanionDraft = {
    id: str(r.id, 64) ?? newDraftId(),
    kind: r.kind === 'sentence' ? 'sentence' : 'word',
    word,
    origin,
    createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : Date.now(),
  };
  const reading = str(r.reading, MAX_WORD);
  const meaning = str(r.meaning, MAX_SENTENCE);
  const sentence = str(r.sentence, MAX_SENTENCE);
  const sourceTitle = str(r.sourceTitle, 300);
  const sourceApp = str(r.sourceApp, 120);
  if (reading) out.reading = reading;
  if (meaning) out.meaning = meaning;
  if (sentence) out.sentence = sentence;
  if (sourceTitle) out.sourceTitle = sourceTitle;
  if (sourceApp) out.sourceApp = sourceApp;
  if (image) out.imageDataUrl = image;
  if (isStudyLang(r.studyLang)) out.studyLang = r.studyLang;
  return out;
}

/** "Document.pdf — Adobe Acrobat" style source line: the title, else the program. */
export function draftSourceLabel(draft: Pick<CompanionDraft, 'sourceTitle' | 'sourceApp'>): string {
  return draft.sourceTitle || draft.sourceApp || '';
}

/** Raw base64 and a safe filename from a draft's picture, for the card and for Anki. */
export function draftImagePayload(
  draft: Pick<CompanionDraft, 'imageDataUrl' | 'id'>,
): { base64: string; filename: string } | null {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(draft.imageDataUrl ?? '');
  if (!m) return null;
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  return { base64: m[2]!, filename: `gum-companion-${draft.id.replace(/[^a-z0-9-]/gi, '')}.${ext}` };
}

// ---------------------------------------------------------------------------
// Radial wheel

export type CompanionWheelActionId =
  | 'lookup'
  | 'cursor'
  | 'lens'
  | 'preview'
  | 'sentence'
  | 'translate'
  | 'audio'
  | 'open';

export interface CompanionWheelAction {
  id: CompanionWheelActionId;
  /** The global command this slot shares a chord with ('' = wheel-only). */
  commandId: string;
  /** Needs the selection copied out of the app underneath. */
  needsSelection: boolean;
}

/**
 * The command live captions registers for "mine the last seconds of system
 * audio" (`captions.mineRecent`, main/systemAudioCapture.ts). The wheel shows
 * its audio slot only when it has a handler, so the slot never appears on a
 * build that cannot fill it.
 */
export const CAPTIONS_CAPTURE_COMMAND_IDS: readonly string[] = ['captions.mineRecent'];

/** The wheel's slots, clockwise from the top. Keys 1–8 follow this order. */
export function buildWheelActions(opts: { audioCommandId?: string | null }): CompanionWheelAction[] {
  const actions: CompanionWheelAction[] = [
    { id: 'lookup', commandId: 'companion.lookupSelection', needsSelection: true },
    { id: 'cursor', commandId: 'lens.atCursor', needsSelection: false },
    { id: 'lens', commandId: 'lens.region', needsSelection: false },
    { id: 'preview', commandId: 'companion.cardPreview', needsSelection: true },
    { id: 'sentence', commandId: '', needsSelection: true },
    { id: 'translate', commandId: '', needsSelection: true },
  ];
  if (opts.audioCommandId) actions.push({ id: 'audio', commandId: opts.audioCommandId, needsSelection: false });
  actions.push({ id: 'open', commandId: 'app.focus', needsSelection: false });
  return actions;
}

export interface CompanionWheelInit {
  actions: Array<CompanionWheelAction & { chord: string }>;
  /** The app the wheel was opened over. */
  sourceTitle?: string;
}

/** Keys 1–8 (top row or numpad) → slot index, or -1. */
export function wheelIndexForKey(key: string, code = ''): number {
  const digit = /^[1-8]$/.test(key) ? key : /^(?:Digit|Numpad)([1-8])$/.exec(code)?.[1];
  return digit ? Number(digit) - 1 : -1;
}
