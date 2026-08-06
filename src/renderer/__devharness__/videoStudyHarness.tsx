/**
 * Standalone visual harness for the video study surfaces.
 *
 * Exists because the render tests are DOM-structural: they prove a segment
 * carries `sa-cat-particle`, and cannot see that the hue resolved, that the
 * transcript rail does not sit under the control dock, or that a subtitle
 * background at 0% is genuinely absent. Those are the questions this page
 * answers, and it answers them without launching the Electron app — which
 * belongs to the user and must not be started by an agent.
 *
 * Each `<section data-shot="…">` is one framed case. The `data-shot` attribute is
 * the handle a screenshot pass targets; keep them stable.
 */
import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import SubtitleCueLine from '../components/SubtitleCueLine';
import VideoCoreTranscriptPanel from '../../media/VideoCoreTranscriptPanel';
import VideoCoreGrammarPanel from '../../media/VideoCoreGrammarPanel';
import VideoCoreMiningPanel from '../../media/VideoCoreMiningPanel';
import {
  alignAnnotations,
  type SentenceAnalysisResult,
  type SentenceAnnotation,
} from '../../shared/sentenceAnalysisCore';
import type { VideoCoreActiveCue } from '@/app/(main)/_features/video-core/video-core-subtitles';
// BOTH are load-bearing and were missing in the first draft of this harness,
// which then measured every category as the same grey and looked like a product
// failure. mediaWorkspace.css scopes all 6,950 of its selectors under
// `#media-workspace` (see MediaSurfaceShell), and sentenceAnalysis.css defines
// the category hues and `.sa-seg` itself — it normally arrives with
// SentenceAnalysisView, which this page does not render.
import '../../media/mediaWorkspace.css';
import '../components/analysis/sentenceAnalysis.css';

const SENTENCE = 'この町が好き。';

const ANNOTATIONS: SentenceAnnotation[] = alignAnnotations(SENTENCE, [
  {
    text: 'この', category: 'grammar', meaning: 'this (demonstrative)',
    explanation: 'Prenominal demonstrative.', examples: [], vocabulary: [],
  },
  {
    text: '町', category: 'vocabulary', meaning: 'town',
    explanation: 'Common noun.', examples: [], vocabulary: [],
  },
  {
    text: 'が', category: 'particle', meaning: 'subject marker',
    explanation: 'Marks the object of 好き.', examples: [], vocabulary: [],
  },
  {
    text: '好き', category: 'expression', meaning: 'to like',
    explanation: 'na-adjective taking が.', examples: [], vocabulary: [],
  },
]);

const CUES: VideoCoreActiveCue[] = [
  { index: 0, trackNumber: 1, text: '行ってきます。', startMs: 266_000, endMs: 268_000 },
  { index: 1, trackNumber: 1, text: '気をつけて。', startMs: 268_000, endMs: 270_000 },
  { index: 2, trackNumber: 1, text: SENTENCE, startMs: 271_000, endMs: 273_000 },
  { index: 3, trackNumber: 1, text: 'どうして？', startMs: 274_000, endMs: 275_000 },
  { index: 4, trackNumber: 1, text: 'みんな優しいから。', startMs: 276_000, endMs: 278_000 },
  { index: 5, trackNumber: 1, text: 'そうなんだ。', startMs: 279_000, endMs: 280_000 },
];

const noop = (): undefined => undefined;

/**
 * Enough of the preload bridge for the real panels to mount.
 *
 * `useAnalysisPrefs` calls `sentenceGetPrefs` / `onSentencePrefsChanged`
 * unguarded, so the grammar panel throws on a bare page. The mining panel
 * already guards `window.api?.ankiStatus`, and every other bridge call it makes
 * is behind a button. Nothing here fakes a *result* — the panels render their
 * own real states.
 */
function installBridgeStub(): void {
  const api = (window as unknown as { api?: Record<string, unknown> }).api ?? {};
  if (typeof api.sentenceGetPrefs !== 'function') {
    api.sentenceGetPrefs = () => Promise.resolve({});
  }
  if (typeof api.onSentencePrefsChanged !== 'function') {
    api.onSentencePrefsChanged = () => () => undefined;
  }
  (window as unknown as { api: Record<string, unknown> }).api = api;
}

installBridgeStub();

const ANALYSIS: SentenceAnalysisResult = {
  sentence: SENTENCE,
  translations: { en: 'I like this town.' },
  literal: 'this town — SUBJ — likeable',
  formality: { level: 'Casual (plain form)', note: 'Said to a friend; です would make it polite.' },
  difficulty: 'N5',
  structure: '「この町」 is the subject marked by が; 好き is a na-adjective predicate.',
  annotations: ANNOTATIONS,
  nuance: ['Warmer than 気に入っている — it reads as settled affection, not a verdict.'],
  pitfalls: ['好き takes が, not を. 「この町を好き」 is the classic learner slip.'],
};

const MINING_SOURCE = {
  playbackId: 'harness-1',
  playbackType: 'localFile',
  streamType: 'file',
  localFilePath: 'C:\\anime\\Shirobako\\Shirobako - 03.mkv',
  mediaId: 20812,
  mediaTitle: 'SHIROBAKO',
  episodeNumber: 3,
  episodeTitle: 'Exodus!',
};

/**
 * Stands in for the control dock, which is inline in `VideoCoreStudyOverlay` and
 * cannot be mounted without the adopted player's jotai atoms.
 *
 * Legitimate for the question this page asks: the dock's box is fixed by
 * `.study-control-dock` (`left`/`right`/`bottom`/`max-height`), not by what is
 * inside it, so a stand-in with the same class occupies the same rectangle. The
 * row is real markup so the collapsed height is real too.
 */
function ControlDock({ expanded }: { expanded: boolean }) {
  const ref = useRef<HTMLElement | null>(null);
  // Mirrors the ResizeObserver in VideoCoreStudyOverlay. Without it the page
  // would measure the stylesheet's collapsed default in every case and report
  // the expanded-dock collisions as fixed when they are not.
  useEffect(() => {
    const dock = ref.current;
    const slice = dock?.closest('.study-player-slice');
    if (!dock || !(slice instanceof HTMLElement)) return;
    const publish = (): void => {
      const height = Math.round(dock.getBoundingClientRect().height);
      if (height > 0) slice.style.setProperty('--study-dock-height', `${height}px`);
    };
    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(dock);
    return () => observer.disconnect();
  }, []);
  return (
    <section
      ref={ref}
      className="study-control-dock"
      aria-label="Study controls"
      data-study-controls={expanded ? 'expanded' : 'collapsed'}
    >
      <div className="study-control-row study-control-primary">
        <div className="study-control-cluster">
          <button type="button">Previous line</button>
          <button type="button">Replay line</button>
          <button type="button">Next line</button>
        </div>
        <div className="study-control-cluster">
          <button type="button">Frame −</button>
          <button type="button">Frame +</button>
        </div>
        <button type="button" className="study-control-more">
          {expanded ? 'Fewer controls' : 'More controls'}
        </button>
      </div>
      {expanded && (
        <div className="study-control-advanced">
          {['Display', 'Subtitle appearance', 'Practice mode', 'Loop', 'Tracks', 'Whisper'].map((group) => (
            <div className="study-control-row" key={group}>
              <span className="study-control-legend">{group}</span>
              <label><input type="checkbox" /> Option A</label>
              <label><input type="checkbox" /> Option B</label>
              <button type="button">Action</button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** A framed case, labelled, on a stand-in for the video picture. */
function Shot({
  id, title, note, height = 260, width, children,
}: {
  id: string; title: string; note?: string; height?: number; width?: number;
  children: React.ReactNode;
}) {
  return (
    <section data-shot={id} className="harness-shot">
      <h2>{id} — {title}</h2>
      {note && <p className="harness-note">{note}</p>}
      {/* `id="media-workspace"` and `dark` are not decoration: every rule in
          mediaWorkspace.css is scoped under that id, and Tailwind's class-based
          dark mode hangs off the class. Without them the panels render unstyled
          and the page measures nothing. */}
      <div className="harness-stage" style={{ height, ...(width ? { width } : {}) }}>
        <div id="media-workspace" className="dark harness-workspace">
          <section className="study-player-slice" style={{ position: 'absolute' }}>
            {children}
          </section>
        </div>
      </div>
    </section>
  );
}

/** Stands in for the frame, so subtitle contrast is judged against picture. */
function Picture() {
  return <div className="harness-picture" />;
}

function CueOverlay({
  bgOpacity, fontSize, annotated, selected, ownBottom = true,
}: {
  bgOpacity: number; fontSize: number; annotated: boolean; selected?: number;
  /**
   * V1–V8 frame the subtitle alone in a short stage and lift it to 2rem so it is
   * visible at all. The composed cases must NOT do that: where the line sits
   * relative to the control dock is one of the things they measure.
   */
  ownBottom?: boolean;
}) {
  const style: React.CSSProperties = { fontSize: `${fontSize}px` };
  if (bgOpacity > 0) {
    style.backgroundColor = `rgba(0, 0, 0, ${bgOpacity / 100})`;
    style.padding = '0.1em 0.4em';
    style.borderRadius = '0.35em';
  }
  return (
    <aside className="study-cue-overlay" style={ownBottom ? { bottom: '2rem' } : undefined}>
      <SubtitleCueLine
        className="study-cue-text sa-palette"
        style={style}
        text={SENTENCE}
        furigana={false}
        annotations={annotated ? ANNOTATIONS : undefined}
        selectedAnnotation={selected}
      />
      <span className="study-cue-timing">cue 3 · 4:31</span>
    </aside>
  );
}

function Harness() {
  return (
    <main className="harness-root">
      <h1>Video study — visual cases</h1>

      <Shot id="V1" title="Subtitle, background 35% (default)"
        note="Box hugs the words; it must not span the overlay width.">
        <Picture />
        <CueOverlay bgOpacity={35} fontSize={26} annotated={false} />
      </Shot>

      <Shot id="V2" title="Subtitle, background 0% (fully transparent)"
        note="No box at all — not a transparent rectangle. Text shadow carries legibility.">
        <Picture />
        <CueOverlay bgOpacity={0} fontSize={26} annotated={false} />
      </Shot>

      <Shot id="V3" title="Subtitle, background 90% (maximum)">
        <Picture />
        <CueOverlay bgOpacity={90} fontSize={26} annotated={false} />
      </Shot>

      <Shot id="V4" title="Subtitle size 16 (minimum)">
        <Picture />
        <CueOverlay bgOpacity={35} fontSize={16} annotated={false} />
      </Shot>

      <Shot id="V5" title="Subtitle size 48 (maximum)">
        <Picture />
        <CueOverlay bgOpacity={35} fontSize={48} annotated={false} />
      </Shot>

      <Shot id="V6" title="Grammar highlight on the cue"
        note="Four category hues must be visible. If the tint is gone, preflight beat .sa-seg.">
        <Picture />
        <CueOverlay bgOpacity={35} fontSize={30} annotated />
      </Shot>

      <Shot id="V7" title="Grammar highlight, second span selected"
        note="Selected span is visibly stronger than its neighbours.">
        <Picture />
        <CueOverlay bgOpacity={35} fontSize={30} annotated selected={1} />
      </Shot>

      <Shot id="V8" title="Grammar highlight over a transparent subtitle"
        note="The user's case: highlights readable with no background box.">
        <Picture />
        <CueOverlay bgOpacity={0} fontSize={30} annotated selected={2} />
      </Shot>

      {/* The panel is only ever rendered inside `.study-side-rail`, and the rail is
          what positions it — so these cases wrap it exactly as the overlay does.
          Framed bare, they would measure a CSS box the product no longer has. */}
      <Shot id="V9" title="Transcript rail" height={420}
        note="POS colours per token; active row marked; rail clears the right edge.">
        <Picture />
        <div className="study-side-rail">
          <VideoCoreTranscriptPanel
            cues={CUES} activeIndex={2} lang="ja" trackLabel="Japanese (Jimaku)"
            onSeek={noop} onClose={noop}
          />
        </div>
      </Shot>

      <Shot id="V10" title="Transcript rail + cue overlay together" height={420}
        note="Cue must recentre into the remaining picture, not sit under the rail.">
        <Picture />
        <CueOverlay bgOpacity={35} fontSize={26} annotated />
        <div className="study-side-rail">
          <VideoCoreTranscriptPanel
            cues={CUES} activeIndex={2} lang="ja" trackLabel="Japanese (Jimaku)"
            onSeek={noop} onClose={noop}
          />
        </div>
      </Shot>

      <Shot id="V11" title="Transcript rail in a 620px-wide slice" height={420}
        note={'A narrow SLICE, not a narrow window: the ≤640px rules are viewport '
          + 'media queries and do not fire here. This shows the rail giving up width '
          + 'gracefully; for the docked-to-bottom layout, resize the browser instead.'}>
        <div className="harness-narrow">
          <Picture />
          <div className="study-side-rail">
            <VideoCoreTranscriptPanel
              cues={CUES} activeIndex={2} lang="ja" trackLabel="Japanese"
              onSeek={noop} onClose={noop}
            />
          </div>
        </div>
      </Shot>

      <Shot id="V12" title="Long cue, highlighted, small box" height={300}
        note="Wrapping must not break the per-token colouring or overflow the overlay.">
        <Picture />
        <aside className="study-cue-overlay" style={{ bottom: '2rem' }}>
          <SubtitleCueLine
            className="study-cue-text sa-palette"
            style={{ fontSize: '26px', backgroundColor: 'rgba(0,0,0,0.35)', padding: '0.1em 0.4em', borderRadius: '0.35em' }}
            text="この町が好きだから、ずっとここに住んでいたいと思っているんです。"
            furigana={false}
            annotations={alignAnnotations(
              'この町が好きだから、ずっとここに住んでいたいと思っているんです。',
              ANNOTATIONS.map((a) => ({ ...a })),
            )}
          />
        </aside>
      </Shot>
      {/*
        V13–V17: the whole study surface at once — the state the video tab is
        actually in with an episode open. V1–V12 each framed one panel, so none
        of them could see the thing being asked about here: whether the panels
        fit beside each other, or land on top of one another.

        The stage widths are the real ones. The workspace is a full-screen
        overlay, so its width is the window's: 1440 and 1280 are the common
        laptop sizes, 1024 is the smallest the app is usable at, and none of
        them reach the 640px breakpoint where the rails re-dock.
      */}
      <Shot id="V13" title="Episode open — grammar + mining + dock, 1280" width={1280} height={620}
        note="Default study surface. Grammar claims the left column, mining the right, dock the bottom band.">
        <StudySurface width={1280} transcript={false} expanded={false} />
      </Shot>

      <Shot id="V14" title="Everything on — transcript rail too, 1440" width={1440} height={680}
        note="Four panels plus the cue. Nothing may overlap anything.">
        <StudySurface width={1440} transcript expanded={false} />
      </Shot>

      <Shot id="V15" title="Everything on, 1280" width={1280} height={620}
        note="The common laptop. Mining must not run into the grammar panel.">
        <StudySurface width={1280} transcript expanded={false} />
      </Shot>

      <Shot id="V16" title="Everything on, 1024 — the tight case" width={1024} height={620}
        note="Three 24rem panels do not fit across 64rem. This is the crammed case.">
        <StudySurface width={1024} transcript expanded={false} />
      </Shot>

      <Shot id="V17" title="Controls expanded, short window — 1280 × 520" width={1280} height={520}
        note={'The expanded dock must not cover the subtitle line or the grammar card. '
          + 'Read this one at a WIDE browser window: below 640px the stacked layout wants '
          + 'a short viewport too, and the stage cannot express a height the viewport does '
          + 'not have. For the small-window yield rule, size the browser to 620×520.'}>
        <StudySurface width={1280} transcript expanded />
      </Shot>
    </main>
  );
}

/**
 * The composed study surface: what `VideoCoreStudyOverlay` renders when an
 * episode is playing. Real panels, except the dock — see `ControlDock`.
 */
function StudySurface({
  width, transcript, expanded,
}: {
  width: number; transcript: boolean; expanded: boolean;
}) {
  return (
    <>
      <Picture />
      <VideoCoreGrammarPanel
        state={{ kind: 'ready', result: ANALYSIS }}
        lang="ja"
        selectedIndex={2}
        onSelectedIndexChange={noop}
        onLookup={noop}
        onAnalyzeNow={noop}
      />
      <CueOverlay bgOpacity={35} fontSize={26} annotated ownBottom={false} />
      {/* Same wrapper the overlay renders — the column IS the layout under test. */}
      <div className="study-side-rail">
        <VideoCoreMiningPanel
          cue={CUES[2] ?? null}
          displayText={SENTENCE}
          source={MINING_SOURCE}
          video={null}
          subtitleDelaySec={0}
        />
        {transcript && (
          <VideoCoreTranscriptPanel
            cues={CUES} activeIndex={2} lang="ja" trackLabel="Japanese (Jimaku)"
            onSeek={noop} onClose={noop}
          />
        )}
      </div>
      <ControlDock expanded={expanded} />
      <span className="harness-width-tag">{width}px</span>
    </>
  );
}

const host = document.getElementById('root');
if (host) createRoot(host).render(<Harness />);
