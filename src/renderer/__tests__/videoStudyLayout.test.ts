/**
 * The video tab's study surface, as a layout contract.
 *
 * ## What this file used to guard, and why it changed
 *
 * Before the Liquid Workspace, five surfaces anchored themselves to edges of the
 * picture and the fix was geometric: one right-hand rail, a published dock height, a
 * declared column width. Measured in the dev harness (`video-study-harness.html`,
 * cases V13–V17) before that landed:
 *
 *   1024×622, everything open      grammar × mining   12 × 294px
 *   1280×522, controls expanded    grammar × dock    336 × 172px
 *                                  mining  × dock    336 ×  74px
 *                                  dock    × cue     644 ×  69px  ← subtitle gone
 *   620×622,  everything open      mining ran through all three
 *
 * The redesign removes the cause rather than the symptom: no panel decides for itself
 * that it is on screen any more, so "everything open" is not a state Watch Mode can
 * reach. The three geometric rules survive — they are still what keeps the subtitle
 * readable once blocks ARE docked — and this file now guards them plus the invariants
 * that replaced self-anchoring.
 *
 * Source-level assertions on purpose. `VideoCoreStudyOverlay.tsx` imports the adopted
 * player's jotai atoms and cannot be imported by a test (the same reason
 * `directstreamOpenRecovery.test.ts` reads it as text), and a CSS geometry contract is
 * not observable in jsdom at all.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SRC = resolve(__dirname, '../..');
const OVERLAY = resolve(SRC, 'media/VideoCoreStudyOverlay.tsx');
const BAR = resolve(SRC, 'media/StudyBottomBar.tsx');
const DOCKS = resolve(SRC, 'media/StudyDocks.tsx');
const SLICE = resolve(SRC, 'media/StudyPlayerSlice.tsx');
const CSS = resolve(SRC, 'media/mediaWorkspace.css');
const WORKSPACE_CSS = resolve(SRC, 'media/studyWorkspace.css');

/**
 * Comments out before any source sweep.
 *
 * Load-bearing here rather than tidy: the rules being asserted are the ones whose
 * comments quote the defect they replaced, and a raw substring search reads every one
 * of those explanations as the thing it warns about.
 */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

/** The declarations of one rule, by exact selector. Brace-counted, not regexed. */
function block(css: string, selector: string): string {
  const at = css.indexOf(`${selector} {`);
  expect(at, `no rule for \`${selector}\``).toBeGreaterThan(-1);
  const open = css.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error(`unterminated rule for \`${selector}\``);
}

const MENU = resolve(SRC, 'media/StudyBlockMenu.tsx');
const DETACHED = resolve(SRC, 'media/DetachedStudyBlock.tsx');
const APP = resolve(SRC, 'renderer/App.tsx');
const MAIN = resolve(SRC, 'main.ts');
const PRELOAD = resolve(SRC, 'preload.ts');

const overlay = code(readFileSync(OVERLAY, 'utf8'));
const bar = code(readFileSync(BAR, 'utf8'));
const docks = code(readFileSync(DOCKS, 'utf8'));
const slice = code(readFileSync(SLICE, 'utf8'));
const css = code(readFileSync(CSS, 'utf8'));
const workspaceCss = code(readFileSync(WORKSPACE_CSS, 'utf8'));
const menu = code(readFileSync(MENU, 'utf8'));
const detached = code(readFileSync(DETACHED, 'utf8'));
const app = code(readFileSync(APP, 'utf8'));
const mainProcess = code(readFileSync(MAIN, 'utf8'));
const preload = code(readFileSync(PRELOAD, 'utf8'));

describe('no panel places itself any more', () => {
  it('routes every dockable panel through the workspace, not through JSX position', () => {
    // The three panels are values in the renderer map, never siblings the overlay
    // positions itself. That is what makes Watch Mode able to have no side column.
    expect(overlay).toMatch(/const blockRenderers: BlockRenderers = \{/);
    for (const marker of ['grammar:', 'cardEditor:', 'transcript:']) {
      expect(overlay, `${marker} is not a workspace block`).toContain(marker);
    }
    expect(overlay).toMatch(/<StudyDocks renderers=\{blockRenderers\} \/>/);
  });

  it('has retired the self-anchoring rail and the flat control dock', () => {
    expect(overlay, 'the old rail is back').not.toContain('className="study-side-rail"');
    expect(overlay, 'the old dock is back').not.toContain('className="study-control-dock"');
  });

  it('lets the dock place the panels — none of them positions itself', () => {
    for (const selector of ['.study-mining-panel', '.study-transcript-panel']) {
      const rule = block(css, `#media-workspace ${selector}`);
      // Both assertions below are negative, so prove first that `block` found a real
      // rule and is not handing them an empty string to succeed against.
      expect(rule, `${selector} resolved to an empty rule`).toMatch(/padding:\s*0\.8rem/);
      expect(rule, `${selector} anchors itself again`).not.toMatch(/\bposition:/);
      expect(rule, `${selector} anchors itself again`).not.toMatch(/^\s*(top|right|bottom|left):/m);
    }
    // The grammar panel still carries its own absolute corner in the base sheet, so
    // the workspace layer has to override it or it would ignore its dock entirely.
    expect(block(workspaceCss, '#media-workspace .study-block .study-grammar-panel'))
      .toMatch(/position:\s*static/);
  });

  it('is a flex column, because a percentage cap dies in an auto grid track', () => {
    /*
      Not a style preference, and it carried over from the rail for the same measured
      reason: as `grid-template-rows: auto minmax(0, 1fr)` a panel's `max-height:
      min(21rem, 60%)` is cyclic during track sizing, so Chromium drops it — the mining
      row took 583 of the column's 592px and left the transcript a 24px stub.
    */
    const dock = block(workspaceCss, '#media-workspace .study-dock');
    expect(dock).toMatch(/display:\s*flex/);
    expect(dock).toMatch(/flex-direction:\s*column/);
    expect(dock).not.toMatch(/grid-template-rows/);
  });
});

describe('the bar publishes its height instead of being guessed at', () => {
  it('observes the bar and writes the variable onto the slice', () => {
    expect(overlay).toMatch(/barRef=\{dockRef\}/);
    expect(bar).toMatch(/ref=\{props\.barRef\}/);
    expect(overlay).toMatch(/new ResizeObserver\(publish\)/);
    expect(overlay).toMatch(/setProperty\('--study-dock-height'/);
    // On the slice, so a pop-out workspace cannot overwrite the main window's.
    expect(overlay).toMatch(/closest\('\.study-player-slice'\)/);
  });

  it('removes it on unmount, so no stale height outlives the bar', () => {
    expect(overlay).toMatch(/removeProperty\('--study-dock-height'\)/);
  });

  it('degrades to the collapsed height when there is no observer', () => {
    expect(block(css, '#media-workspace .study-player-slice'))
      .toMatch(/--study-dock-height:\s*3\.5rem/);
  });

  it('opens tool surfaces ABOVE the bar, so the transport never moves under the pointer', () => {
    // A sheet is a sibling rendered before the <nav>, in a column layer. Measured in
    // the harness (V13–V17): `.study-bar` is 45px whether a sheet is open or not.
    expect(bar.indexOf('StudyToolSheet')).toBeLessThan(bar.indexOf('<nav'));
    expect(block(workspaceCss, '#media-workspace .study-bar-layer'))
      .toMatch(/flex-direction:\s*column/);
  });

  it('measures the LAYER, not the bar, so an open sheet is cleared too', () => {
    /*
      The distinction is load-bearing and was caught by measuring rather than by
      reading: with the More sheet open the layer is 163px against the bar's 45px, and
      the subtitle is positioned off `--study-dock-height`. Observing only `.study-bar`
      would leave a 118px sheet sitting over the cue line — the 644×69px defect this
      redesign replaced, rebuilt out of new parts.
    */
    expect(overlay).toMatch(/barRef=\{dockRef\}/);
    expect(bar).toMatch(/ref=\{props\.barRef\}\s*\n\s*className="study-bar-layer"/);
  });
});

describe('the surface declares its geometry once', () => {
  const sliceRule = block(css, '#media-workspace .study-player-slice');

  it('names the column width and derives the gutter from it', () => {
    expect(sliceRule).toMatch(/--study-column:\s*24rem/);
    expect(sliceRule).toMatch(/--study-gutter:\s*calc\(var\(--study-column\) \+ 1rem\)/);
  });

  it('claims a gutter per DOCK that is holding something, not per panel', () => {
    expect(sliceRule).toMatch(/--study-left-gutter:\s*0rem/);
    expect(sliceRule).toMatch(/--study-right-gutter:\s*0rem/);
    const left = block(
      css,
      "#media-workspace .study-player-slice:has(.study-dock[data-dock='left']:not([hidden]))",
    );
    expect(left).toMatch(/--study-left-gutter:\s*var\(--study-gutter\)/);
    const right = block(
      css,
      "#media-workspace .study-player-slice:has(.study-dock[data-dock='right']:not([hidden]))",
    );
    expect(right).toMatch(/--study-right-gutter:\s*var\(--study-gutter\)/);
  });

  it('does not reserve a column for a dock that is only keeping a block alive', () => {
    // `StudyDocks` keeps the card editor mounted while hidden so the mine shortcut
    // still has something to fire into. A hidden dock must not take 24rem for it.
    expect(docks).toMatch(/hidden=\{anyVisible \? undefined : true\}/);
    expect(css).toContain(":has(.study-dock[data-dock='left']:not([hidden]))");
  });

  it('centres the subtitle between the gutters rather than in the slice', () => {
    const cue = block(css, '#media-workspace .study-cue-overlay');
    expect(cue).toMatch(/--study-left-gutter/);
    expect(cue).toMatch(/--study-right-gutter/);
    expect(cue, 'centred on the whole slice again').not.toMatch(/left:\s*50%/);
  });

  it('keeps the subtitle above the bar, with the transport bar as the floor', () => {
    expect(sliceRule)
      .toMatch(/--study-cue-bottom:\s*max\(9\.25rem,\s*calc\(var\(--study-dock-height\)/);
    expect(block(css, '#media-workspace .study-cue-overlay'))
      .toMatch(/bottom:\s*var\(--study-cue-bottom\)/);
  });

  it('keeps the side docks clear of the bar', () => {
    expect(workspaceCss).toMatch(
      /bottom:\s*calc\(var\(--study-dock-height\) \+ var\(--study-bar-gap\)/,
    );
  });

  it('bounds the grammar card by the bar, not by the slice', () => {
    expect(block(css, '#media-workspace .study-grammar-panel'))
      .toMatch(/max-height:.*var\(--study-dock-height\)/);
  });

  it('narrows both columns together where three do not fit across', () => {
    // 48rem of furniture out of a 64rem window leaves the subtitle 176px.
    expect(css).toMatch(/@media \(max-width: 1180px\)/);
    const narrow = css.slice(css.indexOf('@media (max-width: 1180px)'));
    expect(narrow.slice(0, 200)).toMatch(/--study-column:\s*19rem/);
  });
});

describe('preservation — the redesign moved controls, it did not drop them', () => {
  /**
   * The thirteen command ids the overlay registers.
   *
   * `deletedPlayerDependents.test.ts` guards the catalog side; this guards that the
   * player is still the owner. A refactor that lost one would leave a rebindable
   * shortcut row pointing at nothing, which is exactly the defect slice 19 fixed.
   */
  const COMMANDS = [
    'video.replayLine', 'video.prevLine', 'video.nextLine',
    'video.subEarlier', 'video.subLater', 'video.subEarlierLarge', 'video.subLaterLarge',
    'video.toggleAutoPause', 'video.toggleLoop', 'video.toggleFurigana',
    'video.seekBack', 'video.seekForward', 'video.mineCurrentLine',
  ];

  it('still registers every video.* command', () => {
    for (const id of COMMANDS) {
      expect(overlay, `${id} lost its handler`).toContain(`registerCommandHandler('${id}'`);
    }
  });

  it('keeps every harness hook on a real control', () => {
    const surfaces = `${overlay}\n${bar}`;
    for (const hook of [
      'previous-cue', 'replay-cue', 'next-cue', 'toggle-study-controls',
    ]) {
      expect(surfaces, `data-study-action="${hook}" is gone`)
        .toContain(`data-study-action="${hook}"`);
    }
    for (const pref of [
      'furigana', 'autoPause', 'loopLine', 'grammarHighlight', 'transcriptPanel',
      'subtitleFontFamily', 'subtitleOutline', 'cueTimingReadout', 'secondarySubLang',
    ]) {
      expect(surfaces, `data-study-pref="${pref}" is gone`)
        .toContain(`data-study-pref="${pref}"`);
    }
  });

  it('keeps every control the retired dock owned', () => {
    // Named by their i18n keys, which is the one identifier a control cannot lose
    // without changing what it says.
    for (const key of [
      'mediaWorkspace.study.frameBack', 'mediaWorkspace.study.frameForward',
      'mediaWorkspace.study.playbackSpeed', 'mediaWorkspace.study.seekStep',
      'mediaWorkspace.study.subsOffsetStep', 'mediaWorkspace.study.japaneseSubs',
      'mediaWorkspace.study.dualSubs', 'mediaWorkspace.study.pauseOnLookup',
      'mediaWorkspace.study.translateLine', 'mediaWorkspace.study.subtitleFontSize',
      'mediaWorkspace.study.subtitleBgOpacity', 'mediaWorkspace.study.subtitleWeight',
      'mediaWorkspace.study.practiceMode', 'mediaWorkspace.study.abLoop',
      'mediaWorkspace.study.clearAb', 'mediaWorkspace.study.subtitleTrack',
      'mediaWorkspace.study.secondarySubs', 'mediaWorkspace.study.secondaryLang',
      'mediaWorkspace.study.audioTrack', 'mediaWorkspace.study.whisperDevice',
      'mediaWorkspace.study.whisperModel', 'mediaWorkspace.study.transcriptionLanguage',
      'mediaWorkspace.study.generateSubs', 'mediaWorkspace.study.stopGeneration',
    ]) {
      expect(bar, `${key} was dropped in the move`).toContain(key);
    }
  });

  it('never gates the adopted player on workspace state', () => {
    /*
      Unmounting <VideoCore> drops `vc_activePlayerId` with nothing to restore it,
      which silently disables every isActivePlayer-gated DOM listener — the server
      then never gets the loaded-metadata event that starts subtitle streaming. The
      workspace provider therefore wraps the OVERLAY, never the player.
    */
    const player = slice.indexOf('<VideoCore');
    const provider = slice.indexOf('<StudyWorkspaceProvider');
    expect(player).toBeGreaterThan(-1);
    expect(provider).toBeGreaterThan(player);
    expect(slice).not.toMatch(/<StudyWorkspaceProvider[^>]*>[\s\S]{0,200}<VideoCore/);
  });

  it('keeps the card editor mounted so the mine shortcut has a target', () => {
    expect(docks).toMatch(/KEEP_MOUNTED[^=]*=\s*\[\s*'cardEditor'\s*\]/);
  });
});

describe('Watch Mode is cinematic by default', () => {
  it('fades the bar when the pointer goes idle, and takes it out of the tab order', () => {
    const faded = block(workspaceCss, "#media-workspace .study-bar-layer[data-study-bar-hidden='true']");
    expect(faded).toMatch(/opacity:\s*0/);
    // Opacity alone leaves an invisible focusable control over the picture.
    expect(faded).toMatch(/visibility:\s*hidden/);
  });

  it('honours reduced motion without removing the layout', () => {
    expect(workspaceCss).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    const reduced = workspaceCss.slice(
      workspaceCss.indexOf('@media (prefers-reduced-motion: reduce)'),
    );
    expect(reduced).toMatch(/--study-motion:\s*1ms/);
  });
});

/**
 * Detach is wired end to end, or it is not offered.
 *
 * The failure this guards is specific and was left open deliberately in the first pass:
 * a Detach menu item whose window never opens. Four separate files have to agree for
 * the button to do anything — the menu, the preload bridge, the main-process window
 * manager and the renderer route that the new window loads — and a source sweep is the
 * only way to catch three of the four from a test, because none of them can be
 * imported into jsdom (`main.ts` needs Electron, `App.tsx` needs the whole shell).
 */
describe('detach: every link in the chain exists', () => {
  it('the block menu offers detach, and only where the registry allows it', () => {
    expect(menu).toMatch(/data-study-action=\{isDetached \? 'attach-block' : 'detach-block'\}/);
    // Two gates, not one: the definition must permit it AND a bridge must exist. A
    // browser harness with no Electron has `available: false` and shows no item.
    expect(menu).toMatch(/detach\.available && definition\?\.canDetach === true/);
  });

  it('the menu is also the non-drag path to another monitor', () => {
    expect(menu).toMatch(/data-study-action="send-to-display"/);
    expect(menu).toMatch(/detach\.sendToDisplay\(block\.blockId, display\.key\)/);
    // Read from the OS. A hardcoded "Display 1 / Display 2" would lie on every machine
    // that is not the developer's.
    expect(menu).toMatch(/window\.api\.displayList\(\)/);
  });

  it('main owns the windows and closes them with the app', () => {
    expect(mainProcess).toMatch(/registerStudyBlockWindowIpc\(\)/);
    expect(mainProcess).toMatch(/configureStudyBlockWindows\(\{/);
    // A detached panel must not outlive the player feeding it.
    expect(mainProcess).toMatch(/closeAllStudyBlockWindows\(\)/);
  });

  it('the preload bridge carries both directions', () => {
    for (const member of [
      'studyBlockOpen', 'studyBlockClose', 'studyBlockList', 'studyBlockSendToDisplay',
      'studyBlockPublish', 'studyBlockRequestSnapshot', 'onStudyBlockSync',
      'studyBlockSendCommand', 'onStudyBlockCommand', 'onStudyBlockWindowsChanged',
    ]) {
      expect(preload, member).toMatch(new RegExp(`\\b${member}:`));
    }
  });

  it('the renderer has a route for the window main opens', () => {
    expect(app).toMatch(/parseDetachTarget\(window\.location\.search\)/);
    expect(app).toMatch(/<DetachedStudyBlock \/>/);
    // Lazy: every other window in the app would otherwise carry the player's bundle.
    expect(app).toMatch(/lazy\(\(\) => import\('\.\.\/media\/DetachedStudyBlock'\)\)/);
  });

  it('the detached window renders the real panels, not copies of them', () => {
    // The point of the whole design. A simplified second transcript would drift.
    expect(detached).toMatch(/<VideoCoreTranscriptPanel/);
    expect(detached).toMatch(/<VideoCoreGrammarPanel/);
    expect(detached).toMatch(/<AiWorkspaceBlock/);
    expect(detached).toMatch(/<MiningQueueBlock/);
    expect(detached).toMatch(/<MediaInfoBlock/);
    expect(detached).toMatch(/<StudyHudBlock/);
  });

  it('the detached window carries the id the panel stylesheets are scoped under', () => {
    // Without this the panels render as unstyled markup: every selector in both
    // stylesheets is prefixed `#media-workspace`.
    expect(detached).toMatch(/id="media-workspace"/);
    expect(detached).toMatch(/import '\.\/mediaWorkspace\.css'/);
    expect(detached).toMatch(/import '\.\/studyWorkspace\.css'/);
  });

  it('closing a detached window returns the block to the workspace', () => {
    expect(detached).toMatch(/send\(\{ type: 'closing', blockId \}\)/);
    expect(detached).toMatch(/data-study-action="return-to-player"/);
  });
});

describe('detach costs nothing while nothing is detached', () => {
  it('publishes only while a hosted window is open', () => {
    const hook = code(readFileSync(resolve(SRC, 'media/useStudyDetach.ts'), 'utf8'));
    // The guard, not just the comment: an unconditional interval would put an IPC
    // message on the bus several times a second for every player, forever.
    expect(hook).toMatch(/if \(!available \|\| !hostedOpen\) return undefined;/);
  });

  it('never grows a per-frame React state for the clock', () => {
    // `setState` on `timeupdate` re-renders the whole overlay 4-5x a second while a
    // video plays. The publisher reads the element instead.
    expect(overlay).toMatch(/readMedia: \(\) => \(\{/);
    expect(overlay).not.toMatch(/addEventListener\('timeupdate', \(\) => set/);
  });

  it('sends the transcript once per track rather than once per frame', () => {
    const hook = code(readFileSync(resolve(SRC, 'media/useStudyDetach.ts'), 'utf8'));
    expect(hook).toMatch(/cues: cuesChanged \? trimCues\(cueList\) : null/);
  });
});
