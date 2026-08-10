import type { AgentReusablePrompt, AgentWorkspaceState } from '../shared/agentWorkspace';

export const AGENT_PROMPT_TITLE_LIMIT = 120;
export const AGENT_PROMPT_TEXT_LIMIT = 12_000;
export const AGENT_PROMPT_LIBRARY_LIMIT = 100;

export interface AgentPromptLibraryDraft {
  id: string;
  title: string;
  text: string;
  now: number;
}

function bounded(value: string, limit: number): string {
  return value.trim().slice(0, limit);
}

export function agentWorkspaceWithPromptSaved(
  state: AgentWorkspaceState,
  draft: AgentPromptLibraryDraft,
): AgentWorkspaceState | null {
  const id = bounded(draft.id, 240);
  const title = bounded(draft.title, AGENT_PROMPT_TITLE_LIMIT);
  const text = bounded(draft.text, AGENT_PROMPT_TEXT_LIMIT);
  if (!id || !title || !text || !Number.isFinite(draft.now) || draft.now < 0) return null;

  const prompts = state.prompts ?? [];
  const existing = prompts.find((entry) => entry.id === id);
  const next: AgentReusablePrompt = {
    id,
    title,
    text,
    createdAt: existing?.createdAt ?? draft.now,
    updatedAt: draft.now,
  };
  if (existing && existing.title === title && existing.text === text) return null;
  if (!existing && prompts.length >= AGENT_PROMPT_LIBRARY_LIMIT) return null;
  return {
    ...state,
    prompts: existing
      ? prompts.map((entry) => (entry.id === id ? next : entry))
      : [next, ...prompts],
  };
}

export function agentWorkspaceWithPromptDeleted(
  state: AgentWorkspaceState,
  promptId: string,
): AgentWorkspaceState | null {
  const id = bounded(promptId, 240);
  if (!id) return null;
  const prompts = state.prompts ?? [];
  if (!prompts.some((entry) => entry.id === id)) return null;
  return { ...state, prompts: prompts.filter((entry) => entry.id !== id) };
}
