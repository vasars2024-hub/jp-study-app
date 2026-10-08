// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { decodeSubtitleBytes } from '../../shared/subtitleDecode';
import { SRT_JA, SRT_JA_PLAIN, encodeLegacy, encodeUtf16Le } from './e2eFixtures/texts';

/*
 * Every encoding a Japanese subtitle file turns up in, produced from the same
 * cues. The shared decoder must hand back the identical text for each.
 */

function utf16Be(text: string, bom: boolean): Uint8Array {
  const le = Buffer.from(text, 'utf16le');
  const out = Buffer.alloc(le.length);
  for (let i = 0; i + 1 < le.length; i += 2) {
    out[i] = le[i + 1];
    out[i + 1] = le[i];
  }
  return bom ? Buffer.concat([Buffer.from([0xfe, 0xff]), out]) : out;
}

const ASS_EUC = '[Events]\nDialogue: 0,0:00:00.50,0:00:01.40,Default,,0,0,0,,行くぞ、みんな！\n'
  + 'Dialogue: 0,0:00:01.50,0:00:02.80,Default,,0,0,0,,ありがとうございました。\n';

const CASES: Array<{ name: string; bytes: Uint8Array; text: string; encoding: string }> = [
  { name: 'UTF-8 without a BOM', bytes: Buffer.from(SRT_JA_PLAIN, 'utf-8'), text: SRT_JA_PLAIN, encoding: 'utf-8' },
  { name: 'UTF-8 with a BOM (BOM stripped)', bytes: Buffer.from(SRT_JA, 'utf-8'), text: SRT_JA_PLAIN, encoding: 'utf-8' },
  { name: 'UTF-16 LE with a BOM', bytes: encodeUtf16Le(SRT_JA_PLAIN), text: SRT_JA_PLAIN, encoding: 'utf-16le' },
  { name: 'UTF-16 LE without a BOM', bytes: Buffer.from(SRT_JA_PLAIN, 'utf16le'), text: SRT_JA_PLAIN, encoding: 'utf-16le' },
  { name: 'UTF-16 BE with a BOM', bytes: utf16Be(SRT_JA_PLAIN, true), text: SRT_JA_PLAIN, encoding: 'utf-16be' },
  { name: 'UTF-16 BE without a BOM', bytes: utf16Be(SRT_JA_PLAIN, false), text: SRT_JA_PLAIN, encoding: 'utf-16be' },
  { name: 'Shift_JIS SRT', bytes: encodeLegacy(SRT_JA_PLAIN, 'shift_jis'), text: SRT_JA_PLAIN, encoding: 'shift_jis' },
  { name: 'EUC-JP SRT', bytes: encodeLegacy(SRT_JA_PLAIN, 'euc-jp'), text: SRT_JA_PLAIN, encoding: 'euc-jp' },
  { name: 'Shift_JIS ASS', bytes: encodeLegacy(ASS_EUC, 'shift_jis'), text: ASS_EUC, encoding: 'shift_jis' },
  { name: 'EUC-JP ASS', bytes: encodeLegacy(ASS_EUC, 'euc-jp'), text: ASS_EUC, encoding: 'euc-jp' },
  { name: 'a doubled UTF-8 BOM', bytes: Buffer.from(`\uFEFF${SRT_JA}`, 'utf-8'), text: SRT_JA_PLAIN, encoding: 'utf-8' },
  { name: 'empty input', bytes: new Uint8Array(0), text: '', encoding: 'utf-8' },
];

describe('decodeSubtitleBytes across encodings', () => {
  it.each(CASES)('reads $name', ({ bytes, text, encoding }) => {
    const decoded = decodeSubtitleBytes(bytes);
    expect(decoded.text).toBe(text);
    expect(decoded.encoding).toBe(encoding);
  });

  it('never leaves a leading U+FEFF', () => {
    for (const { bytes } of CASES) {
      expect(decodeSubtitleBytes(bytes).text.charCodeAt(0)).not.toBe(0xfeff);
    }
  });

  it('falls back to lenient UTF-8 for bytes no candidate explains', () => {
    const decoded = decodeSubtitleBytes(Uint8Array.of(0x31, 0x0a, 0x80, 0x80, 0x0a));
    expect(decoded.encoding).toBe('utf-8');
    expect(decoded.text.startsWith('1\n')).toBe(true);
  });
});
