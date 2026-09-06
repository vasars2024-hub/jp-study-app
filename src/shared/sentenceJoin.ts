// Joining a data string to a localised sentence tail without doubling the
// full stop.
//
// The pattern this exists for: a catalog string that OPENS with the terminator
// which closes the clause before it, so the sentence still ends correctly when
// the optional middle part is absent. `anki.deckNoteType.subTail` is exactly
// that — '. Switch profiles above…' in en/ru, '。デッキ…' in ja/zh. Drop a seed
// profile description in front of it and the two terminators collide:
// 'background.. Switch profiles' and 'background.。デッキ', visible in all four
// languages because the seed descriptions are English data that ends in '.'.
//
// The terminator set is deliberately the two the app's own catalogs use as a
// sentence tail, not a general punctuation class: '!' and '?' carry meaning a
// following '. ' does not duplicate, and stripping them would change what the
// sentence says.

/**
 * Strip one trailing sentence terminator ('.' or '。') and any whitespace after
 * it, so the caller's own localised terminator is the only one rendered.
 * Returns the text unchanged when it does not end in one.
 */
export function stripTrailingTerminator(text: string): string {
  return text.replace(/[.。]\s*$/, '');
}
