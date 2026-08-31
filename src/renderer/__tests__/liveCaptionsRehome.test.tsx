// @vitest-environment jsdom
/**
 * Gate 7b, first half — Live Captions survives the deletion of the Notebook.
 *
 * `NotebookView.tsx:63` was the panel's ONLY mount. Gate 7 deletes that section,
 * so without a new home the capture control disappears with it, and that is a
 * regression rather than an absorption: caption scripts are not recoverable
 * after the fact (the Windows Live Captions window evicts its ~12 lines within
 * seconds), so a control that cannot be armed is a feature that no longer
 * exists.
 *
 * Its new home is the Reading workspace's Captures surface, as a second reading
 * tool beside the capture list. Deliberately NOT the Files app: gate 6 forbids a
 * capability becoming Files-app-only, and moving the app's one arming control
 * there would have done exactly that.
 *
 * The negative control is the point of the file. Every assertion below would
 * also pass on a panel that is mounted unconditionally and can never be
 * dismissed, which is a different (and worse) surface — so the toggle is driven
 * in both directions and the absence is asserted as hard as the presence.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  toolContentRoot,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

const SRC = resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(resolve(SRC, relative), 'utf8');

/** The captions toggle is the second `.reading-captures-list-toggle` in the header. */
const CAPTIONS_TOGGLE_INDEX = 1;

describe('gate 7b — Live Captions is rehomed, not deleted', () => {
  it('the module moved out of the notebook folder entirely', () => {
    expect(() => read('renderer/components/reading/LiveCaptionsPanel.tsx')).not.toThrow();
    expect(() => read('renderer/components/notebook/LiveCaptionsPanel.tsx')).toThrow();
  });

  it('every string it renders is an i18n key in its new namespace', () => {
    const panel = read('renderer/components/reading/LiveCaptionsPanel.tsx');
    const keys = [...panel.matchAll(/'(reading\.liveCaptions\.[a-zA-Z.]+)'/g)].map((m) => m[1]);
    // 6 language labels + 13 panel strings, all of which must exist in all four
    // catalogs; `i18n.test.ts`'s hygiene block enforces the other three.
    expect(new Set(keys).size).toBe(19);
    expect(panel).not.toMatch(/notebook\.liveCaptions/);
    const en = read('shared/i18n/catalogs/en.ts');
    for (const key of new Set(keys)) expect(en).toContain(`'${key}':`);
    // The old namespace is gone from every catalog, not merely from the panel.
    for (const lang of ['en', 'ja', 'zh', 'ru']) {
      expect(read(`shared/i18n/catalogs/${lang}.ts`)).not.toMatch(/notebook\.liveCaptions/);
    }
  });

  describe('mounted in the Reading captures canvas', () => {
    let harness: ReadingSurfaceHarness;

    beforeEach(() => {
      installResizeObserver();
      // `liveCaptionsStatus` decides the panel's whole shape: an unsupported
      // platform renders one muted line and none of the controls, so the inert
      // proxy default would score the arming control ABSENT on a working panel.
      installReadingSurfaceApi({
        liveCaptionsStatus: () =>
          Promise.resolve({ supported: true, capturing: false, attached: false, error: '' }),
        liveCaptionsScripts: () => Promise.resolve([]),
        lensHistoryList: () => Promise.resolve([]),
      });
    });

    afterEach(() => harness?.teardown());

    async function mount(): Promise<void> {
      const { default: ReadingCapturesView } = await import('../views/ReadingCapturesView');
      harness = createReadingSurfaceHarness({ render: () => <ReadingCapturesView /> });
      await harness.mount(1200);
    }

    it('is closed on a cold open, opens from the header, and closes again', async () => {
      await mount();
      // NEGATIVE CONTROL, before anything is clicked: the passage this section
      // exists to show is not covered by a second sheet on open.
      expect(harness.tool('live-captions')).toBe(null);

      await harness.click('.reading-captures-list-toggle', CAPTIONS_TOGGLE_INDEX);
      const root = toolContentRoot(harness, 'live-captions');
      expect(root.classList.contains('gx-lc-panel')).toBe(true);
      // The arming control itself, not merely the panel frame.
      expect(root.querySelectorAll('button').length).toBeGreaterThanOrEqual(2);

      await harness.click('.reading-captures-list-toggle', CAPTIONS_TOGGLE_INDEX);
      expect(harness.tool('live-captions')).toBe(null);
    });

    it('drops its own heading so the canvas label is the only one', async () => {
      await mount();
      await harness.click('.reading-captures-list-toggle', CAPTIONS_TOGGLE_INDEX);
      const root = toolContentRoot(harness, 'live-captions');
      expect(root.querySelector('.gx-lc-title')).toBe(null);
      // The description survives: it is the instruction for a control most
      // users meet once, and `headless` must not take it with the heading.
      expect(root.querySelector('.gx-lc-desc')).not.toBe(null);
    });
  });
});
