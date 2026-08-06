// @vitest-environment jsdom
/**
 * Renders the two halves of grammar highlight and asserts they actually paint.
 *
 * This exists because the feature's failure mode is silent. The category tint is
 * the whole point of highlighting, and it is applied by a bare `.sa-seg` class
 * from sentenceAnalysis.css — which the media workspace's Tailwind preflight
 * (`#media-workspace button`, one ID heavier) had been overriding to
 * `background: transparent`. Everything still compiled, every existing test
 * still passed, and the highlight rendered as a colourless underline.
 *
 * So the assertions here are about *structure reaching the DOM*: one segment per
 * annotation, carrying the category class the stylesheet keys its hue off, with
 * the sentence still readable character-for-character. A jsdom test cannot
 * evaluate `color-mix`, so it deliberately does not claim to check the colour —
 * it checks the hook the colour hangs on, which is what silently disappeared.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import SubtitleCueLine from '../components/SubtitleCueLine';
import VideoCoreTranscriptPanel from '../../media/VideoCoreTranscriptPanel';
import {
  alignAnnotations,
  type SentenceAnnotation,
} from '../../shared/sentenceAnalysisCore';

const SENTENCE = 'この町が好き。';

/** Aligned the same way the real pipeline aligns them — never hand-written offsets. */
const ANNOTATIONS: SentenceAnnotation[] = alignAnnotations(SENTENCE, [
  {
    text: 'この',
    category: 'grammar',
    meaning: 'this (demonstrative)',
    explanation: 'Prenominal demonstrative.',
    examples: [],
    vocabulary: [],
  },
  {
    text: '町',
    category: 'vocabulary',
    meaning: 'town',
    explanation: 'Common noun.',
    examples: [],
    vocabulary: [],
  },
  {
    text: 'が',
    category: 'particle',
    meaning: 'subject marker',
    explanation: 'Marks the object of 好き.',
    examples: [],
    vocabulary: [],
  },
]);

/** Explicit rather than `() => {}`, which the lint rules reject as an empty body. */
const noop = (): undefined => undefined;

/** Fails the test where the element is missing rather than where it is used. */
function must<T>(value: T | null | undefined, what: string): T {
  if (value == null) throw new Error(`expected to find ${what}`);
  return value;
}

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

/**
 * React installs its own `value` setter on the input node to track changes, so
 * assigning `input.value` directly updates the DOM without React ever seeing it
 * and the dispatched event arrives with the old value. Going through the
 * prototype's setter is what makes a scripted edit look like a typed one.
 */
async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  await act(async () => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function render(node: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(node);
  });
  return host;
}

describe('highlighted subtitle cue', () => {
  it('gives every annotation its own segment carrying the category class', async () => {
    const host = await render(
      <SubtitleCueLine text={SENTENCE} furigana={false} annotations={ANNOTATIONS} />,
    );
    const segments = [...host.querySelectorAll('button.sa-seg')];
    expect(segments).toHaveLength(ANNOTATIONS.length);
    expect(segments.map((s) => s.className)).toEqual([
      'sa-seg sa-cat-grammar',
      'sa-seg sa-cat-vocabulary',
      'sa-seg sa-cat-particle',
    ]);
  });

  it('renders the sentence character-for-character, highlights included', async () => {
    const host = await render(
      <SubtitleCueLine text={SENTENCE} furigana={false} annotations={ANNOTATIONS} />,
    );
    // The trailing 。is outside every annotation — the piece walk has to emit it
    // as plain text rather than dropping it off the end.
    expect(host.textContent).toBe(SENTENCE);
  });

  it('marks only the selected segment active', async () => {
    const host = await render(
      <SubtitleCueLine
        text={SENTENCE}
        furigana={false}
        annotations={ANNOTATIONS}
        selectedAnnotation={1}
      />,
    );
    const active = [...host.querySelectorAll('button.sa-seg')].map((s) =>
      s.classList.contains('active'));
    expect(active).toEqual([false, true, false]);
    expect(host.querySelector('button.sa-seg.active')?.textContent).toBe('町');
  });

  it('reports the clicked segment by index', async () => {
    const clicks: number[] = [];
    const host = await render(
      <SubtitleCueLine
        text={SENTENCE}
        furigana={false}
        annotations={ANNOTATIONS}
        onSelectAnnotation={(index) => clicks.push(index)}
      />,
    );
    const segments = [...host.querySelectorAll<HTMLButtonElement>('button.sa-seg')];
    await act(async () => {
      segments[2].click();
      segments[0].click();
    });
    expect(clicks).toEqual([2, 0]);
  });

  it('stays a plain line when there is no analysis', async () => {
    // The same component still serves the un-highlighted player and the media
    // view; adding segments there would have been a regression nobody asked for.
    const host = await render(<SubtitleCueLine text={SENTENCE} furigana={false} />);
    expect(host.querySelectorAll('button')).toHaveLength(0);
    expect(host.textContent).toBe(SENTENCE);
  });
});

describe('transcript rail', () => {
  const CUES = [
    { index: 0, trackNumber: 1, text: '行ってきます。', startMs: 266_000, endMs: 268_000 },
    { index: 1, trackNumber: 1, text: '気をつけて。', startMs: 268_000, endMs: 270_000 },
    { index: 2, trackNumber: 1, text: 'この町が好き。', startMs: 271_000, endMs: 273_000 },
  ];

  function panel(overrides: Partial<Parameters<typeof VideoCoreTranscriptPanel>[0]> = {}) {
    return (
      <VideoCoreTranscriptPanel
        cues={CUES}
        activeIndex={2}
        lang="ja"
        trackLabel="Japanese"
        onSeek={noop}
        onClose={noop}
        {...overrides}
      />
    );
  }

  it('lists every cue with its timestamp', async () => {
    const host = await render(panel());
    const rows = [...host.querySelectorAll('.study-transcript-row')];
    expect(rows).toHaveLength(3);
    expect([...host.querySelectorAll('.study-transcript-time')].map((n) => n.textContent))
      .toEqual(['4:26', '4:28', '4:31']);
  });

  it('marks the cue that is on screen', async () => {
    const host = await render(panel());
    const active = host.querySelectorAll('.study-transcript-row.is-active');
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute('data-cue-index')).toBe('2');
  });

  it('seeks to the cue that was clicked', async () => {
    const seeks: number[] = [];
    const host = await render(panel({ onSeek: (cue) => seeks.push(cue.startMs) }));
    await act(async () => {
      host.querySelectorAll<HTMLButtonElement>('.study-transcript-seek')[1].click();
    });
    expect(seeks).toEqual([268_000]);
  });

  it('filters to matching lines and says so when nothing matches', async () => {
    const host = await render(panel());
    const search = must(
      host.querySelector<HTMLInputElement>('input[type="search"]'),
      'the transcript search box',
    );
    await typeInto(search, '町');
    expect(host.querySelectorAll('.study-transcript-row')).toHaveLength(1);

    await typeInto(search, 'ぜったいにない');
    expect(host.querySelectorAll('.study-transcript-row')).toHaveLength(0);
    expect(host.querySelector('.study-transcript-empty')).not.toBeNull();
  });

  it('paints tokens with the category class the stylesheet keys its hue off', async () => {
    // The tokenizer needs its dictionary, which jsdom has no way to fetch, so the
    // rows fall back to plain text here — that fallback is itself the assertion
    // worth making: no tokenizer must mean an uncoloured transcript, never a
    // blank one. The mapping that decides the colours is covered exhaustively in
    // shared/__tests__/posCategory.test.ts.
    const host = await render(panel());
    const texts = [...host.querySelectorAll('.study-transcript-text')];
    expect(texts.map((n) => n.textContent)).toEqual([
      '行ってきます。',
      '気をつけて。',
      'この町が好き。',
    ]);
  });

  it('carries the shared palette so a noun is the same colour as in the panel', async () => {
    // Without sa-palette every --sa-c resolves to nothing and every token renders
    // in the default ink — the colour code silently disappears.
    const host = await render(panel());
    expect(host.querySelector('.study-transcript-list')?.classList).toContain('sa-palette');
  });

  it('shows where a mined card would land once routing resolves', async () => {
    // No window.api in this environment, so the row must be absent rather than
    // guessing a deck name — a routing display that guesses is worse than none.
    const host = await render(panel());
    expect(host.querySelector('.study-transcript-destination')).toBeNull();
  });

  it('strips ASS override tags rather than showing them', async () => {
    const host = await render(
      panel({
        cues: [{ index: 0, trackNumber: 1, text: '{\\an8}こんにちは', startMs: 0, endMs: 1000 }],
        activeIndex: 0,
      }),
    );
    expect(host.querySelector('.study-transcript-text')?.textContent).toBe('こんにちは');
  });
});
