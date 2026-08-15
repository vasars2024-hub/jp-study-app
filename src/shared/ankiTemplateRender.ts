/**
 * The representative template preview — Phase 2 of ANKI_DECK_WORKBENCH_PLAN.md,
 * and the engine behind acceptance gate 13 ("prove that the representative
 * preview catches blank, duplicate, cloze, sibling, media and dark/mobile
 * rendering failures before Apply").
 *
 * A card in Anki is not stored: it is *generated* by running a note's fields
 * through its note type's template. So a workbench that shows fields but never
 * renders them cannot tell the user that an edit produced a blank question, a
 * reference to a field that does not exist, or a cloze marker Anki will not
 * parse — those only surface after a commit, which is exactly too late. This
 * module renders the card the way Anki would, and reports every way the render
 * went wrong.
 *
 * It is pure string work with no DOM, so it unit-tests in the node environment
 * and can run over a whole deck to build a sample set. The renderer implements
 * the subset of Anki's template language that a real deck uses; anything it does
 * not implement is *reported* as a problem rather than silently dropped, because
 * a preview that quietly renders less than Anki does is a preview that lies.
 *
 * Rendered HTML is untrusted: it comes from a foreign package and may contain
 * `<script>`. Every consumer must put it in a sandboxed frame, never in
 * `dangerouslySetInnerHTML`.
 */
import {
  mediaRefsInField,
  type AnkiDraft,
  type AnkiDraftCard,
  type AnkiDraftNote,
  type AnkiDraftNoteType,
  type AnkiDraftTemplate,
} from './ankiDraft';

/** A whole-deck scan stops here; a 100k-note deck must not block on a preview. */
export const MAX_PREVIEW_SCAN_NOTES = 5000;

/** How many cards a representative sample holds, at most. */
export const MAX_SAMPLE_CASES = 12;

export type AnkiRenderProblemCode =
  /** The rendered question side is empty — Anki would refuse to generate this card. */
  | 'empty-question'
  /** The rendered answer side is empty. */
  | 'empty-answer'
  /** `{{Foo}}` where `Foo` is neither a field of this note type nor a special. */
  | 'unresolved-field'
  /** A filter the renderer does not implement, e.g. `{{tts en_US:Front}}`. */
  | 'unknown-filter'
  /** `{{#Foo}}` with no `{{/Foo}}`, or a `{{/Foo}}` that closes nothing. */
  | 'unbalanced-conditional'
  /** `{{c1::` that never closes, or `{{c0::` — Anki numbers cloze from 1. */
  | 'malformed-cloze'
  /** A cloze note type whose fields carry no usable cloze marker at all. */
  | 'cloze-without-markers'
  /** `{{cloze:…}}` used by a standard note type, where it renders nothing useful. */
  | 'cloze-filter-outside-cloze-note'
  /** The render references a media file the source does not contain. */
  | 'missing-media'
  /**
   * The render references media the source *does* contain, but the preview
   * frame cannot load it. Advisory, not a deck defect — see
   * `ADVISORY_RENDER_PROBLEMS`.
   */
  | 'media-not-rendered'
  /**
   * The question rendered empty because a conditional in the template is false
   * for this note, so Anki generates **no card here at all**. Advisory: this is
   * the design working, not a blank card — see `ADVISORY_RENDER_PROBLEMS`.
   */
  | 'conditional-card-not-generated'
  /** The note's first field is empty; Anki treats it as the duplicate key. */
  | 'empty-first-field'
  /** Another note in this deck has the same first field. */
  | 'duplicate-first-field';

export interface AnkiRenderProblem {
  code: AnkiRenderProblemCode;
  /** `question`, `answer`, or `note` when the problem is not side-specific. */
  side: 'question' | 'answer' | 'note';
  /** The offending name — a field, a filter, a media file. Absent when not applicable. */
  detail?: string;
}

/**
 * Problems that describe a limit of the *preview*, not a defect in the deck.
 *
 * They are still shown — a user comparing a card against Anki deserves to know
 * why a box is blank — but nothing may treat them as evidence that a card is
 * broken. The representative sample's `validation-failing` slot in particular
 * would otherwise be spent on the first image card of any media deck.
 */
export const ADVISORY_RENDER_PROBLEMS: ReadonlySet<AnkiRenderProblemCode> = new Set([
  'media-not-rendered',
  'conditional-card-not-generated',
]);

export interface RenderedAnkiCard {
  cardId: string;
  noteId: string;
  /** Template ordinal for a standard note; cloze number minus one for a cloze note. */
  ord: number;
  /** Template name, or `Cloze N` for a cloze card. */
  label: string;
  questionHtml: string;
  answerHtml: string;
  /** The note type's CSS, verbatim — the preview frame needs it to look like Anki. */
  css: string;
  problems: AnkiRenderProblem[];
}

// ----- HTML and field helpers -------------------------------------------------

const TAG_RE = /<[^>]*>/g;
const NBSP_RE = /&nbsp;|&#160;|\u00a0/g;

/** A tag carrying a `src`, whose file name Anki counts as content. */
const SRC_TAG_RE = /<(?:img|audio|video|source|embed|object)\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>/gi;

/**
 * Anki's "is this field empty": strip markup and entities-as-space, then trim —
 * but keep the file name of anything with a `src` first.
 *
 * This mirrors Anki's own `strip_html_preserving_media_filenames`, and the
 * distinction is load-bearing: a card whose front is nothing but `<img>` is a
 * perfectly ordinary card that Anki generates and reviews. Stripping the tag
 * outright would call it empty and claim Anki refuses to generate it, which is
 * a false failure on every image-only note in a deck.
 */
export function fieldIsEmpty(raw: string): boolean {
  return stripHtml(String(raw ?? '').replace(SRC_TAG_RE, (_m, a, b, c) => ` ${a ?? b ?? c} `))
    .length === 0;
}

export function stripHtml(raw: string): string {
  return String(raw ?? '')
    .replace(TAG_RE, '')
    .replace(NBSP_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ----- cloze ------------------------------------------------------------------

interface ClozeChunk {
  ord: number;
  answer: string;
  hint?: string;
  start: number;
  end: number;
}

const CLOZE_OPEN_RE = /\{\{c(\d+)::/g;

/** Index of the `::` that separates answer from hint, ignoring nested markers. */
function topLevelHintSplit(body: string): number {
  let depth = 0;
  for (let i = 0; i < body.length - 1; i += 1) {
    if (body.startsWith('{{', i)) {
      depth += 1;
      i += 1;
      continue;
    }
    if (body.startsWith('}}', i)) {
      depth -= 1;
      i += 1;
      continue;
    }
    if (depth === 0 && body.startsWith('::', i)) return i;
  }
  return -1;
}

/**
 * Every well-formed cloze deletion in a field, with the span it occupies.
 *
 * Anki's own parser is not regex-only because a cloze answer may itself contain
 * `}}` from a nested template; this scans forward for the closing `}}` at the
 * same nesting depth, which is what makes `{{c1::a {{c2::b}} c}}` come out with
 * both markers intact rather than the outer one truncated at the inner's close.
 */
export function parseClozeChunks(raw: string): { chunks: ClozeChunk[]; malformed: boolean } {
  const text = String(raw ?? '');
  const chunks: ClozeChunk[] = [];
  let malformed = false;

  CLOZE_OPEN_RE.lastIndex = 0;
  for (let m = CLOZE_OPEN_RE.exec(text); m; m = CLOZE_OPEN_RE.exec(text)) {
    const ord = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    let depth = 1;
    let i = bodyStart;
    let end = -1;
    while (i < text.length - 1) {
      if (text.startsWith('{{', i)) {
        depth += 1;
        i += 2;
        continue;
      }
      if (text.startsWith('}}', i)) {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
        i += 2;
        continue;
      }
      i += 1;
    }
    // `{{c0::` is not a card Anki can make, and an unclosed marker is a typo the
    // user has to see; both are reported and neither renders as a deletion.
    if (end < 0 || !Number.isFinite(ord) || ord < 1) {
      malformed = true;
      continue;
    }
    const body = text.slice(bodyStart, end);
    // The hint separator is the first `::` at depth zero. Taking `indexOf` would
    // split `{{c1::a {{c2::b}} c}}` inside the nested marker and hand back `a {{c2`
    // as the answer — a nested cloze then renders as visible template garbage.
    const split = topLevelHintSplit(body);
    chunks.push({
      ord,
      answer: split >= 0 ? body.slice(0, split) : body,
      hint: split >= 0 ? body.slice(split + 2) : undefined,
      start: m.index,
      end: end + 2,
    });
    CLOZE_OPEN_RE.lastIndex = end + 2;
  }

  return { chunks, malformed };
}

/**
 * Render one field's cloze markers for card ordinal `ord` (0-based, so cloze
 * number `ord + 1`). The target deletion is hidden on the question and revealed
 * on the answer; every other deletion shows its answer on both sides, which is
 * what makes a sibling card readable.
 */
export function renderClozeField(
  raw: string,
  ord: number,
  side: 'question' | 'answer',
): { html: string; hasTarget: boolean; malformed: boolean } {
  const { chunks, malformed } = parseClozeChunks(raw);
  const target = ord + 1;
  let out = '';
  let cursor = 0;
  let hasTarget = false;

  for (const chunk of chunks) {
    out += raw.slice(cursor, chunk.start);
    if (chunk.ord === target) {
      hasTarget = true;
      out +=
        side === 'question'
          ? `<span class="cloze">[${escapeHtml(chunk.hint ?? '...')}]</span>`
          : `<span class="cloze">${chunk.answer}</span>`;
    } else {
      out += chunk.answer;
    }
    cursor = chunk.end;
  }
  out += raw.slice(cursor);

  return { html: out, hasTarget, malformed };
}

/** Every cloze number a note's fields carry — one card per number, as Anki does. */
export function clozeOrdinalsOfNote(note: AnkiDraftNote): number[] {
  const out = new Set<number>();
  for (const field of note.fields) {
    for (const chunk of parseClozeChunks(field.raw).chunks) out.add(chunk.ord);
  }
  return [...out].sort((a, b) => a - b);
}

// ----- the template renderer ---------------------------------------------------

/** Filters that change the value. Anything else is reported as `unknown-filter`. */
const KNOWN_FILTERS = new Set([
  'text',
  'cloze',
  'hint',
  'type',
  'furigana',
  'kana',
  'kanji',
  'edit',
]);

interface RenderContext {
  note: AnkiDraftNote;
  noteType: AnkiDraftNoteType;
  card: AnkiDraftCard | undefined;
  /**
   * The ordinal being rendered — deliberately not read off `card`. A cloze number
   * an edit just added has no card row yet, and taking the target from `card.ord`
   * would silently render every such preview as cloze 1.
   */
  cardOrd: number;
  deckName: string;
  templateName: string;
  side: 'question' | 'answer';
  report: (problem: AnkiRenderProblem) => void;
  /**
   * Keep every conditional section's body regardless of its field, used once to
   * ask "would this template have rendered anything if the conditional were
   * true?". Never set on a render the user sees.
   */
  forceSections?: boolean;
}

/** Anki's Japanese support: `漢字[かんじ]` becomes ruby. */
function furigana(value: string, mode: 'furigana' | 'kana' | 'kanji'): string {
  return value.replace(/ ?([^ >]+?)\[(.+?)\]/g, (_all, base: string, reading: string) => {
    if (mode === 'kana') return reading;
    if (mode === 'kanji') return base;
    return `<ruby>${base}<rt>${reading}</rt></ruby>`;
  });
}

function specialValue(name: string, ctx: RenderContext): string | undefined {
  switch (name) {
    case 'Tags':
      return ctx.note.tags.join(' ');
    case 'Type':
      return ctx.noteType.name;
    case 'Deck':
      return ctx.deckName;
    case 'Subdeck':
      return ctx.deckName.split('::').pop() ?? ctx.deckName;
    case 'Card':
      return ctx.templateName;
    case 'CardFlag':
      return ctx.card && ctx.card.flag !== 'none' ? `flag-${ctx.card.flag}` : '';
    default:
      return undefined;
  }
}

function fieldRaw(name: string, ctx: RenderContext): string | undefined {
  return ctx.note.fields.find((f) => f.name === name)?.raw;
}

/** One `{{…}}` replacement, filters applied left to right as Anki applies them. */
function renderReplacement(inner: string, ctx: RenderContext): string {
  const parts = inner.split(':');
  const name = (parts.pop() ?? '').trim();
  const filters = parts.map((f) => f.trim()).filter(Boolean);

  const special = specialValue(name, ctx);
  let value = special ?? fieldRaw(name, ctx);
  if (value === undefined) {
    ctx.report({ code: 'unresolved-field', side: ctx.side, detail: name });
    return '';
  }

  for (const filter of filters) {
    // `tts en_US` and friends carry an argument in the same segment.
    const head = filter.split(/\s+/)[0] ?? filter;
    if (!KNOWN_FILTERS.has(head)) {
      ctx.report({ code: 'unknown-filter', side: ctx.side, detail: head });
      continue;
    }
    switch (head) {
      case 'text':
        value = stripHtml(value);
        break;
      case 'cloze': {
        if (ctx.noteType.kind !== 'cloze') {
          ctx.report({ code: 'cloze-filter-outside-cloze-note', side: ctx.side, detail: name });
          break;
        }
        const rendered = renderClozeField(value, ctx.cardOrd, ctx.side);
        if (rendered.malformed) {
          ctx.report({ code: 'malformed-cloze', side: ctx.side, detail: name });
        }
        value = rendered.html;
        break;
      }
      case 'hint':
        value = value ? `<a class="hint" href="#">${escapeHtml(name)}</a>` : '';
        break;
      case 'type':
        // The typing box is interactive in Anki and cannot be in a static
        // preview; showing the slot is honest, showing the answer would not be.
        value = `<span class="typebox">[${escapeHtml(name)}]</span>`;
        break;
      case 'furigana':
      case 'kana':
      case 'kanji':
        value = furigana(value, head);
        break;
      case 'edit':
        break;
    }
  }

  return value;
}

const SECTION_RE = /\{\{([#^/])([^}]+)\}\}/;
const REPLACEMENT_RE = /\{\{([^#^/][^}]*)\}\}/g;

/**
 * Conditional sections, resolved outermost-first by scanning for the matching
 * close of the same name. An unmatched open or close is reported and its marker
 * is dropped, so a broken template still previews the rest of the card instead
 * of rendering the raw `{{#Foo}}` text at the user.
 */
function renderSections(template: string, ctx: RenderContext): string {
  const match = SECTION_RE.exec(template);
  if (!match) return template;

  const [marker, kind, rawName] = [match[0], match[1], match[2].trim()];
  const before = template.slice(0, match.index);
  const after = template.slice(match.index + marker.length);

  if (kind === '/') {
    ctx.report({ code: 'unbalanced-conditional', side: ctx.side, detail: rawName });
    return before + renderSections(after, ctx);
  }

  const close = `{{/${rawName}}}`;
  const closeAt = after.indexOf(close);
  if (closeAt < 0) {
    ctx.report({ code: 'unbalanced-conditional', side: ctx.side, detail: rawName });
    return before + renderSections(after, ctx);
  }

  const body = after.slice(0, closeAt);
  const rest = after.slice(closeAt + close.length);

  const special = specialValue(rawName, ctx);
  const value = special ?? fieldRaw(rawName, ctx);
  if (value === undefined) {
    ctx.report({ code: 'unresolved-field', side: ctx.side, detail: rawName });
  }
  const filled = !fieldIsEmpty(value ?? '');
  const keep = ctx.forceSections ? true : kind === '#' ? filled : !filled;

  return before + (keep ? renderSections(body, ctx) : '') + renderSections(rest, ctx);
}

function renderFormat(template: string, ctx: RenderContext): string {
  const sectioned = renderSections(String(template ?? ''), ctx);
  return sectioned.replace(REPLACEMENT_RE, (_all, inner: string) =>
    renderReplacement(inner, ctx),
  );
}

// ----- one card ----------------------------------------------------------------

function deckNameFor(draft: AnkiDraft, card: AnkiDraftCard | undefined, note: AnkiDraftNote): string {
  const deckId = card?.deckId ?? note.targetDeckId;
  return draft.decks.find((d) => d.id === deckId)?.name ?? '';
}

function templateFor(
  noteType: AnkiDraftNoteType,
  ord: number,
): { template: AnkiDraftTemplate | undefined; label: string } {
  if (noteType.kind === 'cloze') {
    const first = noteType.templates[0];
    return { template: first, label: `${first?.name ?? 'Cloze'} ${ord + 1}` };
  }
  const template = noteType.templates.find((tpl) => tpl.ord === ord);
  return { template, label: template?.name ?? `Card ${ord + 1}` };
}

/**
 * Render the card `card` of `note` exactly as its note type says, and report
 * every problem found on the way. `card` may be a card the draft does not hold
 * yet — a cloze number an edit just added generates one on commit, and the whole
 * point of the preview is to show it before that happens.
 */
export function renderAnkiCard(
  draft: AnkiDraft,
  note: AnkiDraftNote,
  cardOrd: number,
  options: { cardId?: string; mediaPresent?: (fileName: string) => boolean } = {},
): RenderedAnkiCard {
  const noteType = draft.noteTypes.find((nt) => nt.id === note.noteTypeId);
  const card = draft.cards.find((c) => c.noteId === note.id && c.ord === cardOrd);
  const problems: AnkiRenderProblem[] = [];
  const seen = new Set<string>();
  const report = (problem: AnkiRenderProblem): void => {
    const key = `${problem.code}:${problem.side}:${problem.detail ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    problems.push(problem);
  };

  if (!noteType) {
    return {
      cardId: options.cardId ?? card?.id ?? `${note.id}:${cardOrd}`,
      noteId: note.id,
      ord: cardOrd,
      label: `Card ${cardOrd + 1}`,
      questionHtml: '',
      answerHtml: '',
      css: '',
      problems: [
        { code: 'empty-question', side: 'question' },
        { code: 'empty-answer', side: 'answer' },
      ],
    };
  }

  const { template, label } = templateFor(noteType, cardOrd);
  const base = {
    note,
    noteType,
    card,
    cardOrd,
    deckName: deckNameFor(draft, card, note),
    templateName: label,
    report,
  };

  const questionHtml = renderFormat(template?.qfmt ?? '', { ...base, side: 'question' });
  const answerFormat = String(template?.afmt ?? '').replace(/\{\{FrontSide\}\}/g, questionHtml);
  const answerHtml = renderFormat(answerFormat, { ...base, side: 'answer' });

  // An empty question means Anki generates no card — but *why* it is empty is
  // the difference between a defect and a design. A qfmt with no conditional
  // that renders blank is a broken card the user must fix; a qfmt gated on
  // `{{#Add Reverse}}` that renders blank is the optional-reverse design
  // working exactly as asked, and calling that "blank question" would make
  // every unflagged note in the deck read as a failure.
  //
  // "Has a conditional" is not enough to tell them apart: a *flagged* note whose
  // question field is blank also renders empty, and calling that by-design would
  // hide a real blank behind the switch. So the test is whether the conditional
  // is what suppressed the content — render the question once more with every
  // section forced open, and if it is still empty the blank is the field's, not
  // the switch's. The extra render only runs on an empty question.
  const questionIsConditional =
    fieldIsEmpty(questionHtml) &&
    SECTION_RE.test(String(template?.qfmt ?? '')) &&
    !fieldIsEmpty(
      renderFormat(template?.qfmt ?? '', {
        ...base,
        side: 'question',
        forceSections: true,
        // This render is a question asked of the template, not a render of the
        // card, so its findings are already reported by the real one above.
        report: () => undefined,
      }),
    );
  if (fieldIsEmpty(questionHtml)) {
    if (questionIsConditional) {
      report({ code: 'conditional-card-not-generated', side: 'question' });
    } else {
      report({ code: 'empty-question', side: 'question' });
    }
  }
  // A card that is not generated has no answer to be blank. Reporting one
  // would be a second failure line for a card that does not exist.
  if (fieldIsEmpty(answerHtml) && !(questionIsConditional && fieldIsEmpty(questionHtml))) {
    report({ code: 'empty-answer', side: 'answer' });
  }

  if (noteType.kind === 'cloze' && clozeOrdinalsOfNote(note).length === 0) {
    report({ code: 'cloze-without-markers', side: 'note' });
  }
  for (const field of note.fields) {
    if (parseClozeChunks(field.raw).malformed) {
      report({ code: 'malformed-cloze', side: 'note', detail: field.name });
    }
  }

  // Media is checked on the *rendered* HTML, not the fields: a template can add
  // an `<img>` of its own, and a conditional can leave a field's image out.
  const present =
    options.mediaPresent ??
    ((fileName: string) => note.media.some((m) => m.fileName === fileName && m.present));
  for (const side of [questionHtml, answerHtml]) {
    const sideName = side === questionHtml ? 'question' : 'answer';
    // Media the source *does* hold still cannot load: the frame is an
    // opaque-origin srcdoc whose CSP allows `data:` images only, and Anki
    // references media by bare file name. Saying so is the difference between
    // "this card is fine" and "this card is fine except for what you cannot
    // see here" — without it every image card gets a false clean.
    const unrendered: string[] = [];
    for (const ref of mediaRefsInField(side, 0, present)) {
      if (!ref.present) {
        report({ code: 'missing-media', side: sideName, detail: ref.fileName });
      } else if (!unrendered.includes(ref.fileName)) {
        unrendered.push(ref.fileName);
      }
    }
    if (unrendered.length > 0) {
      report({ code: 'media-not-rendered', side: sideName, detail: unrendered.join(', ') });
    }
  }

  return {
    cardId: options.cardId ?? card?.id ?? `${note.id}:${cardOrd}`,
    noteId: note.id,
    ord: cardOrd,
    label,
    questionHtml,
    answerHtml,
    css: noteType.css,
    problems,
  };
}

/** Every card a note generates — the template ords, or one per cloze number. */
export function cardOrdsOfNote(draft: AnkiDraft, note: AnkiDraftNote): number[] {
  const noteType = draft.noteTypes.find((nt) => nt.id === note.noteTypeId);
  if (!noteType) return [0];
  if (noteType.kind === 'cloze') {
    const ords = clozeOrdinalsOfNote(note).map((n) => n - 1);
    return ords.length > 0 ? ords : [0];
  }
  return noteType.templates.map((tpl) => tpl.ord).sort((a, b) => a - b);
}

/** Render every sibling card of a note, in card order. */
export function renderNoteCards(draft: AnkiDraft, note: AnkiDraftNote): RenderedAnkiCard[] {
  const present = draftMediaPresence(draft);
  return cardOrdsOfNote(draft, note).map((ord) =>
    renderAnkiCard(draft, note, ord, { mediaPresent: present }),
  );
}

/** Media the source actually holds, keyed by leaf name. */
export function draftMediaPresence(draft: AnkiDraft): (fileName: string) => boolean {
  const names = new Set<string>();
  for (const note of draft.notes) {
    for (const ref of note.media) if (ref.present) names.add(ref.fileName);
  }
  return (fileName: string) => names.has(fileName);
}

// ----- the representative sample ------------------------------------------------

export type SampleReason =
  | 'first'
  | 'empty-render'
  | 'longest'
  | 'media-heavy'
  | 'cloze'
  | 'sibling'
  | 'duplicate'
  | 'validation-failing'
  | 'random';

export interface SampleCase {
  /** Why this card is in the set. A card picked for several reasons lists them all. */
  reasons: SampleReason[];
  noteId: string;
  cardOrd: number;
  render: RenderedAnkiCard;
}

export interface RepresentativeSample {
  cases: SampleCase[];
  /** Notes actually scanned; below `counts.notes` when the deck hit the scan cap. */
  scannedNotes: number;
  /** Reasons no card in this deck could satisfy — an honest "nothing to show". */
  absentReasons: SampleReason[];
}

const REASON_ORDER: SampleReason[] = [
  'validation-failing',
  'empty-render',
  'cloze',
  'sibling',
  'media-heavy',
  'duplicate',
  'longest',
  'first',
  'random',
];

/**
 * A deterministic stand-in for "a random card". A real `Math.random` would make
 * the preview a different set on every render, so the same deck could never be
 * compared against itself across an edit.
 */
function stableHash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Build the representative sample set the plan asks for: first, empty, longest,
 * media-heavy, cloze, sibling, duplicate and validation-failing cases, plus one
 * deterministic random card so a deck's ordinary middle is represented too.
 *
 * The scan is capped at `MAX_PREVIEW_SCAN_NOTES` and the result says how far it
 * got, because a preview that silently sampled the first 5,000 notes of a
 * 100,000-note deck and called itself representative would be the exact kind of
 * quiet lie the plan forbids.
 */
export function buildRepresentativeSample(
  draft: AnkiDraft,
  options: { limit?: number; scanLimit?: number } = {},
): RepresentativeSample {
  const limit = Math.max(1, options.limit ?? MAX_SAMPLE_CASES);
  const scanLimit = Math.max(1, options.scanLimit ?? MAX_PREVIEW_SCAN_NOTES);
  const notes = draft.notes.slice(0, scanLimit);
  const present = draftMediaPresence(draft);

  const firstFieldCounts = new Map<string, number>();
  for (const note of notes) {
    const key = note.fields[0]?.normalized ?? '';
    if (key) firstFieldCounts.set(key, (firstFieldCounts.get(key) ?? 0) + 1);
  }

  const picked = new Map<string, SampleCase>();
  const claim = (note: AnkiDraftNote, cardOrd: number, reason: SampleReason): void => {
    const key = `${note.id}:${cardOrd}`;
    const existing = picked.get(key);
    if (existing) {
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }
    picked.set(key, {
      reasons: [reason],
      noteId: note.id,
      cardOrd,
      render: renderAnkiCard(draft, note, cardOrd, { mediaPresent: present }),
    });
  };

  // One pass computes the extremes, so a large deck is scanned once.
  let longest: { note: AnkiDraftNote; length: number } | undefined;
  let mediaHeavy: { note: AnkiDraftNote; count: number } | undefined;
  let randomPick: { note: AnkiDraftNote; score: number } | undefined;
  const empties: AnkiDraftNote[] = [];
  const failing: Array<{ note: AnkiDraftNote; ord: number }> = [];
  let cloze: AnkiDraftNote | undefined;
  let sibling: AnkiDraftNote | undefined;
  let duplicate: AnkiDraftNote | undefined;

  for (const note of notes) {
    const ords = cardOrdsOfNote(draft, note);
    const length = note.fields.reduce((sum, f) => sum + f.normalized.length, 0);
    if (!longest || length > longest.length) longest = { note, length };
    if (!mediaHeavy || note.media.length > mediaHeavy.count) {
      mediaHeavy = { note, count: note.media.length };
    }
    const score = stableHash(note.guid || note.id);
    if (!randomPick || score > randomPick.score) randomPick = { note, score };

    const noteType = draft.noteTypes.find((nt) => nt.id === note.noteTypeId);
    if (!cloze && noteType?.kind === 'cloze') cloze = note;
    if (!sibling && ords.length > 1) sibling = note;

    const key = note.fields[0]?.normalized ?? '';
    if (!duplicate && key && (firstFieldCounts.get(key) ?? 0) > 1) duplicate = note;
    if (!duplicate && !key) duplicate = note;

    // Rendering every card of every note is the expensive part; a note only
    // enters the render loop while the two render-derived buckets are unfilled.
    if (empties.length > 0 && failing.length > 0) continue;
    for (const ord of ords) {
      const render = renderAnkiCard(draft, note, ord, { mediaPresent: present });
      const blank = render.problems.some(
        (p) => p.code === 'empty-question' || p.code === 'empty-answer',
      );
      if (blank && empties.length === 0) empties.push(note);
      // Advisory lines say something about the preview, not the deck, so they
      // must not spend the one slot reserved for a card that really fails.
      const failed = render.problems.some((p) => !ADVISORY_RENDER_PROBLEMS.has(p.code));
      if (failed && !blank && failing.length === 0) {
        failing.push({ note, ord });
      }
      if (empties.length > 0 && failing.length > 0) break;
    }
  }

  const first = notes[0];
  if (failing[0]) claim(failing[0].note, failing[0].ord, 'validation-failing');
  if (empties[0]) claim(empties[0], cardOrdsOfNote(draft, empties[0])[0] ?? 0, 'empty-render');
  if (cloze) claim(cloze, cardOrdsOfNote(draft, cloze)[0] ?? 0, 'cloze');
  // A sibling case is only useful if the *siblings* are visible, so it claims
  // every card the note generates rather than just the first.
  if (sibling) for (const ord of cardOrdsOfNote(draft, sibling)) claim(sibling, ord, 'sibling');
  if (mediaHeavy && mediaHeavy.count > 0) {
    claim(mediaHeavy.note, cardOrdsOfNote(draft, mediaHeavy.note)[0] ?? 0, 'media-heavy');
  }
  if (duplicate) claim(duplicate, cardOrdsOfNote(draft, duplicate)[0] ?? 0, 'duplicate');
  if (longest) claim(longest.note, cardOrdsOfNote(draft, longest.note)[0] ?? 0, 'longest');
  if (first) claim(first, cardOrdsOfNote(draft, first)[0] ?? 0, 'first');
  if (randomPick) {
    claim(randomPick.note, cardOrdsOfNote(draft, randomPick.note)[0] ?? 0, 'random');
  }

  const all = [...picked.values()];
  for (const item of all) {
    item.reasons.sort((a, b) => REASON_ORDER.indexOf(a) - REASON_ORDER.indexOf(b));
  }
  // Rank by the strongest reason a card carries, so a truncated set drops the
  // ordinary cards and keeps the ones that can fail.
  all.sort(
    (a, b) => REASON_ORDER.indexOf(a.reasons[0]) - REASON_ORDER.indexOf(b.reasons[0]),
  );
  const cases = all.slice(0, limit);

  const covered = new Set(cases.flatMap((c) => c.reasons));
  return {
    cases,
    scannedNotes: notes.length,
    absentReasons: REASON_ORDER.filter((r) => !covered.has(r)),
  };
}

/**
 * Note-level problems the per-card render cannot see, because they are about the
 * note's place in the deck rather than its template.
 */
export function noteLevelProblems(draft: AnkiDraft, note: AnkiDraftNote): AnkiRenderProblem[] {
  const out: AnkiRenderProblem[] = [];
  const key = note.fields[0]?.normalized ?? '';
  if (!key) {
    out.push({ code: 'empty-first-field', side: 'note' });
    return out;
  }
  const twin = draft.notes.find(
    (other) => other.id !== note.id && (other.fields[0]?.normalized ?? '') === key,
  );
  if (twin) out.push({ code: 'duplicate-first-field', side: 'note', detail: key });
  return out;
}
