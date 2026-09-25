// The claim under test: the prompt asks for exactly the shape the parser reads,
// the parser survives the wrappings models actually put JSON in, and it refuses
// rather than inventing an answer when the reply is not one.
import { describe, expect, it } from 'vitest';
import {
  EXPLAIN_GLOSS_MAX_CHARS,
  EXPLAIN_MAX_GLOSSES,
  buildExplanationPrompt,
  explainModelKey,
  explanationProseLanguage,
  extractJsonBlock,
  parseExplanationReply,
  readExplainGrounding,
  readExplainTarget,
} from '../lexiconExplainPrompt';
import {
  EXPLANATION_PROMPT_VERSION,
  EXPLANATION_SECTION_KINDS,
} from '../lexiconExplanations';
import type { AgentProviderPolicy } from '../agentWorkspace';

const GROUNDING = { glosses: ['cat', 'feline'], partsOfSpeech: ['n'] };

describe('the prompt', () => {
  it('is pinned, because the cache is keyed on its version', () => {
    // If this assertion fails you changed the question. Bump
    // EXPLANATION_PROMPT_VERSION in `lexiconExplanations.ts` in the same commit,
    // or every cached answer is served for a question no longer being asked.
    expect(EXPLANATION_PROMPT_VERSION).toBe(1);
    expect(buildExplanationPrompt('猫', 'ねこ', 'en', GROUNDING)).toBe(
      [
        'Explain the word 猫 (ねこ) to a Japanese learner.',
        'Write every value in English.',
        '',
        'Dictionary material already shown to the reader:',
        '- cat',
        '- feline',
        '',
        'Parts of speech: n',
        '',
        'Return one JSON object and nothing else:',
        '{"summary": "...", "sections": [{"kind": "...", "body": "..."}]}',
        '',
        `"kind" must be one of: ${EXPLANATION_SECTION_KINDS.join(', ')}.`,
        'Use a kind at most once. Include only the ones you have something real to say about.',
        'Do not repeat the dictionary glosses back; say what they leave out.',
        'Keep "summary" to one or two sentences and each "body" under 120 words.',
        'If you are not confident about a point, leave that section out rather than guessing.',
      ].join('\n'),
    );
  });

  it('names the prose language rather than passing a tag through', () => {
    expect(buildExplanationPrompt('猫', '', 'ru', GROUNDING)).toContain('Write every value in Russian.');
    // A tag the prompt cannot name falls back to English rather than asking for
    // prose in a language the surface would then label wrongly.
    expect(explanationProseLanguage('pt-BR')).toBe('English');
    expect(explanationProseLanguage('JA')).toBe('Japanese');
  });

  it('does not repeat the reading when it is the word', () => {
    expect(buildExplanationPrompt('ねこ', 'ねこ', 'en', GROUNDING)).toContain(
      'Explain the word ねこ to a Japanese learner.',
    );
  });

  it('says so plainly when the entry has no glosses to ground on', () => {
    expect(buildExplanationPrompt('猫', '', 'en', { glosses: [] })).toContain('- (none)');
  });

  it('bounds a long entry so one explanation is not a large paid request', () => {
    const prompt = buildExplanationPrompt('猫', '', 'en', {
      glosses: Array.from({ length: 40 }, (_, index) => `gloss ${index} ${'x'.repeat(400)}`),
    });
    expect(prompt.split('\n').filter((line) => line.startsWith('- gloss'))).toHaveLength(EXPLAIN_MAX_GLOSSES);
    expect(prompt).not.toContain('x'.repeat(EXPLAIN_GLOSS_MAX_CHARS + 1));
  });
});

describe('reading a reply back', () => {
  const good = '{"summary":"A cat.","sections":[{"kind":"nuance","body":"Unmarked."}]}';

  it('accepts bare JSON', () => {
    expect(parseExplanationReply(good)).toEqual({
      summary: 'A cat.',
      sections: [{ kind: 'nuance', body: 'Unmarked.' }],
    });
  });

  it('accepts a fenced block with prose around it', () => {
    const reply = `Sure, here you go:\n\`\`\`json\n${good}\n\`\`\`\nHope that helps!`;
    expect(parseExplanationReply(reply)?.summary).toBe('A cat.');
  });

  it('accepts an unfenced object with a preamble', () => {
    expect(parseExplanationReply(`Here is the answer: ${good}`)?.summary).toBe('A cat.');
  });

  it('drops a heading the surface has no label for rather than the whole answer', () => {
    const reply = '{"summary":"A cat.","sections":[{"kind":"vibes","body":"?"},{"kind":"grammar","body":"Noun."}]}';
    expect(parseExplanationReply(reply)?.sections).toEqual([{ kind: 'grammar', body: 'Noun.' }]);
  });

  it('refuses rather than inventing an answer', () => {
    // Every one of these is a real failure a model produces, and every one must
    // reach the caller as "ask again", never as a cached blank.
    expect(parseExplanationReply('I am not able to help with that.')).toBeNull();
    expect(parseExplanationReply('{"summary": "unterminated')).toBeNull();
    expect(parseExplanationReply('{"summary":"","sections":[]}')).toBeNull();
    expect(parseExplanationReply('[]')).toBeNull();
    expect(parseExplanationReply('')).toBeNull();
    expect(parseExplanationReply(null)).toBeNull();
  });

  it('takes the first brace through the last', () => {
    expect(extractJsonBlock('noise {"a":1} noise')).toBe('{"a":1}');
    expect(extractJsonBlock('no object here')).toBe('');
  });
});

describe('the model half of the cache key', () => {
  const cloud = (model?: string): AgentProviderPolicy => ({
    target: { kind: 'cloud', providerId: 'gemini-2.5-flash', ...(model ? { model } : {}) },
    allowCloud: true,
    cache: 'off',
  } as AgentProviderPolicy);

  it('is derived from the policy, and separates local from cloud', () => {
    expect(explainModelKey(cloud('gemini-2.5-flash'))).toBe('cloud:gemini-2.5-flash:gemini-2.5-flash');
    expect(explainModelKey(cloud())).toBe('cloud:gemini-2.5-flash:default');
    expect(explainModelKey({
      target: { kind: 'local', backend: 'local-qwen', model: 'qwen3-4b' },
      allowCloud: false,
      cache: 'off',
    } as AgentProviderPolicy)).toBe('local:local-qwen:qwen3-4b');
  });
});

describe('what an untrusted caller may send', () => {
  it('requires a word and a prose language', () => {
    expect(readExplainTarget({ lang: 'ja', text: '猫', reading: 'ねこ', glossLang: 'en' }))
      .toEqual({ lang: 'ja', text: '猫', reading: 'ねこ', glossLang: 'en' });
    expect(readExplainTarget({ lang: 'ja', text: '猫', reading: 'ねこ' })).toBeNull();
    expect(readExplainTarget({ text: '猫', glossLang: 'en' })).toBeNull();
    expect(readExplainTarget(null)).toBeNull();
  });

  it('bounds and cleans the grounding', () => {
    const grounding = readExplainGrounding({
      glosses: ['  cat  ', '', 42, 'y'.repeat(500), ...Array.from({ length: 30 }, () => 'more')],
      partsOfSpeech: ['n', ' v '],
    });
    expect(grounding.glosses[0]).toBe('cat');
    expect(grounding.glosses).toHaveLength(EXPLAIN_MAX_GLOSSES);
    expect(grounding.glosses.every((gloss) => gloss.length <= EXPLAIN_GLOSS_MAX_CHARS)).toBe(true);
    expect(grounding.partsOfSpeech).toEqual(['n', 'v']);
    expect(readExplainGrounding(undefined)).toEqual({ glosses: [], partsOfSpeech: [] });
  });
});

describe('prompts name the study language', () => {
  it('explanations, AI additions and invented decks are for the word\'s own language', async () => {
    expect(buildExplanationPrompt('书', 'shū', 'en', GROUNDING, 'zh')).toContain('to a Chinese learner.');
    expect(buildExplanationPrompt('книга', '', 'en', GROUNDING, 'ru')).toContain('to a Russian learner.');
    const { buildAiAdditionsPrompt, normalizeAiAdditionsRequest } = await import('../ankiAiPrompt');
    const request = normalizeAiAdditionsRequest({
      kind: 'example-sentence', notes: [{ noteId: '1', term: 'книга' }], variantCount: 1, sendGloss: false,
      explainLanguage: 'en', studyLang: 'ru',
    });
    const prompt = buildAiAdditionsPrompt(request!, request!.notes);
    expect(prompt).toContain('Russian flashcards');
    expect(prompt).toContain('natural Russian sentence');
    expect(prompt).not.toContain('Japanese');
  });
});
