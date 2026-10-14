/**
 * Read a grammar example aloud.
 *
 * Grammar had no audio at all, so a learner met every pattern on the page and
 * never in the ear. This reuses the card-audio path rather than a second
 * speech stack: main's offline synthesizer (`flashcardSynthesizeAudio`, the
 * voice the learner picked for that language in Flashcards settings, cached by
 * sentence and voice) and the shared study-clip channel (`cardAudio`), so a
 * grammar example cuts a flashcard clip instead of talking over it, the
 * Soundscape ducks under it, and an app switch silences it.
 *
 * One example plays at a time across the Grammar window. Clicking another
 * example stops the current one first, before the new one is synthesized;
 * clicking the playing one stops it. The example's own language speaks it:
 * a Chinese pattern's example is never handed to a Japanese voice.
 *
 * A missing voice is a state, not a crash: main classifies the failure and
 * this maps it to a translated message that names the missing language.
 */
import type { FlashcardAudioResult } from '../../../main/flashcardAudio';
import { cardAudio } from '../../cardAudioPlayback';
import { preferredVoiceFor } from '../../flashcardVoicePreference';

export type GrammarAudioLang = 'ja' | 'zh' | 'ru';
export type GrammarAudioStatus = 'idle' | 'loading' | 'playing' | 'error';

export interface GrammarAudioSnapshot {
  /** The example the status is about; null when nothing was played yet. */
  key: string | null;
  status: GrammarAudioStatus;
  /** grammarUi pack key for an `error` status. */
  errorKey?: string;
}

export interface GrammarAudioChannel {
  play(src: string): Promise<void>;
  stop(src?: string): void;
  claim(): () => boolean;
  readonly playing: boolean;
}

export interface GrammarAudioDeps {
  synthesize(text: string, lang: GrammarAudioLang, voice?: string): Promise<FlashcardAudioResult>;
  read(path: string): Promise<FlashcardAudioResult>;
  channel: GrammarAudioChannel;
  voiceFor(lang: GrammarAudioLang): string | undefined;
  /** How often a playing clip is checked for having ended. */
  pollMs?: number;
}

const NO_VOICE_KEY: Record<GrammarAudioLang, string> = {
  ja: 'grammarUi.audio.noVoice.ja',
  zh: 'grammarUi.audio.noVoice.zh',
  ru: 'grammarUi.audio.noVoice.ru',
};

/** The translated message for a failed synthesis, by main's classification. */
export function grammarAudioErrorKey(reason: unknown, lang: GrammarAudioLang): string {
  if (reason === 'no-voice') return NO_VOICE_KEY[lang];
  if (reason === 'no-synthesizer') return 'grammarUi.audio.noSynthesizer';
  return 'grammarUi.audio.failed';
}

export function normalizeGrammarAudioLang(lang: string | undefined): GrammarAudioLang {
  return lang === 'zh' || lang === 'ru' ? lang : 'ja';
}

export class GrammarExampleAudio {
  private snapshot: GrammarAudioSnapshot = { key: null, status: 'idle' };
  private readonly listeners = new Set<(s: GrammarAudioSnapshot) => void>();
  private src: string | null = null;
  private poll: ReturnType<typeof setInterval> | null = null;
  /** Bumped by every play and stop; an await that comes back to a stale run drops its result. */
  private run = 0;

  constructor(private readonly deps: GrammarAudioDeps) {}

  get state(): GrammarAudioSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (s: GrammarAudioSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Is `key` the example currently loading or sounding? */
  isActive(key: string): boolean {
    return this.snapshot.key === key && (this.snapshot.status === 'loading' || this.snapshot.status === 'playing');
  }

  /**
   * Play one example, or stop it when it is the one already playing. Resolves
   * when playback has started, failed, or been superseded.
   */
  async toggle(key: string, text: string, lang: GrammarAudioLang): Promise<void> {
    if (this.isActive(key)) {
      this.stop();
      return;
    }
    await this.play(key, text, lang);
  }

  async play(key: string, text: string, lang: GrammarAudioLang): Promise<void> {
    // The previous example goes quiet now, not when the next one is ready.
    this.silence();
    const run = ++this.run;
    const { channel } = this.deps;
    const live = channel.claim();
    const current = (): boolean => run === this.run && live();
    this.set({ key, status: 'loading' });

    let made: FlashcardAudioResult;
    try {
      made = await this.deps.synthesize(text, lang, this.deps.voiceFor(lang));
    } catch (error) {
      // A rejected invoke: the handler is missing (an older main behind a reloaded renderer).
      made = { ok: false, reason: 'failed', error: String(error) };
    }
    if (!current()) return;
    if (!made.ok || !made.path) {
      this.set({ key, status: 'error', errorKey: grammarAudioErrorKey(made.reason, lang) });
      return;
    }

    let clip: FlashcardAudioResult;
    try {
      clip = await this.deps.read(made.path);
    } catch {
      clip = { ok: false, reason: 'failed' };
    }
    if (!current()) return;
    if (!clip.ok || !clip.dataUrl) {
      this.set({ key, status: 'error', errorKey: grammarAudioErrorKey(clip.reason, lang) });
      return;
    }

    const src = clip.dataUrl;
    this.src = src;
    this.set({ key, status: 'playing' });
    try {
      await channel.play(src);
    } catch {
      // `play()` refused: the user-activation window lapsed during synthesis.
      // The clip is cached in main, so the next click plays it at once.
      if (run === this.run) {
        this.src = null;
        this.set({ key, status: 'error', errorKey: 'grammarUi.audio.failed' });
      }
      return;
    }
    if (run !== this.run) return;
    // The channel owns the clip; it lets go when the clip ends, fails, is cut by
    // another study clip or the window loses focus. A ticket taken after our own
    // `play` goes stale on any of those that starts a different clip.
    const mine = channel.claim();
    this.watch(() => mine() && channel.playing, run);
  }

  /** Stop whatever example is playing or loading. */
  stop(): void {
    this.run += 1;
    this.silence();
    if (this.snapshot.status !== 'idle' || this.snapshot.key !== null) this.set({ key: null, status: 'idle' });
  }

  private silence(): void {
    this.clearPoll();
    if (this.src) this.deps.channel.stop(this.src);
    this.src = null;
  }

  private watch(stillMine: () => boolean, run: number): void {
    this.clearPoll();
    this.poll = setInterval(() => {
      if (run !== this.run) {
        this.clearPoll();
        return;
      }
      if (stillMine()) return;
      this.clearPoll();
      this.src = null;
      this.set({ key: null, status: 'idle' });
    }, this.deps.pollMs ?? 250);
  }

  private clearPoll(): void {
    if (this.poll !== null) clearInterval(this.poll);
    this.poll = null;
  }

  private set(next: GrammarAudioSnapshot): void {
    this.snapshot = next;
    for (const listener of this.listeners) listener(next);
  }
}

/** The Grammar window's one example player, on the app's shared study-clip channel. */
export const grammarExampleAudio = new GrammarExampleAudio({
  synthesize: (text, lang, voice) => window.api.flashcardSynthesizeAudio(text, lang, voice),
  read: (path) => window.api.flashcardReadAudio(path),
  channel: cardAudio,
  voiceFor: (lang) => preferredVoiceFor(lang),
});
