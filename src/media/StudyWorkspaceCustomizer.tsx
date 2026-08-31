/**
 * Customize Workspace — the editing chrome, and the Workspace Manager.
 *
 * Two rules shape this file:
 *
 * 1. **Normal playback must never accidentally rearrange anything.** So none of this
 *    exists until the user asks for it: the whole component returns `null` unless
 *    `customizing` is on, and the outlines, handles and block names it adds live in a
 *    `[data-study-customizing]` scope that disappears with it.
 * 2. **Nothing here is a demo.** Every action goes through the same reducer the player
 *    uses, and export/import goes through `exportWorkspace`/`importWorkspace`, which
 *    are covered by `studyWorkspace.test.ts`. The one capability deliberately absent is
 *    "send to another display" — see `StudyBlockMenu`'s header.
 */
import React from 'react';
import {
  exportWorkspace,
  importWorkspace,
  type StudyBlockId,
  type StudyWorkspace,
} from '../shared/studyWorkspace';
import { useT } from '../renderer/i18n';
import { useStudyWorkspace } from './StudyWorkspaceProvider';
import { libraryBlocks, STUDY_BLOCK_MAP } from './studyBlockRegistry';

function workspaceLabel(
  workspace: StudyWorkspace,
  t: (key: string) => string,
): string {
  return workspace.name ?? (workspace.nameKey ? t(workspace.nameKey) : workspace.id);
}

export default function StudyWorkspaceCustomizer(): React.ReactElement | null {
  const { t } = useT();
  const { doc, workspace, layout, customizing, dispatch } = useStudyWorkspace();
  const [transfer, setTransfer] = React.useState('');
  const [notice, setNotice] = React.useState('');

  if (!customizing) return null;

  const present = new Set<StudyBlockId>(workspace.blocks.map((entry) => entry.blockId));
  const available = libraryBlocks().filter((definition) => !present.has(definition.id));

  const newWorkspaceId = (): string => {
    // Deterministic and collision-checked, rather than a timestamp: two clicks in the
    // same millisecond are otherwise one workspace.
    let index = doc.workspaces.length + 1;
    while (doc.workspaces.some((entry) => entry.id === `custom-${index}`)) index += 1;
    return `custom-${index}`;
  };

  return (
    <div className="study-customizer" data-study-customizing="true">
      <header className="study-customizer-head">
        <strong>{t('studyWorkspace.customizing')}</strong>
        <div className="study-customizer-history">
          <button
            type="button"
            data-study-action="workspace-undo"
            onClick={() => dispatch({ type: 'undo' })}
          >
            {t('studyWorkspace.undo')}
          </button>
          <button
            type="button"
            data-study-action="workspace-redo"
            onClick={() => dispatch({ type: 'redo' })}
          >
            {t('studyWorkspace.redo')}
          </button>
          <button
            type="button"
            data-study-action="workspace-reset"
            onClick={() => dispatch({ type: 'reset-workspace', workspaceId: layout.workspaceId })}
          >
            {t('studyWorkspace.resetLayout')}
          </button>
        </div>
        <button
          type="button"
          className="study-customizer-done"
          data-study-action="customize-done"
          onClick={() => dispatch({ type: 'set-customizing', customizing: false })}
        >
          {t('studyWorkspace.done')}
        </button>
      </header>

      <section className="study-customizer-section" aria-label={t('studyWorkspace.workspaces')}>
        <span className="study-customizer-legend">{t('studyWorkspace.workspaces')}</span>
        <div className="study-customizer-workspaces">
          {doc.workspaces.map((entry) => (
            <button
              key={entry.id}
              type="button"
              aria-pressed={entry.id === doc.activeWorkspaceId}
              onClick={() => dispatch({ type: 'switch-workspace', workspaceId: entry.id })}
            >
              {workspaceLabel(entry, t)}
            </button>
          ))}
        </div>
        <div className="study-customizer-workspace-actions">
          <button
            type="button"
            data-study-action="workspace-duplicate"
            onClick={() => {
              const id = newWorkspaceId();
              dispatch({
                type: 'duplicate-workspace',
                workspaceId: workspace.id,
                newId: id,
                name: t('studyWorkspace.copyOf', { name: workspaceLabel(workspace, t) }),
              });
            }}
          >
            {t('studyWorkspace.duplicate')}
          </button>
          <label className="study-customizer-rename">
            {t('studyWorkspace.name')}
            <input
              type="text"
              value={workspace.name ?? ''}
              placeholder={workspaceLabel(workspace, t)}
              onChange={(event) => dispatch({
                type: 'rename-workspace',
                workspaceId: workspace.id,
                name: event.currentTarget.value,
              })}
            />
          </label>
          {!workspace.builtIn && (
            <button
              type="button"
              data-study-action="workspace-delete"
              onClick={() => dispatch({ type: 'delete-workspace', workspaceId: workspace.id })}
            >
              {t('studyWorkspace.delete')}
            </button>
          )}
        </div>
      </section>

      <section className="study-customizer-section" aria-label={t('studyWorkspace.blockLibrary')}>
        <span className="study-customizer-legend">{t('studyWorkspace.blockLibrary')}</span>
        {available.length === 0 ? (
          <p className="study-customizer-empty">{t('studyWorkspace.libraryEmpty')}</p>
        ) : (
          <div className="study-customizer-library">
            {available.map((definition) => (
              <button
                key={definition.id}
                type="button"
                data-study-action="add-block"
                data-block={definition.id}
                data-availability={definition.availability}
                title={definition.availability === 'app-owned'
                  ? t('studyWorkspace.appOwnedHint')
                  : undefined}
                onClick={() => dispatch({
                  type: 'add-block',
                  blockId: definition.id,
                  placement: definition.supportedPlacements[0],
                  size: definition.defaultSize,
                })}
              >
                {t(definition.titleKey)}
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="study-customizer-section" aria-label={t('studyWorkspace.blocksInWorkspace')}>
        <span className="study-customizer-legend">{t('studyWorkspace.blocksInWorkspace')}</span>
        <ul className="study-customizer-blocks">
          {workspace.blocks.map((instance) => {
            const definition = STUDY_BLOCK_MAP.get(instance.blockId);
            if (!definition) return null;
            return (
              <li key={instance.blockId} data-block={instance.blockId}>
                <span>{t(definition.titleKey)}</span>
                <small>
                  {t(`studyWorkspace.placement.${instance.placement}`)}
                  {' · '}
                  {instance.presence === 'hidden'
                    ? t('studyWorkspace.presence.hidden')
                    : t('studyWorkspace.presence.shown')}
                </small>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'toggle-block', blockId: instance.blockId })}
                >
                  {t(instance.presence === 'hidden'
                    ? 'studyWorkspace.show'
                    : 'studyWorkspace.hide')}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="study-customizer-section" aria-label={t('studyWorkspace.transfer')}>
        <span className="study-customizer-legend">{t('studyWorkspace.transfer')}</span>
        <div className="study-customizer-transfer">
          <button
            type="button"
            data-study-action="workspace-export"
            onClick={() => {
              const text = exportWorkspace(workspace);
              setTransfer(text);
              // Best effort — the textarea below is the guaranteed path, so a denied
              // clipboard permission costs a convenience rather than the feature.
              void navigator.clipboard?.writeText(text).then(
                () => setNotice(t('studyWorkspace.exportCopied')),
                () => setNotice(t('studyWorkspace.exportReady')),
              );
            }}
          >
            {t('studyWorkspace.export')}
          </button>
          <button
            type="button"
            data-study-action="workspace-import"
            disabled={!transfer.trim()}
            onClick={() => {
              const imported = importWorkspace(transfer, { definitions: STUDY_BLOCK_MAP });
              if (!imported) {
                setNotice(t('studyWorkspace.importFailed'));
                return;
              }
              dispatch({ type: 'import-workspace', workspace: imported });
              setNotice(t('studyWorkspace.imported', { name: imported.name ?? imported.id }));
            }}
          >
            {t('studyWorkspace.import')}
          </button>
          <textarea
            className="study-customizer-transfer-box"
            aria-label={t('studyWorkspace.transfer')}
            placeholder={t('studyWorkspace.transferPlaceholder')}
            value={transfer}
            onChange={(event) => setTransfer(event.currentTarget.value)}
          />
          <output role="status" aria-live="polite">{notice}</output>
        </div>
      </section>
    </div>
  );
}
