/**
 * The nyaa offer must not send the user anywhere, because nyaa runs from here.
 *
 * **What this test used to be.** When Jimaku filed nothing, the harvest panel
 * did not run nyaa — it named the next step in prose via
 * `subHarvest.nyaa.offered`, and all four catalogs pointed at the **Episodes**
 * tab while the button sat on **Subtitles**. That was one defect (fixed), on top
 * of a larger one: the route it pointed at refuses anything the media library
 * does not already hold, so a MAL title the user had not downloaded had no nyaa
 * route at all. The panel could only ever describe a door that was not there.
 *
 * **What it is now.** `subtitleHarvest:nyaaList` / `:nyaaFetch` key on a title
 * and need no media item, so the harvest panel performs the search itself. The
 * invariant therefore inverts: the sentence must name **no** other surface, and
 * the panel it appears in must actually carry a live control. A pointer that
 * became stale is exactly how the previous defect happened.
 *
 * **Why a source scan.** The control's label resolves through `t()` at render
 * time and the IPC channels are strings inside handler registrations; there is
 * no runtime value that spans catalog, panel, preload and main. Reading the four
 * sources is the only way to compare what the prose promises against what the
 * product implements.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHARED = join(__dirname, '..');
const SRC = join(SHARED, '..');
const EN_CATALOG = join(SHARED, 'i18n', 'catalogs', 'en.ts');
const DETAIL_PANEL = join(SRC, 'renderer', 'components', 'media', 'library', 'MediaDetailPanel.tsx');
const HARVEST_PANEL = join(SRC, 'renderer', 'components', 'discover', 'SubtitleHarvestPanel.tsx');
const PRELOAD = join(SRC, 'preload.ts');
const MAIN_HARVEST = join(SRC, 'main', 'subtitleHarvest.ts');

/** The value of one single-quoted English catalog entry. */
function englishString(catalog: string, key: string): string {
  const match = new RegExp(`^  '${key.replace(/\./g, '\\.')}': '((?:[^'\\\\]|\\\\.)*)',$`, 'm').exec(catalog);
  if (!match) throw new Error(`en.ts has no entry for ${key}`);
  return match[1].replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Every tab id the media detail panel declares, in render order. */
function tabIds(source: string): string[] {
  return [...source.matchAll(/\{\s*id:\s*'([a-z]+)',\s*label:\s*t\('media\.detail\.tab\.\1'\)/g)]
    .map((m) => m[1]);
}

describe('the nyaa offer names a route that exists', () => {
  const catalog = readFileSync(EN_CATALOG, 'utf8');
  const detail = readFileSync(DETAIL_PANEL, 'utf8');
  const harvest = readFileSync(HARVEST_PANEL, 'utf8');
  const preload = readFileSync(PRELOAD, 'utf8');
  const main = readFileSync(MAIN_HARVEST, 'utf8');
  const offer = englishString(catalog, 'subHarvest.nyaa.offered');
  const ids = tabIds(detail);

  it('reads a plausible tab list, so a silent parse failure cannot pass', () => {
    // Without this, a regex that matched nothing would make the assertion below
    // vacuously true — the way this class of scan usually fails.
    expect(ids.length).toBeGreaterThanOrEqual(3);
    expect(offer.length).toBeGreaterThan(20);
  });

  it('names no media-library tab, because the search no longer happens there', () => {
    const labels = ids
      .map((id) => englishString(catalog, `media.detail.tab.${id}`))
      // 'Details' is a common English word; only labels that read as navigation
      // are meaningful here.
      .filter((label) => label !== 'Details');
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) expect(offer).not.toContain(label);
  });

  it('promises nothing downloads before a choice, and the panel makes that true', () => {
    // The offer says a release must be picked first. What makes that honest is
    // that `findNyaa` only lists — the fetch is a separate handler on a separate
    // click — so listing cannot start a transfer.
    expect(offer).toMatch(/pick a release|choose a release/i);
    expect(harvest).toContain('subtitleHarvestNyaaList');
    expect(harvest).toContain('subtitleHarvestNyaaFetch');
    const listAt = harvest.indexOf('subtitleHarvestNyaaList');
    const fetchAt = harvest.indexOf('subtitleHarvestNyaaFetch');
    expect(listAt).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(listAt);
  });

  it('is not a dead control: both channels exist in preload and in main', () => {
    // A binding on `window.api` is not proof a handler exists — preload reloads
    // with the window and main does not. Both ends are asserted.
    for (const channel of ['subtitleHarvest:nyaaList', 'subtitleHarvest:nyaaFetch']) {
      expect(preload).toContain(channel);
      expect(main).toContain(`ipcMain.handle('${channel}'`);
    }
  });
});
