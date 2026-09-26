/**
 * The adopted video player's OWN keyboard map, readable from Study OS code.
 *
 * The player (vendor `video-core`) handles its keys itself: a rebindable map
 * (`vc_defaultKeybindings` in `video-core.atoms.ts`, overridden per user in
 * `localStorage['sea-video-core-keybindings']` by the player's Preferences
 * dialog) plus a fixed set in `VideoCoreKeybindingController` — Space/Enter,
 * Home/End, the digit row, comma/period and Escape. None of it is in
 * `COMMAND_CATALOG`, so Settings > Help > Keyboard shortcuts listed the app's
 * `video.*` study keys and not one of the keys that actually play, seek or mute
 * (round-2 K12).
 *
 * Renderer code does not import the vendor tree (ADR-004: "@/" is for the
 * adopted media surface only), so the defaults are restated here and
 * `playerKeymap.test.ts` pins them to the vendor source — a vendor change
 * fails that test instead of silently drifting.
 */

export const PLAYER_KEYBINDINGS_STORAGE_KEY = 'sea-video-core-keybindings';

/** One rebindable action, in the vendor map's own names and order. */
interface RebindableKey {
  action: string;
  code: string;
  /** Seconds / percent / rate step the vendor stores beside the key. */
  value?: number;
}

/** Mirror of `vc_defaultKeybindings` (vendor video-core.atoms.ts). */
export const PLAYER_DEFAULT_KEYBINDINGS: readonly RebindableKey[] = [
  { action: 'seekForward', code: 'KeyD', value: 30 },
  { action: 'seekBackward', code: 'KeyA', value: 30 },
  { action: 'seekForwardFine', code: 'ArrowRight', value: 2 },
  { action: 'seekBackwardFine', code: 'ArrowLeft', value: 2 },
  { action: 'nextChapter', code: 'KeyE' },
  { action: 'previousChapter', code: 'KeyQ' },
  { action: 'volumeUp', code: 'ArrowUp', value: 5 },
  { action: 'volumeDown', code: 'ArrowDown', value: 5 },
  { action: 'mute', code: 'KeyM' },
  { action: 'cycleSubtitles', code: 'KeyJ' },
  { action: 'cycleAudio', code: 'KeyK' },
  { action: 'nextEpisode', code: 'KeyN' },
  { action: 'previousEpisode', code: 'KeyB' },
  { action: 'fullscreen', code: 'KeyF' },
  { action: 'pictureInPicture', code: 'KeyP' },
  { action: 'increaseSpeed', code: 'BracketRight', value: 0.1 },
  { action: 'decreaseSpeed', code: 'BracketLeft', value: 0.1 },
  { action: 'takeScreenshot', code: 'KeyI' },
  { action: 'openInSight', code: 'KeyH' },
  { action: 'statsForNerds', code: 'KeyZ' },
];

/** Keys hardcoded in `VideoCoreKeybindingController`; not rebindable. */
const FIXED_KEYS: readonly { action: string; keys: string }[] = [
  { action: 'playPause', keys: 'Space · Enter' },
  { action: 'toStart', keys: 'Home' },
  { action: 'toEnd', keys: 'End' },
  { action: 'jumpPercent', keys: '0–9' },
  { action: 'frameBack', keys: ',' },
  { action: 'frameForward', keys: '.' },
  { action: 'exitFullscreen', keys: 'Esc' },
];

export interface PlayerKeyRow {
  /** Vendor action name — also the tail of its `helpKeys.player.*` label key. */
  action: string;
  labelKey: string;
  /** Params for the label (`{seconds}`, `{percent}`, `{step}`). */
  params?: Record<string, string | number>;
  /** Display text for the key, e.g. "D", "→", "]". */
  keys: string;
}

const ARROWS: Record<string, string> = {
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
};

const PUNCTUATION: Record<string, string> = {
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Period: '.',
  Semicolon: ';',
  Quote: "'",
  Slash: '/',
  Backslash: '\\',
  Minus: '-',
  Equal: '=',
  Backquote: '`',
};

/** A `KeyboardEvent.code` as the key cap a US-layout user would press. */
export function formatPlayerKeyCode(code: string): string {
  if (!code) return '';
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return `Num ${code.slice(6)}`;
  return ARROWS[code] ?? PUNCTUATION[code] ?? code;
}

function storedOverrides(): Record<string, { key?: unknown; value?: unknown }> {
  try {
    const raw = localStorage.getItem(PLAYER_KEYBINDINGS_STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, { key?: unknown; value?: unknown }>)
      : {};
  } catch {
    return {};
  }
}

function paramsFor(action: string, value: number | undefined): Record<string, string | number> | undefined {
  if (value == null) return undefined;
  if (action.startsWith('seek')) return { seconds: value };
  if (action.startsWith('volume')) return { percent: value };
  if (action.endsWith('Speed')) return { step: Number(value.toFixed(2)) };
  return undefined;
}

/**
 * The player's keys as the player will actually read them: stored overrides
 * laid over the defaults (the same merge `vc_keybindingsAtom` does), then the
 * fixed keys. An action the user unbound (empty key) is left out.
 */
export function readPlayerKeymap(): PlayerKeyRow[] {
  const stored = storedOverrides();
  const rows: PlayerKeyRow[] = [];
  for (const def of PLAYER_DEFAULT_KEYBINDINGS) {
    const override = stored[def.action];
    const code = typeof override?.key === 'string' ? override.key : def.code;
    const value = typeof override?.value === 'number' && Number.isFinite(override.value)
      ? override.value
      : def.value;
    const keys = formatPlayerKeyCode(code);
    if (!keys) continue;
    rows.push({
      action: def.action,
      labelKey: `helpKeys.player.${def.action}`,
      params: paramsFor(def.action, value),
      keys,
    });
  }
  for (const fixed of FIXED_KEYS) {
    rows.push({ action: fixed.action, labelKey: `helpKeys.player.${fixed.action}`, keys: fixed.keys });
  }
  return rows;
}
