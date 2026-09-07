/**
 * A disabled study control must say WHY, not which key also does nothing.
 *
 * Measured live 2026-09-03 on a real clip with no subtitle track: category 8's harness
 * (`probes/cat8-honest-states.cjs --surface "@#media-workspace"`) counted THREE mute pairs
 * on `nav.study-bar` -- `Previous line`, `Replay line`, `Next line`, all disabled, all
 * carrying only `Shortcut: W/R/S`. Two more controls in the same file, `Translate line` and
 * `Mine`, are disabled on the same condition with no title at all.
 *
 * The property under test is the DECISION, not the spelling: which reason a control shows
 * for each of the four (needs x state) combinations, and that the two reasons stay distinct.
 * The source ratchet below is deliberately narrow -- it only asserts that every disabled
 * cue-dependent control routes through the helper, which is the thing a future edit would
 * silently undo by writing a bare `shortcutHint` back in.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { cueControlTitleKey } from '../StudyBottomBar';
import { en } from '../../shared/i18n/catalogs/en';

const SOURCE_PATH = new URL('../StudyBottomBar.tsx', import.meta.url);

/**
 * Comments in this file name every symbol the ratchet matches, and this repo has banked a
 * false match on exactly that twice. Strip them before searching.
 */
function sourceWithoutComments(): string {
  return readFileSync(SOURCE_PATH, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\r\n/g, '\n');
}

describe('cueControlTitleKey', () => {
  it('says the track is missing when the file has no cues at all', () => {
    expect(cueControlTitleKey('cues', false, false)).toBe('mediaWorkspace.study.transcriptEmpty');
    expect(cueControlTitleKey('active-cue', false, false))
      .toBe('mediaWorkspace.study.transcriptEmpty');
  });

  it('says it is waiting when cues exist but playback sits between two of them', () => {
    expect(cueControlTitleKey('active-cue', true, false))
      .toBe('mediaWorkspace.study.waitingSubtitle');
  });

  it('keeps the two reasons distinct, because only one of them is the user to act on', () => {
    expect(cueControlTitleKey('active-cue', false, false))
      .not.toBe(cueControlTitleKey('active-cue', true, false));
  });

  /*
    The third state, and why it is not a nicety.

    Measured live 2026-09-07 through the debug bridge on `The Big O - 13`, whose Jimaku
    sidecar holds 261 real cues: from the click on the episode to these controls becoming
    usable was 38,839 ms. For all 38.8 s `hasCues` was false, so all three controls said
    "No subtitle track is loaded." about a file that was on disk and that the library card
    beside them advertised as "Japanese subtitles ready". The default of `false` keeps
    every existing caller on the old two-state behaviour.
  */
  it('does not call a track missing while its mount is still in flight', () => {
    expect(cueControlTitleKey('cues', false, false, true)).toBe('common.loading');
    expect(cueControlTitleKey('active-cue', false, false, true)).toBe('common.loading');
    expect(cueControlTitleKey('cues', false, false, true))
      .not.toBe(cueControlTitleKey('cues', false, false, false));
  });

  it('stops saying loading the moment the mount resolves with no cues', () => {
    expect(cueControlTitleKey('cues', false, false, false))
      .toBe('mediaWorkspace.study.transcriptEmpty');
  });

  it('lets the between-lines answer win once cues exist, loading or not', () => {
    // `hasCues` true means the track is mounted; a pending flag left over from a second
    // mount must not relabel a real between-lines gap as "loading".
    expect(cueControlTitleKey('active-cue', true, false, true))
      .toBe('mediaWorkspace.study.waitingSubtitle');
  });

  it('explains nothing when the control is usable, so the shortcut hint survives', () => {
    expect(cueControlTitleKey('cues', true, false)).toBeNull();
    expect(cueControlTitleKey('cues', true, true)).toBeNull();
    expect(cueControlTitleKey('active-cue', true, true)).toBeNull();
  });

  it('names keys that really exist in the catalogue', () => {
    const catalog = en as unknown as Record<string, unknown>;
    for (const key of ['mediaWorkspace.study.transcriptEmpty', 'mediaWorkspace.study.waitingSubtitle']) {
      expect(typeof catalog[key]).toBe('string');
      expect(String(catalog[key]).trim().length).toBeGreaterThan(11);
    }
    // `common.loading` is short by design ("Loading…"), so it gets its own floor rather
    // than being excluded from the check that the key resolves at all.
    expect(typeof catalog['common.loading']).toBe('string');
    expect(String(catalog['common.loading']).trim().length).toBeGreaterThan(3);
  });
});

/**
 * The overlay is the only thing that knows a mount is in flight, so the wiring between the
 * two files is the half a pure-function test cannot see. A source ratchet, not a render:
 * mounting the overlay needs VideoCore, a manager and a real element.
 */
describe('the video overlay tells the bar when a track is still arriving', () => {
  const OVERLAY = new URL('../VideoCoreStudyOverlay.tsx', import.meta.url);

  function overlaySource(): string {
    return readFileSync(OVERLAY, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\r\n/g, '\n');
  }

  it('passes the pending flag down and clears it on every exit', () => {
    const source = overlaySource();
    expect(source, 'the bar never learns a mount is in flight')
      .toContain('subtitleLoading={externalSubtitlePending}');
    // Set once when the effect arms; cleared both when the async body settles and when the
    // effect is torn down before its timer ever fires. Either one missing strands the flag.
    expect(source).toContain('setExternalSubtitlePending(true)');
    expect(source).toContain('.finally(() => setExternalSubtitlePending(false))');
    const teardown = source.indexOf('window.clearTimeout(timer)');
    expect(teardown).toBeGreaterThan(-1);
    expect(source.slice(teardown, teardown + 200))
      .toContain('setExternalSubtitlePending(false)');
  });
});

describe('the bar routes every cue-dependent disabled control through the helper', () => {
  it('gives all five a title', () => {
    const source = sourceWithoutComments();
    for (const action of ['previous-cue', 'replay-cue', 'next-cue', 'mine-current-line']) {
      const at = source.indexOf(`data-study-action="${action}"`);
      expect(at, `${action} is gone from the bar`).toBeGreaterThan(-1);
      // The attribute block of one element; a title further down the file must not count.
      const block = source.slice(at, at + 400);
      expect(block, `${action} lost its title`).toContain('title={cueTitle(');
    }
    // Translate line has no data-study-action; it is identified by its own handler.
    const translate = source.indexOf('props.onTranslateLine()');
    expect(translate).toBeGreaterThan(-1);
    expect(source.slice(Math.max(0, translate - 400), translate)).toContain('cueTitle(');
  });

  it('no disabled cue control is left explaining only its shortcut', () => {
    const source = sourceWithoutComments();
    for (const action of ['previous-cue', 'replay-cue', 'next-cue']) {
      const at = source.indexOf(`data-study-action="${action}"`);
      const block = source.slice(at, at + 400);
      expect(block).not.toContain("title={t('mediaWorkspace.study.shortcutHint'");
    }
  });
});
