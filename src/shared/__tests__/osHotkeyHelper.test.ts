import { describe, expect, it } from 'vitest';
import { MOD_ALT, MOD_CONTROL, MOD_SHIFT, parseHotkeyChord } from '../osHotkeyChord';

describe('parseHotkeyChord', () => {
  it('parses Ctrl+Alt+Shift+G', () => {
    const parsed = parseHotkeyChord('Ctrl+Alt+Shift+G');
    expect(parsed).toEqual({
      modifiers: MOD_ALT | MOD_CONTROL | MOD_SHIFT,
      vk: 0x47,
    });
  });

  it('rejects chords without a modifier', () => {
    expect(parseHotkeyChord('G')).toBeNull();
  });

  it('uses the first alternative only', () => {
    expect(parseHotkeyChord('Ctrl+Alt+H|Ctrl+Alt+J')).toEqual({
      modifiers: MOD_ALT | MOD_CONTROL,
      vk: 0x48,
    });
  });
});
