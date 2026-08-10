// @vitest-environment jsdom
/**
 * "Ask the Agent" from the player, with the frame it is on.
 *
 * A client render for the reason `videoCoreMiningPanelStructure.test.ts` records:
 * the state this asserts is set in effects and event handlers, so
 * `renderToStaticMarkup` would make every assertion vacuous. Written as `.test.ts`
 * with `createElement` to match its neighbour.
 *
 * `handOffToAgent` is the only thing mocked. The two producers stay real — what is
 * worth pinning is exactly *what this surface asks them for*, and a mocked producer
 * would assert the test's own opinion of the shape instead of the shipped one.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentContextInput } from '../../shared/agentContext';
import { CATALOGS } from '../../shared/i18n/catalogs/all';

const handoff = vi.hoisted(() => ({
  calls: [] as Array<{
    input: AgentContextInput;
    title: string;
    place?: AgentContextInput;
    image?: { dataUrl: string; name: string };
  }>,
}));

vi.mock('../agentContextHandoff', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../agentContextHandoff')>();
  return {
    ...actual,
    handOffToAgent: async (
      input: AgentContextInput,
      title: string,
      place?: AgentContextInput,
      image?: { dataUrl: string; name: string },
    ) => {
      handoff.calls.push({ input, title, place, image });
      return 'attached' as const;
    },
  };
});

const JPEG = `data:image/jpeg;base64,${'A'.repeat(2048)}`;

/** A 1080p element that has decoded a frame. Nothing else on it is read. */
function playingVideo(): HTMLVideoElement {
  return { videoWidth: 1920, videoHeight: 1080 } as unknown as HTMLVideoElement;
}

let host: HTMLDivElement | null = null;

beforeEach(() => {
  handoff.calls = [];
  // jsdom ships no 2D context, so without this the ladder measures nothing and the
  // gesture correctly travels without a picture — which is a case worth testing, but
  // not the only one.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    { drawImage: () => undefined } as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(JPEG);
});

afterEach(() => {
  host?.remove();
  host = null;
  vi.restoreAllMocks();
});

async function render(props: {
  line: string;
  mediaTitle: string;
  video: HTMLVideoElement | null;
}): Promise<HTMLButtonElement> {
  const { default: MediaCueAgentHandoffButton } = await import(
    '../../media/MediaCueAgentHandoffButton'
  );
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(MediaCueAgentHandoffButton, props));
  });
  const button = host.querySelector('button');
  if (!button) throw new Error('the hand-off button did not render');
  return button;
}

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.click();
  });
}

const LINE = '猫が窓辺で寝ている。';

describe('MediaCueAgentHandoffButton', () => {
  it('sends the line as a media cue, and the Media Center as the place', async () => {
    const button = await render({ line: LINE, mediaTitle: '夜のクラゲ', video: playingVideo() });
    await click(button);

    expect(handoff.calls).toHaveLength(1);
    const [call] = handoff.calls;
    expect(call.input.kind).toBe('media-cue');
    expect(call.input.label).toBe(LINE);
    // `player` is the Media Center window. The producer's own `media` names no
    // window, so a suggestion built from it could only fail its allowlist check.
    expect(call.place?.source).toEqual({ app: 'player' });
    expect(call.place?.kind).toBe('route');
  });

  it('titles the conversation from the show, never from the line', async () => {
    // A title is persisted and `media-cue` is refused retention exactly so the line
    // never reaches disk; titling with it would write it there through the
    // neighbouring field.
    const button = await render({ line: LINE, mediaTitle: '夜のクラゲ', video: playingVideo() });
    await click(button);
    expect(handoff.calls[0].title).toContain('夜のクラゲ');
    expect(handoff.calls[0].title).not.toContain(LINE);
  });

  it('discloses no entityId, so a shared shelf id never carries the wrong one', async () => {
    // `MediaStudyMode` discloses a media-library item id here; this surface only has
    // an AniList id. `media-cue` keys on the line alone, so the two collapse into one
    // entry — an id from whichever namespace was last would be wrong, not vague.
    const button = await render({ line: LINE, mediaTitle: '夜のクラゲ', video: playingVideo() });
    await click(button);
    expect(handoff.calls[0].input.source).toEqual({ app: 'media' });
  });

  it('carries the frame as a bounded JPEG attachment', async () => {
    const button = await render({ line: LINE, mediaTitle: '夜のクラゲ', video: playingVideo() });
    await click(button);
    expect(handoff.calls[0].image?.dataUrl).toBe(JPEG);
    expect(handoff.calls[0].image?.name).toBe('Video frame');
  });

  it('still asks when there is no video, rather than blocking on the picture', async () => {
    const button = await render({ line: LINE, mediaTitle: '夜のクラゲ', video: null });
    await click(button);
    expect(handoff.calls).toHaveLength(1);
    // Absent, not empty: `handOffToAgent` announces a *broken* image and says nothing
    // about one that was never offered.
    expect(handoff.calls[0].image).toBeUndefined();
  });

  it('offers no picture when the browser cannot encode one', async () => {
    // What jsdom does natively, and what a hardware-decoded frame does on some drivers.
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:,');
    const button = await render({ line: LINE, mediaTitle: '夜のクラゲ', video: playingVideo() });
    await click(button);
    expect(handoff.calls).toHaveLength(1);
    expect(handoff.calls[0].image).toBeUndefined();
  });

  it('trims the line, so a cue padded by its subtitle track is one shelf entry', async () => {
    const button = await render({
      line: `  ${LINE}  `,
      mediaTitle: '夜のクラゲ',
      video: playingVideo(),
    });
    await click(button);
    expect(handoff.calls[0].input.label).toBe(LINE);
  });

  it('is disabled, and asks nothing, when there is no line', async () => {
    const button = await render({ line: '   ', mediaTitle: '夜のクラゲ', video: playingVideo() });
    expect(button.disabled).toBe(true);
    await click(button);
    expect(handoff.calls).toHaveLength(0);
  });

  it('renders its label from the catalog, not the key', async () => {
    // Three slices running shipped a call to a key nobody had added, which renders as
    // the key itself. Cheaper to catch here than by looking at the running app.
    const button = await render({ line: LINE, mediaTitle: '夜のクラゲ', video: playingVideo() });
    expect(button.textContent).toBe('Ask the Agent');
  });
});

describe('the keys this surface calls', () => {
  it('exists in all four catalogs', () => {
    for (const key of [
      'mediaWorkspace.mining.askAgent',
      'mediaWorkspace.mining.askingAgent',
      'agent.handoff.frame.name',
    ]) {
      for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
        expect(CATALOGS[lang][key], `${lang} ${key}`).toBeTruthy();
      }
    }
  });
});
