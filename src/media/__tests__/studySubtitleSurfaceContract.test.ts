// @vitest-environment jsdom
/**
 * Subtitle audit fixes that live in stylesheet rules, portal targets and effect wiring — none
 * of which jsdom can lay out or mount (the overlay imports the adopted player's atoms), so
 * they are pinned here the way `videoStudyLayout.test.ts` pins its geometry: the helper that
 * decides is called for real, and the rules/wiring are read from source with comments
 * stripped so a sentence ABOUT a defect can never satisfy the check for its fix.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { mediaCorePortalContainer } from '../../../vendor/seanime-web/app/(main)/_features/media-core/media-core-menu';
import {
  loadStudyTrackChoice,
  loadSubtitleDelay,
  rememberStudyTrackChoice,
  saveSubtitleDelay,
  studySubtitleSource,
  subtitleDelayKey,
} from '../studySubtitleMemory';

const MEDIA = resolve(__dirname, '..');
const read = (file: string): string => readFileSync(resolve(MEDIA, file), 'utf8').replace(/\r\n/g, '\n');
/** Comments out (CSS block comments and JS line/block comments), then whitespace collapsed. */
const code = (text: string): string => text
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\s+/g, ' ');

const CSS = code(read('mediaWorkspace.css'));
const OVERLAY = code(read('VideoCoreStudyOverlay.tsx'));

function rule(selector: string): string {
  const at = CSS.indexOf(`${selector} {`);
  expect(at, `rule ${selector}`).toBeGreaterThanOrEqual(0);
  return CSS.slice(at, CSS.indexOf('}', at) + 1);
}

afterEach(() => {
  localStorage.clear();
  document.body.replaceChildren();
});

describe('fullscreen keeps the study surface above the picture (audit 11a)', () => {
  it('neutralises the inline container\'s fullscreen z-index inside the study slice', () => {
    const body = rule("#media-workspace .study-player-slice [data-vc-element='inline-container']");
    expect(body).toContain('z-index: auto;');
    expect(body).toContain('position: relative;');
  });

  it('the cue layer and the bar still sit above an un-indexed player', () => {
    expect(rule('#media-workspace .study-cue-overlay')).toMatch(/z-index: 90;/);
  });
});

describe('VideoCore menus open inside the player (audit 13)', () => {
  it('portals into the player container inside the media workspace, fullscreen or not', () => {
    const workspace = document.createElement('div');
    workspace.id = 'media-workspace';
    const container = document.createElement('div');
    workspace.append(container);
    document.body.append(workspace);
    expect(mediaCorePortalContainer(false, container)).toBe(container);
    expect(mediaCorePortalContainer(true, container)).toBe(container);
  });

  it('keeps upstream behaviour anywhere else', () => {
    const elsewhere = document.createElement('div');
    document.body.append(elsewhere);
    expect(mediaCorePortalContainer(false, elsewhere)).toBeUndefined();
    expect(mediaCorePortalContainer(true, elsewhere)).toBe(elsewhere);
    expect(mediaCorePortalContainer(true, null)).toBeUndefined();
  });
});

describe('subtitle position (audit 4a)', () => {
  it('lifts from the floor and never replaces it', () => {
    const body = rule('#media-workspace .study-cue-overlay');
    expect(body).toMatch(/bottom: calc\( var\(--study-cue-bottom\) \+ \(100% - var\(--study-cue-bottom\) - var\(--study-cue-top-reserve, 5rem\)\) \* var\(--study-cue-lift, 0\) \);/);
  });

  it('"Top of screen" anchors to the top, below the title row', () => {
    const body = rule("#media-workspace .study-cue-overlay[data-study-cue-position='top']");
    expect(body).toContain('top: var(--study-cue-top-reserve, 5rem);');
    expect(body).toContain('bottom: auto;');
  });

  it('the overlay publishes the placement from the preferences', () => {
    expect(OVERLAY).toContain("data-study-cue-position={preferences.subtitleAtTop ? 'top' : 'bottom'}");
    expect(OVERLAY).toContain('style={subtitlePlacementStyle(preferences) as React.CSSProperties}');
  });
});

describe('cue timing readout stays visible (audit 9c)', () => {
  it('only the one-off notice fades', () => {
    const fading = CSS.match(/([^{}]+)\{ animation: study-cue-status-fade/);
    expect(fading?.[1]).toBeDefined();
    expect(fading![1]).not.toContain('.study-cue-timing');
    expect(fading![1]).toContain("[data-study-cue-status='none']");
    expect(CSS).not.toMatch(/\.study-cue-timing[^{]*\{[^}]*animation/);
  });
});

describe('overlay wiring', () => {
  it('the English helper line is mounted without being selected (it is the SECOND line)', () => {
    expect(OVERLAY).toMatch(/as MKVParser_TrackInfo, \{ select: false \}\)/);
  });

  it('the transcript preference closes the rail only on a user\'s true → false (audit 7b)', () => {
    expect(OVERLAY).toContain("} else if (previous === true) { workspaceDispatch({ type: 'close-block', blockId: 'transcript' });");
    expect(OVERLAY).not.toMatch(/if \(preferences\.transcriptPanel\) \{ workspaceDispatch\(\{ type: 'open-block', blockId: 'transcript', placement: 'right' \}\); \} else \{/);
  });

  it('a drill started in a layout without its panel adds that panel (audit 9d)', () => {
    expect(OVERLAY).toMatch(/type: 'open-block', blockId: practiceBlockId, placement: 'bottom', presence: 'hidden',/);
  });

  it('the second line re-reads its timeline when ITS track grows (audit 6h)', () => {
    expect(OVERLAY).toContain("if (event.detail.trackNumbers.includes(secondaryTrack)) refreshTimeline();");
    expect(OVERLAY).toContain("manager?.addEventListener('eventsadded', handleEventsAdded);");
  });

  it('the study-language correction and remembered choice go through pickStudyPrimaryTrack', () => {
    expect(OVERLAY).toMatch(/const pick = pickStudyPrimaryTrack\( tracks, studyLang, loadStudyTrackChoice\(subtitleSource\), selectedTrack, \);/);
    expect(OVERLAY).toContain('onSelectTrack={chooseSubtitleTrack}');
  });
});

describe('per-file subtitle memory (audit 8c, 6a)', () => {
  const info = {
    id: 'pb',
    localFile: { path: 'D:\\Anime\\Yuru Camp\\03.mkv' },
    media: { id: 7 },
    episode: { episodeNumber: 3 },
  } as never;

  it('a delay set for one file comes back for that file only', () => {
    const key = subtitleDelayKey(studySubtitleSource(info));
    expect(key).toBe('file:d:/anime/yuru camp/03.mkv');
    saveSubtitleDelay(key, 0.2);
    expect(loadSubtitleDelay(key)).toBe(0.2);
    expect(loadSubtitleDelay('file:d:/anime/yuru camp/04.mkv')).toBe(0);
    saveSubtitleDelay(key, 0);
    expect(loadSubtitleDelay(key)).toBe(0);
  });

  it('a track picked on episode 3 is the choice for episode 4 of the same series', () => {
    rememberStudyTrackChoice(studySubtitleSource(info), { language: 'eng', label: 'English' });
    const next = studySubtitleSource({
      ...(info as object),
      localFile: { path: 'D:\\Anime\\Yuru Camp\\04.mkv' },
      episode: { episodeNumber: 4 },
    } as never);
    expect(loadStudyTrackChoice(next)).toMatchObject({ lang: 'en', label: 'English', off: false });
  });

  it('unreadable storage reads as "nothing remembered"', () => {
    localStorage.setItem('jp-video-core-sub-delay-v1', '{broken');
    expect(loadSubtitleDelay('file:x')).toBe(0);
  });
});

describe('the second line for a file that is not in the library', () => {
  it('falls back to the file\'s own English sidecar when the automation has no record', () => {
    const at = OVERLAY.indexOf('window.api.secondarySubtitleForPath(localPath)');
    expect(at).toBeGreaterThanOrEqual(0);
    const effect = OVERLAY.slice(at, at + 900);
    expect(effect).toMatch(/window\.api\.subtitleForPath\(localPath, \{ lang: 'en' \}\)/);
    expect(effect).toMatch(/if \(!helper\?\.text && typeof window\.api\.subtitleForPath === 'function'\)/);
  });
});

describe('dual subtitles stack', () => {
  it('the second line is a block of its own, so two short lines never share a row', () => {
    const secondary = rule('#media-workspace .study-cue-secondary');
    expect(secondary).toMatch(/display: block;/);
    expect(secondary).toMatch(/width: fit-content;/);
    expect(secondary).toMatch(/margin: 0\.4rem auto 0;/);
    expect(secondary).not.toMatch(/display: inline-block;/);
  });
});

describe('V hides every subtitle line at once', () => {
  it('gates the study line, the second line, its fallback hint and the timing readout', () => {
    // `lineCue`: the playing line, or the line just heard while paused (the study loop's
    // lingering line); listening practice may hide it for the session too.
    expect(OVERLAY).toMatch(/lineCue && preferences\.primarySubs && !listeningHidden && !preferences\.subtitlesHidden/);
    expect(OVERLAY).toMatch(/preferences\.dualSubs && !preferences\.subtitlesHidden && secondaryText/);
    expect(OVERLAY).toMatch(/preferences\.dualSubs && !preferences\.subtitlesHidden && secondaryIsFallback/);
    expect(OVERLAY).toMatch(/preferences\.cueTimingReadout && !preferences\.subtitlesHidden/);
    expect(OVERLAY).toMatch(/registerCommandHandler\('video\.toggleSubtitles'/);
  });
});

describe('picture fit removes the black bars', () => {
  it('overrides VideoCore\'s inline contain for the video and both overlay canvases together', () => {
    expect(CSS).toMatch(/#media-workspace\[data-video-fit='cover'\] video, #media-workspace\[data-video-fit='cover'\] canvas\.vc-pgs-canvas, #media-workspace\[data-video-fit='cover'\] canvas\.vc-anime4k-canvas \{ object-fit: cover !important; \}/);
    expect(CSS).toMatch(/#media-workspace\[data-video-fit='fill'\] video,[^{]*\{ object-fit: fill !important; \}/);
    expect(OVERLAY).toMatch(/host\.dataset\.videoFit = preferences\.videoFit/);
  });
});
