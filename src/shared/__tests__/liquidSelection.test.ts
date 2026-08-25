// L5's selection contract: the normalizer, the identity rule, and the one place
// where a mapping mistake would leak the user's own words into a kind the agent's
// store is allowed to write to disk.
import { describe, expect, it } from 'vitest';
import {
  LIQUID_SELECTION_APPS,
  LIQUID_SELECTION_KINDS,
  LIQUID_SELECTION_PREVIEW_MAX,
  SELECTION_AGENT_KIND,
  agentContextInputFromSelection,
  createLiquidSelection,
  sameLiquidSelection,
} from '../liquidSelection';
import { agentContextSensitivityFloor, createAgentContextItem } from '../agentContext';

const base = { app: 'dictionary', kind: 'entry', label: '猫' } as const;

describe('createLiquidSelection', () => {
  it('normalizes whitespace and keeps the label as the identity when the app has no id', () => {
    const selection = createLiquidSelection({ ...base, label: '  子\n猫  ' });
    expect(selection?.label).toBe('子 猫');
    expect(selection?.entityId).toBe('子 猫');
  });

  it('returns null rather than an inspector with a blank heading', () => {
    expect(createLiquidSelection({ ...base, label: '   ' })).toBeNull();
    expect(createLiquidSelection({ ...base, label: '' })).toBeNull();
  });

  it('refuses an app or a kind it does not know', () => {
    expect(createLiquidSelection({ ...base, app: 'reading' as never })).toBeNull();
    expect(createLiquidSelection({ ...base, kind: 'cue' as never })).toBeNull();
  });

  it('bounds the preview at the inspector budget, not the agent shelf budget', () => {
    const selection = createLiquidSelection({
      ...base,
      preview: 'あ'.repeat(LIQUID_SELECTION_PREVIEW_MAX + 500),
    });
    expect(selection?.preview.length).toBe(LIQUID_SELECTION_PREVIEW_MAX);
  });

  it('accepts every declared app and kind', () => {
    for (const app of LIQUID_SELECTION_APPS) {
      for (const kind of LIQUID_SELECTION_KINDS) {
        expect(createLiquidSelection({ app, kind, label: 'x' })).not.toBeNull();
      }
    }
  });
});

describe('sameLiquidSelection', () => {
  it('does not confuse two apps that share an id', () => {
    const dict = createLiquidSelection({ app: 'dictionary', kind: 'entry', label: 'a', entityId: '4211' });
    const grammar = createLiquidSelection({ app: 'grammar', kind: 'pattern', label: 'a', entityId: '4211' });
    expect(sameLiquidSelection(dict, grammar)).toBe(false);
    expect(sameLiquidSelection(dict, dict)).toBe(true);
  });

  it('is false when either side is absent', () => {
    const dict = createLiquidSelection(base);
    expect(sameLiquidSelection(dict, null)).toBe(false);
    expect(sameLiquidSelection(null, null)).toBe(false);
  });
});

describe('agentContextInputFromSelection', () => {
  it('produces an input the agent shelf actually accepts', () => {
    const selection = createLiquidSelection({
      app: 'translate', kind: 'span', label: '猫が好き', preview: 'source line', route: '#/translate',
    });
    const item = createAgentContextItem(agentContextInputFromSelection(selection!, 1000));
    expect(item).not.toBeNull();
    expect(item?.kind).toBe('selected-text');
    expect(item?.label).toBe('猫が好き');
    expect(item?.source.app).toBe('translate');
    expect(item?.source.route).toBe('#/translate');
  });

  it('scopes identity by app so two apps cannot collide into one shelf slot', () => {
    const dict = createLiquidSelection({ app: 'dictionary', kind: 'entry', label: 'a', entityId: '7' });
    const grammar = createLiquidSelection({ app: 'grammar', kind: 'pattern', label: 'a', entityId: '7' });
    const left = createAgentContextItem(agentContextInputFromSelection(dict!, 1));
    const right = createAgentContextItem(agentContextInputFromSelection(grammar!, 1));
    expect(left?.id).not.toBe(right?.id);
  });

  it('never maps the user own words onto a kind with a looser privacy floor', () => {
    // The rule the mapping table exists to keep. `span` and `message` are the
    // user's material; a floor of `ordinary` would let the agent store retain
    // them to disk without being asked.
    expect(agentContextSensitivityFloor(SELECTION_AGENT_KIND.span)).toBe('personal');
    expect(agentContextSensitivityFloor(SELECTION_AGENT_KIND.message)).toBe('personal');
    // Reference data is correctly `ordinary` — this is the control that proves
    // the assertion above is discriminating rather than trivially true.
    expect(agentContextSensitivityFloor(SELECTION_AGENT_KIND.entry)).toBe('ordinary');
    expect(agentContextSensitivityFloor(SELECTION_AGENT_KIND.pattern)).toBe('ordinary');
  });

  it('every declared kind has a mapping', () => {
    for (const kind of LIQUID_SELECTION_KINDS) {
      expect(SELECTION_AGENT_KIND[kind]).toBeTruthy();
    }
  });
});

describe('the two producers built on the contract', () => {
  it('grammar shelves a pattern as reference data, keyed by its id and not its title', async () => {
    const { grammarPatternAgentContext } = await import('../../renderer/agentContextHandoff');
    const input = grammarPatternAgentContext('g-0417', '〜てしまう', 'completion or regret', 5);
    const item = createAgentContextItem(input);
    expect(item?.kind).toBe('dictionary-entry');
    expect(item?.label).toBe('〜てしまう');
    expect(item?.source.app).toBe('grammar');
    expect(item?.source.entityId).toBe('g-0417');
    expect(item?.id).toBe('dictionary-entry:grammar/pattern/g-0417');
    // A renamed pattern is still the same shelf item.
    const renamed = createAgentContextItem(
      grammarPatternAgentContext('g-0417', 'te-shimau', 'completion or regret', 5),
    );
    expect(renamed?.id).toBe(item?.id);
  });

  it('translate shelves a span as the user own words, so it is not written to disk', async () => {
    const { translateSpanAgentContext } = await import('../../renderer/agentContextHandoff');
    const item = createAgentContextItem(translateSpanAgentContext('  猫が\n好き  ', 'ja', 5));
    expect(item?.kind).toBe('selected-text');
    expect(item?.label).toBe('猫が 好き');
    expect(item?.source.app).toBe('translate');
    // The control: `retained` is refused for anything above `ordinary`, which is
    // what keeps a span out of the persisted store.
    expect(item?.retained).not.toBe(true);
  });

  it('an empty span produces nothing rather than a blank shelf row', async () => {
    const { translateSpanAgentContext } = await import('../../renderer/agentContextHandoff');
    expect(createAgentContextItem(translateSpanAgentContext('   ', 'ja', 5))).toBeNull();
  });
});
