// @vitest-environment jsdom
/**
 * onb3 — the first-run placement check (`FirstRunAi.tsx`, default export).
 *
 * What it must do: render the AI's quiz with its study-language content tagged
 * as such (the prompts are UI-language text quoting Japanese), grade against
 * the quiz's own key and offer the suggested level, and keep Escape to itself —
 * the setup dialog around it treats Escape as "Later", which closed setup and
 * threw a freshly written quiz away.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';
import type { PlacementItem } from '../../shared/aiOnboarding';

vi.mock('../aiSetupClient', () => ({
  useAiReadiness: () => ({ loaded: true, enabled: true, ready: true, engine: 'local' }),
  openAiSettings: () => undefined,
}));

import PlacementQuiz, { studyLangRuns } from '../components/onboarding/FirstRunAi';

const en = (key: string, vars: Record<string, string | number> = {}): string => {
  const entry = CATALOGS.en[key];
  const text = typeof entry === 'string' ? entry : entry ? entry.other : key;
  return text.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
};

const ITEMS: PlacementItem[] = [
  { level: 0, word: '猫', prompt: 'What does 「猫」 mean?', choices: ['cat', 'dog', 'bird', 'fish'], answer: 0 },
  { level: 0, word: '水', prompt: 'What does 「水」 mean?', choices: ['fire', 'water', 'tree', 'sky'], answer: 1 },
  { level: 1, word: '食べる', prompt: 'Which word means "to eat"?', choices: ['食べる', '飲む', '見る', '行く'], answer: 0 },
];

let root: Root | null = null;
let host: HTMLDivElement;
let resolveQuiz: ((value: unknown) => void) | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  resolveQuiz = null;
  (window as unknown as { api: unknown }).api = {
    aiTutorPlacementQuiz: vi.fn(
      () =>
        new Promise((resolve) => {
          resolveQuiz = resolve;
        }),
    ),
    aiStudyCancel: vi.fn(async () => ({ ok: true })),
  };
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function mount(props: Partial<Parameters<typeof PlacementQuiz>[0]> = {}) {
  const onLevel = vi.fn();
  const onClose = vi.fn();
  const outerKeyDown = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(
      // Stands in for the setup card, whose own Escape means "Later".
      <div onKeyDown={(event) => outerKeyDown(event.key)}>
        <PlacementQuiz studyLang="ja" onLevel={onLevel} onClose={onClose} {...props} />
      </div>,
    );
  });
  return { onLevel, onClose, outerKeyDown };
}

const button = (label: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);

async function startQuiz(): Promise<void> {
  await act(async () => {
    button(en('aiTutor.placement.start'))?.click();
  });
  await act(async () => {
    resolveQuiz?.({ ok: true, result: { items: ITEMS } });
  });
}

const escapeOn = async (target: Element | null): Promise<void> => {
  await act(async () => {
    target?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  });
};

describe('PlacementQuiz', () => {
  it('renders the quiz with study-language content tagged in the study language', async () => {
    await mount();
    expect(host.querySelector('[data-placement-quiz]')?.getAttribute('aria-label')).toBe(en('aiTutor.placement.title'));
    await startQuiz();
    const items = host.querySelectorAll('.ai-tutor-quiz > li');
    expect(items).toHaveLength(ITEMS.length);
    // The prompt is English around a quoted Japanese word: only the word is Japanese.
    const legend = items[0].querySelector('legend');
    expect(legend?.textContent).toContain('What does 「猫」 mean?');
    const tagged = [...(legend?.querySelectorAll('[lang="ja"]') ?? [])].map((el) => el.textContent);
    expect(tagged).toEqual(['「猫」']);
    // English choices carry no Japanese tag; Japanese choices do.
    expect(items[0].querySelectorAll('label [lang="ja"]')).toHaveLength(0);
    const jaChoices = [...items[2].querySelectorAll('label [lang="ja"]')].map((el) => el.textContent);
    expect(jaChoices).toEqual(['食べる', '飲む', '見る', '行く']);
    // The level label of every item comes from the study language's scale.
    expect(legend?.textContent).toContain('N5');
  });

  it('grades against the quiz key and applies the suggested level', async () => {
    const { onLevel } = await mount();
    await startQuiz();
    const radios = (item: number) => host.querySelectorAll<HTMLInputElement>(`input[name="frs-placement-${item}"]`);
    expect(button(en('aiTutor.placement.grade'))?.disabled).toBe(true);
    await act(async () => {
      radios(0)[0].click();
      radios(1)[1].click();
      radios(2)[0].click();
    });
    await act(async () => {
      button(en('aiTutor.placement.grade'))?.click();
    });
    expect(host.textContent).toContain(en('aiTutor.placement.score', { right: 3, total: 3 }));
    await act(async () => {
      button(en('aiTutor.placement.use'))?.click();
    });
    expect(onLevel).toHaveBeenCalledWith('elementary');
  });

  it('keeps Escape to itself: it closes the quiz, never the dialog around it', async () => {
    const { onClose, outerKeyDown } = await mount();
    await startQuiz();
    await escapeOn(host.querySelector('input[name="frs-placement-0"]'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(outerKeyDown).not.toHaveBeenCalled();
    // The sample textarea is inside the quiz too.
    await escapeOn(host.querySelector('.ai-tutor-fallback textarea'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(outerKeyDown).not.toHaveBeenCalled();
    // Other keys still reach the dialog (its Tab trap lives there).
    await act(async () => {
      host.querySelector('textarea')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(outerKeyDown).toHaveBeenCalledWith('Tab');
  });

  it('Escape while the quiz is being written stops that request and stays open', async () => {
    const { onClose, outerKeyDown } = await mount();
    await act(async () => {
      button(en('aiTutor.placement.start'))?.click();
    });
    await escapeOn(host.querySelector('[data-placement-quiz] button'));
    expect(onClose).not.toHaveBeenCalled();
    expect(outerKeyDown).not.toHaveBeenCalled();
    expect(host.querySelector('[data-placement-quiz]')).not.toBeNull();
    expect(button(en('aiTutor.placement.start'))).toBeTruthy();
  });
});

describe('studyLangRuns', () => {
  it('splits UI-language text around study-script runs', () => {
    expect(studyLangRuns('What does 「猫」 mean?', 'ja', 'en')).toEqual([
      { text: 'What does ', study: false },
      { text: '「猫」', study: true },
      { text: ' mean?', study: false },
    ]);
    expect(studyLangRuns('What is «большой дом»?', 'ru', 'en').filter((run) => run.study).map((run) => run.text)).toEqual([
      'большой дом',
    ]);
  });

  it('marks only the tested word when the two languages share a script', () => {
    const runs = studyLangRuns('「猫」是什么意思？', 'ja', 'zh', '猫');
    expect(runs.filter((run) => run.study).map((run) => run.text)).toEqual(['猫']);
    expect(studyLangRuns('意味', 'zh', 'ja')).toEqual([{ text: '意味', study: false }]);
  });

  it('leaves text alone when the study and UI languages are the same', () => {
    expect(studyLangRuns('「猫」はどういう意味？', 'ja', 'ja')).toEqual([{ text: '「猫」はどういう意味？', study: false }]);
  });
});
