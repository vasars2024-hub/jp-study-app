// Reading a legacy `userData/yomitan/<id>/index.json` a member at a time.
//
// The first-boot migration used to `JSON.parse(fs.readFileSync(file))` each
// store. The bundled JMdict (English) store is ~65 MB of JSON, and holding its
// text and the whole parsed object at once is what put the migration's utility
// process at ~530 MB. Nothing in the migration needs more than one headword's
// entries at a time, so this reads the file in fixed-size chunks and hands over
// one member of each streamed section (`terms`, `pitch`, …) at a time, parsed on
// its own and dropped once the caller has written it.
//
// The format is the one `yomitan.ts` writes: a single top-level object whose
// sections are objects keyed by term. Scanning bytes is safe for UTF-8 because
// every structural character (`{ } [ ] " : , \`) is ASCII, and no byte of a
// multi-byte sequence is below 0x80 — so a slice cut at a structural byte never
// splits a character, and a slice spanning chunks is decoded only once whole.

import fs from 'node:fs';

/** The file is not the JSON object this module reads; the message says where. */
export class LegacyIndexReadError extends Error {}

/** Bytes read per `fs.readSync`. Small enough to be noise next to one parsed entry. */
const CHUNK_BYTES = 1 << 20;

const QUOTE = 0x22;
const BACKSLASH = 0x5c;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;
const COLON = 0x3a;
const COMMA = 0x2c;

function isSpace(byte: number): boolean {
  return byte === 0x20 || byte === 0x0a || byte === 0x0d || byte === 0x09;
}

export interface LegacyIndexScan {
  /** Top-level keys whose object value is streamed member by member. */
  sections: ReadonlySet<string>;
  /** Top-level keys whose value is parsed whole and handed to `onValue`. */
  values?: ReadonlySet<string>;
  /** One member of a streamed section. */
  onMember?: (section: string, key: string, value: unknown) => void;
  /** A whole top-level value. Return `false` to stop reading the file there. */
  onValue?: (key: string, value: unknown) => boolean | void;
}

type Phase = 'key' | 'colon' | 'value' | 'primitive' | 'nested' | 'after';

/**
 * Walks the file once, synchronously, calling back for the members and values
 * the scan asked for; everything else is stepped over without being parsed.
 * Throws `LegacyIndexReadError` for a file that is not a JSON object, or whose
 * wanted parts do not parse.
 */
export function scanLegacyIndexFile(file: string, scan: LegacyIndexScan): void {
  const fd = fs.openSync(file, 'r');
  try {
    scanWith(fd, scan);
  } finally {
    fs.closeSync(fd);
  }
}

function scanWith(fd: number, scan: LegacyIndexScan): void {
  const chunk = Buffer.allocUnsafe(CHUNK_BYTES);
  let offset = 0;
  let depth = 0;
  let started = false;
  let finished = false;
  let inString = false;
  let escaped = false;
  // The object whose members are being examined: 1 = the top level, 2 = inside
  // a streamed section. Deeper nesting is only counted.
  let level = 1;
  let phase: Phase = 'key';
  let section = '';
  let topKey = '';
  let memberKey = '';

  // The key or value being collected, as the chunk slices it spans.
  let collecting = false;
  let parts: Buffer[] = [];
  let startAt = 0;
  let wanted = false;

  const fail = (what: string): never => {
    throw new LegacyIndexReadError(`${what} at byte ${offset}`);
  };

  const begin = (at: number): void => {
    collecting = true;
    parts = [];
    startAt = at;
  };

  /** The collected text through `end` (exclusive) of the current chunk. */
  const take = (end: number): string => {
    parts.push(chunk.subarray(startAt, end));
    const text = Buffer.concat(parts).toString('utf8');
    parts = [];
    collecting = false;
    return text;
  };

  const parse = (text: string, what: string): unknown => {
    try {
      return JSON.parse(text);
    } catch (error) {
      return fail(`${what} does not parse (${(error as Error).message})`);
    }
  };

  const finishKey = (end: number): void => {
    const key = parse(take(end), 'a key');
    if (typeof key !== 'string') fail('a key is not a string');
    if (level === 1) topKey = key as string;
    else memberKey = key as string;
    phase = 'colon';
  };

  /** The value that just ended at `end` (exclusive). False stops the scan. */
  const finishValue = (end: number): boolean => {
    phase = 'after';
    if (!wanted) return true;
    wanted = false;
    const text = take(end);
    if (level === 2) {
      scan.onMember?.(section, memberKey, parse(text, `a ${section} member`));
      return true;
    }
    return scan.onValue?.(topKey, parse(text, `the ${topKey} value`)) !== false;
  };

  /** A `}` closing the examined object. */
  const closeLevel = (): void => {
    depth -= 1;
    if (level === 2) {
      level = 1;
      phase = 'after';
    } else {
      finished = true;
    }
  };

  for (;;) {
    const read = fs.readSync(fd, chunk, 0, CHUNK_BYTES, null);
    if (read === 0) break;
    startAt = 0;
    for (let i = 0; i < read; i += 1, offset += 1) {
      const byte = chunk[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (byte === BACKSLASH) escaped = true;
        else if (byte === QUOTE) {
          inString = false;
          if (depth === level) {
            if (phase === 'key') finishKey(i + 1);
            else if (phase === 'nested' && !finishValue(i + 1)) return;
          }
        }
        continue;
      }
      if (isSpace(byte)) continue;
      if (finished) fail('content after the top-level object');

      if (!started) {
        // A byte-order mark is the one thing tolerated before the object.
        if (byte === 0xef || byte === 0xbb || byte === 0xbf) continue;
        if (byte !== OPEN_BRACE) fail('not a JSON object');
        started = true;
        depth = 1;
        continue;
      }

      if (depth > level) {
        // Inside a value: only nesting is tracked, until it closes.
        if (byte === QUOTE) inString = true;
        else if (byte === OPEN_BRACE || byte === OPEN_BRACKET) depth += 1;
        else if (byte === CLOSE_BRACE || byte === CLOSE_BRACKET) {
          depth -= 1;
          if (depth === level && !finishValue(i + 1)) return;
        }
        continue;
      }

      // The examined object's own structure: key, colon, value, separator.
      switch (phase) {
        case 'key':
          if (byte === QUOTE) {
            inString = true;
            begin(i);
          } else if (byte === CLOSE_BRACE) closeLevel();
          else fail('expected a key');
          break;
        case 'colon':
          if (byte !== COLON) fail('expected a colon');
          phase = 'value';
          break;
        case 'value':
          if (level === 1 && byte === OPEN_BRACE && scan.sections.has(topKey)) {
            // A streamed section: its members are examined one level down.
            depth += 1;
            level = 2;
            section = topKey;
            phase = 'key';
            break;
          }
          if (byte === COMMA || byte === COLON || byte === CLOSE_BRACE || byte === CLOSE_BRACKET) {
            fail('expected a value');
          }
          wanted = level === 2 || scan.values?.has(topKey) === true;
          if (wanted) begin(i);
          if (byte === QUOTE) {
            phase = 'nested';
            inString = true;
          } else if (byte === OPEN_BRACE || byte === OPEN_BRACKET) {
            phase = 'nested';
            depth += 1;
          } else {
            phase = 'primitive';
          }
          break;
        case 'primitive':
          // A number, `true`, `null`: it ends at the separator.
          if (byte === COMMA || byte === CLOSE_BRACE) {
            if (!finishValue(i)) return;
            if (byte === COMMA) phase = 'key';
            else closeLevel();
          }
          break;
        case 'after':
          if (byte === COMMA) phase = 'key';
          else if (byte === CLOSE_BRACE) closeLevel();
          else fail('expected a comma');
          break;
        default:
          fail('unexpected structure');
      }
    }
    // A key or value still open at the chunk's end continues in the next one.
    if (collecting) parts.push(Buffer.from(chunk.subarray(startAt, read)));
  }
  if (!finished) fail('unexpected end of file');
}

/**
 * The store's `info`, read without parsing anything else. `yomitan.ts` writes it
 * right after `version`, so this reads the first chunk of a 65 MB file, not all
 * of it; a store that has it further down is still read correctly, only slower.
 */
export function readLegacyIndexInfo(file: string): unknown {
  let info: unknown;
  scanLegacyIndexFile(file, {
    sections: new Set(),
    values: new Set(['info']),
    onValue: (key, value) => {
      if (key !== 'info') return true;
      info = value;
      return false;
    },
  });
  return info;
}
