// Lightweight TTS via Web Speech API — offline OS voices, no new dependency.

export type TtsLang = 'ja' | 'zh' | 'ru' | 'en' | string;

const LANG_TAG: Record<string, string> = {
  ja: 'ja-JP',
  zh: 'zh-CN',
  ru: 'ru-RU',
  en: 'en-US',
};

function pickVoice(lang: string): SpeechSynthesisVoice | null {
  if (typeof speechSynthesis === 'undefined') return null;
  const tag = LANG_TAG[lang] || lang;
  const voices = speechSynthesis.getVoices();
  const exact = voices.find((v) => v.lang === tag || v.lang.replace('_', '-') === tag);
  if (exact) return exact;
  const prefix = tag.slice(0, 2).toLowerCase();
  return voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ?? null;
}

/** Speak `text` in `lang` (ja/zh/ru/en or BCP-47). Stops any current utterance. */
export function speak(text: string, lang: TtsLang = 'ja'): boolean {
  if (typeof speechSynthesis === 'undefined') return false;
  const t = text.trim();
  if (!t) return false;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(t);
  u.lang = LANG_TAG[lang] || lang;
  const voice = pickVoice(lang);
  if (voice) u.voice = voice;
  u.rate = 0.95;
  speechSynthesis.speak(u);
  return true;
}

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
}

/**
 * Guess the TTS language from the text's script. Kana → ja; Han-only text
 * follows `hanPreference` (the active dictionary language); Cyrillic → ru;
 * otherwise en.
 */
export function detectTtsLang(text: string, hanPreference: 'ja' | 'zh' | 'ru' = 'ja'): TtsLang {
  if (/[぀-ヿ]/.test(text)) return 'ja'; // any kana is unambiguously Japanese
  // Han only: ja vs zh by the study language. A Russian learner's Han text is
  // not Chinese by default either — Japanese stays the fallback.
  if (/[㐀-鿿]/.test(text)) return hanPreference === 'zh' ? 'zh' : 'ja';
  if (/[Ѐ-ӿ]/.test(text)) return 'ru';
  return 'en';
}

export function ttsAvailable(): boolean {
  return typeof speechSynthesis !== 'undefined';
}
