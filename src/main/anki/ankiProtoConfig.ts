// Decode the protobuf `config` blobs schema 18 keeps note-type CSS and card
// templates in — the last thing standing between a modern .apkg and a
// full-fidelity draft (ANKI_DECK_WORKBENCH_PLAN.md, Phase 1).
//
// Schema 11 states a template's question and answer format as plain JSON in
// `col.models`. Schema 18 moved it into `notetypes.config` / `templates.config`
// / `fields.config`, each a serialized protobuf message. Anki ships the schema
// in its own repository, not in the package, so the field numbers below were
// derived the only way a reader here can defend: by decoding every blob in 18
// real schema-18 packages with a generic wire-format reader and matching field
// numbers to content that can only be one thing (a `.card { ... }` stylesheet, a
// `\documentclass` preamble, a `{{Front}}` template).
//
// Field numbers this file claims, with the evidence:
//   notetypes.config  3 = css        35/35 blobs, CSS text
//                     5 = latexPre   35/35, `\documentclass...`
//                     6 = latexPost  35/35, `\end{document}`
//   templates.config  1 = qfmt      187/187, contains `{{`
//                     2 = afmt      187/187, contains `{{FrontSide}}` etc.
//                     3 = bqfmt       6/187, a bare `{{Kanji}}` browser format
//   fields.config     3 = font      496/496, `Arial`
//                     4 = size      496/496, `20`
//
// Everything else stays undecoded on purpose. `kind` (field 1) and
// `sortFieldIdx` (field 2) are absent from all 35 sampled note types because
// both default to zero, so this reader will not assert a meaning for them from
// a blob alone: cloze is recognised from the `{{cloze:` marker in a decoded
// template, which is content evidence and cannot be a misread field number.
//
// Nothing here throws. A blob that does not decode returns `null` and the
// caller keeps its existing "formats unavailable" claim, which is the honest
// answer and the one already wired into the draft's blocking diagnostics.

/** One field occurrence from the protobuf wire format. */
interface WireField {
  field: number;
  wire: number;
  varint?: bigint;
  bytes?: Uint8Array;
}

const WIRE_VARINT = 0;
const WIRE_I64 = 1;
const WIRE_LEN = 2;
const WIRE_I32 = 5;

/**
 * Generic protobuf wire-format reader — no schema, no assumptions.
 *
 * Returns `null` for anything malformed (a truncated varint, a length that runs
 * past the end, a group/deprecated wire type) rather than a partial read, so a
 * caller can never mistake half a message for a whole one.
 */
export function decodeWireFields(bytes: Uint8Array): WireField[] | null {
  const out: WireField[] = [];
  let i = 0;

  const varint = (): bigint | null => {
    let shift = 0n;
    let value = 0n;
    while (i < bytes.length) {
      const b = bytes[i++];
      value |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return value;
      shift += 7n;
      // 10 bytes is the maximum a 64-bit varint can occupy.
      if (shift > 63n) return null;
    }
    return null;
  };

  while (i < bytes.length) {
    const key = varint();
    if (key == null) return null;
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (field <= 0) return null;

    if (wire === WIRE_VARINT) {
      const value = varint();
      if (value == null) return null;
      out.push({ field, wire, varint: value });
    } else if (wire === WIRE_LEN) {
      const len = varint();
      if (len == null) return null;
      const size = Number(len);
      if (!Number.isSafeInteger(size) || size < 0 || i + size > bytes.length) return null;
      out.push({ field, wire, bytes: bytes.subarray(i, i + size) });
      i += size;
    } else if (wire === WIRE_I64) {
      if (i + 8 > bytes.length) return null;
      i += 8;
      out.push({ field, wire });
    } else if (wire === WIRE_I32) {
      if (i + 4 > bytes.length) return null;
      i += 4;
      out.push({ field, wire });
    } else {
      // Wire types 3 and 4 are the deprecated groups; Anki emits neither.
      return null;
    }
  }
  return out;
}

const decoder = new TextDecoder('utf-8', { fatal: false });

function text(fields: WireField[], field: number): string | undefined {
  const hit = fields.find((f) => f.field === field && f.wire === WIRE_LEN);
  return hit?.bytes ? decoder.decode(hit.bytes) : undefined;
}

function asBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array) return value;
  // sql.js hands back a Uint8Array; a Buffer (a Uint8Array subclass) also passes
  // above. Anything else — a string, a null column — is not a blob.
  if (Array.isArray(value) && value.every((b) => typeof b === 'number')) {
    return Uint8Array.from(value as number[]);
  }
  return null;
}

// ----- note types ------------------------------------------------------------

export interface AnkiNotetypeConfig {
  css?: string;
  latexPre?: string;
  latexPost?: string;
}

/** Decode `notetypes.config`. `null` when the column is not a decodable blob. */
export function decodeNotetypeConfig(value: unknown): AnkiNotetypeConfig | null {
  const bytes = asBytes(value);
  if (!bytes) return null;
  const fields = decodeWireFields(bytes);
  if (!fields) return null;
  return {
    css: text(fields, 3),
    latexPre: text(fields, 5),
    latexPost: text(fields, 6),
  };
}

// ----- card templates --------------------------------------------------------

export interface AnkiTemplateConfig {
  qfmt: string;
  afmt: string;
  bqfmt?: string;
  bafmt?: string;
}

/**
 * Decode `templates.config`.
 *
 * `null` unless the blob yields a question format that actually looks like one.
 * Anki requires the front of a card to reference at least one field, so a qfmt
 * with no `{{` is either a misdecode or a template that would render blank —
 * both cases the caller must report as unavailable rather than export.
 */
export function decodeTemplateConfig(value: unknown): AnkiTemplateConfig | null {
  const bytes = asBytes(value);
  if (!bytes) return null;
  const fields = decodeWireFields(bytes);
  if (!fields) return null;
  const qfmt = text(fields, 1);
  if (!qfmt || !qfmt.includes('{{')) return null;
  return {
    qfmt,
    afmt: text(fields, 2) ?? '',
    bqfmt: text(fields, 3),
    bafmt: text(fields, 4),
  };
}

/**
 * Encode `templates.config` for a template this export ADDS.
 *
 * The inverse of `decodeTemplateConfig` and deliberately only that: it writes
 * fields 1-4 and nothing else. A schema-18 template config can carry more (a
 * deck override, browser font and size), but every one of those is optional in
 * the wire format and absent on most real templates — the survey at the top of
 * this file measured `bqfmt` on 6 of 187. Writing only what the workbench models
 * means a template it adds cannot claim a setting the draft never held, and Anki
 * fills the rest with its own defaults on open.
 *
 * Round-tripped by the test suite through `decodeTemplateConfig`, so the two
 * halves cannot drift.
 */
export function encodeTemplateConfig(config: AnkiTemplateConfig): Uint8Array {
  const out: number[] = [];
  const put = (field: number, value: string | undefined): void => {
    if (!value) return; // An empty format is absent, which is how Anki writes it.
    const bytes = new TextEncoder().encode(value);
    out.push((field << 3) | 2); // wire type 2, length-delimited
    let n = bytes.length;
    do {
      const byte = n & 0x7f;
      n >>>= 7;
      out.push(n > 0 ? byte | 0x80 : byte);
    } while (n > 0);
    for (const b of bytes) out.push(b);
  };
  put(1, config.qfmt);
  put(2, config.afmt);
  put(3, config.bqfmt);
  put(4, config.bafmt);
  return new Uint8Array(out);
}

/**
 * Rewrite ONLY the question and answer formats inside an existing
 * `templates.config`, leaving every other byte of the blob exactly as it was.
 *
 * Not `encodeTemplateConfig(decodeTemplateConfig(x))`. That round trip is right
 * for a template this export ADDS — where writing only fields 1-4 means the new
 * template cannot claim a setting the draft never held — and wrong for one that
 * already exists, where the same narrowness DELETES whatever the source had
 * beyond those four: a schema-18 template config can carry a deck override,
 * browser font and browser size, and `decodeWireFields` does not even retain the
 * raw bytes of an I32/I64 field, so a re-encode could not restore them if it
 * tried. Changing two strings must not cost a template its deck override.
 *
 * So this walks the wire format keeping each field's whole raw span, and emits
 * the original bytes for every field except 1 and 2. Field order is preserved;
 * a format absent from the source is appended in schema order, and one being set
 * to empty is dropped, which is how Anki itself stores an empty format.
 *
 * `null` when the blob is not decodable — the caller refuses rather than writing
 * a config it could not read.
 */
export function replaceTemplateFormats(
  value: unknown,
  qfmt: string,
  afmt: string,
): Uint8Array | null {
  const bytes = asBytes(value);
  if (!bytes) return null;

  const put = (out: number[], field: number, text_: string): void => {
    if (!text_) return; // An empty format is absent, as `encodeTemplateConfig` writes it.
    const encoded = new TextEncoder().encode(text_);
    out.push((field << 3) | WIRE_LEN);
    let n = encoded.length;
    do {
      const byte = n & 0x7f;
      n >>>= 7;
      out.push(n > 0 ? byte | 0x80 : byte);
    } while (n > 0);
    for (const b of encoded) out.push(b);
  };

  const out: number[] = [];
  let i = 0;
  let wroteQ = false;
  let wroteA = false;

  const varint = (): bigint | null => {
    let shift = 0n;
    let acc = 0n;
    while (i < bytes.length) {
      const b = bytes[i++];
      acc |= BigInt(b & 0x7f) << shift;
      if ((b & 0x80) === 0) return acc;
      shift += 7n;
      if (shift > 63n) return null;
    }
    return null;
  };

  while (i < bytes.length) {
    const start = i;
    const key = varint();
    if (key == null) return null;
    const field = Number(key >> 3n);
    const wire = Number(key & 7n);
    if (field <= 0) return null;

    if (wire === WIRE_VARINT) {
      if (varint() == null) return null;
    } else if (wire === WIRE_LEN) {
      const len = varint();
      if (len == null) return null;
      const size = Number(len);
      if (!Number.isSafeInteger(size) || size < 0 || i + size > bytes.length) return null;
      i += size;
    } else if (wire === WIRE_I64) {
      if (i + 8 > bytes.length) return null;
      i += 8;
    } else if (wire === WIRE_I32) {
      if (i + 4 > bytes.length) return null;
      i += 4;
    } else {
      return null;
    }

    // The two this function exists to replace. Everything else is copied byte
    // for byte from `start` to `i`, including fields this file has no name for.
    if (field === 1 && wire === WIRE_LEN) {
      put(out, 1, qfmt);
      wroteQ = true;
      continue;
    }
    if (field === 2 && wire === WIRE_LEN) {
      put(out, 2, afmt);
      wroteA = true;
      continue;
    }
    for (let k = start; k < i; k += 1) out.push(bytes[k]);
  }

  // A source that stored no qfmt/afmt at all still has to receive the new ones.
  // Appending keeps them after the fields already emitted, which protobuf allows
  // and Anki reads; the common path above preserves the original position.
  if (!wroteQ) put(out, 1, qfmt);
  if (!wroteA) put(out, 2, afmt);

  return new Uint8Array(out);
}

/** A cloze note type is the one whose template asks for a cloze deletion. */
export function templatesLookCloze(templates: readonly { qfmt?: string }[]): boolean {
  return templates.some((t) => (t.qfmt ?? '').includes('{{cloze:'));
}

// ----- fields ----------------------------------------------------------------

export interface AnkiFieldConfig {
  font?: string;
  size?: number;
}

/** Decode `fields.config`. Only the two members every sampled blob carries. */
export function decodeFieldConfig(value: unknown): AnkiFieldConfig | null {
  const bytes = asBytes(value);
  if (!bytes) return null;
  const fields = decodeWireFields(bytes);
  if (!fields) return null;
  const size = fields.find((f) => f.field === 4 && f.wire === WIRE_VARINT)?.varint;
  return {
    font: text(fields, 3),
    // A font size is a small positive number; anything else is not one.
    size: size != null && size > 0n && size < 1000n ? Number(size) : undefined,
  };
}

// ----- the media manifest ----------------------------------------------------

/**
 * The file names in a package's `media` manifest, protobuf flavour.
 *
 * A legacy .apkg stores the manifest as JSON (`{"0": "cat.jpg"}`); the zstd
 * package stores the same information as a compressed protobuf, so the JSON
 * reader gets `undefined` and the draft's missing-media check silently switches
 * itself off — a deck with no media at all reports nothing missing.
 *
 * Shape, read off a real 104-file package: one repeated field 1, each entry
 * carrying `name` (1, string), `size` (2, varint) and `sha1` (3, exactly 20
 * bytes). The corroboration is arithmetic — 104 entries, 104 numbered files in
 * the zip, and 104 media references in the collection.
 *
 * `null` when the bytes are not that message. An entry list that decodes but
 * yields a nameless entry is rejected whole: half a manifest would accuse a
 * complete deck of missing files, which is worse than not checking.
 *
 * The caller passes ALREADY-DECOMPRESSED bytes. Zero bytes is a real answer —
 * a package that carries no media — and decodes to an empty list.
 */
export function decodeMediaManifestNames(value: unknown): string[] | null {
  const bytes = asBytes(value);
  if (!bytes) return null;
  const fields = decodeWireFields(bytes);
  if (!fields) return null;

  const names: string[] = [];
  for (const entry of fields) {
    if (entry.field !== 1 || entry.wire !== WIRE_LEN || !entry.bytes) return null;
    const inner = decodeWireFields(entry.bytes);
    if (!inner) return null;
    const name = text(inner, 1);
    if (!name) return null;
    names.push(name);
  }
  return names;
}
