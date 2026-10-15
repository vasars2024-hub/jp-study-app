/**
 * Read-aloud for the immersion reader: the article, or the paragraph the reader
 * is on, sentence by sentence, in the language the text is written in.
 *
 * It reuses the card-audio speech path rather than a second speech stack:
 * main's offline synthesizer (`flashcardSynthesizeAudio`, with the voice the
 * learner picked for that language in Flashcards settings, cached by sentence
 * and voice) and `flashcardReadAudio` for the clip. One sentence is one clip,
 * so the sentence being spoken is known exactly and can be highlighted, and
 * the next sentence is synthesized while the current one plays.
 *
 * Unlike a card clip, an article is long-form listening: it is not cut when the
 * window loses focus, and it has its own pause, resume and speed. A missing
 * voice is a state with a translated message naming the language, never a
 * crash or silence.
 */
import type { FlashcardAudioResult } from '../../../main/flashcardAudio';
import { detectImmersionTextLang } from '../../../shared/immersion';

export type ReadAloudLang = 'ja' | 'zh' | 'ru' | 'en';
export type ReadAloudStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';
export type ReadAloudScope = 'article' | 'paragraph';

export const READ_ALOUD_RATES: readonly number[] = [0.6, 0.8, 1, 1.25, 1.5];

/* ------------------------------------------------------------------ *
 * Sentences out of the reader's DOM.
 * ------------------------------------------------------------------ */

/** A run of text the reader shows as one block (a paragraph, a heading, a line of a `<br>` list). */
interface TextPiece {
  node: Text;
  /** Offsets of this node's text inside its unit's text. */
  start: number;
  end: number;
}

export interface ReadAloudSentence {
  text: string;
  /** The block element the sentence sits in (what "this paragraph" means). */
  block: Element;
  /** Index of the block among the article's blocks. */
  blockIndex: number;
  pieces: readonly TextPiece[];
  /** Offsets of the sentence inside its unit's text. */
  start: number;
  end: number;
}

/** Furigana and anything that is not article prose is not read. */
const SKIP = new Set(['rt', 'rp', 'script', 'style', 'noscript', 'template', 'button', 'select', 'textarea', 'svg', 'math', 'iframe', 'video', 'audio']);
const BLOCK = new Set([
  'p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav', 'blockquote', 'pre',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'ul', 'ol', 'dl', 'dt', 'dd', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'caption', 'hr',
]);

/** Sentence ends: CJK and Latin terminators, plus the closing quotes and brackets that follow them. */
const CJK_END = '。！？!?．…‼⁇⁈⁉';
const CLOSERS = '」』）)"\'”’》〉】〕］]';
const QUOTE_PARTICLE = /^(と|って)/;

function blockOf(node: Node, root: Element): Element {
  let el = node.parentElement;
  while (el && el !== root) {
    if (BLOCK.has(el.tagName.toLowerCase())) return el;
    el = el.parentElement;
  }
  return root;
}

/** Split one unit's text into [start, end) sentence spans (trimmed, never empty). */
export function splitSentenceSpans(text: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let from = 0;
  const push = (end: number): void => {
    let s = from;
    let e = end;
    while (s < e && /\s/.test(text[s])) s += 1;
    while (e > s && /\s/.test(text[e - 1])) e -= 1;
    // A span of punctuation alone (a stray "」" or "…") is not a sentence.
    if (e > s && /[\p{L}\p{N}]/u.test(text.slice(s, e))) spans.push([s, e]);
    from = end;
  };
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\n') {
      push(i + 1);
      continue;
    }
    const cjk = CJK_END.includes(ch);
    // A Latin full stop ends a sentence only before a space or the end (not "3.14", not "e.g.x").
    const latin = ch === '.' && (i + 1 >= text.length || /\s/.test(text[i + 1]) || CLOSERS.includes(text[i + 1]));
    if (!cjk && !latin) continue;
    let j = i + 1;
    let closed = false;
    while (j < text.length && (CJK_END.includes(text[j]) || text[j] === '.' || CLOSERS.includes(text[j]))) {
      if (CLOSERS.includes(text[j])) closed = true;
      j += 1;
    }
    // 「…。」と言った: a quotation the sentence goes on after (と, って) is not its end.
    if (closed && QUOTE_PARTICLE.test(text.slice(j, j + 2))) {
      i = j - 1;
      continue;
    }
    push(j);
    i = j - 1;
  }
  push(text.length);
  return spans;
}

/**
 * Every sentence of the reader's article, in order. Text in `<rt>` (furigana)
 * is skipped, and a block boundary or `<br>` always ends a sentence.
 */
export function readAloudSentences(root: Element): ReadAloudSentence[] {
  const out: ReadAloudSentence[] = [];
  let pieces: TextPiece[] = [];
  let text = '';
  let blockIndex = -1;
  let lastBlock: Element | null = null;

  const flush = (): void => {
    if (pieces.length && /[\p{L}\p{N}]/u.test(text)) {
      const block = blockOf(pieces[0].node, root);
      if (block !== lastBlock) {
        blockIndex += 1;
        lastBlock = block;
      }
      const unitPieces = pieces;
      for (const [start, end] of splitSentenceSpans(text)) {
        out.push({ text: text.slice(start, end), block, blockIndex, pieces: unitPieces, start, end });
      }
    }
    pieces = [];
    text = '';
  };

  const walk = (node: Node): void => {
    if (node.nodeType === 3) {
      const value = (node as Text).data;
      if (!value) return;
      pieces.push({ node: node as Text, start: text.length, end: text.length + value.length });
      text += value;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag) || el.getAttribute('aria-hidden') === 'true') return;
    if (tag === 'br') {
      flush();
      return;
    }
    const block = BLOCK.has(tag);
    if (block) flush();
    for (const child of [...el.childNodes]) walk(child);
    if (block) flush();
  };

  for (const child of [...root.childNodes]) walk(child);
  flush();
  return out;
}

/** A DOM Range over one sentence, or null when its text nodes are gone (the reader re-rendered). */
export function sentenceRange(sentence: ReadAloudSentence, doc: Document = document): Range | null {
  const startPiece = sentence.pieces.find((p) => sentence.start >= p.start && sentence.start < p.end);
  const endPiece = [...sentence.pieces].reverse().find((p) => sentence.end > p.start && sentence.end <= p.end);
  if (!startPiece || !endPiece || !startPiece.node.isConnected || !endPiece.node.isConnected) return null;
  if (startPiece.node.data.length < sentence.start - startPiece.start || endPiece.node.data.length < sentence.end - endPiece.start) return null;
  try {
    const range = doc.createRange();
    range.setStart(startPiece.node, sentence.start - startPiece.start);
    range.setEnd(endPiece.node, sentence.end - endPiece.start);
    return range;
  } catch {
    return null;
  }
}

/** Is every node this sentence was read from still in the document? */
export function sentenceIsLive(sentence: ReadAloudSentence): boolean {
  return sentence.pieces.every((p) => p.node.isConnected);
}

/**
 * The language to read in: the text's own (kana → Japanese, Han → Chinese,
 * Cyrillic → Russian); Latin prose is read in English; text too short to tell
 * falls back to the study language.
 */
export function readAloudLangFor(text: string, studyLang: 'ja' | 'zh' | 'ru'): ReadAloudLang {
  const detected = detectImmersionTextLang(text, studyLang);
  if (detected === 'ja' || detected === 'zh' || detected === 'ru') return detected;
  const latin = (text.slice(0, 20_000).match(/[A-Za-z]/g) ?? []).length;
  return latin >= 20 ? 'en' : studyLang;
}

/**
 * Where "this paragraph" starts: the block holding the selection, else the
 * first block whose box is inside the reader's visible area, else the first.
 */
export function currentParagraphIndex(
  sentences: readonly ReadAloudSentence[],
  root: Element,
  selection: Selection | null = typeof window === 'undefined' ? null : window.getSelection(),
): number {
  if (!sentences.length) return -1;
  const anchor = selection && selection.rangeCount > 0 ? selection.anchorNode : null;
  if (anchor && root.contains(anchor)) {
    const hit = sentences.find((s) => s.block === anchor || s.block.contains(anchor));
    if (hit) return hit.blockIndex;
  }
  const view = root.getBoundingClientRect();
  if (view.height > 0) {
    for (const s of sentences) {
      const box = s.block.getBoundingClientRect();
      if (box.bottom > view.top + 4 && box.top < view.bottom) return s.blockIndex;
    }
  }
  return sentences[0].blockIndex;
}

/* ------------------------------------------------------------------ *
 * The player.
 * ------------------------------------------------------------------ */

export interface ReadAloudSnapshot {
  status: ReadAloudStatus;
  scope: ReadAloudScope | null;
  /** The sentence being read (0-based, into the article's sentences), -1 when idle. */
  index: number;
  /** The slice being read: sentences [from, total). */
  from: number;
  total: number;
  rate: number;
  lang: ReadAloudLang | null;
  /** immersionUi pack key for an `error` status. */
  errorKey?: string;
}

/** The slice of an `<audio>` element the player drives (a stand-in in tests). */
export interface ReadAloudAudio {
  play(): Promise<void>;
  pause(): void;
  playbackRate: number;
  addEventListener(type: 'ended' | 'error', listener: () => void): void;
  removeEventListener(type: 'ended' | 'error', listener: () => void): void;
}

export interface ReadAloudDeps {
  synthesize(text: string, lang: ReadAloudLang, voice?: string): Promise<FlashcardAudioResult>;
  read(path: string): Promise<FlashcardAudioResult>;
  createAudio(src: string): ReadAloudAudio;
  voiceFor(lang: ReadAloudLang): string | undefined;
  /** Called with the sentence being read (or null) so the reader can mark it. */
  highlight(sentence: ReadAloudSentence | null): void;
  /** Before the first clip: silence the shared study-clip channel. */
  quietOthers?(): void;
  /** Re-read the reader's sentences when the ones held went stale (the DOM re-rendered). */
  refresh?(): ReadAloudSentence[] | null;
}

const NO_VOICE_KEY: Record<ReadAloudLang, string> = {
  ja: 'immersionUi.readAloud.noVoice.ja',
  zh: 'immersionUi.readAloud.noVoice.zh',
  ru: 'immersionUi.readAloud.noVoice.ru',
  en: 'immersionUi.readAloud.noVoice.en',
};

/** The translated message for a failed synthesis, by main's classification. */
export function readAloudErrorKey(reason: unknown, lang: ReadAloudLang): string {
  if (reason === 'no-voice') return NO_VOICE_KEY[lang];
  if (reason === 'no-synthesizer') return 'immersionUi.readAloud.noSynthesizer';
  return 'immersionUi.readAloud.failed';
}

type Clip = { ok: true; src: string } | { ok: false; reason: unknown };

export class ImmersionReadAloud {
  private snapshot: ReadAloudSnapshot = { status: 'idle', scope: null, index: -1, from: 0, total: 0, rate: 1, lang: null };
  private readonly listeners = new Set<(s: ReadAloudSnapshot) => void>();
  private sentences: ReadAloudSentence[] = [];
  /** The slice being read: [from, to) indices into `sentences`. */
  private to = 0;
  private audio: ReadAloudAudio | null = null;
  private detach: (() => void) | null = null;
  private clips = new Map<number, Promise<Clip>>();
  /** Bumped by every start, stop and pause; an await that comes back to a stale run drops its result. */
  private run = 0;

  constructor(private readonly deps: ReadAloudDeps, rate = 1) {
    this.snapshot = { ...this.snapshot, rate };
  }

  get state(): ReadAloudSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (s: ReadAloudSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Read `sentences[from, to)` in `lang`. */
  start(sentences: ReadAloudSentence[], lang: ReadAloudLang, scope: ReadAloudScope, from = 0, to = sentences.length): void {
    this.halt();
    if (!sentences.length || from >= to) {
      this.set({ status: 'error', scope, index: -1, from: 0, total: 0, rate: this.snapshot.rate, lang, errorKey: 'immersionUi.readAloud.nothing' });
      return;
    }
    this.sentences = sentences;
    this.to = Math.min(to, sentences.length);
    this.clips.clear();
    this.deps.quietOthers?.();
    this.set({ status: 'loading', scope, index: from, from, total: this.to, rate: this.snapshot.rate, lang, errorKey: undefined });
    void this.playAt(from);
  }

  pause(): void {
    const { status } = this.snapshot;
    if (status !== 'playing' && status !== 'loading') return;
    if (status === 'loading') {
      // Nothing sounds yet: drop the pending clip; Resume asks for it again (it is cached).
      this.run += 1;
    } else {
      this.audio?.pause();
    }
    this.set({ ...this.snapshot, status: 'paused' });
  }

  resume(): void {
    if (this.snapshot.status !== 'paused') return;
    const { index } = this.snapshot;
    if (this.audio) {
      const run = this.run;
      this.set({ ...this.snapshot, status: 'playing' });
      this.audio.playbackRate = this.snapshot.rate;
      this.audio.play().catch(() => {
        if (run === this.run && this.snapshot.status !== 'paused') this.fail('immersionUi.readAloud.failed');
      });
      return;
    }
    this.set({ ...this.snapshot, status: 'loading' });
    void this.playAt(index);
  }

  stop(): void {
    const wasActive = this.snapshot.status !== 'idle' || this.snapshot.index !== -1;
    this.halt();
    this.sentences = [];
    this.clips.clear();
    if (wasActive) this.set({ status: 'idle', scope: null, index: -1, from: 0, total: 0, rate: this.snapshot.rate, lang: null });
  }

  setRate(rate: number): void {
    const next = READ_ALOUD_RATES.includes(rate) ? rate : 1;
    if (this.audio) this.audio.playbackRate = next;
    this.set({ ...this.snapshot, rate: next });
  }

  private halt(): void {
    this.run += 1;
    this.release();
    this.deps.highlight(null);
  }

  private release(): void {
    this.detach?.();
    this.detach = null;
    if (this.audio) {
      try {
        this.audio.pause();
      } catch {
        /* a detached element is already silent */
      }
    }
    this.audio = null;
  }

  private fail(errorKey: string): void {
    this.release();
    this.deps.highlight(null);
    this.set({ ...this.snapshot, status: 'error', errorKey });
  }

  private clip(index: number): Promise<Clip> {
    const cached = this.clips.get(index);
    if (cached) return cached;
    const sentence = this.sentences[index];
    const lang = this.snapshot.lang ?? 'ja';
    const made = (async (): Promise<Clip> => {
      let synth: FlashcardAudioResult;
      try {
        synth = await this.deps.synthesize(sentence.text, lang, this.deps.voiceFor(lang));
      } catch (error) {
        synth = { ok: false, reason: 'failed', error: String(error) };
      }
      if (!synth.ok || !synth.path) return { ok: false, reason: synth.reason };
      let read: FlashcardAudioResult;
      try {
        read = await this.deps.read(synth.path);
      } catch {
        read = { ok: false, reason: 'failed' };
      }
      if (!read.ok || !read.dataUrl) return { ok: false, reason: read.reason };
      return { ok: true, src: read.dataUrl };
    })();
    this.clips.set(index, made);
    // A failed clip is not kept: Resume or a new start asks again.
    void made.then((c) => {
      if (!c.ok && this.clips.get(index) === made) this.clips.delete(index);
    });
    return made;
  }

  private async playAt(index: number): Promise<void> {
    this.release();
    const run = ++this.run;
    const lang = this.snapshot.lang ?? 'ja';
    // Only the clips around the current one are worth keeping in memory.
    for (const key of [...this.clips.keys()]) if (key < index - 1) this.clips.delete(key);
    const clip = await this.clip(index);
    if (run !== this.run) return;
    if (index + 1 < this.to) void this.clip(index + 1);
    if (!clip.ok) {
      this.fail(readAloudErrorKey(clip.reason, lang));
      return;
    }
    const audio = this.deps.createAudio(clip.src);
    audio.playbackRate = this.snapshot.rate;
    const onEnded = (): void => {
      if (run !== this.run) return;
      if (index + 1 < this.to) {
        this.set({ ...this.snapshot, status: 'loading', index: index + 1 });
        void this.playAt(index + 1);
      } else this.stop();
    };
    const onError = (): void => {
      if (run === this.run) this.fail('immersionUi.readAloud.failed');
    };
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);
    this.audio = audio;
    this.detach = () => {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
    this.markSentence(index);
    this.set({ ...this.snapshot, status: 'playing', index, errorKey: undefined });
    try {
      await audio.play();
    } catch {
      // A Pause while `play()` was still pending rejects it (AbortError): that is the
      // user's pause, not a playback failure.
      if (run === this.run && this.snapshot.status !== 'paused') this.fail('immersionUi.readAloud.failed');
    }
  }

  /** Highlight the sentence; when the reader re-rendered under it, re-read the sentences first. */
  private markSentence(index: number): void {
    let sentence = this.sentences[index];
    if (sentence && !sentenceIsLive(sentence) && this.deps.refresh) {
      const fresh = this.deps.refresh();
      // The same text re-wrapped (known-word colouring, i+1): the same sentences, new nodes.
      if (fresh && fresh.length === this.sentences.length) {
        this.sentences = fresh;
        sentence = fresh[index];
      }
    }
    this.deps.highlight(sentence ?? null);
  }

  private set(next: ReadAloudSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener(next);
  }
}
