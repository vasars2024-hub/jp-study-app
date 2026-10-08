import { describe, expect, it } from 'vitest';
import { parseAss } from '../subtitleCues';

// P7: ASS `\h` is a hard space, and `{\pN}` vector drawings are never text.

const HEADER = '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
const line = (text: string, style = 'Default') => `Dialogue: 0,0:00:01.00,0:00:02.00,${style},,0,0,0,,${text}\n`;

describe('parseAss: hard spaces and drawings', () => {
  it('turns \\h into a space and keeps \\N as a line break', () => {
    const cues = parseAss(HEADER + line('また\\h明日。') + line('一行目\\N二行目') + line('a\\nb'));
    expect(cues.map((c) => c.text)).toEqual(['また 明日。', '一行目\n二行目', 'a\nb']);
  });

  it('drops a cue that is only a vector drawing', () => {
    const cues = parseAss(HEADER + line('{\\an7\\pos(0,0)\\p1}m 0 0 l 100 0 100 100 0 100{\\p0}', 'Sign') + line('台詞'));
    expect(cues.map((c) => c.text)).toEqual(['台詞']);
  });

  it('keeps the text around a drawing, and any \\pN with N > 0 is a drawing', () => {
    const cues = parseAss(HEADER + line('前{\\p2}m 0 0 b 1 1 2 2 3 3{\\p0}後') + line('{\\p4}m 0 0 l 5 5'));
    expect(cues.map((c) => c.text)).toEqual(['前後']);
  });

  it('does not read \\pos or \\pbo as a drawing switch', () => {
    const cues = parseAss(HEADER + line('{\\pos(10,20)\\pbo0}看板'));
    expect(cues.map((c) => c.text)).toEqual(['看板']);
  });

  it('drops a cue that is only hard spaces', () => {
    expect(parseAss(HEADER + line('\\h\\h'))).toEqual([]);
  });
});
