/**
 * The detach contract.
 *
 * Two things are being defended here, and they are the two that cannot be caught by
 * running the app once and seeing a window appear:
 *
 *   1. **Honesty of the detachable set.** `studyBlockRegistry`'s `canDetach` is what the
 *      block menu reads, and `shared/studyDetach`'s tables are what actually decide
 *      whether anything opens. If those two disagree the menu grows a Detach item that
 *      does nothing — the placeholder the acceptance criteria forbid. The registry is
 *      imported here so the disagreement fails a test rather than shipping.
 *   2. **Everything crossing a process boundary is validated.** A command from another
 *      renderer reaches `video.currentTime`, and stored geometry reaches
 *      `BrowserWindow.setBounds`. Both are `unknown` no matter what the types say.
 */
import { describe, expect, it } from 'vitest';
import {
  APP_SECTION_DETACH_BLOCKS,
  HOSTED_DETACH_BLOCKS,
  appSectionForBlock,
  centreOnWorkArea,
  defaultDetachedSize,
  detachWindowId,
  emptyDetachSnapshot,
  isDetachableBlock,
  isHostedDetachBlock,
  mergeDetachSnapshot,
  parseDetachCommand,
  parseDetachTarget,
  sanitizeDetachedBounds,
  trimCues,
  type DetachCue,
  type StudyDetachSnapshot,
} from '../studyDetach';
import { STUDY_BLOCK_DEFINITIONS, STUDY_BLOCK_MAP } from '../../media/studyBlockRegistry';
import {
  createDefaultWorkspaceDocument,
  createWorkspaceState,
  parseWorkspaceDocument,
  serializeWorkspaceDocument,
  workspaceReducer,
  activeWorkspace,
  exportWorkspace,
  importWorkspace,
  type WorkspaceAction,
  type WorkspaceState,
} from '../studyWorkspace';

const SCREEN = [{ x: 0, y: 0, width: 1920, height: 1040 }];

function state(): WorkspaceState {
  return createWorkspaceState(createDefaultWorkspaceDocument(), STUDY_BLOCK_MAP);
}

function run(initial: WorkspaceState, ...actions: WorkspaceAction[]): WorkspaceState {
  return actions.reduce(workspaceReducer, initial);
}

function findBlock(s: WorkspaceState, id: string) {
  return activeWorkspace(s.doc).blocks.find((block) => block.blockId === id);
}

describe('the detachable set is the same set on both sides', () => {
  it('every block the registry says can detach has somewhere to go', () => {
    const claimed = STUDY_BLOCK_DEFINITIONS
      .filter((definition) => definition.canDetach)
      .map((definition) => definition.id);
    const unroutable = claimed.filter((id) => !isDetachableBlock(id));
    expect(unroutable).toEqual([]);
  });

  it('every block detach knows how to open is allowed to detach by the registry', () => {
    const routable = [
      ...HOSTED_DETACH_BLOCKS,
      ...Object.keys(APP_SECTION_DETACH_BLOCKS),
    ];
    for (const id of routable) {
      const definition = STUDY_BLOCK_MAP.get(id as never);
      expect(definition, `${id} is routable but not in the registry`).toBeDefined();
      expect(definition?.canDetach, `${id} is routable but canDetach is false`).toBe(true);
    }
  });

  it('a detachable block also lists `detached` as a placement it supports', () => {
    for (const definition of STUDY_BLOCK_DEFINITIONS) {
      if (!definition.canDetach) continue;
      expect(
        definition.supportedPlacements.includes('detached'),
        `${definition.id} can detach but has no detached placement`,
      ).toBe(true);
    }
  });

  it('the blocks that cannot survive a second process are excluded, by name', () => {
    // Named rather than derived: this is the *decision*, and a future edit that flips
    // one of them should have to change this list deliberately.
    for (const id of ['video', 'subtitles', 'cardEditor', 'cardPreview', 'dictionary'] as const) {
      expect(STUDY_BLOCK_MAP.get(id)?.canDetach, id).toBe(false);
      expect(isDetachableBlock(id)).toBe(false);
    }
  });

  it('app-owned blocks route to the app section that really owns them', () => {
    // `notes` routed to 'notebook' until the Files app absorbed that section and
    // deleted it. Changed deliberately, per the note above: the owning section is
    // now 'files', and `LEGACY_WIN_SECTION_ALIASES` (shared/desktop.ts) maps the
    // old id forward so persisted windows still resolve.
    expect(appSectionForBlock('notes')).toBe('files');
    expect(appSectionForBlock('library')).toBe('library');
    expect(appSectionForBlock('statistics')).toBe('stats');
    expect(appSectionForBlock('review')).toBe('anki');
    // …and a hosted block is not routed to an app section by accident.
    expect(appSectionForBlock('transcript')).toBeNull();
  });
});

describe('window targeting', () => {
  it('reads a block off a detached window URL', () => {
    expect(parseDetachTarget('?studyBlock=transcript&surface=player')).toEqual({
      blockId: 'transcript',
      surface: 'player',
    });
    expect(parseDetachTarget('studyBlock=grammar')).toEqual({
      blockId: 'grammar',
      surface: 'workspace',
    });
  });

  it('refuses a URL naming a block that cannot be hosted', () => {
    // The main window's own bare URL, an app pop-out, and a block that is registered
    // but not hosted must all fail to look like a detached window.
    expect(parseDetachTarget('')).toBeNull();
    expect(parseDetachTarget('?popout=library')).toBeNull();
    expect(parseDetachTarget('?studyBlock=cardEditor')).toBeNull();
    expect(parseDetachTarget('?studyBlock=../../etc/passwd')).toBeNull();
  });

  it('derives the same window id on both sides without a handshake', () => {
    expect(detachWindowId('transcript', 'workspace')).toBe('study-block:workspace:transcript');
    expect(detachWindowId('transcript', 'player'))
      .not.toBe(detachWindowId('transcript', 'workspace'));
  });

  it('knows which ids it can host', () => {
    expect(isHostedDetachBlock('transcript')).toBe(true);
    expect(isHostedDetachBlock('notes')).toBe(false);
    expect(isHostedDetachBlock('nonsense')).toBe(false);
  });
});

describe('commands crossing a process boundary', () => {
  it('accepts the real ones', () => {
    expect(parseDetachCommand({ type: 'seek-cue', index: 12 }))
      .toEqual({ type: 'seek-cue', index: 12 });
    expect(parseDetachCommand({ type: 'toggle-play' })).toEqual({ type: 'toggle-play' });
    expect(parseDetachCommand({ type: 'set-ai-mode', mode: 'translation' }))
      .toEqual({ type: 'set-ai-mode', mode: 'translation' });
    expect(parseDetachCommand({ type: 'lookup', query: '本' }))
      .toEqual({ type: 'lookup', query: '本', context: '' });
    // -1 is the analysis panel's "nothing selected", not a bad index.
    expect(parseDetachCommand({ type: 'select-annotation', index: -1 }))
      .toEqual({ type: 'select-annotation', index: -1 });
  });

  it('rejects a seek that would break the player', () => {
    // Each of these reaches `video.currentTime` if it gets through.
    expect(parseDetachCommand({ type: 'seek-cue', index: Number.NaN })).toBeNull();
    expect(parseDetachCommand({ type: 'seek-cue', index: -3 })).toBeNull();
    expect(parseDetachCommand({ type: 'seek-cue', index: '4' })).toBeNull();
    expect(parseDetachCommand({ type: 'seek-cue' })).toBeNull();
  });

  it('rejects anything that is not a command at all', () => {
    expect(parseDetachCommand(null)).toBeNull();
    expect(parseDetachCommand('seek-cue')).toBeNull();
    expect(parseDetachCommand({ type: 'shutdown' })).toBeNull();
    expect(parseDetachCommand({ type: 'lookup', query: '' })).toBeNull();
    expect(parseDetachCommand({ type: 'set-ai-mode', mode: 'sql' })).toBeNull();
  });
});

describe('snapshots', () => {
  const cues: DetachCue[] = [
    { index: 0, trackNumber: 1, text: 'one', startMs: 0, endMs: 900 },
    { index: 1, trackNumber: 1, text: 'two', startMs: 1000, endMs: 1900 },
  ];

  it('a light frame keeps the transcript the last full frame carried', () => {
    const full: StudyDetachSnapshot = { ...emptyDetachSnapshot(), revision: 1, cues };
    const light: StudyDetachSnapshot = {
      ...emptyDetachSnapshot(), revision: 2, cues: null, activeIndex: 1,
    };
    const merged = mergeDetachSnapshot(full, light);
    expect(merged.cues).toEqual(cues);
    expect(merged.activeIndex).toBe(1);
  });

  it('a light frame with nothing before it still yields a usable snapshot', () => {
    // A window can open mid-stream. `cues.map` must not be called on null.
    const merged = mergeDetachSnapshot(null, { ...emptyDetachSnapshot(), cues: null });
    expect(merged.cues).toEqual([]);
  });

  it('a full frame replaces the list rather than merging into it', () => {
    const first: StudyDetachSnapshot = { ...emptyDetachSnapshot(), cues };
    const second = mergeDetachSnapshot(first, { ...emptyDetachSnapshot(), cues: [] });
    // Switching to a track with no cues must clear the column, not keep the old one.
    expect(second.cues).toEqual([]);
  });

  it('trims cues to plain data and caps the length', () => {
    const withExtra = [{ ...cues[0], junk: 'x' } as unknown as DetachCue];
    expect(trimCues(withExtra)[0]).toEqual(cues[0]);
    expect(trimCues(withExtra)[0]).not.toHaveProperty('junk');
    const many: DetachCue[] = Array.from({ length: 5_000 }, (_, i) => ({
      index: i, trackNumber: 1, text: `${i}`, startMs: i, endMs: i + 1,
    }));
    expect(trimCues(many)).toHaveLength(4_000);
  });

  it('the empty snapshot is renderable, not a null hole', () => {
    const empty = emptyDetachSnapshot();
    expect(empty.cues).toEqual([]);
    expect(empty.revision).toBe(0);
    expect(empty.aiMode).toBe('analysis');
  });
});

describe('window geometry', () => {
  it('keeps a rectangle that is still on a screen', () => {
    const bounds = sanitizeDetachedBounds(
      { x: 100, y: 100, width: 460, height: 820, displayKey: 'd1' },
      SCREEN,
    );
    expect(bounds).toEqual({ x: 100, y: 100, width: 460, height: 820, displayKey: 'd1' });
  });

  it('drops a rectangle on a monitor that is gone', () => {
    // The whole reason this function exists: restoring these bounds opens a window the
    // user can neither see nor reach.
    expect(sanitizeDetachedBounds({ x: 3000, y: 200, width: 460, height: 820 }, SCREEN))
      .toBeNull();
    expect(sanitizeDetachedBounds({ x: -900, y: -900, width: 460, height: 820 }, SCREEN))
      .toBeNull();
  });

  it('drops nonsense', () => {
    expect(sanitizeDetachedBounds(null, SCREEN)).toBeNull();
    expect(sanitizeDetachedBounds({ x: 0, y: 0, width: 10, height: 10 }, SCREEN)).toBeNull();
    expect(sanitizeDetachedBounds({ x: Number.NaN, y: 0, width: 460, height: 820 }, SCREEN))
      .toBeNull();
    expect(sanitizeDetachedBounds({ x: 0, y: 0, width: 99_999, height: 820 }, SCREEN))
      .toBeNull();
  });

  it('centres on a work area and never exceeds it', () => {
    const placed = centreOnWorkArea({ x: 1920, y: 0, width: 800, height: 600 }, {
      width: 2_000, height: 2_000,
    });
    expect(placed.width).toBeLessThanOrEqual(800);
    expect(placed.height).toBeLessThanOrEqual(600);
    expect(placed.x).toBeGreaterThanOrEqual(1920);
  });

  it('opens each block at a shape that suits it', () => {
    // A transcript is a column; a HUD is a strip. One default for both would waste a
    // monitor on one of them.
    expect(defaultDetachedSize('transcript').height)
      .toBeGreaterThan(defaultDetachedSize('studyHud').height);
  });
});

describe('the layout remembers a detach across a restart', () => {
  it('keeps the intent and drops the dead window handle', () => {
    const detached = run(state(), {
      type: 'detach-block',
      blockId: 'transcript',
      windowId: 'study-block:workspace:transcript',
      displayKey: 'monitor-2',
    });
    const reloaded = parseWorkspaceDocument(serializeWorkspaceDocument(detached.doc), {
      definitions: STUDY_BLOCK_MAP,
    });
    const block = activeWorkspace(reloaded).blocks.find((b) => b.blockId === 'transcript');

    // Still detached — re-docking every block the user put on their second monitor on
    // every launch is the bug this replaced.
    expect(block?.placement).toBe('detached');
    // …but the handle is empty: that window belonged to a process that has exited.
    expect(block?.detached?.windowId).toBe('');
    // …and the monitor is a preference, so it survives.
    expect(block?.detached?.displayKey).toBe('monitor-2');
  });

  it('re-docks a block whose definition no longer allows detaching', () => {
    const forged = JSON.stringify({
      schemaVersion: 3,
      activeWorkspaceId: 'watch',
      customizing: false,
      workspaces: [{
        id: 'watch',
        name: 'Watch',
        mode: 'watch',
        primaryBlockId: 'video',
        blocks: [{
          blockId: 'cardEditor',
          placement: 'detached',
          size: 'l',
          presence: 'expanded',
          pinned: false,
          autoHide: false,
          order: 0,
          detached: { windowId: 'w9' },
        }],
        contextualRules: [],
        responsiveRules: [],
      }],
    });
    const repaired = parseWorkspaceDocument(forged, { definitions: STUDY_BLOCK_MAP });
    const block = activeWorkspace(repaired).blocks.find((b) => b.blockId === 'cardEditor');
    expect(block?.placement).not.toBe('detached');
    expect(block?.detached).toBeUndefined();
  });

  it('attaching returns the block to a placement it supports', () => {
    const s = run(
      state(),
      { type: 'detach-block', blockId: 'transcript', windowId: 'w1' },
      { type: 'attach-block', blockId: 'transcript' },
    );
    const block = findBlock(s, 'transcript');
    expect(block?.placement).not.toBe('detached');
    expect(block?.detached).toBeUndefined();
    expect(STUDY_BLOCK_MAP.get('transcript')?.supportedPlacements)
      .toContain(block?.placement);
  });
});

describe('a shared workspace carries the intent, never the machine', () => {
  it('exports the detach without the window or the monitor', () => {
    const s = run(state(), {
      type: 'detach-block',
      blockId: 'transcript',
      windowId: 'study-block:workspace:transcript',
      displayKey: 'DELL-U2720Q-serial-1234',
    });
    const json = exportWorkspace(activeWorkspace(s.doc));

    // Neither the handle nor the exporter's monitor fingerprint may travel.
    expect(json).not.toContain('DELL-U2720Q');
    expect(json).not.toContain('study-block:workspace:transcript');

    // …but a "Dual-Monitor Immersion" preset that arrived fully re-docked would not be
    // the layout that was shared.
    const imported = importWorkspace(json, { definitions: STUDY_BLOCK_MAP })!;
    const block = imported.blocks.find((b) => b.blockId === 'transcript');
    expect(block?.placement).toBe('detached');
    expect(block?.detached?.windowId).toBe('');
    expect(block?.detached?.displayKey).toBeUndefined();
  });
});
