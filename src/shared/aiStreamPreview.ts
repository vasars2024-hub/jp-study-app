/**
 * What a streamed AI reply looks like while it is still arriving (docs/AI_AUDIT.md F9).
 *
 * Almost every AI feature asks for a JSON object, so the text that streams in is
 * `{"explanation":"暑い is about the wea` — not something to show a learner. This reads
 * that prefix the way a parser would, tolerating the cut at any point, and hands back
 * the string values it has seen so far, the last one possibly unfinished. A surface
 * shows those as a "drafting" preview; the final reply is still parsed by
 * `jsonReply.ts` and validated exactly as an unstreamed one, so what is kept never
 * depends on the preview.
 *
 * A Cancel keeps the preview as it stood: the partial text the learner was reading.
 *
 * Pure and framework-free: the renderer reads it, main's tests read it.
 */

export interface PartialJsonField {
  /** Dotted path from the top-level value: `sections.0.body`, `items.2.expression`. */
  path: string;
  /** The nearest object key (`body`); an array element's is its array's key. */
  key: string;
  value: string;
  /** False for the string the stream was cut inside. */
  complete: boolean;
}

/** Reasoning a local model emits before its answer; never part of the preview. */
function withoutThinking(text: string): string {
  const closed = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  const open = closed.search(/<think>/i);
  return open >= 0 ? closed.slice(0, open) : closed;
}

const ESCAPES: Readonly<Record<string, string>> = { n: '\n', t: '\t', r: '', b: '', f: '', '"': '"', '\\': '\\', '/': '/' };

interface Frame {
  kind: 'object' | 'array';
  /** The path of this container. */
  path: string[];
  /** The key the container itself sits under (for array elements). */
  key: string;
  /** Object: the key whose value comes next. Array: the next index. */
  pendingKey: string | null;
  index: number;
  expectKey: boolean;
}

/**
 * Every string value in the (possibly truncated) JSON value that starts at the first
 * `{` or `[` of `text`. Keys are not values; numbers, booleans and null are skipped.
 */
export function partialJsonStrings(raw: string): PartialJsonField[] {
  const text = withoutThinking(raw);
  const starts = [text.indexOf('{'), text.indexOf('[')].filter((n) => n >= 0);
  if (!starts.length) return [];
  const fields: PartialJsonField[] = [];
  const stack: Frame[] = [];
  let i = Math.min(...starts);

  /** Reads a string opening at `i` (the quote); returns its decoded text and whether it closed. */
  const readString = (): { value: string; complete: boolean } => {
    let out = '';
    i += 1;
    while (i < text.length) {
      const c = text[i];
      if (c === '"') {
        i += 1;
        return { value: out, complete: true };
      }
      if (c === '\\') {
        const next = text[i + 1];
        if (next === undefined) {
          i = text.length;
          break;
        }
        if (next === 'u') {
          const hex = text.slice(i + 2, i + 6);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) {
            // Cut inside the escape: what came before it stands.
            i = text.length;
            break;
          }
          out += String.fromCharCode(Number.parseInt(hex, 16));
          i += 6;
          continue;
        }
        out += ESCAPES[next] ?? next;
        i += 2;
        continue;
      }
      out += c;
      i += 1;
    }
    return { value: out, complete: false };
  };

  const valueSlot = (): { path: string[]; key: string } | null => {
    const top = stack[stack.length - 1];
    if (!top) return { path: [], key: '' };
    if (top.kind === 'array') return { path: [...top.path, String(top.index)], key: top.key };
    if (top.pendingKey === null) return null;
    return { path: [...top.path, top.pendingKey], key: top.pendingKey };
  };

  while (i < text.length) {
    const c = text[i];
    const top = stack[stack.length - 1];
    if (c === '"') {
      if (top && top.kind === 'object' && top.expectKey) {
        const { value, complete } = readString();
        if (!complete) break;
        top.pendingKey = value;
        top.expectKey = false;
        continue;
      }
      const slot = valueSlot();
      const { value, complete } = readString();
      if (slot) fields.push({ path: slot.path.join('.'), key: slot.key, value, complete });
      if (!complete) break;
      continue;
    }
    if (c === '{' || c === '[') {
      const slot = valueSlot() ?? { path: [], key: '' };
      stack.push({
        kind: c === '{' ? 'object' : 'array',
        path: slot.path,
        key: slot.key,
        pendingKey: null,
        index: 0,
        expectKey: c === '{',
      });
      i += 1;
      continue;
    }
    if (c === '}' || c === ']') {
      stack.pop();
      i += 1;
      if (!stack.length) break;
      continue;
    }
    if (c === ',' && top) {
      if (top.kind === 'array') top.index += 1;
      else {
        top.pendingKey = null;
        top.expectKey = true;
      }
    }
    i += 1;
  }
  return fields;
}

/**
 * Keys whose values are labels for the app, not prose for the learner: an enum
 * (`kind`, `confusion`, `confidence`), a code or an id.
 */
const LABEL_KEYS = new Set([
  'kind',
  'type',
  'confusion',
  'confidence',
  'id',
  'lang',
  'level',
  'mode',
  'register',
  'pos',
  'partOfSpeech',
  'imageQuery',
  'tags',
  'format',
]);

export interface StreamPreviewOptions {
  /** Only these keys (the prose the surface shows); otherwise every non-label key. */
  keys?: readonly string[];
  /**
   * The reply is prose, not JSON (a chat line): shown as it arrives, minus any
   * reasoning block. JSON replies never show anything outside their string values.
   */
  prose?: boolean;
}

/**
 * The readable part of a streamed reply so far: its string values, one paragraph
 * each, in the order they arrived. `''` until there is something to read.
 */
export function streamPreview(raw: string, options: StreamPreviewOptions = {}): string {
  if (options.prose) return withoutThinking(raw).trim();
  const keep = options.keys ? new Set(options.keys) : null;
  return partialJsonStrings(raw)
    .filter((field) => (keep ? keep.has(field.key) : !LABEL_KEYS.has(field.key)))
    .map((field) => field.value.trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * The fields of each element of the top-level array under `arrayKey` (Card Studio's
 * `items`), as `{ key: value }` per element, in order — the progressive view of a
 * batch while its JSON is still arriving.
 */
export function streamItems(raw: string, arrayKey: string): Array<Record<string, string>> {
  const items: Array<Record<string, string>> = [];
  for (const field of partialJsonStrings(raw)) {
    const parts = field.path.split('.');
    if (parts.length < 3 || parts[0] !== arrayKey) continue;
    const index = Number(parts[1]);
    if (!Number.isInteger(index) || index < 0 || index > 500) continue;
    const name = parts.slice(2).join('.');
    while (items.length <= index) items.push({});
    items[index][name] = field.value;
  }
  return items.filter((item) => Object.keys(item).length > 0);
}
