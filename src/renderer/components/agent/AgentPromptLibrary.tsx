import { useEffect, useMemo, useState } from 'react';
import type { AgentReusablePrompt, AgentWorkspaceState } from '../../../shared/agentWorkspace';
import {
  AGENT_PROMPT_LIBRARY_LIMIT,
  AGENT_PROMPT_TEXT_LIMIT,
  AGENT_PROMPT_TITLE_LIMIT,
  agentWorkspaceWithPromptDeleted,
  agentWorkspaceWithPromptSaved,
} from '../../agentPromptLibraryModel';
import {
  loadAgentWorkspace,
  onAgentWorkspaceChanged,
  updateAgentWorkspace,
} from '../../agentWorkspaceClient';
import { useT } from '../../i18n';
import './agentPromptLibrary.css';

export interface AgentPromptLibraryProps {
  onUse(promptText: string): void;
}

function newPromptId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `prompt-${crypto.randomUUID()}`;
  }
  return `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function byRecentlyUpdated(left: AgentReusablePrompt, right: AgentReusablePrompt): number {
  return right.updatedAt - left.updatedAt || left.title.localeCompare(right.title);
}

export function AgentPromptLibrary({ onUse }: AgentPromptLibraryProps) {
  const { t } = useT();
  const [workspace, setWorkspace] = useState<AgentWorkspaceState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [promptText, setPromptText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadAgentWorkspace().then((result) => {
      if (!active) return;
      if (result.ok) setWorkspace(result.state);
      else setError(t(`agent.promptLibrary.error.${result.code}`));
    });
    const unsubscribe = onAgentWorkspaceChanged((state) => {
      if (active) setWorkspace(state);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [t]);

  const prompts = useMemo(
    () => [...(workspace?.prompts ?? [])].sort(byRecentlyUpdated),
    [workspace],
  );

  const resetEditor = () => {
    setEditingId(null);
    setTitle('');
    setPromptText('');
  };

  const beginEdit = (prompt: AgentReusablePrompt) => {
    setEditingId(prompt.id);
    setTitle(prompt.title);
    setPromptText(prompt.text);
    setDeleteId(null);
    setError(null);
  };

  const save = async () => {
    if (!workspace || saving) return;
    const normalizedTitle = title.trim();
    const normalizedText = promptText.trim();
    if (!normalizedTitle || !normalizedText) {
      setError(t('agent.promptLibrary.error.required'));
      return;
    }
    if (!editingId && prompts.length >= AGENT_PROMPT_LIBRARY_LIMIT) {
      setError(t('agent.promptLibrary.error.limit', { count: AGENT_PROMPT_LIBRARY_LIMIT }));
      return;
    }
    const id = editingId ?? newPromptId();
    setSaving(true);
    setError(null);
    const result = await updateAgentWorkspace(workspace, (current) => (
      agentWorkspaceWithPromptSaved(current, {
        id,
        title: normalizedTitle,
        text: normalizedText,
        now: Date.now(),
      })
    ));
    setSaving(false);
    if (!result.ok) {
      setError(t(`agent.promptLibrary.error.${result.code}`));
      return;
    }
    setWorkspace(result.state);
    resetEditor();
  };

  const remove = async (promptId: string) => {
    if (!workspace || saving) return;
    setSaving(true);
    setError(null);
    const result = await updateAgentWorkspace(
      workspace,
      (current) => agentWorkspaceWithPromptDeleted(current, promptId),
    );
    setSaving(false);
    if (!result.ok) {
      setError(t(`agent.promptLibrary.error.${result.code}`));
      return;
    }
    setWorkspace(result.state);
    setDeleteId(null);
    if (editingId === promptId) resetEditor();
  };

  return (
    <section className="agent-prompt-library" aria-labelledby="agent-prompt-library-title">
      <div className="agent-prompt-library-heading">
        <div>
          <h3 id="agent-prompt-library-title" className="agent-subheading">
            {t('agent.promptLibrary.title')}
          </h3>
          <p>{t('agent.promptLibrary.description')}</p>
        </div>
        <span aria-label={t('agent.promptLibrary.countLabel', { count: prompts.length })}>
          {prompts.length}/{AGENT_PROMPT_LIBRARY_LIMIT}
        </span>
      </div>

      <div className="agent-prompt-library-editor">
        <label>
          <span>{t('agent.promptLibrary.name')}</span>
          <input
            value={title}
            maxLength={AGENT_PROMPT_TITLE_LIMIT}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('agent.promptLibrary.namePlaceholder')}
          />
        </label>
        <label>
          <span>{t('agent.promptLibrary.prompt')}</span>
          <textarea
            value={promptText}
            maxLength={AGENT_PROMPT_TEXT_LIMIT}
            rows={4}
            onChange={(event) => setPromptText(event.target.value)}
            placeholder={t('agent.promptLibrary.promptPlaceholder')}
          />
        </label>
        <div className="agent-prompt-library-editor-actions">
          <button type="button" className="agent-prompt-library-primary" disabled={saving} onClick={() => void save()}>
            {saving ? t('agent.promptLibrary.saving') : editingId
              ? t('agent.promptLibrary.saveChanges')
              : t('agent.promptLibrary.create')}
          </button>
          {editingId ? (
            <button type="button" disabled={saving} onClick={resetEditor}>
              {t('agent.promptLibrary.cancel')}
            </button>
          ) : null}
        </div>
      </div>

      <p className="agent-prompt-library-status" role="status" aria-live="polite">
        {error ?? ''}
      </p>

      {workspace && prompts.length === 0 ? (
        <p className="agent-prompt-library-empty">{t('agent.promptLibrary.empty')}</p>
      ) : null}

      <ul className="agent-prompt-library-list">
        {prompts.map((prompt) => (
          <li key={prompt.id}>
            <div className="agent-prompt-library-copy">
              <strong>{prompt.title}</strong>
              <p>{prompt.text}</p>
            </div>
            {deleteId === prompt.id ? (
              <div className="agent-prompt-library-confirm" role="group" aria-label={t('agent.promptLibrary.deleteConfirm', { name: prompt.title })}>
                <span>{t('agent.promptLibrary.deleteQuestion')}</span>
                <button type="button" className="agent-prompt-library-danger" disabled={saving} onClick={() => void remove(prompt.id)}>
                  {t('agent.promptLibrary.confirmDelete')}
                </button>
                <button type="button" disabled={saving} onClick={() => setDeleteId(null)}>
                  {t('agent.promptLibrary.cancel')}
                </button>
              </div>
            ) : (
              <div className="agent-prompt-library-actions">
                <button type="button" className="agent-prompt-library-primary" onClick={() => onUse(prompt.text)}>
                  {t('agent.promptLibrary.use')}
                </button>
                <button type="button" onClick={() => beginEdit(prompt)}>
                  {t('agent.promptLibrary.edit')}
                </button>
                <button type="button" onClick={() => setDeleteId(prompt.id)}>
                  {t('agent.promptLibrary.delete')}
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default AgentPromptLibrary;
