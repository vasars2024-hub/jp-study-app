// @vitest-environment jsdom
/**
 * a11y axe — axe-core (plus the house ARIA audit) over AI Card Studio: the form
 * with no AI configured (setup prompt), the form with a cloud key ready, and
 * the preview editor holding a batch the Agent staged.
 */
import { createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';

const READY_CONFIG = {
  apiKeysSet: { gemini: true, deepseek: false },
  engine: 'cloud',
  providerId: 'gemini-2.5-flash',
  cardCount: 3,
  outputFormat: 'anki',
};

const BATCH = {
  id: 'batch-1',
  deckLabel: 'Idioms studio',
  source: 'preset',
  results: [{
    presetId: 'idiom-slang',
    formatId: 'idiom-slang-recognition',
    expression: '猫の手も借りたい',
    reading: 'ねこのてもかりたい',
    meaning: 'extremely busy',
    sentence: '今日は猫の手も借りたいほど忙しい。',
    tags: ['idiom'],
    cards: [{
      formatId: 'idiom-slang-recognition',
      label: 'Recognition',
      front: '猫の手も借りたい',
      back: 'so busy you would take help from a cat',
      tags: ['idiom'],
    }],
  }],
};

function bridge(config: Record<string, unknown> | null, batch: unknown = null): void {
  stubBridge({
    aiGetConfig: config ?? {},
    aiListPresets: [],
    aiListFormats: [],
    ankiStatus: { connected: false, decks: [], models: [] },
    agentCardBatchTake: { ok: true, batch },
    listLibrary: [],
  });
}

beforeAll(() => {
  installJsdomShims();
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await cleanup();
});

async function mountStudio(): Promise<HTMLDivElement> {
  const { default: AiCardStudio } = await import('../components/AiCardStudio');
  const { host } = await mount(createElement(AiCardStudio), 80);
  await settle(30);
  return host;
}

describe('AI Card Studio — axe-core', () => {
  it('no AI configured', async () => {
    bridge(null);
    const host = await mountStudio();
    expect(host.textContent?.length, 'painted').toBeGreaterThan(40);
    expect(host.querySelectorAll('button, select, input').length, 'controls painted').toBeGreaterThan(2);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('a cloud key ready', async () => {
    bridge(READY_CONFIG);
    const host = await mountStudio();
    expect(host.querySelectorAll('select, input').length, 'form fields painted').toBeGreaterThan(1);
    host.querySelectorAll<HTMLDetailsElement>('details').forEach((d) => { d.open = true; });
    await settle(20);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('the preview editor holding an Agent-staged batch', async () => {
    bridge(READY_CONFIG, BATCH);
    const host = await mountStudio();
    expect(host.textContent, 'staged batch previewed').toContain('猫の手も借りたい');
    expect(await a11yViolations(host)).toEqual([]);
  });
});
