/**
 * L4 parity — the detached Study Block window's presentation is DECIDED, not silent.
 *
 * The defect this pins was found by driving, not by reading: on 2026-09-02 a Transcript
 * block was detached out of a workspace host that was in Liquid, and the new OS window
 * came up with `data-presentation` null and zero `[class*="liquid"]` nodes while
 * `lq.workspace.presentation` was set in the same origin. Nothing was wrong with the
 * pixels. What was wrong is that the window said NOTHING about which presentation it was
 * in, so "deliberately conventional" and "this host was never wired" read identically —
 * the exact ambiguity that let a visualizer window render Liquid with no way out
 * (boss audit 2026-08-17, finding 2) and that `canPresentLiquid` was collapsed into one
 * function to prevent.
 *
 * Two things are ratcheted, and they are deliberately different in kind:
 *
 *  1. THE POLICY, executed. `canPresentLiquid(<block>, 'detached')` is `false` for every
 *     hosted block id, and the host argument is what decides it — the same section under
 *     any other host still presents, so this is a host rule and not a section blocklist
 *     that would silently spread.
 *  2. THE RENDER, read from source. `DetachedStudyBlock` declares `data-presentation` and
 *     `data-presentation-locked` rather than leaving them undefined, and offers no
 *     Make Liquid control. Source text, because the alternative is mounting an Electron
 *     preload bridge for two attributes; the live half is in the ledger row.
 *
 * Comments are stripped before matching. This file's own subject is spelled out in the
 * prose above and in the component's, and a ratchet that reads its own explanation is a
 * recorded failure mode in this repo.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canPresentLiquid, type LiquidPresentationHost } from '../../renderer/liquidWindowPresentation';

const HOSTED_BLOCKS = [
  'transcript',
  'grammar',
  'aiWorkspace',
  'miningQueue',
  'mediaInfo',
  'studyHud',
] as const;

function source(relative: string): string {
  const text = readFileSync(join(__dirname, '..', relative), 'utf8').replace(/\r\n/g, '\n');
  // Block comments first, then line comments: the component explains this decision at
  // length and names every attribute the assertions below look for.
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('the detached Study Block declares a presentation instead of leaving it null', () => {
  it('refuses Liquid for every hosted block, and the HOST is what refuses', () => {
    for (const block of HOSTED_BLOCKS) {
      expect(canPresentLiquid(block, 'detached')).toBe(false);
      // The same section, docked, still presents. A section blocklist would have made
      // the transcript panel unpresentable inside the workspace too.
      expect(canPresentLiquid(block, 'workspace')).toBe(true);
      expect(canPresentLiquid(block, 'desktop')).toBe(true);
    }
  });

  it('refuses on the host even for a section nobody has named', () => {
    // A block added later must inherit the refusal rather than quietly present.
    expect(canPresentLiquid('somethingAddedLater', 'detached')).toBe(false);
    expect(canPresentLiquid(undefined, 'detached')).toBe(false);
  });

  it('leaves every other host exactly as it was', () => {
    const unchanged: Array<[string | undefined, LiquidPresentationHost, boolean]> = [
      ['visualizer', 'desktop', false],
      ['note', 'desktop', true],
      ['note', 'popout', false],
      ['city', 'desktop', true],
      ['dictionary', 'reader', true],
      ['mediaWorkspace', 'workspace', true],
    ];
    for (const [section, host, expected] of unchanged) {
      expect(canPresentLiquid(section, host)).toBe(expected);
    }
  });

  it('renders both attributes on the root, resolved from the policy', () => {
    const text = source('DetachedStudyBlock.tsx');
    expect(text).toContain("canPresentLiquid(blockId, 'detached')");
    expect(text).toContain('data-presentation={');
    expect(text).toContain('data-presentation-locked={');
    // The reason travels with the refusal. An attribute that said only "standard" would
    // still not distinguish a decision from a default.
    expect(text).toContain("'dense-work'");
  });

  it('offers no Make Liquid control in the detached window', () => {
    const text = source('DetachedStudyBlock.tsx');
    expect(text).not.toContain('toggleWorkspacePresentation');
    expect(text).not.toContain('useWorkspacePresentation');
    expect(text).not.toMatch(/liquidWindow\.(makeLiquid|returnToStandard)/);
  });
});
