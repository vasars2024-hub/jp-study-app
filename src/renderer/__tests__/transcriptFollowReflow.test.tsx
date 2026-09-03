// @vitest-environment jsdom
/**
 * Auto-follow survives a layout reflow, and still yields to a real gesture.
 *
 * THE DEFECT, measured live 2026-09-02 (backup) against parity row 10 and recorded there
 * rather than repaired, because it was not that row's words: switching the media workspace
 * to Liquid while a clip was playing turned the transcript's `Follow` off by itself —
 * `listScrollTop` 3693 → 4552, `followChecked` true → false — with the panel box identical
 * at 384x517 in both presentations. The reader's only clue was that the transcript stopped
 * moving, and getting it back cost a click they had no reason to know they needed.
 *
 * The mechanism is not Liquid's. `handleScroll` suspends following on any `scroll` event
 * that is not one the panel itself just caused, and the only question it could ask was
 * "did WE scroll" (a 250 ms mark). It could not ask the other one: did the LIST reflow
 * under a fixed `scrollTop`? Make Liquid is one way to get there. So are lazy furigana
 * tokenisation, a detach and re-dock, and an OS window resize — all of which fire the same
 * event from the same non-gesture.
 *
 * The discriminator is that a user gesture never changes `scrollHeight` or `clientHeight`
 * and a reflow almost always changes one. These tests drive the real component and move
 * those two numbers directly, because that is the actual input the fix reads — asserting
 * on a `ResizeObserver` would have tested a mechanism the fix deliberately does not use
 * (it does not fire at all in an unfocused window, and this panel is watched while a video
 * plays).
 *
 * The second test is the one that keeps the fix honest: a scroll with the geometry
 * UNCHANGED must still suspend following, or this would have traded a silent stop for a
 * transcript the reader cannot hold still.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import VideoCoreTranscriptPanel from '../../media/VideoCoreTranscriptPanel';

const CUES = [
  { index: 0, trackNumber: 1, text: '行ってきます。', startMs: 266_000, endMs: 268_000 },
  { index: 1, trackNumber: 1, text: '気をつけて。', startMs: 268_000, endMs: 270_000 },
  { index: 2, trackNumber: 1, text: 'この町が好き。', startMs: 271_000, endMs: 273_000 },
];

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const noop = (): void => undefined;

async function mountPanel(): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(
      <VideoCoreTranscriptPanel
        cues={CUES}
        activeIndex={2}
        lang="ja"
        trackLabel="Japanese"
        onSeek={noop}
        onClose={noop}
      />,
    );
  });
  return host;
}

/**
 * jsdom lays nothing out, so every box is 0. These override the two properties the fix
 * reads, exactly as a real reflow moves them, and nothing else — a jsdom test that faked
 * the whole layout would be scoring its own fixture.
 */
function setListGeometry(list: Element, scrollHeight: number, clientHeight: number): void {
  Object.defineProperty(list, 'scrollHeight', { value: scrollHeight, configurable: true });
  Object.defineProperty(list, 'clientHeight', { value: clientHeight, configurable: true });
}

function followCheckbox(host: HTMLElement): HTMLInputElement {
  const box = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!box) throw new Error('the Follow control is not rendered');
  return box;
}

async function scroll(list: Element): Promise<void> {
  await act(async () => {
    list.dispatchEvent(new Event('scroll', { bubbles: true }));
  });
}

describe('transcript auto-follow across a layout reflow', () => {
  it('follows by default', async () => {
    const host = await mountPanel();
    expect(followCheckbox(host).checked).toBe(true);
  });

  it('stays on when the list reflows under a fixed scrollTop', async () => {
    const host = await mountPanel();
    const list = host.querySelector('.study-transcript-list');
    if (!list) throw new Error('no transcript list');

    // Baseline: one scroll at a stable geometry establishes what "unchanged" means.
    setListGeometry(list, 4800, 517);
    await scroll(list);
    expect(followCheckbox(host).checked).toBe(false);

    // Back on, as the reader would put it back, then reflow: the content grows while the
    // viewport stays 517 tall — the shape a presentation switch produced live.
    await act(async () => {
      followCheckbox(host).click();
    });
    expect(followCheckbox(host).checked).toBe(true);

    setListGeometry(list, 5300, 517);
    await scroll(list);
    expect(followCheckbox(host).checked).toBe(true);
  });

  it('stays on when only the viewport height changes', async () => {
    // The other half of a reflow: a detach, a re-dock or an OS window resize moves
    // clientHeight while the content is untouched.
    const host = await mountPanel();
    const list = host.querySelector('.study-transcript-list');
    if (!list) throw new Error('no transcript list');

    setListGeometry(list, 4800, 517);
    await scroll(list);
    await act(async () => {
      followCheckbox(host).click();
    });
    expect(followCheckbox(host).checked).toBe(true);

    setListGeometry(list, 4800, 820);
    await scroll(list);
    expect(followCheckbox(host).checked).toBe(true);
  });

  it('still suspends following for a real gesture, geometry unchanged', async () => {
    // Without this the fix would be a regression of its own: a reader who scrolls back to
    // re-read a line would be yanked to the playhead on the next cue.
    const host = await mountPanel();
    const list = host.querySelector('.study-transcript-list');
    if (!list) throw new Error('no transcript list');

    setListGeometry(list, 4800, 517);
    await scroll(list);
    expect(followCheckbox(host).checked).toBe(false);

    await act(async () => {
      followCheckbox(host).click();
    });
    setListGeometry(list, 4800, 517);
    await scroll(list);
    expect(followCheckbox(host).checked).toBe(false);
  });

  it('suspends following on a reflow that the reader answers with a real scroll', async () => {
    // The one measured cost of the discriminator, pinned so it is a known shape rather
    // than a surprise: the reflow event itself is forgiven, and the NEXT event — now at a
    // stable geometry — suspends normally. One extra event, not a lost feature.
    const host = await mountPanel();
    const list = host.querySelector('.study-transcript-list');
    if (!list) throw new Error('no transcript list');

    setListGeometry(list, 4800, 517);
    await scroll(list);
    await act(async () => {
      followCheckbox(host).click();
    });

    setListGeometry(list, 5300, 517);
    await scroll(list);
    expect(followCheckbox(host).checked).toBe(true);

    await scroll(list);
    expect(followCheckbox(host).checked).toBe(false);
  });
});
