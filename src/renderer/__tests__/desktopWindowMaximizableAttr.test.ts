import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { canMaximizeSection } from '../desktopWindowGeometry';

/**
 * `canMaximizeSection` is a deliberate product refusal for `note` and `city`: maximizing
 * suppresses window drag and all three resize handles, and neither of those two bars renders
 * a control that could clear the state, so the window would be trapped.
 *
 * Until 2026-09-04 that decision was only inferrable from the ABSENCE of a Maximize button,
 * so anything reading the DOM had to guess whether a missing one was intentional or lost.
 * Rubric category 4's harness guessed with `.fwin-frameless`, which catches `city` and misses
 * the FRAMED `note` — the note then failed `allThreeSizes` for honouring the refusal, and the
 * cell read FAIL on a surface with nothing wrong with it.
 *
 * `data-maximizable` publishes the predicate, so the refusal is legible rather than inferred.
 * The load-bearing half is the OTHER direction: a window that declares `true` and ships no
 * Maximize is still a defect, and the harness keeps its button scan precisely so that case
 * cannot be laundered. Both halves are asserted below.
 *
 * Comments are stripped before any assertion. This file's own prose names the attribute, and
 * DesktopShell's does too — a raw-text ratchet would match the explanation rather than the
 * code, which has produced a false reading in this repo.
 */
const SRC = readFileSync(new URL('../components/DesktopShell.tsx', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !/^\s*(\/\/|\*)/.test(line))
  .join('\n');

describe('a floating window publishes its own maximize refusal', () => {
  it('renders data-maximizable from canMaximize, not from a class name', () => {
    expect(SRC).toContain("data-maximizable={canMaximize ? 'true' : 'false'}");
  });

  it('binds it to the one predicate the chrome and every route already share', () => {
    expect(SRC).toContain('const canMaximize = canMaximizeSection(win.section);');
    // The attribute must sit on the same element as `data-section`, or a probe that
    // resolves a window by section reads the flag off a different node.
    const openTag = SRC.slice(SRC.indexOf('className={`fwin '));
    const tagEnd = openTag.indexOf('>');
    const attrs = openTag.slice(0, tagEnd);
    expect(attrs).toContain('data-section={win.section}');
    expect(attrs).toContain('data-maximizable=');
  });

  it('declares false for exactly the two sections that refuse the state', () => {
    expect(canMaximizeSection('note')).toBe(false);
    expect(canMaximizeSection('city')).toBe(false);
  });

  it('declares true for a section that must still fail if its Maximize goes missing', () => {
    for (const section of ['dictionary', 'video', 'settings', 'stats', 'library']) {
      expect(canMaximizeSection(section)).toBe(true);
    }
  });

  it('keeps the Maximize control gated on the same predicate the attribute reports', () => {
    expect(SRC).toContain('{canMaximize && (');
    expect(SRC).toContain('onDoubleClick={() => canMaximize && onMaximize()}');
  });
});
