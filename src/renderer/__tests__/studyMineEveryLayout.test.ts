// @vitest-environment node
/**
 * One-key mine (C) and a transcript row's Mine must work in EVERY player layout.
 *
 * 2026-10 hardware run: in the Transcript layout both did nothing — no card, no toast.
 * The mine request is consumed by the mining panel, and only the `cardEditor` block
 * rendered it. Watch and Mining carry a `cardEditor`; Transcript, Review, Practice,
 * Listening and Immersion do not, so their `mine` trigger opened `cardPreview` — a block
 * the overlay had no renderer for — and nothing ever handled the request.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  activeWorkspace,
  blockIsVisible,
  createDefaultWorkspaceDocument,
  createWorkspaceState,
  findBlock,
  workspaceReducer,
} from '../../shared/studyWorkspace';
import { STUDY_BLOCK_MAP } from '../../media/studyBlockRegistry';

const OVERLAY = readFileSync(path.join(__dirname, '..', '..', 'media', 'VideoCoreStudyOverlay.tsx'), 'utf8');

/** The blocks the overlay draws a mining panel into, as the source declares them. */
function miningRenderedBlocks(hasCardEditor: boolean): string[] {
  const out: string[] = [];
  if (/\bcardEditor:\s*miningPanel\b/.test(OVERLAY)) out.push('cardEditor');
  if (/workspaceHasCardEditor\s*\?\s*\{\}\s*:\s*\{\s*cardPreview:\s*miningPanel\s*\}/.test(OVERLAY)) {
    if (!hasCardEditor) out.push('cardPreview');
  } else if (/\bcardPreview:\s*miningPanel\b/.test(OVERLAY)) {
    out.push('cardPreview');
  }
  return out;
}

describe('a mine request has a panel to land in, whatever the layout', () => {
  const doc = createDefaultWorkspaceDocument();
  const ids = doc.workspaces.filter((w) => w.builtIn).map((w) => w.id);

  it('covers the built-in layouts the player offers', () => {
    expect(ids).toEqual(expect.arrayContaining(['watch', 'transcript', 'mining', 'practice', 'review', 'listening', 'immersion']));
  });

  for (const id of ids) {
    it(`${id}: the mine trigger leaves exactly one mining panel mounted`, () => {
      let state = createWorkspaceState({ ...doc, activeWorkspaceId: id }, STUDY_BLOCK_MAP);
      state = workspaceReducer(state, {
        type: 'context-trigger',
        trigger: 'mine',
        atMs: 1,
        viewport: { width: 1600, height: 900 },
      });
      const workspace = activeWorkspace(state.doc);
      const hasCardEditor = Boolean(findBlock(workspace, 'cardEditor'));
      const rendered = miningRenderedBlocks(hasCardEditor);
      // cardEditor is kept mounted even while hidden (StudyDocks KEEP_MOUNTED); any other
      // block is mounted only when it is on screen.
      const mounted = rendered.filter((blockId) => {
        const block = findBlock(workspace, blockId as 'cardEditor' | 'cardPreview');
        return block && (blockId === 'cardEditor' || blockIsVisible(block));
      });
      expect(mounted, `${id} would drop the mine request`).toHaveLength(1);
    });
  }
});
