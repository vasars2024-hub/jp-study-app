// @vitest-environment jsdom
/**
 * Structure proof for the mining panel's Phase-3 UI pass.
 *
 * What is pinned is all static markup — whether the result message's live region exists
 * before it has content, whether the collapsed panel still reports what is attached, and
 * whether the history row shows a translated label instead of the raw `entry.status`
 * enum. It runs in the ordinary suite forever instead of being a screenshot nobody
 * re-takes.
 *
 * It is a *client* render, not `renderToStaticMarkup`: the draft this panel is built
 * from is derived in a `useEffect`, so under SSR the component never leaves its
 * "waiting for a cue" state and every assertion below would be vacuous. Hence the
 * per-file `@vitest-environment jsdom` — `vitest.config.ts` is root config this track
 * does not own, and the docblock needs no change to it.
 *
 * Lives in `src/renderer/__tests__` because that is one of the directories the config
 * includes; `src/media/__tests__` is not. Written as `.test.ts` with `createElement` for
 * the same reason the two `.test.tsx` files in this directory have never run.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createVideoCoreMiningDraft,
  createVideoCoreMiningHistoryEntry,
  VIDEO_CORE_MINING_HISTORY_KEY,
  type VideoCoreMiningHistoryEntry,
  type VideoCoreMiningSource,
} from '../../shared/videoCoreMining';
import type { VideoCoreStudyCue } from '../../shared/videoCoreStudy';

const CUE: VideoCoreStudyCue = {
  index: 0,
  trackNumber: 3,
  text: '猫が窓辺で寝ている。',
  startMs: 2148,
  endMs: 5148,
};

// Typed, not inferred: an untyped literal silently omitted the two required fields
// (`playbackType`, `streamType`) and cost two new tsc diagnostics.
const SOURCE: VideoCoreMiningSource = {
  playbackId: 'harness-playback',
  playbackType: 'localfile',
  streamType: 'directstream',
  mediaId: 154587,
  mediaTitle: 'Fixture media',
  episodeNumber: 1,
  episodeTitle: 'Episode 1',
  localFilePath: 'C:/fixture/cue.mkv',
};

/**
 * Built through the production factories rather than hand-written: a literal missing
 * `provenance` is silently dropped by `normalizeVideoCoreMiningHistory`, which makes an
 * assertion about the history row pass vacuously against an empty list.
 */
function exportedEntry(): VideoCoreMiningHistoryEntry {
  const draft = { ...createVideoCoreMiningDraft(CUE, CUE.text, SOURCE), term: '窓辺' };
  return createVideoCoreMiningHistoryEntry(draft, {
    ok: true,
    noteId: 1785396692600,
    deckName: 'StudyOS::_Probe',
  });
}

const store = new Map<string, string>();
let host: HTMLDivElement | null = null;

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  });
});

afterEach(() => {
  host?.remove();
  host = null;
});

async function render(
  history: VideoCoreMiningHistoryEntry[] = [],
  cue: VideoCoreStudyCue = CUE,
): Promise<string> {
  if (history.length) {
    store.set(VIDEO_CORE_MINING_HISTORY_KEY, JSON.stringify(history));
  }
  const { default: VideoCoreMiningPanel } = await import('../../media/VideoCoreMiningPanel');
  host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(VideoCoreMiningPanel, {
      cue,
      displayText: cue.text,
      source: SOURCE,
      video: null,
      subtitleDelaySec: 0,
    }));
  });
  return host.innerHTML;
}

describe('VideoCoreMiningPanel structure', () => {
  it('mounts the result live region before it has any content', async () => {
    const html = await render();
    // An aria-live region created together with its text is not reliably announced,
    // which is how every mine result — including "Duplicate" — used to be silent.
    expect(html).toContain('class="study-mining-message"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('role="status"');
  });

  it('exposes a labelled collapse toggle rather than a bare heading', async () => {
    const html = await render();
    expect(html).toContain('data-study-action="toggle-mining-panel"');
    expect(html).toContain('aria-expanded="true"');
  });

  it('reports attachment state independently of the form, so collapsing keeps it', async () => {
    const html = await render();
    expect(html).toContain('class="study-mining-armed"');
    // Nothing captured yet: both dots present and both unarmed.
    expect(html.match(/data-armed="false"/g)).toHaveLength(2);
    expect(html).not.toContain('data-armed="true"');
  });

  it('keeps the panel labelled for assistive tech in both states', async () => {
    const html = await render();
    expect(html).toContain('aria-label="Card preview"');
  });

  it('shows a translated history status, never the raw enum', async () => {
    const html = await render([exportedEntry()]);
    expect(html).toContain('In Anki');
    // The pre-pass markup was `<small>exported · StudyOS::_Probe</small>`. Match that
    // exact shape — a mutation run showed `>exported<` never matched it, so the
    // assertion was passing on both the fixed and the broken component.
    expect(html).not.toMatch(/>exported\s/);
    // The enum stays available as a styling/query hook; only the *text* is translated.
    expect(html).toContain('data-history-status="exported"');
  });

  it('names each undo by the card it removes', async () => {
    const html = await render([exportedEntry()]);
    expect(html).toContain('aria-label="Undo 窓辺"');
  });

  it('explains why Mine is disabled instead of just greying it out', async () => {
    // The seeded draft takes its term from the cue text, so an empty cue is the
    // no-term case.
    const html = await render([], { ...CUE, text: '' });
    expect(html).toContain('class="study-mining-hint"');
    expect(html).toContain('Add a term or sentence before mining.');
  });

  describe('the already-mined marker (watch-to-review, slice 6)', () => {
    it('warns before any capture work that this exact line is already a card', async () => {
      // Finding out from Anki's duplicate warning means the framing, the screenshot and
      // the audio clip were all captured first. That is what the G-PLAY run hit.
      const html = await render([exportedEntry()]);
      expect(html).toContain('class="study-mining-mined"');
      expect(html).toContain('Already mined');
      expect(html).toContain('StudyOS::_Probe');
    });

    it('says nothing for a line that has never been mined', async () => {
      const html = await render([]);
      expect(html).not.toContain('class="study-mining-mined"');
    });

    it('says nothing for a DIFFERENT cue in the same file', async () => {
      // Guards the identity rule: a marker that fires on every cue is worse than none.
      const html = await render([exportedEntry()], { ...CUE, index: 4, startMs: 6648 });
      expect(html).not.toContain('class="study-mining-mined"');
    });

    it('clears once the card is undone — the line is minable again', async () => {
      const entry = exportedEntry();
      const html = await render([{ ...entry, status: 'undone' }]);
      expect(html).not.toContain('class="study-mining-mined"');
    });
  });
});
