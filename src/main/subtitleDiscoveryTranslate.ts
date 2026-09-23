/**
 * Machine-translates a whole subtitle track, keeping its timing.
 *
 * Used by the automation queue in two directions:
 *   Japanese → helper language, when a Japanese track exists and no helper-line
 *     track does (the ordinary anime case: Jimaku has Japanese only).
 *   helper language → Japanese, when only an English track exists and the audio
 *     is not Japanese, so Whisper cannot hear a Japanese line to transcribe.
 *
 * Engines are the app's existing ones, nothing new: a cloud provider through
 * `providerRuntime` (Gemini / DeepSeek, with the user's key and monthly spend
 * ceiling), else the offline Qwen model through `runLocalQwenPrompt`, which
 * shares the translator's serialized queue so an interactive translation is
 * never stuck behind a whole episode. Lines already translated anywhere in the
 * app are read from the shared translation cache and cost nothing.
 *
 * Prompting, parsing and assembly are pure and live in
 * `shared/subtitleDiscoveryTranslate.ts`.
 */

import { AI_PROVIDERS, type AiProviderId } from '../shared/aiProviders';
import { isValidCrossLangTranslation } from '../shared/epubEnrichment';
import { parseStudySubtitles, parseSubtitles } from '../shared/subtitleCues';
import type { SubtitleTranslationEnginePreference } from '../shared/subtitleDiscoveryIpc';
import {
  SUBTITLE_TRANSLATION_SYSTEM_PROMPT,
  assembleTranslatedSrt,
  buildSubtitleTranslationPrompt,
  chunkTranslationUnits,
  contextBefore,
  parseSubtitleTranslationReply,
  subtitleTranslationUnits,
  type SubtitleTranslationUnit,
} from '../shared/subtitleDiscoveryTranslate';
import { AiProviderRuntimeError, getAiProviderHealth, runCloudAiRequest } from './providerRuntime';
import {
  flushTranslationCache,
  getCachedTranslation,
  isTranslateAvailable,
  runLocalQwenPrompt,
  setCachedTranslation,
} from './translate';

export type SubtitleTranslationEngine =
  | { kind: 'cloud'; providerId: AiProviderId; label: string }
  | { kind: 'local'; label: 'local-qwen' };

/** Lines per request. A cloud model takes a whole scene; the 1.7B local model does best with a few. */
const CLOUD_CHUNK = 40;
const LOCAL_CHUNK = 10;
/** A track longer than this is not a subtitle track; refuse rather than spend on it. */
const MAX_UNITS = 3000;

/**
 * Cloud refusals that no retry of the next chunk can fix. The run stops on the
 * first one rather than sending the rest of the episode to the same refusal.
 */
const FATAL_CLOUD_CODES = new Set([
  'missing-credential',
  'authentication',
  'spend-budget',
  'cost-budget',
  'cloud-disabled',
  'sensitive-context',
]);

/**
 * The engine a translation may use now, or null when none is configured.
 *
 * `auto` prefers a configured cloud key (fast, and far better than a 1.7B model
 * at dialogue), then the offline model. The first configured provider in the
 * app's own table wins, which puts DeepSeek Flash ahead of Pro.
 */
export function resolveSubtitleTranslationEngine(
  preference: SubtitleTranslationEnginePreference,
): SubtitleTranslationEngine | null {
  if (preference !== 'local') {
    for (const provider of AI_PROVIDERS) {
      try {
        if (getAiProviderHealth(provider.id).configured) {
          return { kind: 'cloud', providerId: provider.id, label: provider.id };
        }
      } catch {
        /* an unreadable vault is the same as no key */
      }
    }
  }
  if (preference !== 'cloud' && isTranslateAvailable()) return { kind: 'local', label: 'local-qwen' };
  return null;
}

export interface TranslateTrackOptions {
  isCancelled?: () => boolean;
  onProgress?: (done: number, total: number) => void;
}

export interface TranslatedTrack {
  srt: string;
  translated: number;
  total: number;
  engine: string;
  /** Why the run stopped early, when it did. */
  stoppedBy?: string;
}

async function askEngine(engine: SubtitleTranslationEngine, prompt: string, lines: number): Promise<string> {
  if (engine.kind === 'cloud') {
    const result = await runCloudAiRequest({
      providerId: engine.providerId,
      prompt,
      systemPrompt: SUBTITLE_TRANSLATION_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      maxOutputTokens: Math.min(8192, 256 + lines * 120),
      temperature: 0.2,
      retryAttempts: 2,
      timeoutMs: 120_000,
    });
    return result.text;
  }
  return runLocalQwenPrompt(prompt, { maxTokens: Math.min(2048, 128 + lines * 90), timeoutMs: 120_000 });
}

/**
 * Translates `raw` (any format the app parses) from `source` into `target`.
 *
 * Returns null when the track holds nothing translatable. A returned track may be
 * partial — the caller decides with `translationIsUsable` whether it is worth
 * keeping.
 */
export async function translateSubtitleTrack(
  raw: string,
  source: string,
  target: string,
  engine: SubtitleTranslationEngine,
  options: TranslateTrackOptions = {},
): Promise<TranslatedTrack | null> {
  // The study split for a Japanese source: a dual-language `.ass` carries a whole
  // Chinese track beside the Japanese one, and translating both into one English
  // line would print every line twice.
  const cues = source.toLowerCase().startsWith('ja') ? parseStudySubtitles(raw).cues : parseSubtitles(raw);
  const units = subtitleTranslationUnits(cues);
  if (!units.length || units.length > MAX_UNITS) return null;

  // Namespaced so a subtitle line never borrows a glossary entry's "meaning only"
  // answer for the same text, and the reverse.
  const cacheSource = `${source}#subtitle`;
  const translations = new Map<string, string>();
  const pending: SubtitleTranslationUnit[] = [];
  for (const unit of units) {
    const hit = getCachedTranslation(unit.text, cacheSource, target);
    if (hit && isValidCrossLangTranslation(source, target, unit.text, hit)) translations.set(unit.id, hit);
    else pending.push(unit);
  }

  let stoppedBy: string | undefined;
  try {
    for (const chunk of chunkTranslationUnits(pending, engine.kind === 'cloud' ? CLOUD_CHUNK : LOCAL_CHUNK)) {
      if (options.isCancelled?.()) {
        stoppedBy = 'cancelled';
        break;
      }
      let reply = '';
      try {
        reply = await askEngine(
          engine,
          buildSubtitleTranslationPrompt(chunk, source, target, contextBefore(units, chunk)),
          chunk.length,
        );
      } catch (error) {
        if (error instanceof AiProviderRuntimeError && FATAL_CLOUD_CODES.has(error.code)) {
          stoppedBy = error.code;
          break;
        }
        // One bad chunk (a timeout, a malformed reply) costs its lines, not the track.
        continue;
      }
      const parsed = parseSubtitleTranslationReply(reply, chunk);
      for (const unit of chunk) {
        const text = parsed.get(unit.id);
        if (!text || !isValidCrossLangTranslation(source, target, unit.text, text)) continue;
        translations.set(unit.id, text);
        setCachedTranslation(unit.text, cacheSource, target, text);
      }
      options.onProgress?.(translations.size, units.length);
    }
  } finally {
    flushTranslationCache();
  }

  const assembled = assembleTranslatedSrt(units, translations);
  return { ...assembled, engine: engine.label, ...(stoppedBy ? { stoppedBy } : {}) };
}
