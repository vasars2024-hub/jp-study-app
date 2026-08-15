// Field text normalisation — ANKI_DECK_WORKBENCH_PLAN.md Phase 4, "text
// normalization".
//
// This is the one Phase 4 workflow that writes back into `raw`, so it is
// deliberately narrower than `stripFieldHtml`. That function produces the
// *display* string: it drops cloze markers, sound tags and bracket readings all
// at once, which is right for a search index and catastrophic as an edit — a
// deck normalised with it would lose every cloze deletion it had.
//
// So the ops here are separate, individually chosen, and each one is the
// smallest thing a user could mean by its name. What none of them ever do:
//
//  - touch `{{c1::…}}` cloze markers, which are card structure, not formatting;
//  - touch `[sound:file.mp3]`, which is a media reference that happens to use
//    the same brackets as a furigana reading;
//  - reflow or translate anything. Normalising is not editing.
//
// `<img>` is a real exception: `strip-html` removes it, and with it the note's
// only reference to that file. That is not hidden — the tray runs every write
// through `writeNoteField`, which reports the dropped reference as a problem.

export type TextNormalizeOp =
  | 'strip-html'
  | 'strip-furigana'
  | 'ascii-width'
  | 'collapse-space'
  | 'trim';

/**
 * The order the ops run in, regardless of the order they were listed.
 *
 * Sub-steps inside one action are not where ordering belongs: the tray already
 * owns "action 2 sees action 1's output", and a second, finer ordering that
 * only applies inside one action is a rule nobody would guess. Anyone who needs
 * a different order queues two normalise actions and reorders those.
 *
 * The order itself is forced by what each op reads: entity decoding has to
 * happen before whitespace collapsing can see an `&nbsp;`, and width folding
 * has to happen before trimming can see an ideographic space.
 */
export const TEXT_NORMALIZE_ORDER: readonly TextNormalizeOp[] = [
  'strip-html',
  'strip-furigana',
  'ascii-width',
  'collapse-space',
  'trim',
];

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&([a-z]+);/gi, (whole, name: string) => ENTITIES[name.toLowerCase()] ?? whole);
}

function stripHtml(s: string): string {
  // `<rt>`/`<rp>` hold the reading, not the word: dropping only the tags would
  // fuse 漢 and かん into one unreadable string.
  let out = s.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/gi, '').replace(/<rp\b[^>]*>[\s\S]*?<\/rp>/gi, '');
  // A line break is whitespace once the markup is gone; without this every
  // `<br>`-separated line fuses into one word.
  out = out.replace(/<br\s*\/?>/gi, ' ').replace(/<\/(?:div|p|li|tr|h[1-6])\s*>/gi, ' ');
  out = out.replace(/<[^>]+>/g, '');
  return decodeEntities(out);
}

/**
 * A bracket span: either an Anki media reference or a bracket furigana reading,
 * in the ASCII or the full-width bracket form. Both alternatives live in one
 * pattern so the sound tag always wins the position it starts at.
 */
const SOUND_OR_READING = /([ \t]?)(\[sound:[^\]]*\]|[[\uFF3B][^\]\uFF3D]*[\]\uFF3D])/gi;

/**
 * `漢字[かんじ]` → `漢字`, Anki's own furigana convention, and the full-width
 * bracket form some sources use. `[sound:…]` survives: it is the same bracket
 * with a different meaning, and dropping it silently unlinks the audio.
 */
function stripFurigana(s: string): string {
  // One pass with the sound tag as the first alternative, rather than parking
  // sound tags behind a placeholder and restoring them: any placeholder that
  // can be typed can already be in the field, and restoring it then eats real
  // text. The optional leading space is captured outside the alternation, so a
  // space in front of a sound tag cannot pull it into the furigana branch.
  return s.replace(SOUND_OR_READING, (whole: string, _space: string, bracket: string) =>
    bracket.toLowerCase().startsWith('[sound:') ? whole : '',
  );
}

/**
 * Full-width ASCII (U+FF01–U+FF5E) folded to its half-width twin, plus the
 * ideographic space. Nothing else: 、。「」 live outside that block precisely
 * because they are not ASCII, and folding them would rewrite Japanese
 * punctuation into English punctuation, which is a translation, not a
 * normalisation.
 */
function foldAsciiWidth(s: string): string {
  return s
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ');
}

/** Every run of whitespace — including the NBSP a decoded `&nbsp;` leaves. */
function collapseSpace(s: string): string {
  // `\s` already covers U+00A0, so a decoded &nbsp; collapses like any space.
  return s.replace(/\s+/g, ' ');
}

/**
 * Apply the chosen ops in `TEXT_NORMALIZE_ORDER`. Unknown or repeated entries
 * are harmless; an empty list returns the input unchanged, and the tray turns
 * that into a blocking problem rather than a silently useless action.
 */
export function normalizeFieldText(raw: string, ops: readonly TextNormalizeOp[]): string {
  if (raw === '' || ops.length === 0) return raw;
  const wanted = new Set(ops);
  let out = raw;
  for (const op of TEXT_NORMALIZE_ORDER) {
    if (!wanted.has(op)) continue;
    if (op === 'strip-html') out = stripHtml(out);
    else if (op === 'strip-furigana') out = stripFurigana(out);
    else if (op === 'ascii-width') out = foldAsciiWidth(out);
    else if (op === 'collapse-space') out = collapseSpace(out);
    else out = out.trim();
  }
  return out;
}
