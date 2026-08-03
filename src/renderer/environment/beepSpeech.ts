/**
 * Animalese-style beep speech — one short oscillator per mora/syllable.
 * Reuses soundEngine's AudioContext (companion category). No TTS, no network.
 */
import { soundEngine } from '../audio/soundEngine';
import type { CompanionTypeId } from './companionCatalog';

export interface VoiceProfile {
  /** Base pitch in Hz. */
  baseHz: number;
  wave: OscillatorType;
  /** Hz step applied per successive mora (signed ok). */
  stepPerMora: number;
}

export const DEFAULT_VOICE: VoiceProfile = {
  baseHz: 520,
  wave: 'square',
  stepPerMora: 36,
};

export const BUDDY_SPEECH_EVENT = 'buddy:speech';

export interface BuddySpeechDetail {
  companionId: string;
  text: string | null;
}

const KANA_RE =
  /[\u3040-\u309F\u30A0-\u30FF\uFF66-\uFF9D]|[\u4E00-\u9FFF]|[A-Za-z]+|\d+|[^\s]/gu;

/** Split a line into mora-ish units for beep timing. */
export function splitSyllables(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts: string[] = [];
  const re = new RegExp(KANA_RE.source, 'gu');
  let m: RegExpExecArray | null;
  while ((m = re.exec(trimmed))) {
    const tok = m[0];
    if (/^[A-Za-z]+$/.test(tok)) {
      // Rough English syllable chunks: CV groups.
      const chunks = tok.match(/[^aeiouy]*[aeiouy]+(?:[^aeiouy]*$|[^aeiouy](?=[^aeiouy]))?/gi) ?? [tok];
      for (const c of chunks) if (c) parts.push(c);
    } else {
      parts.push(tok);
    }
  }
  return parts.length ? parts : [trimmed];
}

function hashChar(ch: string): number {
  let h = 0;
  for (let i = 0; i < ch.length; i++) h = (h * 31 + ch.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function emitSpeech(companionId: string, text: string | null): void {
  try {
    window.dispatchEvent(new CustomEvent(BUDDY_SPEECH_EVENT, { detail: { companionId, text } }));
  } catch {
    /* ignore */
  }
}

const active = new Map<string, number>();

/**
 * Play one short beep per syllable while the subtitle bubble shows `text`.
 * Resolves when the line finishes (or is cancelled by a newer line).
 */
export async function speakBeepLine(
  companionId: string,
  text: string,
  profile: VoiceProfile = DEFAULT_VOICE,
): Promise<void> {
  const line = text.trim().slice(0, 160);
  if (!line) return;

  const gen = (active.get(companionId) ?? 0) + 1;
  active.set(companionId, gen);
  emitSpeech(companionId, line);

  const syllables = splitSyllables(line);
  const gapMs = 72;

  try {
    for (let i = 0; i < syllables.length; i++) {
      if (active.get(companionId) !== gen) return;
      const syl = syllables[i] ?? '';
      const wobble = (hashChar(syl) % 17) - 8;
      const freq = Math.max(
        80,
        Math.min(2400, profile.baseHz + i * profile.stepPerMora + wobble),
      );
      soundEngine.playTone('companion', {
        freq,
        durationMs: 48,
        volume: 0.22,
        type: profile.wave,
      });
      await sleep(gapMs);
    }
    // Hold the bubble briefly after the last beep.
    await sleep(280);
  } finally {
    if (active.get(companionId) === gen) {
      emitSpeech(companionId, null);
      active.delete(companionId);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Built-in voice lookup by type when a def has no profile. */
export function voiceForType(typeId: CompanionTypeId): VoiceProfile {
  switch (typeId) {
    case 'critter':
      return { baseHz: 640, wave: 'triangle', stepPerMora: 48 };
    case 'timekeeper':
      return { baseHz: 440, wave: 'sine', stepPerMora: 28 };
    case 'miko-shimeji':
      return { baseHz: 700, wave: 'square', stepPerMora: 55 };
    case 'wired-navi':
      return { baseHz: 300, wave: 'sawtooth', stepPerMora: 18 };
    default:
      return DEFAULT_VOICE;
  }
}
