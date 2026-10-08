/**
 * Signal decrypt — the pure half of the Wired review console.
 *
 * Scheduling is NOT here and never will be: grades go through
 * `reviewDeckCard`, the same seam the Flashcards app uses, so the SRS math has
 * one owner. This module only decides how a prompt looks while it decrypts,
 * which prompt a channel shows, and how the packet log / signal meter / final
 * transmission report are tallied.
 */
import type { LocalSrsRating } from '../../shared/localSrs';

/** Glyph noise the cipher is drawn from — box-drawing, blocks, half-width kana. */
export const NOISE_GLYPHS = '█▓▒░▚▞▙▟■□◆◇ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ01';

export type DecryptMotion = 'full' | 'reduced' | 'off';

export interface DecryptPlan {
  /** Number of stepped frames before the plaintext stands (0 = instant). */
  frames: number;
  /** Milliseconds per frame. */
  frameMs: number;
}

/**
 * ~1.5 s in 12 stepped frames at full motion; a short 4-frame burst when
 * motion is reduced; nothing at all under OS / in-app reduced motion, the
 * motion level `off`, or battery saver.
 */
export function decryptPlan(motion: DecryptMotion, reducedMotion: boolean, battery = false): DecryptPlan {
  if (reducedMotion || motion === 'off') return { frames: 0, frameMs: 0 };
  if (motion === 'reduced' || battery) return { frames: 4, frameMs: 100 };
  return { frames: 12, frameMs: 125 };
}

function hash(seed: number, i: number): number {
  let h = (seed * 2654435761 + i * 40503) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d) >>> 0;
  h ^= h >>> 12;
  return h >>> 0;
}

/**
 * The prompt as it reads at `frame` of `frames`. Characters lock in a
 * seeded order (not left to right — a decrypt resolves, it does not type), the
 * rest show noise. Whitespace and punctuation stay put so the shape reads.
 * `frame >= frames` (or `frames <= 0`) returns the plaintext exactly.
 */
export function decryptFrame(text: string, frame: number, frames: number, seed = 0): string {
  const chars = [...text];
  if (frames <= 0 || frame >= frames) return text;
  const progress = Math.max(0, frame) / frames;
  return chars
    .map((ch, i) => {
      if (/[\s、。，．！？!?・「」（）()]/u.test(ch)) return ch;
      // Each character's lock-in moment, spread over the run.
      const lockAt = (hash(seed, i) % 1000) / 1000;
      if (lockAt < progress) return ch;
      return NOISE_GLYPHS[hash(seed + frame * 31, i) % NOISE_GLYPHS.length];
    })
    .join('');
}

// ---------------------------------------------------------------------------
// Channels — what the prompt and the answer are.
// ---------------------------------------------------------------------------

export type DecryptChannel = 'forward' | 'reverse' | 'cloze';

export interface DecryptCardLike {
  id: string;
  word: string;
  reading?: string;
  meaning?: string;
  sentence?: string;
  front?: string;
  back?: string;
}

export interface DecryptPrompt {
  /** What is encrypted on screen. */
  prompt: string;
  /** Whether the prompt is Japanese (lang attr / font). */
  promptIsTarget: boolean;
  /** The channel actually used — cloze falls back to forward without a usable sentence. */
  channel: DecryptChannel;
}

const CLOZE_MASK = '［＿＿］';

export function clozeSentence(sentence: string, word: string): string | null {
  const s = sentence.trim();
  const w = word.trim();
  if (!s || !w || !s.includes(w) || s === w) return null;
  return s.split(w).join(CLOZE_MASK);
}

export function buildPrompt(card: DecryptCardLike, channel: DecryptChannel): DecryptPrompt {
  const word = (card.word || card.front || '').trim();
  const meaning = (card.meaning || card.back || '').trim();
  if (channel === 'reverse' && meaning) {
    return { prompt: meaning, promptIsTarget: false, channel: 'reverse' };
  }
  if (channel === 'cloze' && card.sentence) {
    const cloze = clozeSentence(card.sentence, word);
    if (cloze) return { prompt: cloze, promptIsTarget: true, channel: 'cloze' };
  }
  return { prompt: word || meaning, promptIsTarget: !!word, channel: 'forward' };
}

// ---------------------------------------------------------------------------
// Packet log + signal meter + transmission report.
// ---------------------------------------------------------------------------

export type PacketKind = 'ACK' | 'NAK';

export interface Packet {
  seq: number;
  kind: PacketKind;
  word: string;
  rating: LocalSrsRating;
  /** Interval after the grade, days (from the scheduler's result). */
  intervalDays: number;
  at: number;
}

export interface DecryptSession {
  packets: Packet[];
  /** Consecutive ACKs right now. */
  signal: number;
  /** Highest consecutive run this session. */
  peakSignal: number;
  startedAt: number;
}

export const SIGNAL_BARS = 10;

export function newDecryptSession(now = Date.now()): DecryptSession {
  return { packets: [], signal: 0, peakSignal: 0, startedAt: now };
}

export function packetKind(rating: LocalSrsRating): PacketKind {
  return rating === 'again' ? 'NAK' : 'ACK';
}

/** Append one graded answer. Pure: returns a new session. */
export function logPacket(
  session: DecryptSession,
  input: { word: string; rating: LocalSrsRating; intervalDays: number; at?: number },
): DecryptSession {
  const kind = packetKind(input.rating);
  const signal = kind === 'ACK' ? session.signal + 1 : 0;
  const packet: Packet = {
    seq: session.packets.length + 1,
    kind,
    word: input.word,
    rating: input.rating,
    intervalDays: Math.max(0, input.intervalDays),
    at: input.at ?? Date.now(),
  };
  return {
    ...session,
    packets: [...session.packets, packet],
    signal,
    peakSignal: Math.max(session.peakSignal, signal),
  };
}

/** Lit bars on the meter (0..SIGNAL_BARS). */
export function signalBars(signal: number): number {
  return Math.max(0, Math.min(SIGNAL_BARS, Math.floor(signal)));
}

export interface TransmissionReport {
  sent: number;
  ack: number;
  nak: number;
  /** 0..100, rounded. */
  accuracy: number;
  peakSignal: number;
  elapsedSec: number;
}

export function transmissionReport(session: DecryptSession, now = Date.now()): TransmissionReport {
  const sent = session.packets.length;
  const ack = session.packets.filter((p) => p.kind === 'ACK').length;
  return {
    sent,
    ack,
    nak: sent - ack,
    accuracy: sent ? Math.round((ack / sent) * 100) : 0,
    peakSignal: session.peakSignal,
    elapsedSec: Math.max(0, Math.round((now - session.startedAt) / 1000)),
  };
}

/** `#0007` — packet sequence code, literal. */
export function packetCode(seq: number): string {
  return `#${String(Math.max(0, seq)).padStart(4, '0')}`;
}

/** `+4d` / `+12h` / `+10m` for an interval in days. */
export function intervalCode(days: number): string {
  if (!(days > 0)) return '+0m';
  if (days >= 1) return `+${Math.round(days)}d`;
  const hours = days * 24;
  if (hours >= 1) return `+${Math.round(hours)}h`;
  return `+${Math.max(1, Math.round(hours * 60))}m`;
}
