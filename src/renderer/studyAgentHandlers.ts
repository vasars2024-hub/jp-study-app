import type { AgentToolHandlers } from '../shared/localAgent';
import type { StudyContextRef, StudyVocabularyFilters } from '../shared/mediaStudyOrchestrator';
import {
  createInternalStudyCards,
  prepareStudyMediaById,
  previewInternalStudyCards,
} from './mediaStudyOrchestrator';

function textArgument(
  arguments_: Readonly<Record<string, unknown>>,
  key: string,
  required = true,
): string {
  const value = arguments_[key];
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (required) throw new Error(`The Study operation needs ${key}.`);
  return '';
}

async function activeWorkspace(workspaceId?: string) {
  const document = await window.api.studyGet();
  const workspace = workspaceId
    ? document.workspaces[workspaceId]
    : Object.values(document.workspaces).sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!workspace) throw new Error('No active Study vocabulary workspace is available.');
  return workspace;
}

function filterPatch(arguments_: Readonly<Record<string, unknown>>): Partial<StudyVocabularyFilters> {
  const patch: Partial<StudyVocabularyFilters> = {};
  if (Array.isArray(arguments_.excludedJlptLevels)) {
    patch.excludedJlptLevels = arguments_.excludedJlptLevels
      .filter((value): value is string => typeof value === 'string')
      .slice(0, 10);
  }
  if (typeof arguments_.minimumOccurrences === 'number') {
    patch.minimumOccurrences = arguments_.minimumOccurrences;
  }
  if (typeof arguments_.excludeKnown === 'boolean') {
    patch.excludeKnowledgeAtOrAbove = arguments_.excludeKnown ? 2 : 4;
  }
  if (typeof arguments_.excludeInternalDuplicates === 'boolean') {
    patch.excludeInternalDuplicates = arguments_.excludeInternalDuplicates;
  }
  if (typeof arguments_.excludeAnkiDuplicates === 'boolean') {
    patch.excludeAnkiDuplicates = arguments_.excludeAnkiDuplicates;
  }
  if (typeof arguments_.excludeProperNouns === 'boolean') {
    patch.excludeProperNouns = arguments_.excludeProperNouns;
  }
  if (typeof arguments_.maximumCards === 'number') patch.maximumCards = arguments_.maximumCards;
  return patch;
}

/** Adapters shared by the general AI Mode and Study Mode controls. */
export function createStudyAgentHandlers(): AgentToolHandlers {
  return {
    'study.get-context': async () => {
      const document = await window.api.studyGet();
      const workspace = Object.values(document.workspaces).sort((a, b) => b.updatedAt - a.updatedAt)[0];
      return {
        activeWorkspace: workspace ? {
          id: workspace.id,
          context: workspace.context,
          filters: workspace.filters,
          selected: workspace.selectionIds.length,
          candidates: workspace.candidates.length,
        } : null,
      };
    },
    'study.list-opportunities': () => window.api.studyListOpportunities(),
    'study.prepare-media': async (arguments_) => {
      const mediaId = textArgument(arguments_, 'mediaId');
      return prepareStudyMediaById(mediaId);
    },
    'study.filter-vocabulary': async (arguments_) => {
      const workspace = await activeWorkspace(textArgument(arguments_, 'workspaceId', false));
      const before = workspace.selectionIds.length;
      const next = await window.api.studyApplyFilters(workspace.id, filterPatch(arguments_));
      return {
        workspaceId: next.id,
        removed: Math.max(0, before - next.selectionIds.length),
        remaining: next.selectionIds.length,
        filters: next.filters,
        undoAvailable: next.history.length > 0,
      };
    },
    'study.undo-filter': async (arguments_) => {
      const workspace = await activeWorkspace(textArgument(arguments_, 'workspaceId', false));
      const next = await window.api.studyUndoFilter(workspace.id);
      return { workspaceId: next.id, remaining: next.selectionIds.length, filters: next.filters };
    },
    'study.preview-cards': async (arguments_) => {
      const workspace = await activeWorkspace(textArgument(arguments_, 'workspaceId', false));
      return previewInternalStudyCards(workspace);
    },
    'study.create-cards': async (arguments_) => {
      const workspace = await activeWorkspace(textArgument(arguments_, 'workspaceId', false));
      return createInternalStudyCards(workspace);
    },
    'study.preview-anki': async (arguments_) => {
      const workspace = await activeWorkspace(textArgument(arguments_, 'workspaceId', false));
      return window.api.studyPreviewAnki(workspace.id);
    },
    'study.export-anki': async (arguments_) => {
      const workspace = await activeWorkspace(textArgument(arguments_, 'workspaceId', false));
      return window.api.studyExportAnki(workspace.id);
    },
    'study.resume-session': async (arguments_) => {
      const workspace = await activeWorkspace(textArgument(arguments_, 'workspaceId', false));
      window.dispatchEvent(new CustomEvent('study:open-context', { detail: workspace.context }));
      return { resumed: true, workspaceId: workspace.id, context: workspace.context };
    },
    'study.open-context': (arguments_) => {
      const context = arguments_.context as StudyContextRef | undefined;
      if (!context?.mediaId) throw new Error('The Study operation needs a valid media context.');
      window.dispatchEvent(new CustomEvent('study:open-context', { detail: context }));
      return { opened: true, context };
    },
  };
}
