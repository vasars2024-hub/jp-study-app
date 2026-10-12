// @vitest-environment jsdom
/**
 * The grammar, statistics, planning, settings and Blanc AI helpers as rendered,
 * against a fake bridge (no provider, no model). What is pinned:
 *
 * - each panel shows its deterministic fallback when the AI cannot answer;
 * - spinner + Cancel while a request runs, and Cancel aborts by request id;
 * - nothing is written (rating, examples, targets) until the learner presses it;
 * - the settings fallback can only ever show settings that exist in the registry.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const readiness = vi.hoisted(() => ({ loaded: true, enabled: true }));
vi.mock('../aiSetupClient', () => ({
  useAiReadiness: () => ({ ...readiness, ready: true, cloudReady: true, localReady: false, engine: 'cloud' }),
  openAiSettings: vi.fn(),
}));

import { GrammarExamplesAi, GrammarProductionAi } from '../components/grammar/GrammarAiTools';
import StatsAiCoach from '../components/stats/StatsAiCoach';
import EventQuickEntry from '../components/calendar/EventQuickEntry';
import { BlancMistakeAi } from '../components/blanc/BlancAiAssist';
import { answerSettingsQuestionWithModel, settingsEntriesForModelIds, settingsModelCandidates } from '../settingsAssistant';
import { userExamplesFor } from '../data/grammar/userExamples';
import { DAILY_GOAL_STORAGE_KEY, setDailyGoalTargets } from '../dailyGoal';

const api = {
  aiTutorGrammarProduction: vi.fn(),
  aiTutorGrammarExamples: vi.fn(),
  aiTutorStatsCoach: vi.fn(),
  aiTutorEventParse: vi.fn(),
  aiTutorBlancMistake: vi.fn(),
  aiStudyCancel: vi.fn(async () => true),
};

const point = {
  id: 'tutor-test-point',
  title: '〜ようにする',
  meaning: 'to make an effort to',
  structure: '〜ようにする',
  explanation: 'to make an effort to',
  level: 'N4' as const,
  lang: 'ja' as const,
  examples: [],
};

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
});

beforeEach(() => {
  localStorage.clear();
  for (const fn of Object.values(api)) fn.mockReset();
  api.aiStudyCancel.mockResolvedValue(true);
  readiness.loaded = true;
  readiness.enabled = true;
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function render(node: React.ReactNode): Promise<void> {
  await act(async () => {
    root = createRoot(host);
    root.render(node);
  });
}

function button(label: RegExp): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => label.test(b.textContent ?? '') || label.test(b.getAttribute('aria-label') ?? ''));
  if (!found) throw new Error(`no button ${label}: ${host.textContent}`);
  return found as HTMLButtonElement;
}

async function click(el: HTMLElement): Promise<void> {
  await act(async () => {
    el.click();
  });
}

async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => {
    const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('grammar production practice', () => {
  it('suggests a rating from the AI and applies it only on press', async () => {
    api.aiTutorGrammarProduction.mockResolvedValue({
      ok: true,
      result: { usesPattern: true, correct: true, natural: true, explanation: 'Good use.', corrected: '', suggestedRating: 'good' },
    });
    const onUseRating = vi.fn();
    await render(<GrammarProductionAi point={point} ratingLabel={(r) => r.toUpperCase()} onUseRating={onUseRating} />);
    await type(host.querySelector('input') as HTMLInputElement, '野菜を食べるようにしています。');
    await click(button(/aiTutor\.production\.check|Check/));
    expect(api.aiTutorGrammarProduction).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Good use.');
    expect(onUseRating).not.toHaveBeenCalled();
    await click(button(/GOOD/));
    expect(onUseRating).toHaveBeenCalledWith('good');
  });

  it('falls back to the offline check when the AI is not allowed', async () => {
    api.aiTutorGrammarProduction.mockResolvedValue({ ok: false, code: 'consent', needsConsent: true });
    const onUseRating = vi.fn();
    await render(<GrammarProductionAi point={point} ratingLabel={(r) => r} onUseRating={onUseRating} />);
    await type(host.querySelector('input') as HTMLInputElement, '野菜を食べる。');
    await click(button(/Check/));
    expect(host.querySelector('.ai-tutor-fallback')).not.toBeNull();
    // Pattern missing → the offline suggestion is Hard, still only applied on press.
    expect(onUseRating).not.toHaveBeenCalled();
    await click(button(/hard/));
    expect(onUseRating).toHaveBeenCalledWith('hard');
  });

  it('AI off: no request at all, the offline check still works', async () => {
    readiness.enabled = false;
    await render(<GrammarProductionAi point={point} ratingLabel={(r) => r} onUseRating={vi.fn()} />);
    await type(host.querySelector('input') as HTMLInputElement, '早く寝るようにする。');
    await click(button(/Check/));
    expect(api.aiTutorGrammarProduction).not.toHaveBeenCalled();
    expect(host.querySelector('.ai-tutor-fallback')).not.toBeNull();
  });
});

describe('generated grammar examples', () => {
  it('saves only the ticked sentences, marked generated, on press', async () => {
    api.aiTutorGrammarExamples.mockResolvedValue({
      ok: true,
      result: { sentences: [
        { text: '野菜を食べるようにしている。', reading: '', translation: 'I try to eat vegetables.' },
        { text: '早く寝るようにする。', reading: '', translation: 'I will try to sleep early.' },
      ] },
    });
    await render(<GrammarExamplesAi point={point} existing={[]} onClose={vi.fn()} />);
    expect(userExamplesFor(point.id)).toEqual([]);
    const boxes = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes).toHaveLength(2);
    await click(boxes[1]);
    await click(button(/Save/));
    const saved = userExamplesFor(point.id);
    expect(saved.map((e) => e.jp)).toEqual(['野菜を食べるようにしている。']);
    expect(saved[0].generated).toBe(true);
  });
});

describe('Explain my stats', () => {
  const entries = Array.from({ length: 40 }, (_, i) => ({ at: Date.now() - i * 3_600_000, mode: 'review', correct: i % 3 !== 0, prevIntervalDays: 10 }));

  it('shows rule-based tips without AI, and the withheld note when study data may not leave', async () => {
    api.aiTutorStatsCoach.mockResolvedValue({ ok: false, code: 'consent', studyDataWithheld: true });
    await render(<StatsAiCoach entries={entries as never} deck={[]} rangeDays={30} now={Date.now()} onClose={vi.fn()} />);
    expect(host.querySelectorAll('.ai-tutor-fallback li').length).toBeGreaterThanOrEqual(3);
    await click(button(/aiTutor\.stats\.ask|Ask the AI/));
    const sent = api.aiTutorStatsCoach.mock.calls[0][0] as { digest: Record<string, unknown>; shareStudyData: string };
    expect(sent.shareStudyData).toBe('unset');
    expect(Object.keys(sent.digest)).not.toContain('cards');
    expect(host.textContent).toMatch(/stay on this device|aiTutor\.studyDataWithheld/);
    expect(host.querySelectorAll('.ai-tutor-fallback li').length).toBeGreaterThanOrEqual(3);
  });

  it('spinner with Cancel while running; Cancel aborts by request id', async () => {
    api.aiTutorStatsCoach.mockImplementation(() => new Promise(() => undefined));
    await render(<StatsAiCoach entries={entries as never} deck={[]} rangeDays={30} now={Date.now()} onClose={vi.fn()} />);
    await click(button(/Ask the AI|aiTutor\.stats\.ask/));
    expect(host.querySelector('.ai-study-spinner')).not.toBeNull();
    await click(button(/^Cancel$|aiStudy\.cancel/));
    expect(api.aiStudyCancel).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.ai-study-spinner')).toBeNull();
  });
});

describe('event quick entry', () => {
  it('fills from the deterministic parser without AI and only applies on press', async () => {
    const onApply = vi.fn();
    await render(<EventQuickEntry onApply={onApply} onClose={vi.fn()} />);
    await type(host.querySelector('input') as HTMLInputElement, 'study kanji every Tue/Thu 7pm for 30 min');
    await click(button(/Fill in|aiTutor\.event\.fill/));
    expect(api.aiTutorEventParse).not.toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
    await click(button(/Use these details|aiTutor\.event\.apply/));
    const [draft, extra] = onApply.mock.calls[0];
    expect(draft).toMatchObject({ title: 'study kanji', startTime: '19:00', endTime: '19:30', recurrence: 'weekly', weekdays: [2, 4] });
    expect(extra).toHaveLength(1);
  });
});

describe('Blanc: explain my mistake', () => {
  it('shows where the answers part when the AI fails', async () => {
    api.aiTutorBlancMistake.mockResolvedValue({ ok: false, code: 'invalid' });
    await render(
      <BlancMistakeAi kind="conjugation" word="書く" reading="かく" meaning="to write" task="te" expected="書いて" typed="書きて" onClose={vi.fn()} />,
    );
    expect(api.aiTutorBlancMistake).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.ai-tutor-fallback')?.textContent).toContain('いて');
  });

  it('does not call anything while AI is off', async () => {
    readiness.enabled = false;
    await render(
      <BlancMistakeAi kind="counter" word="3本" reading="さんぼん" meaning="" task="" expected="さんぼん" typed="さんほん" onClose={vi.fn()} />,
    );
    expect(api.aiTutorBlancMistake).not.toHaveBeenCalled();
    expect(host.querySelector('.ai-tutor-fallback')?.textContent).toContain('ぼん');
  });
});

describe('settings model fallback', () => {
  const t = (key: string) => key;

  it('is not asked when the keyword search found something', async () => {
    const askModel = vi.fn();
    const answer = await answerSettingsQuestionWithModel('language', t, { advanced: true }, askModel);
    expect(answer.strategy).not.toBe('model');
    expect(askModel).not.toHaveBeenCalled();
  });

  it('keeps only ids that exist in the registry', async () => {
    const candidates = settingsModelCandidates(t, { advanced: true });
    expect(candidates.length).toBeGreaterThan(50);
    const real = candidates[0].id;
    const askModel = vi.fn(async () => ['invented-setting', real, real]);
    const answer = await answerSettingsQuestionWithModel('how do I print a fax to my toaster', t, { advanced: true }, askModel);
    expect(askModel).toHaveBeenCalledTimes(1);
    expect(answer.strategy).toBe('model');
    expect(answer.entries.map((e) => e.id)).toEqual([real]);
    expect(settingsEntriesForModelIds(['nope'], { advanced: true })).toEqual([]);
  });

  it('a model that names nothing real leaves the honest "none"', async () => {
    const answer = await answerSettingsQuestionWithModel('how do I print a fax to my toaster', t, { advanced: true }, async () => ['x']);
    expect(answer).toMatchObject({ strategy: 'none', entries: [] });
    const failed = await answerSettingsQuestionWithModel('how do I print a fax to my toaster', t, { advanced: true }, async () => null);
    expect(failed.strategy).toBe('none');
  });
});

describe('daily goal targets', () => {
  it('apply writes the overrides, dropping metrics equal to the profile default', () => {
    setDailyGoalTargets({ reviews: 120, newCards: 10, minutes: 45 });
    const stored = JSON.parse(localStorage.getItem(DAILY_GOAL_STORAGE_KEY) ?? '{}') as Record<string, number>;
    expect(stored).toMatchObject({ reviews: 120, minutes: 45 });
  });
});
