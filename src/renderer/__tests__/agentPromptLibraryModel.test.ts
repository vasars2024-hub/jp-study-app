// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { emptyAgentWorkspaceState } from '../../shared/agentWorkspace';
import {
  AGENT_PROMPT_LIBRARY_LIMIT,
  agentWorkspaceWithPromptDeleted,
  agentWorkspaceWithPromptSaved,
} from '../agentPromptLibraryModel';

describe('Agent prompt library model', () => {
  it('creates, edits and deletes one prompt without touching conversations', () => {
    const initial = {
      ...emptyAgentWorkspaceState(),
      conversations: [{
        id: 'chat-1',
        title: 'Keep me',
        mode: 'ask' as const,
        createdAt: 1,
        updatedAt: 1,
        pinned: false,
        archived: false,
        context: [],
        messages: [],
      }],
    };
    const created = agentWorkspaceWithPromptSaved(initial, {
      id: ' prompt-1 ', title: ' Explain ', text: ' Give examples ', now: 10,
    });
    expect(created?.prompts).toEqual([{
      id: 'prompt-1', title: 'Explain', text: 'Give examples', createdAt: 10, updatedAt: 10,
    }]);
    expect(created?.conversations).toBe(initial.conversations);
    if (!created) throw new Error('Expected prompt creation');

    const edited = agentWorkspaceWithPromptSaved(created, {
      id: 'prompt-1', title: 'Explain clearly', text: 'Give three examples', now: 20,
    });
    expect(edited?.prompts?.[0]).toMatchObject({
      title: 'Explain clearly', text: 'Give three examples', createdAt: 10, updatedAt: 20,
    });
    if (!edited) throw new Error('Expected prompt edit');
    expect(agentWorkspaceWithPromptDeleted(edited, 'prompt-1')?.prompts).toEqual([]);
  });

  it('rejects empty drafts, no-op edits, missing deletes and overflow', () => {
    const initial = emptyAgentWorkspaceState();
    expect(agentWorkspaceWithPromptSaved(initial, {
      id: 'x', title: '', text: 'body', now: 1,
    })).toBeNull();

    const full = {
      ...initial,
      prompts: Array.from({ length: AGENT_PROMPT_LIBRARY_LIMIT }, (_, index) => ({
        id: `prompt-${index}`,
        title: `Prompt ${index}`,
        text: 'Body',
        createdAt: index,
        updatedAt: index,
      })),
    };
    expect(agentWorkspaceWithPromptSaved(full, {
      id: 'overflow', title: 'Overflow', text: 'Body', now: 200,
    })).toBeNull();
    expect(agentWorkspaceWithPromptSaved(full, {
      id: 'prompt-0', title: 'Prompt 0', text: 'Body', now: 200,
    })).toBeNull();
    expect(agentWorkspaceWithPromptDeleted(full, 'missing')).toBeNull();
  });
});
