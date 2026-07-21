import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TOOLBOX_SHORTCUT_COMMANDS, normalizeShortcutLabel } from '../toolboxShortcuts';

/** Pull `{ id, defaultKeys }` pairs from the renderer catalog without importing it (side-effect heavy). */
function extractRendererDefaults(source: string): Array<{ id: string; keys: string }> {
  const catalogStart = source.indexOf('export const COMMAND_CATALOG');
  const toolboxSpread = source.indexOf('...TOOLBOX_SHORTCUT_COMMANDS');
  const slice = source.slice(catalogStart, toolboxSpread > 0 ? toolboxSpread : undefined);
  const out: Array<{ id: string; keys: string }> = [];
  const re = /\{\s*id:\s*'([^']+)'[\s\S]*?defaultKeys:\s*'([^']*)'/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(slice)) !== null) {
    out.push({ id: match[1], keys: match[2] });
  }
  return out;
}

describe('OS-wide shortcut defaults', () => {
  it('keeps every default chord unique across Study OS + Toolbox', () => {
    const rendererSrc = readFileSync(resolve(__dirname, '../../renderer/keyboardShortcuts.ts'), 'utf8');
    const entries = [
      ...extractRendererDefaults(rendererSrc),
      ...TOOLBOX_SHORTCUT_COMMANDS.map((command) => ({
        id: command.id,
        keys: command.defaultShortcut,
      })),
    ];

    const byChord = new Map<string, string[]>();
    for (const entry of entries) {
      for (const raw of entry.keys.split('|').map((part) => part.trim()).filter(Boolean)) {
        const chord = normalizeShortcutLabel(raw).toLowerCase();
        if (!chord) continue;
        byChord.set(chord, [...(byChord.get(chord) ?? []), entry.id]);
      }
    }

    const conflicts = [...byChord.entries()]
      .filter(([, ids]) => new Set(ids).size > 1)
      .map(([chord, ids]) => `${chord} → ${[...new Set(ids)].join(', ')}`);

    expect(conflicts).toEqual([]);
  });
});
