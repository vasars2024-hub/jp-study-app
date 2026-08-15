import { describe, expect, it } from 'vitest';
import {
  EXPLANATION_SECTION_LABEL_KEYS,
  explainErrorLabelKey,
  explainGroundingFromSenses,
  explainPolicyFromEngine,
} from '../lexiconExplainView';
import { EXPLANATION_SECTION_KINDS } from '../lexiconExplanations';
import { EXPLAIN_GLOSS_MAX_CHARS, EXPLAIN_MAX_GLOSSES, explainModelKey } from '../lexiconExplainPrompt';
import { en } from '../i18n/catalogs/en';

describe('section labels', () => {
  it('names every kind the store accepts, and names each one once', () => {
    const keys = EXPLANATION_SECTION_KINDS.map((kind) => EXPLANATION_SECTION_LABEL_KEYS[kind]);
    expect(keys.filter(Boolean)).toHaveLength(EXPLANATION_SECTION_KINDS.length);
    expect(new Set(keys).size).toBe(EXPLANATION_SECTION_KINDS.length);
  });

  it('has a catalog entry for every label it renders', () => {
    for (const kind of EXPLANATION_SECTION_KINDS) {
      expect(en[EXPLANATION_SECTION_LABEL_KEYS[kind]], kind).toBeTruthy();
    }
  });
});

describe('explainErrorLabelKey', () => {
  // The four are `LexiconExplainError`'s members, written out rather than
  // imported: the union lives in main, and this map must not depend on it.
  it('gives each documented failure its own message', () => {
    const keys = ['invalid-request', 'provider-failed', 'unparsable', 'not-stored']
      .map((error) => explainErrorLabelKey(error));
    expect(new Set(keys).size).toBe(4);
    for (const key of keys) expect(en[key]).toBeTruthy();
  });

  it('falls back to a message that exists for an unknown or absent code', () => {
    expect(explainErrorLabelKey(undefined)).toBe('lexicon.wordExplain.failedUnknown');
    expect(explainErrorLabelKey('something-new')).toBe('lexicon.wordExplain.failedUnknown');
    expect(en['lexicon.wordExplain.failedUnknown']).toBeTruthy();
  });
});

describe('explainPolicyFromEngine', () => {
  it('refuses a cloud provider whose key is not set, before anything is sent', () => {
    expect(explainPolicyFromEngine({
      engine: 'cloud',
      providerId: 'gemini-2.5-flash',
      apiKeysSet: { gemini: false, deepseek: true },
    })).toEqual({ ok: false, blocked: 'cloud-key' });
  });

  it('reads the key bucket of the selected provider, not the default one', () => {
    const resolved = explainPolicyFromEngine({
      engine: 'cloud',
      providerId: 'deepseek-v4-pro',
      apiKeysSet: { gemini: false, deepseek: true },
    });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.policy.target).toEqual({ kind: 'cloud', providerId: 'deepseek-v4-pro' });
    expect(resolved.policy.allowCloud).toBe(true);
  });

  it('refuses the local engine when the model file is not on disk', () => {
    expect(explainPolicyFromEngine({ engine: 'local-qwen' }))
      .toEqual({ ok: false, blocked: 'local-model' });
  });

  it('sends the local engine nowhere: a local policy never allows cloud', () => {
    const resolved = explainPolicyFromEngine({ engine: 'local-qwen', localModelAvailable: true });
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.policy.target).toEqual({ kind: 'local', backend: 'local-qwen' });
    expect(resolved.policy.allowCloud).toBe(false);
  });

  it('produces a cache key that distinguishes the providers', () => {
    const gemini = explainPolicyFromEngine({
      engine: 'cloud',
      providerId: 'gemini-2.5-flash',
      apiKeysSet: { gemini: true, deepseek: false },
    });
    const local = explainPolicyFromEngine({ engine: 'local-qwen', localModelAvailable: true });
    if (!gemini.ok || !local.ok) throw new Error('expected both engines to resolve');
    expect(explainModelKey(gemini.policy)).toBe('cloud:gemini-2.5-flash:default');
    expect(explainModelKey(local.policy)).toBe('local:local-qwen:default');
  });
});

describe('explainGroundingFromSenses', () => {
  it('keeps the entry order and drops a gloss two senses repeat', () => {
    expect(explainGroundingFromSenses([
      { partsOfSpeech: ['noun'], definitions: ['cat', 'feline'] },
      { partsOfSpeech: ['noun'], definitions: ['Cat', 'wheelbarrow'] },
    ])).toEqual({ glosses: ['cat', 'feline', 'wheelbarrow'], partsOfSpeech: ['noun'] });
  });

  it('bounds a long entry before it crosses IPC', () => {
    const grounding = explainGroundingFromSenses(
      Array.from({ length: 40 }, (_, i) => ({ definitions: [`sense ${i}`] })),
    );
    expect(grounding.glosses).toHaveLength(EXPLAIN_MAX_GLOSSES);
    expect(grounding.glosses[0]).toBe('sense 0');
  });

  it('truncates one enormous gloss rather than dropping it', () => {
    const grounding = explainGroundingFromSenses([{ definitions: ['x'.repeat(5_000)] }]);
    expect(grounding.glosses[0]).toHaveLength(EXPLAIN_GLOSS_MAX_CHARS);
  });

  it('omits partsOfSpeech entirely when the entry states none', () => {
    expect(explainGroundingFromSenses([{ definitions: ['cat'] }]))
      .toEqual({ glosses: ['cat'] });
    expect(explainGroundingFromSenses(undefined)).toEqual({ glosses: [] });
  });
});
