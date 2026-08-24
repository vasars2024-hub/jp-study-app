/**
 * The workspace player's downloaded-subtitle track must arrive SPLIT, not whole.
 *
 * ## The defect this pins
 *
 * `keepJapaneseStyleCues` exists because a dual-language `.ass` is one file carrying two
 * complete subtitle tracks, and nothing above the parser can see it: the file passes the
 * name check, it passes `looksJapaneseSubtitle`, and it parses cleanly.
 * `MediaContent.applySubtitleFile` has applied that split since the fusion work. The
 * workspace overlay — which is the player that is *actually mounted*, `media:open` being
 * the retired one's entry point — parsed the same downloaded track with bare
 * `parseSubtitles` and mounted everything it found.
 *
 * So for the exact release the MAL pipeline's Route B acquires (39 episodes of JoJo Part 5
 * tagged `简繁外挂字幕`, whose Japanese and Chinese style tracks are **169 lines each** in
 * one file), the Chinese half painted on screen, filled the transcript, and reached mining
 * through `VideoCoreTranscriptPanel` — with every count downstream reading as a success.
 * Found 2026-08-24 while driving gate 31's render leg.
 *
 * ## What is asserted
 *
 * Two things, because either alone is a false pass. The composition claim is behavioural
 * and lives on a fixture shaped like the real release. The wiring claim is textual — the
 * split happens inside a React effect that awaits `window.api`, a sidecar manager and an
 * ffmpeg-backed sync resolver, and a harness able to mount that would be testing its own
 * mocks. Reverting the call site turns the second one red, which is the control that
 * matters here.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseStudySubtitles, parseSubtitles } from '../../shared/subtitleCues';

/**
 * A dual-language `.ass` in the shape the acquired release uses: one Japanese dialogue
 * style, one Chinese dialogue style, both under the same `Dialogue:` list, plus a romaji
 * karaoke style — the third track that release also carries and that no name rule catches.
 */
const DUAL_LANGUAGE_ASS = [
  '[Script Info]',
  'ScriptType: v4.00+',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:01.00,0:00:03.00,JOJO5_textjp-an8,,0,0,0,,おれの名前はジョルノ・ジョバァーナ',
  'Dialogue: 0,0:00:01.00,0:00:03.00,JOJO5_textch-an8,,0,0,0,,我的名字是乔鲁诺·乔巴拿',
  'Dialogue: 0,0:00:04.00,0:00:06.00,JOJO5_textjp-an8,,0,0,0,,夢がある',
  'Dialogue: 0,0:00:04.00,0:00:06.00,JOJO5_textch-an8,,0,0,0,,我有一个梦想',
  'Dialogue: 0,0:00:07.00,0:00:08.00,JOJO5-op1-rm-2,,0,0,0,,kimi no tame ni',
  'Dialogue: 0,0:00:09.00,0:00:10.00,JOJO5_textjp-an8,,0,0,0,,行くぞ',
].join('\n');

/** The overwhelmingly common case, which must be untouched. */
const PLAIN_SRT = [
  '1',
  '00:00:01,000 --> 00:00:03,000',
  'それがおかしい',
  '',
  '2',
  '00:00:04,000 --> 00:00:06,000',
  '私の名前はロジャー・スミス',
  '',
].join('\n');

describe('the downloaded track the workspace player mounts', () => {
  it('mounts only the Japanese style track of a dual-language release', () => {
    const whole = parseSubtitles(DUAL_LANGUAGE_ASS);
    const split = parseStudySubtitles(DUAL_LANGUAGE_ASS);

    // The old behaviour, stated as a number so the regression is legible: every line.
    expect(whole).toHaveLength(6);

    expect(split.cues).toHaveLength(3);
    expect(split.cues.map((cue) => cue.text)).toEqual([
      'おれの名前はジョルノ・ジョバァーナ',
      '夢がある',
      '行くぞ',
    ]);
    expect(split.cues.every((cue) => cue.style === 'JOJO5_textjp-an8')).toBe(true);
  });

  it('reports how many lines went and which styles, so the transcript can say why', () => {
    const split = parseStudySubtitles(DUAL_LANGUAGE_ASS);

    expect(split.dropped).toBe(3);
    // Descending by size: the Chinese dialogue track before the one karaoke line.
    expect(split.styles).toEqual(['JOJO5_textch-an8', 'JOJO5-op1-rm-2']);
  });

  it('is inert on an ordinary single-track file, which is nearly every track', () => {
    const split = parseStudySubtitles(PLAIN_SRT);

    expect(split.cues).toHaveLength(2);
    expect(split.dropped).toBe(0);
    expect(split.styles).toEqual([]);
    expect(split.cues.map((cue) => cue.text)).toEqual(
      parseSubtitles(PLAIN_SRT).map((cue) => cue.text),
    );
  });
});

/**
 * Every seam that reads a stored `SubtitleRecord` and treats it as STUDY material.
 *
 * The census that produced this list, 2026-08-24: eleven `parseSubtitles(` call sites in
 * `src/`, of which four read a stored record for study and had no split — the workspace
 * overlay, the agent's `analyze-subtitles`, the study orchestrator's `prepare`, and the
 * Lexicon personal concordance. The rest are correctly bare: `.lrc` lyrics carry no
 * styles, YouTube captions are not `.ass`, the harvest panel splits a line later, and
 * `MediaContent`'s secondary slot is a translation track that must arrive whole.
 *
 * These are wiring assertions rather than mounted behaviour on purpose. Each call site
 * sits behind `window.api`, a sidecar manager or an ffmpeg-backed resolver, and a harness
 * able to reach them would be asserting against its own mocks. The composition itself is
 * covered behaviourally above; what was never covered is that these four *call* it.
 * Reverting any one call site turns exactly one of these red.
 */
const STUDY_RECORD_SEAMS: Array<[label: string, file: string, marker: string]> = [
  [
    'the workspace player mounts a downloaded track',
    'src/media/VideoCoreStudyOverlay.tsx',
    'const split = parseStudySubtitles(pick.text);',
  ],
  [
    "the agent's analyze-subtitles",
    'src/renderer/mediaAgentHandlers.ts',
    'const split = parseStudySubtitles(stored.text);',
  ],
  [
    'the study orchestrator prepares a workspace',
    'src/renderer/mediaStudyOrchestrator.ts',
    'const cues = parseStudySubtitles(stored.text).cues;',
  ],
  [
    'the Lexicon personal concordance',
    'src/renderer/components/lexicon/LexiconWorkbenchResults.tsx',
    'const cues = parseStudySubtitles(subtitle.text).cues;',
  ],
];

const repoRoot = join(__dirname, '..', '..', '..');
const read = (file: string): string => readFileSync(join(repoRoot, file), 'utf8');

describe('every study seam that reads a stored subtitle record', () => {
  it.each(STUDY_RECORD_SEAMS)('%s uses the study parser', (_label, file, marker) => {
    expect(read(file)).toContain(marker);
  });

  it('reports the dropped count instead of swallowing it', () => {
    const overlay = read('src/media/VideoCoreStudyOverlay.tsx');
    expect(overlay).toContain('setExternalTrackSplit(');
    expect(overlay).toContain("t('media.subStatus.otherScript'");
    expect(overlay).toContain('trackNotice={transcriptTrackNotice}');

    const agent = read('src/renderer/mediaAgentHandlers.ts');
    expect(agent).toContain('droppedCues: split.dropped,');
    expect(agent).toContain('cuesDroppedOtherScript: droppedCues');
  });

  it('never shows the notice against a track the split did not run on', () => {
    expect(read('src/media/VideoCoreStudyOverlay.tsx'))
      .toContain('externalTrackSplit.trackNumber === selectedTrack');
  });
});
