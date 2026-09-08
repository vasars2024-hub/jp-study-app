/**
 * Gate 8's routing half, checked against the two files that would drift.
 *
 * Nothing here restates `FILES_SYSTEM_PANEL_CARDS`. Each assertion re-derives
 * its side from a file the table does not own:
 *
 * - the memory card set from the settings registry's own `pageId: 'memory'`
 *   entries, so an entry that stays behind fails here rather than becoming a
 *   search hit landing on a page that no longer holds the row (the gate's own
 *   FAIL condition);
 * - the rendered card set from each panel's own `FilesPanelCard id=` props, so
 *   a card renamed on one side and not the other fails instead of silently
 *   misrouting;
 * - the panel leaf ids from `catalog.ts`'s tree.
 *
 * A source scan is used because these are JSX props and a data table, not
 * runtime values, and because importing the renderer panels here would pull in
 * React, `window.api` and the whole storage layer.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FILES_LEAF_IDS, isFilesPanelCategory, FILES_PANEL_CATEGORY_IDS } from '../filesApp/catalog';
import {
  FILES_SYSTEM_PANEL_CARDS,
  cardsForFilesPanel,
  filesPanelForCard,
} from '../filesApp/systemPanels';

const ROOT = join(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');

const MEMORY_PANEL = read('src/renderer/components/filesapp/panels/FilesMemoryPanel.tsx');
const STATS_PANEL = read('src/renderer/components/filesapp/panels/FilesStatisticsPanel.tsx');
const FILES_APP = read('src/renderer/components/filesapp/FilesApp.tsx');

/** Every `id="…"` a `FilesPanelCard` is opened with, in source order. */
function renderedCardIds(source: string): string[] {
  const ids: string[] = [];
  const re = /<FilesPanelCard\b[\s\S]*?\bid="([^"]+)"/g;
  let match = re.exec(source);
  while (match) {
    ids.push(match[1]);
    match = re.exec(source);
  }
  return ids;
}

describe('files-app system panels — the table', () => {
  it('maps every card to a leaf that is actually a panel leaf', () => {
    expect(FILES_SYSTEM_PANEL_CARDS.length).toBeGreaterThan(0);
    for (const row of FILES_SYSTEM_PANEL_CARDS) {
      expect(FILES_LEAF_IDS).toContain(row.categoryId);
      expect(isFilesPanelCategory(row.categoryId)).toBe(true);
    }
  });

  it('has no duplicate card id', () => {
    const ids = FILES_SYSTEM_PANEL_CARDS.map((r) => r.cardId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers both panel leaves', () => {
    for (const id of FILES_PANEL_CATEGORY_IDS) {
      expect(cardsForFilesPanel(id).length).toBeGreaterThan(0);
    }
  });

  /**
   * The negative control. A lookup that answers for everything is worthless
   * here: an unrelated settings entry rerouted into the Files app is the same
   * misroute the gate forbids, only pointing the other way.
   */
  it('refuses a card it does not own', () => {
    expect(filesPanelForCard('api-keys')).toBeNull();
    expect(filesPanelForCard('')).toBeNull();
    expect(filesPanelForCard('system-memory-2')).toBeNull();
  });
});

describe('files-app system panels — what the panels actually render', () => {
  it('the memory panel renders exactly the cards the table gives it, minus the page alias', () => {
    const rendered = renderedCardIds(MEMORY_PANEL);
    // `memory` is the old PAGE id, handled by the storage-usage card's own
    // `focusCardId === 'memory'` branch rather than by a card of its own.
    const claimed = cardsForFilesPanel('system/memory').filter((id) => id !== 'memory');
    expect([...rendered].sort()).toEqual([...claimed].sort());
    expect(MEMORY_PANEL).toContain("focusCardId === 'memory'");
  });

  it('the statistics panel renders exactly the cards the table gives it', () => {
    const rendered = renderedCardIds(STATS_PANEL);
    const claimed = cardsForFilesPanel('system/statistics');
    expect([...rendered].sort()).toEqual([...claimed].sort());
  });

  it('the checker can fail — a card the table does not carry is caught', () => {
    const rendered = renderedCardIds(
      `${MEMORY_PANEL}\n<FilesPanelCard id="not-a-real-card" title={t('x')} />`,
    );
    expect(rendered).toContain('not-a-real-card');
    expect(filesPanelForCard('not-a-real-card')).toBeNull();
  });
});

describe('files-app system panels — the readers are the old page’s readers', () => {
  /**
   * Gate 8 is "the same numbers the old Settings page produced". A second
   * implementation of any reader is the only way to produce a different number,
   * so the panel must call the same five sources by name.
   */
  it('memory calls the same five sources the settings page called', () => {
    for (const call of [
      'listSettingsDomains',
      'navigator.storage.estimate',
      'window.api.systemGetMetrics',
      'loadLocalAgentMemory',
      'getAgentOperationHistorySnapshot',
    ]) {
      expect(MEMORY_PANEL).toContain(call);
    }
    // …and formats bytes through the same helper, so a value never changes unit
    // on the way across.
    expect(MEMORY_PANEL).toContain('formatBytes');
  });

  it('statistics composes StatsContent rather than re-reading the store', () => {
    expect(STATS_PANEL).toContain("from '../../stats/StatsContent'");
    expect(STATS_PANEL).toContain('useStats()');
    // No second reader: the summary must not be assembled here.
    expect(STATS_PANEL).not.toContain('getSummary(');
  });

  it('neither panel imports Settings chrome', () => {
    // Import statements only. Both files NAME `SettingsCard` in their header
    // comment to say what they replaced, and a bare substring check would score
    // that prose as the defect it documents.
    for (const source of [MEMORY_PANEL, STATS_PANEL]) {
      const imports = source.match(/^import[\s\S]*?from '[^']+';$/gm) ?? [];
      expect(imports.length).toBeGreaterThan(0);
      const joined = imports.join('\n');
      expect(joined).not.toContain('SettingsCard');
      expect(joined).not.toContain('SettingsContext');
      expect(joined).not.toContain('settings/');
      // The `ui` barrel re-exports AppChrome; dialogService is imported direct.
      expect(joined).not.toMatch(/from '[./]*\.\.\/ui'/);
      // The call, not the word: both headers explain that `SettingsCard` calls
      // `useSettings()` and throws outside a Settings host.
      expect(source).not.toMatch(/^\s*const \{[^}]*\} = useSettings\(/m);
    }
  });
});

describe('files-app system panels — the app renders them', () => {
  it('FilesApp branches to a panel before it consults index state', () => {
    // Scoped to the canvas, not to the whole file. `indexOf` over the module found the
    // FIRST textual occurrence of the status read, which since D314 is a derived flag
    // declared hundreds of lines above — a declaration that gates nothing and reordered
    // the two indices without changing a line of the branching this is about. The claim
    // was always about the order of the branches inside `canvas`, so read that.
    const canvasStart = FILES_APP.indexOf('const canvas = (() => {');
    expect(canvasStart).toBeGreaterThan(-1);
    const canvas = FILES_APP.slice(canvasStart);

    const panelBranch = canvas.indexOf('isFilesPanelCategory(scope)');
    const loadingBranch = canvas.indexOf("state.status === 'loading'");
    expect(panelBranch).toBeGreaterThan(-1);
    expect(loadingBranch).toBeGreaterThan(-1);
    // An enumerator failure must not hide the app's own diagnostics screen.
    expect(panelBranch).toBeLessThan(loadingBranch);
  });

  it('the rail shows no item count for a panel leaf', () => {
    expect(FILES_APP).toContain('fa-tree-panel-mark');
  });

  it('both panels are mounted', () => {
    expect(FILES_APP).toContain('<FilesMemoryPanel');
    expect(FILES_APP).toContain('<FilesStatisticsPanel');
  });
});
