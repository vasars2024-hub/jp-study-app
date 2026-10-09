/**
 * The characters a word is written with: each one's readings, meanings, strokes,
 * level and components, from the character dictionary the install holds (KANJIDIC2
 * for Japanese, CC-CEDICT's character rows for Chinese).
 *
 * The single-character panel (`CharacterMetadataPanel`) only ever appeared when the
 * query WAS one character, so 図書館 never said what 図, 書 and 館 are. This is the
 * multi-character breakdown Yomitan's kanji tab gives. It is closed until asked for:
 * each character is one lookup, and a popup that ran them unasked would pay for three
 * reads per entry it will probably never expand. Facts come only from the character
 * rows; a character the dictionary has no row for says so instead of being guessed.
 */
import { useEffect, useState } from 'react';
import type { DictResult } from '../../../shared/types';
import { onDictionariesChanged } from '../../dictionaryChangeSignal';
import { useT } from '../../i18n';
import './dictEntryExtras.css';

type CharacterFacts = NonNullable<DictResult['character']>;

/** Characters per word worth breaking down; beyond this it is a phrase, not a word. */
const MAX_CHARS = 6;

/**
 * Per-character facts for the session — dropped whenever the installed dictionaries
 * change, because a miss cached before KANJIDIC2 was installed kept saying "no character
 * dictionary covers these characters" until a restart (found by the e2e harness).
 */
const factsCache = new Map<string, CharacterFacts | null>();
let factsGeneration = 0;
let watchingFacts = false;

function watchCharacterDictionaries(): void {
  if (watchingFacts) return;
  watchingFacts = true;
  onDictionariesChanged(() => {
    factsCache.clear();
    factsGeneration += 1;
  });
}

/** The distinct Han characters of `word`, in order, capped. */
export function hanCharacters(word: string, max = MAX_CHARS): string[] {
  const out: string[] = [];
  for (const ch of word) {
    if (!/\p{Script=Han}/u.test(ch) || out.includes(ch)) continue;
    out.push(ch);
    if (out.length >= max) break;
  }
  return out;
}

async function characterFacts(char: string, lang: 'ja' | 'zh'): Promise<CharacterFacts | null> {
  const key = `${lang}\u0000${char}`;
  if (factsCache.has(key)) return factsCache.get(key) ?? null;
  try {
    const api = window.api;
    const result =
      lang === 'zh'
        ? await api?.lookupChinese?.(char, 1)
        : await api?.lookupTerm?.(char, 1, 'ja');
    const facts = result?.character && result.character.char === char ? result.character : null;
    factsCache.set(key, facts);
    return facts;
  } catch {
    return null;
  }
}

interface Props {
  word: string;
  lang: string;
  /** Look a character up as a word of its own; absent hosts leave it a plain label. */
  onLookup?: (word: string) => void;
}

export default function KanjiBreakdown({ word, lang, onLookup }: Props) {
  const { t } = useT();
  const chars = lang === 'ja' || lang === 'zh' ? hanCharacters(word) : [];
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState<{
    word: string;
    generation: number;
    rows: Array<{ char: string; facts: CharacterFacts | null }>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [generation, setGeneration] = useState(() => factsGeneration);
  // Registered after the module-level watcher (which clears the cache first), so the
  // generation read here is already the new one.
  useEffect(() => {
    watchCharacterDictionaries();
    return onDictionariesChanged(() => setGeneration(factsGeneration));
  }, []);

  const rows = loaded?.word === word && loaded.generation === generation ? loaded.rows : null;
  const charsKey = chars.join('');

  // An open panel whose rows went stale (another word, or the dictionaries changed) reloads.
  const stale = !rows;
  useEffect(() => {
    if (!open || !stale || !charsKey) return undefined;
    let alive = true;
    setLoading(true);
    void Promise.all([...charsKey].map((char) => characterFacts(char, lang as 'ja' | 'zh'))).then((facts) => {
      if (!alive) return;
      setLoaded({ word, generation, rows: [...charsKey].map((char, i) => ({ char, facts: facts[i] })) });
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [open, stale, word, generation, charsKey, lang]);

  // A single character is the word itself: the character panel below the entries covers it.
  if (chars.length === 0 || (chars.length === 1 && [...word].length === 1)) return null;

  const toggle = (): void => {
    setOpen((was) => !was);
  };

  return (
    <div className="dict-kanji">
      <button
        type="button"
        className="dict-kanji-toggle lq-hit"
        aria-expanded={open}
        onClick={toggle}
      >
        {t('dict2.kanji.toggle', { count: chars.length })}
      </button>
      {open && loading && <p className="dict-kanji-status muted" role="status">{t('dict2.kanji.loading')}</p>}
      {open && rows && rows.every((row) => !row.facts) && (
        <p className="dict-kanji-status muted">{t('dict2.kanji.none')}</p>
      )}
      {open && rows && rows.some((row) => row.facts) && (
        <ul className="dict-kanji-list">
          {rows.map(({ char, facts }) => (
            <li key={char} className="dict-kanji-row">
              {onLookup ? (
                <button
                  type="button"
                  className="dict-kanji-glyph lq-hit"
                  lang={lang}
                  aria-label={t('dict2.kanji.lookup', { char })}
                  title={t('dict2.kanji.lookup', { char })}
                  onClick={() => onLookup(char)}
                >
                  {char}
                </button>
              ) : (
                <span className="dict-kanji-glyph" lang={lang}>{char}</span>
              )}
              {facts ? (
                <div className="dict-kanji-facts">
                  {facts.meanings.length > 0 && (
                    <span className="dict-kanji-meanings">{facts.meanings.slice(0, 4).join(', ')}</span>
                  )}
                  {facts.readings.length > 0 && (
                    <span className="dict-kanji-readings" lang={lang}>
                      <span className="sr-only">{t('lexicon.character.readings')}: </span>
                      {facts.readings.slice(0, 6).join(' · ')}
                    </span>
                  )}
                  <span className="dict-kanji-meta muted">
                    {facts.strokes !== undefined && (
                      <span>{t('lexicon.character.strokes')} {facts.strokes}</span>
                    )}
                    {facts.jlpt && <span>{t('lexicon.character.jlpt')} {facts.jlpt}</span>}
                    {facts.hsk && <span>{t('lexicon.character.hsk')} {facts.hsk}</span>}
                    {facts.grade !== undefined && <span>{t('lexicon.character.grade')} {facts.grade}</span>}
                    {facts.components.length > 0 && (
                      <span lang={lang}>
                        {t('lexicon.character.components')} {facts.components.join(' ')}
                      </span>
                    )}
                  </span>
                </div>
              ) : (
                <span className="dict-kanji-facts muted">{t('dict2.kanji.noRow')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
