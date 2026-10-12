/**
 * AI fix C, shared halves: bounded step errors (A5), the planner's JSON
 * extraction (A3), the study-data shelf gate (F1(c)), the execution bridge
 * accepting every provider in the table, and the media assistant's
 * study-language prompts (F7).
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_STEP_FAILED_FALLBACK,
  agentStepErrorText,
  createAgentTask,
  executeAgentTaskStep,
  updateAgentTask,
} from '../localAgent';
import { extractFirstJsonObject, parseLocalAgentModelPlan } from '../localAgentPrompt';
import { contextForAgentTarget } from '../agentCloudStudyDataGate';
import {
  defaultAgentExecutionPolicy,
  normalizeAgentExecutionRequest,
  normalizePolicy,
} from '../agentExecutionBridge';
import { AI_PROVIDERS } from '../aiProviders';
import { buildMediaStudyAssistantPrompt, normalizeMediaStudyAssistantRequest } from '../mediaStudyAssistant';

function lookupTask() {
  return createAgentTask('task-1', 'Look up a word', [{
    id: 'step-1',
    label: 'Look up',
    request: { callId: 'call-1', operation: 'dictionary.lookup', arguments: { term: '猫' } },
  }], 1);
}

describe('A5: a tool failure is always recordable', () => {
  it.each([
    ['an empty message', new Error(''), AGENT_STEP_FAILED_FALLBACK],
    ['whitespace only', new Error('   \n '), AGENT_STEP_FAILED_FALLBACK],
    ['a non-Error throw', { weird: true }, AGENT_STEP_FAILED_FALLBACK],
  ])('%s becomes the fallback sentence', async (_label, thrown, expected) => {
    const result = await executeAgentTaskStep(lookupTask(), 'step-1', {
      permission: 'read-only',
      handlers: { 'dictionary.lookup': () => { throw thrown; } },
    });
    expect(result.task.status).toBe('failed');
    expect(result.task.steps[0].error).toBe(expected);
    expect(result.events.at(-1)).toMatchObject({ type: 'tool-failed', error: expected });
  });

  it('a message over 500 characters is truncated, not thrown', async () => {
    const result = await executeAgentTaskStep(lookupTask(), 'step-1', {
      permission: 'read-only',
      handlers: { 'dictionary.lookup': async () => { throw new Error('x'.repeat(5_000)); } },
    });
    expect(result.task.status).toBe('failed');
    expect(result.task.steps[0].error!.length).toBeLessThanOrEqual(500);
    expect(result.task.steps[0].error!.endsWith('…')).toBe(true);
  });

  it('updateAgentTask itself accepts an empty fail-step error', () => {
    const running = updateAgentTask(lookupTask(), { type: 'start-step', stepId: 'step-1' }, 2);
    const failed = updateAgentTask(running, { type: 'fail-step', stepId: 'step-1', error: '' }, 3);
    expect(failed.status).toBe('failed');
    expect(failed.currentStepId).toBeUndefined();
    expect(failed.steps[0].error).toBe(AGENT_STEP_FAILED_FALLBACK);
    expect(agentStepErrorText('  two   lines\nhere ')).toBe('two lines here');
  });
});

describe('A3: the planner reads JSON wrapped in prose', () => {
  const plan = '{"summary":"Look it up","steps":[{"label":"Look up {cat}","operation":"dictionary.lookup","arguments":{"term":"猫"}}]}';

  it.each([
    ['leading prose', `Here is the plan:\n${plan}`],
    ['trailing prose', `${plan}\nLet me know if you need anything {else}.`],
    ['a fence inside prose', `Sure!\n\`\`\`json\n${plan}\n\`\`\`\nDone.`],
    ['a Qwen3 think block with braces', `<think>maybe {"summary": wrong}</think>\n${plan}`],
    ['a stray brace before the plan', `Use { carefully. ${plan}`],
  ])('accepts %s', (_label, response) => {
    const parsed = parseLocalAgentModelPlan(response, 'agent-1', 'Look up 猫', 'read-only', 1);
    expect(parsed.summary).toBe('Look it up');
    expect(parsed.task?.steps[0].request.operation).toBe('dictionary.lookup');
    expect(parsed.task?.steps[0].label).toBe('Look up {cat}');
  });

  it('still validates what it extracted', () => {
    expect(() => parseLocalAgentModelPlan('Plan: {"steps":[]}', 'a', 'o', 'read-only', 1))
      .toThrow('needs a summary');
    expect(() => parseLocalAgentModelPlan('no json here at all', 'a', 'o', 'read-only', 1))
      .toThrow('invalid plan JSON');
    expect(() => parseLocalAgentModelPlan('Plan: {"summary":"x","steps":[{"operation":"files.delete-everything"}]}', 'a', 'o', 'read-only', 1))
      .toThrow('unavailable operation');
  });

  it('returns null for unbalanced or non-object text', () => {
    expect(extractFirstJsonObject('{"summary": "never closed"')).toBeNull();
    expect(extractFirstJsonObject('[1, 2, 3]')).toBeNull();
    expect(extractFirstJsonObject('{'.repeat(10_000))).toBeNull();
  });
});

describe('F1(c): study data on the context shelf', () => {
  const shelf = [
    { id: 'a', kind: 'saved-words' },
    { id: 'b', kind: 'study-session' },
    { id: 'c', kind: 'reading-passage' },
  ];

  it('drops study-data items for a cloud target unless sharing is allowed', () => {
    expect(contextForAgentTarget(shelf, 'cloud', 'unset').context.map((entry) => entry.id)).toEqual(['c']);
    expect(contextForAgentTarget(shelf, 'cloud', 'local-only').withheld.map((entry) => entry.id)).toEqual(['a', 'b']);
    expect(contextForAgentTarget(shelf, 'cloud', 'allow').context).toHaveLength(3);
    expect(contextForAgentTarget(shelf, 'local', 'unset').context).toHaveLength(3);
  });

  it('the bridge carries the setting only when it is an explicit true', () => {
    const base = {
      requestId: 'r',
      conversationId: 'c',
      prompt: 'Hi',
      policy: defaultAgentExecutionPolicy('claude-haiku-5-5'),
      allowLocalFallback: false,
      attachments: [],
    };
    expect(normalizeAgentExecutionRequest({ ...base, shareStudyData: true })?.shareStudyData).toBe(true);
    expect(normalizeAgentExecutionRequest({ ...base, shareStudyData: 'yes' })?.shareStudyData).toBeUndefined();
    expect(normalizeAgentExecutionRequest(base)?.shareStudyData).toBeUndefined();
  });
});

describe('target picker: every provider in the table is routable', () => {
  it.each(AI_PROVIDERS.map((provider) => provider.id))('accepts %s', (providerId) => {
    const policy = normalizePolicy(defaultAgentExecutionPolicy(providerId));
    expect(policy?.target).toEqual({ kind: 'cloud', providerId });
  });

  it('still refuses an unknown id', () => {
    expect(normalizePolicy({ ...defaultAgentExecutionPolicy('openai'), target: { kind: 'cloud', providerId: 'gpt-made-up' } }))
      .toBeNull();
  });
});

describe('F7: the assistant follows the study and UI languages', () => {
  it('builds a Chinese prompt for a zh learner, answering in the UI language', () => {
    const prompt = buildMediaStudyAssistantPrompt({
      mode: 'explain-grammar',
      text: '我昨天去了北京。',
      studyLang: 'zh',
      answerLang: 'ja',
    });
    expect(prompt).toContain('Chinese immersion study assistant');
    expect(prompt).toContain('Chinese: 我昨天去了北京。');
    expect(prompt).toContain('HSK');
    expect(prompt).toContain('pinyin');
    expect(prompt).toContain('in Japanese');
    expect(prompt).not.toContain('JLPT');
  });

  it('keeps the Japanese template for ja and defaults to English answers', () => {
    const prompt = buildMediaStudyAssistantPrompt({ mode: 'simplify-japanese', text: '致し方あるまい。' });
    expect(prompt).toContain('simpler natural Japanese');
    expect(prompt).toContain('in English');
  });

  it('normalizes unknown languages to the defaults', () => {
    expect(normalizeMediaStudyAssistantRequest({ mode: 'explain-dialogue', text: 'x', studyLang: 'fr', answerLang: 'de' }))
      .toMatchObject({ studyLang: 'ja', answerLang: 'en' });
  });
});
