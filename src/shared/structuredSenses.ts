/**
 * Per-sense parts of speech and usage tags from Yomitan structured content.
 *
 * A structured glossary used to reach the popup as one HTML block, so the
 * sense boundaries — and the part-of-speech and usage tags a dictionary like
 * Jitendex writes INSIDE each sense — were lost: the reader saw `noun` as a
 * word in the gloss rather than as the `n` tag every plain glossary shows.
 *
 * Structured content carries its semantics in `data` attributes, and the
 * convention the JMdict-derived Yomitan dictionaries share is:
 *
 *   data.content = 'sense-group'          a run of senses sharing a part of speech
 *   data.content = 'sense'                one sense
 *   data.content = 'part-of-speech-info'  a POS tag, code in data.code
 *   data.content = 'misc-info' | 'field-info' | 'dialect-info'   usage tags
 *   data.content = 'glossary'             the list of glosses of one sense
 *
 * This module reads exactly those markers and nothing else: a dictionary that
 * does not write them yields `null`, and the caller keeps its whole-block
 * rendering. Nothing is guessed from the visible text. The HTML of each sense is
 * produced by the caller's own renderer (the import's escaping renderer) and is
 * sanitized again by the caller, so this module never writes markup itself.
 */

export interface StructuredSenseParts {
  /** POS codes as the dictionary wrote them (`data.code`, else the tag's text). */
  partsOfSpeech: string[];
  /** Usage labels: the tag's own title (its readable description), else its text. */
  tags: string[];
  /** Gloss strings — the glossary list's items, else the sense's remaining text. */
  definitions: string[];
  /** The sense with its tag nodes removed, for the caller to render. */
  content: unknown;
}

type Node = Record<string, unknown>;

const POS_MARK = 'part-of-speech-info';
const USAGE_MARKS = new Set(['misc-info', 'field-info', 'dialect-info']);
const SENSE_MARK = 'sense';
const GROUP_MARK = 'sense-group';
const GLOSSARY_MARK = 'glossary';

function isNode(value: unknown): value is Node {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function marker(node: Node): string {
  const data = node.data;
  if (!isNode(data)) return '';
  const content = data.content;
  return typeof content === 'string' ? content.trim().toLowerCase() : '';
}

function childrenOf(node: unknown): unknown[] {
  if (Array.isArray(node)) return node;
  if (!isNode(node)) return [];
  const content = node.content;
  if (content === undefined || content === null) return [];
  return Array.isArray(content) ? content : [content];
}

/** Visible text of a node, with list items and line breaks as separators. */
function textOf(node: unknown): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number' || typeof node === 'boolean') return String(node);
  if (Array.isArray(node)) return node.map(textOf).join('');
  if (!isNode(node)) return '';
  if (node.type === 'image') return '';
  if (node.tag === 'br') return ' ';
  if (typeof node.text === 'string') return node.text;
  return childrenOf(node).map(textOf).join('');
}

function clean(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isTagNode(node: Node): boolean {
  const mark = marker(node);
  return mark === POS_MARK || USAGE_MARKS.has(mark);
}

interface TagHarvest {
  pos: string[];
  usage: string[];
}

/** Tag nodes under `node`, not descending into nested senses (they own their own tags). */
function harvestTags(node: unknown, out: TagHarvest, skipSenses: boolean): void {
  for (const child of childrenOf(node)) {
    if (!isNode(child)) {
      if (Array.isArray(child)) harvestTags(child, out, skipSenses);
      continue;
    }
    const mark = marker(child);
    if (skipSenses && (mark === SENSE_MARK || mark === GROUP_MARK)) continue;
    if (mark === POS_MARK) {
      const data = child.data as Node;
      const code = clean(typeof data.code === 'string' ? data.code : textOf(child));
      if (code && !out.pos.includes(code)) out.pos.push(code);
      continue;
    }
    if (USAGE_MARKS.has(mark)) {
      const title = typeof child.title === 'string' ? clean(child.title) : '';
      const label = title || clean(textOf(child));
      if (label && !out.usage.includes(label)) out.usage.push(label);
      continue;
    }
    harvestTags(child, out, skipSenses);
  }
}

/** A copy of `node` with every tag node removed (they are rendered as tags instead). */
function withoutTags(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.filter((child) => !(isNode(child) && isTagNode(child))).map(withoutTags);
  }
  if (!isNode(node)) return node;
  if (!('content' in node)) return node;
  return { ...node, content: withoutTags(childrenOf(node)) };
}

function findGlossaries(node: unknown, out: Node[]): void {
  for (const child of childrenOf(node)) {
    if (!isNode(child)) {
      if (Array.isArray(child)) findGlossaries(child, out);
      continue;
    }
    if (marker(child) === GLOSSARY_MARK) {
      out.push(child);
      continue;
    }
    findGlossaries(child, out);
  }
}

function glossItems(glossary: Node): string[] {
  const items = childrenOf(glossary).filter((child) => isNode(child) && child.tag === 'li');
  const texts = (items.length ? items : [glossary]).map((item) => clean(textOf(item)));
  return texts.filter(Boolean);
}

function senseParts(sense: Node, inherited: TagHarvest): StructuredSenseParts {
  const own: TagHarvest = { pos: [], usage: [] };
  harvestTags(sense, own, false);
  const partsOfSpeech = [...new Set([...inherited.pos, ...own.pos])];
  const tags = [...new Set([...inherited.usage, ...own.usage])];
  const content = withoutTags(sense);
  const glossaries: Node[] = [];
  findGlossaries(content, glossaries);
  const definitions = glossaries.length
    ? glossaries.flatMap(glossItems)
    : [clean(textOf(content))].filter(Boolean);
  return { partsOfSpeech, tags, definitions, content };
}

function collect(node: unknown, inherited: TagHarvest, out: StructuredSenseParts[]): void {
  for (const child of childrenOf(node)) {
    if (!isNode(child)) {
      if (Array.isArray(child)) collect(child, inherited, out);
      continue;
    }
    const mark = marker(child);
    if (mark === SENSE_MARK) {
      out.push(senseParts(child, inherited));
      continue;
    }
    if (mark === GROUP_MARK) {
      const group: TagHarvest = { pos: [...inherited.pos], usage: [...inherited.usage] };
      harvestTags(child, group, true);
      collect(child, group, out);
      continue;
    }
    collect(child, inherited, out);
  }
}

/**
 * The senses a structured-content definition marks, or null when it marks none
 * (or marks senses without a single part-of-speech or usage tag, where splitting
 * the block would gain the reader nothing).
 */
export function extractStructuredSenses(definition: unknown): StructuredSenseParts[] | null {
  if (!isNode(definition) && !Array.isArray(definition)) return null;
  const out: StructuredSenseParts[] = [];
  // Wrapped, so a definition that is itself a sense or a sense group is classified too.
  collect([definition], { pos: [], usage: [] }, out);
  const usable = out.filter((sense) => sense.definitions.length > 0);
  if (!usable.length) return null;
  if (!usable.some((sense) => sense.partsOfSpeech.length > 0 || sense.tags.length > 0)) return null;
  return usable;
}
