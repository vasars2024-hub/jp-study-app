/** Win32 hotkey modifiers — matches user32 RegisterHotKey. */
export const MOD_ALT = 0x0001;
export const MOD_CONTROL = 0x0002;
export const MOD_SHIFT = 0x0004;
export const MOD_WIN = 0x0008;

/** Map app chord ("Ctrl+Alt+Shift+G") → Win32 modifiers + virtual-key. */
export function parseHotkeyChord(chord: string): { modifiers: number; vk: number } | null {
  const first = chord.split('|')[0]!.trim();
  if (!first) return null;
  const parts = first.split('+').map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  let modifiers = 0;
  let key = '';
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'ctrl' || lower === 'control' || lower === 'cmdorctrl') modifiers |= MOD_CONTROL;
    else if (lower === 'alt') modifiers |= MOD_ALT;
    else if (lower === 'shift') modifiers |= MOD_SHIFT;
    else if (lower === 'meta' || lower === 'super' || lower === 'win') modifiers |= MOD_WIN;
    else key = part;
  }
  if (!modifiers || !key) return null;
  if (key.length === 1) {
    const ch = key.toUpperCase();
    const code = ch.charCodeAt(0);
    if (code >= 0x30 && code <= 0x39) return { modifiers, vk: code }; // 0-9
    if (code >= 0x41 && code <= 0x5a) return { modifiers, vk: code }; // A-Z
    return null;
  }
  const named: Record<string, number> = {
    space: 0x20,
    tab: 0x09,
    escape: 0x1b,
    esc: 0x1b,
    enter: 0x0d,
    return: 0x0d,
    f1: 0x70,
    f2: 0x71,
    f3: 0x72,
    f4: 0x73,
    f5: 0x74,
    f6: 0x75,
    f7: 0x76,
    f8: 0x77,
    f9: 0x78,
    f10: 0x79,
    f11: 0x7a,
    f12: 0x7b,
  };
  const vk = named[key.toLowerCase()];
  return vk ? { modifiers, vk } : null;
}
