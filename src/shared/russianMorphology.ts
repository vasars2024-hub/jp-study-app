// Russian word forms, as small pure functions shared by main and renderer.
//
// Gum has no Russian morphological analyser, and does not pretend to: the
// dictionary's own paradigm rows (`inflections`, from the Wiktionary extract)
// are the authority for "which dictionary word is this form of". What lives
// here is the floor under that — stress and ё/е normalisation every surface
// needs, candidate dictionary forms to probe the index with (книги → книга,
// видела → видеть), and a light stem for grouping forms of one word when no
// dictionary answers.

/** U+0300 / U+0301: the stress accents Wiktionary and textbooks print. U+0308 is not one — ё is a letter. */
const STRESS_MARKS = /[̀́]/g;

/** `соба́ка` → `собака`. Composed ё survives; a decomposed е + U+0308 is recomposed to ё. */
export function stripRussianStress(text: string): string {
  return text.normalize('NFD').replace(STRESS_MARKS, '').normalize('NFC');
}

/** `ёлка` → `елка`. Most printed Russian writes е for ё, so both spellings must meet. */
export function foldRussianYo(text: string): string {
  return text.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
}

/** The key two spellings of one Russian form share: lower case, no stress, ё folded to е. */
export function russianFormKey(text: string): string {
  return foldRussianYo(stripRussianStress(text.normalize('NFKC').trim().toLowerCase()));
}

export function hasRussianStressMark(text: string): boolean {
  return /[̀́]/.test(text.normalize('NFD'));
}

const VERB_LEMMA = ['ть', 'ться', 'ти'];
const NOUN_LEMMA = ['', 'а', 'я', 'о', 'е', 'ь', 'й'];
const ADJ_LEMMA = ['ый', 'ий', 'ой'];

/**
 * Inflectional endings, longest first, each with the dictionary endings a word
 * that carries it may have. Deliberately a floor: it proposes candidates, and
 * only a dictionary hit makes one of them the answer.
 */
const ENDINGS: readonly (readonly [string, readonly string[]])[] = [
  ['ешься', VERB_LEMMA], ['ишься', VERB_LEMMA], ['ается', ['аться']], ['яется', ['яться']],
  ['лась', ['ться']], ['лось', ['ться']], ['лись', ['ться']], ['ался', ['аться']],
  ['ого', ADJ_LEMMA], ['его', [...ADJ_LEMMA, 'ее']], ['ому', ADJ_LEMMA], ['ему', ADJ_LEMMA],
  ['ыми', ADJ_LEMMA], ['ими', ADJ_LEMMA], ['ями', NOUN_LEMMA], ['ами', NOUN_LEMMA],
  ['ешь', VERB_LEMMA], ['ишь', ['ить', 'еть']], ['ете', VERB_LEMMA], ['ите', ['ить', 'еть']],
  ['ет', VERB_LEMMA], ['ит', ['ить', 'еть']], ['ем', [...VERB_LEMMA, ...NOUN_LEMMA]], ['им', ['ить', 'еть', ...ADJ_LEMMA]],
  ['ут', VERB_LEMMA], ['ют', VERB_LEMMA], ['ат', ['ать', 'ить']], ['ят', ['ять', 'ить', 'еть']],
  ['ла', VERB_LEMMA], ['ло', VERB_LEMMA], ['ли', VERB_LEMMA], ['л', VERB_LEMMA],
  ['ая', ADJ_LEMMA], ['яя', ['ий']], ['ое', ADJ_LEMMA], ['ее', ['ий']], ['ые', ADJ_LEMMA], ['ие', ['ий']],
  ['ую', ADJ_LEMMA], ['юю', ['ий']], ['ых', ADJ_LEMMA], ['их', ADJ_LEMMA], ['ым', ADJ_LEMMA],
  ['ой', [...ADJ_LEMMA, 'а', 'я']], ['ей', ['ь', 'я', 'е', 'ий']], ['ом', NOUN_LEMMA], ['ам', NOUN_LEMMA], ['ям', NOUN_LEMMA],
  ['ах', NOUN_LEMMA], ['ях', NOUN_LEMMA], ['ов', NOUN_LEMMA], ['ев', NOUN_LEMMA], ['ью', ['ь']],
  ['ю', [...VERB_LEMMA, 'я', 'ь']], ['у', ['а', '', 'о']], ['а', ['', 'о']], ['я', ['ь', 'й', 'е']],
  ['ы', ['а', '']], ['и', ['а', 'я', 'ь', '', 'ий']], ['е', ['а', 'я', '', 'о']], ['ь', ['']],
];

const MIN_STEM = 2;

/**
 * Candidate dictionary forms for a Russian word, the word itself first:
 * `книги` → [`книги`, …, `книга`, …]; `видела` → [`видела`, …, `видеть`, …].
 * Stress marks are removed; ё is kept (the ё-folded spelling is a separate key).
 */
export function russianLemmaCandidates(word: string, limit = 32): string[] {
  const base = stripRussianStress(word.normalize('NFKC').trim().toLowerCase());
  if (!base) return [];
  const out = new Set<string>([base]);
  for (const [ending, lemmaEndings] of ENDINGS) {
    if (!base.endsWith(ending) || base.length - ending.length < MIN_STEM) continue;
    const stem = base.slice(0, -ending.length);
    for (const lemmaEnding of lemmaEndings) {
      out.add(stem + lemmaEnding);
      if (out.size >= limit) return [...out];
    }
  }
  return [...out];
}

/**
 * A light stem that groups the forms of one word when no dictionary is there to
 * name its lemma: `книга`, `книги`, `книгу` → `книг`. Case- and ё-insensitive.
 */
export function russianStem(word: string): string {
  const base = russianFormKey(word);
  for (const [ending] of ENDINGS) {
    const folded = foldRussianYo(ending);
    if (base.endsWith(folded) && base.length - folded.length >= 3) return base.slice(0, -folded.length);
  }
  return base;
}

/**
 * Put a stressed spelling's accent onto the word as written in the text,
 * keeping its case: (`Книги`, `кни́ги`) → `Кни́ги`. Returns the surface
 * unchanged when the two are not the same word letter for letter (ё/е aside).
 */
export function applyRussianStress(surface: string, stressed: string): string {
  const letters = [...stressed.normalize('NFD')];
  const plain = [...surface.normalize('NFC')];
  const out: string[] = [];
  let i = 0;
  for (let k = 0; k < letters.length; k += 1) {
    const ch = letters[k];
    if (ch === '́' || ch === '̀') {
      if (!out.length) return surface;
      out.push('́');
      continue;
    }
    if (ch === '̈') continue; // ё decomposed: its base е was matched already
    const src = plain[i];
    if (src === undefined) return surface;
    const a = foldRussianYo(src.toLowerCase());
    const b = foldRussianYo(ch.toLowerCase());
    if (a !== b) return surface;
    out.push(src);
    i += 1;
  }
  if (i !== plain.length) return surface;
  return out.join('').normalize('NFC');
}
