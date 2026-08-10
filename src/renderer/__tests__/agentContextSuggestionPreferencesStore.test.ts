// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyAgentOperationalState } from '../../shared/agentOperationalState';
import {
  loadAgentContextSuggestionPreferences,
  onAgentContextSuggestionPreferencesChanged,
  saveAgentContextSuggestionPreferences,
} from '../agentContextSuggestionPreferencesStore';
import {
  flushAgentOperationalState,
  getAgentOperationalState,
  resetAgentOperationalStateForTests,
} from '../agentOperationalClient';

afterEach(async () => {
  await flushAgentOperationalState();
  resetAgentOperationalStateForTests();
});

describe('Agent context suggestion preference store', () => {
  it('updates the main-owned operational snapshot and announces normalized changes', async () => {
    resetAgentOperationalStateForTests(emptyAgentOperationalState());
    const listener = vi.fn();
    const unsubscribe = onAgentContextSuggestionPreferencesChanged(listener);

    const saved = saveAgentContextSuggestionPreferences({
      enabled: true,
      sources: {
        ...loadAgentContextSuggestionPreferences().sources,
        dictionary: false,
        media: false,
      },
    });

    expect(saved.sources.dictionary).toBe(false);
    expect(getAgentOperationalState().suggestions).toEqual(saved);
    expect(listener).toHaveBeenCalledWith(saved);
    unsubscribe();
  });
});
