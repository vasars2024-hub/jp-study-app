// The protobuf blobs schema 18 keeps card templates in, decoded from literal
// wire bytes — hand-written here so the test proves the decoder rather than
// agreeing with an encoder written by the same hand.
//
// The byte sequences below are the real shapes: `0x1a` is field 3 wire type 2
// (the note type's CSS), `0x0a` field 1 wire 2 (a template's qfmt), `0x20`
// field 4 wire 0 (a field's font size), exactly as they appear in the packages
// this was derived from.

import { describe, it, expect } from 'vitest';
import {
  decodeWireFields,
  decodeNotetypeConfig,
  decodeTemplateConfig,
  decodeFieldConfig,
  templatesLookCloze,
} from '../anki/ankiProtoConfig';

/** `(field << 3) | 2`, a length prefix, then UTF-8 — the only encoding used here. */
function lenField(field: number, value: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  if (bytes.length > 127) throw new Error('test helper only writes one-byte lengths');
  return [(field << 3) | 2, bytes.length, ...bytes];
}

const bytes = (...parts: number[][]) => Uint8Array.from(parts.flat());

describe('decodeWireFields', () => {
  it('reads varint, length-delimited, i64 and i32 fields', () => {
    const buf = bytes(
      [0x08, 0x01], // field 1 varint = 1
      lenField(3, 'css'),
      [0x11, 0, 0, 0, 0, 0, 0, 0, 0], // field 2 i64
      [0x25, 0, 0, 0, 0], // field 4 i32
    );
    const fields = decodeWireFields(buf);
    expect(fields?.map((f) => [f.field, f.wire])).toEqual([
      [1, 0],
      [3, 2],
      [2, 1],
      [4, 5],
    ]);
    expect(fields?.[0].varint).toBe(1n);
  });

  it('reads a multi-byte varint', () => {
    // 0x9601 = 150.
    expect(decodeWireFields(bytes([0x20, 0x96, 0x01]))?.[0].varint).toBe(150n);
  });

  it('returns null rather than a partial read for a truncated length prefix', () => {
    // Field 3, wire 2, claims 9 bytes, supplies 3.
    expect(decodeWireFields(bytes([0x1a, 0x09, 0x61, 0x62, 0x63]))).toBeNull();
  });

  it('returns null for a truncated varint and for a group wire type', () => {
    expect(decodeWireFields(bytes([0x08, 0x80]))).toBeNull();
    expect(decodeWireFields(bytes([0x0b, 0x00]))).toBeNull();
  });

  it('reads an empty blob as an empty message, not as a failure', () => {
    expect(decodeWireFields(new Uint8Array())).toEqual([]);
  });
});

describe('decodeNotetypeConfig', () => {
  it('pulls the CSS and both LaTeX halves out of the blob', () => {
    const config = decodeNotetypeConfig(
      bytes(lenField(3, '.card { color: black; }'), lenField(5, '\\documentclass'), lenField(6, '\\end{document}')),
    );
    expect(config).toEqual({
      css: '.card { color: black; }',
      latexPre: '\\documentclass',
      latexPost: '\\end{document}',
    });
  });

  it('leaves absent members undefined instead of inventing empty ones', () => {
    expect(decodeNotetypeConfig(bytes([0x48, 0x01]))).toEqual({
      css: undefined,
      latexPre: undefined,
      latexPost: undefined,
    });
  });

  it('is null for a non-blob column and for an undecodable blob', () => {
    expect(decodeNotetypeConfig('')).toBeNull();
    expect(decodeNotetypeConfig(null)).toBeNull();
    expect(decodeNotetypeConfig(bytes([0x1a, 0x7f, 0x61]))).toBeNull();
  });
});

describe('decodeTemplateConfig', () => {
  it('reads the question, answer and browser formats', () => {
    const config = decodeTemplateConfig(
      bytes(
        lenField(1, '{{Front}}'),
        lenField(2, '{{FrontSide}}<hr id=answer>{{Back}}'),
        lenField(3, '{{Kanji}}'),
        [0x40, 0x2a], // field 8: the template id varint every real blob carries
      ),
    );
    expect(config).toEqual({
      qfmt: '{{Front}}',
      afmt: '{{FrontSide}}<hr id=answer>{{Back}}',
      bqfmt: '{{Kanji}}',
      bafmt: undefined,
    });
  });

  it('refuses a question format that references no field', () => {
    // A decode that "succeeds" into plain text is far likelier to be a misread
    // field number than a template, and a card with no field renders blank.
    expect(decodeTemplateConfig(bytes(lenField(1, 'Front')))).toBeNull();
    expect(decodeTemplateConfig(bytes(lenField(2, '{{Back}}')))).toBeNull();
    expect(decodeTemplateConfig(new Uint8Array())).toBeNull();
  });

  it('keeps an empty answer format as empty, which Anki does allow', () => {
    expect(decodeTemplateConfig(bytes(lenField(1, '{{Front}}')))).toMatchObject({ afmt: '' });
  });
});

describe('decodeFieldConfig', () => {
  it('reads the font name and size', () => {
    expect(decodeFieldConfig(bytes(lenField(3, 'Arial'), [0x20, 20]))).toEqual({
      font: 'Arial',
      size: 20,
    });
  });

  it('drops a size that is not a plausible font size', () => {
    expect(decodeFieldConfig(bytes([0x20, 0x00]))?.size).toBeUndefined();
    expect(decodeFieldConfig(bytes([0x20, 0x80, 0x80, 0x01]))?.size).toBeUndefined();
  });
});

describe('templatesLookCloze', () => {
  it('recognises a cloze note type from its own template text', () => {
    expect(templatesLookCloze([{ qfmt: '{{cloze:Text}}' }])).toBe(true);
    expect(templatesLookCloze([{ qfmt: '{{Front}}' }, { qfmt: '{{cloze:Body}}' }])).toBe(true);
    expect(templatesLookCloze([{ qfmt: '{{Front}}' }, {}])).toBe(false);
  });
});
