/**
 * The per-block menu that appears in Customize mode.
 *
 * This is also the **non-drag path**, and that is not a fallback: dragging is a mouse
 * gesture with no keyboard equivalent, so every layout change a drag can make has to be
 * reachable from here or the workspace editor is inaccessible (§10, §24). Move, dock,
 * float, overlay and resize are all menu items for that reason, and the drag layer
 * added in `StudyWorkspaceCustomizer` is a shortcut for them rather than the only way.
 *
 * Detach and "Send to display" are here too, and under the same rule as everything
 * else: they appear only when a receiving window can actually exist. `canDetach` in the
 * registry is the gate, `useStudyDetachApi().available` is the runtime one (false in a
 * browser harness with no Electron bridge), and the display list is read from the OS
 * rather than assumed — a one-monitor machine sees Detach and no display submenu.
 */
import React from 'react';
import type { BlockPlacement, BlockSize, ResolvedBlock } from '../shared/studyWorkspace';
import type { DisplaySummary } from '../main/displays';
import { useT } from '../renderer/i18n';
import { useStudyWorkspace } from './StudyWorkspaceProvider';
import { useStudyDetachApi } from './useStudyDetach';
import { studyBlockDefinition } from './studyBlockRegistry';

const MOVE_TARGETS: readonly { placement: BlockPlacement; labelKey: string }[] = [
  { placement: 'left', labelKey: 'studyWorkspace.move.left' },
  { placement: 'right', labelKey: 'studyWorkspace.move.right' },
  { placement: 'bottom', labelKey: 'studyWorkspace.move.bottom' },
  { placement: 'floating', labelKey: 'studyWorkspace.move.float' },
  { placement: 'overlay', labelKey: 'studyWorkspace.move.overlay' },
];

const SIZE_LABEL: Readonly<Record<BlockSize, string>> = {
  xs: 'XS', s: 'S', m: 'M', l: 'L', xl: 'XL', auto: 'Auto',
};

export default function StudyBlockMenu({ block }: { block: ResolvedBlock }): React.ReactElement {
  const { t } = useT();
  const { dispatch, layout } = useStudyWorkspace();
  const detach = useStudyDetachApi();
  const [open, setOpen] = React.useState(false);
  const [displays, setDisplays] = React.useState<readonly DisplaySummary[]>([]);
  const definition = studyBlockDefinition(block.blockId);
  const title = definition ? t(definition.titleKey) : block.blockId;
  const canDetach = detach.available && definition?.canDetach === true;
  const isDetached = canDetach && detach.isDetached(block.blockId);

  /*
    Enumerated when the menu opens, not on mount: this component is rendered once per
    visible block in Customize mode, and asking the OS for the display topology five
    times because five blocks mounted is five IPC round trips for a list nobody has
    asked to see yet.
  */
  React.useEffect(() => {
    if (!open || !canDetach || typeof window.api?.displayList !== 'function') return undefined;
    let alive = true;
    void window.api.displayList().then((list) => {
      if (alive) setDisplays(list);
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [canDetach, open]);

  React.useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  const moves = MOVE_TARGETS.filter(
    (entry) => definition?.supportedPlacements.includes(entry.placement)
      && entry.placement !== block.effectivePlacement,
  );
  const sizes = (definition?.supportedSizes ?? []).filter((size) => size !== block.size);

  return (
    <div className="study-block-chrome">
      <span className="study-block-name">{title}</span>
      <button
        type="button"
        className="study-block-menu-toggle"
        data-study-action="block-menu"
        aria-expanded={open}
        aria-label={t('studyWorkspace.blockMenu', { block: title })}
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>
      {open && (
        <div className="study-block-menu" role="menu" aria-label={title}>
          {!!sizes.length && (
            <div className="study-block-menu-group" role="group" aria-label={t('studyWorkspace.resize')}>
              <span>{t('studyWorkspace.resize')}</span>
              {sizes.map((size) => (
                <button
                  key={size}
                  type="button"
                  role="menuitem"
                  onClick={() => dispatch({ type: 'set-size', blockId: block.blockId, size })}
                >
                  {SIZE_LABEL[size]}
                </button>
              ))}
            </div>
          )}

          {!!moves.length && (
            <div className="study-block-menu-group" role="group" aria-label={t('studyWorkspace.move')}>
              <span>{t('studyWorkspace.move')}</span>
              {moves.map((entry) => (
                <button
                  key={entry.placement}
                  type="button"
                  role="menuitem"
                  onClick={() => dispatch({
                    type: 'set-placement',
                    blockId: block.blockId,
                    placement: entry.placement,
                  })}
                >
                  {t(entry.labelKey)}
                </button>
              ))}
            </div>
          )}

          <div className="study-block-menu-group">
            {definition?.canPin && (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={block.pinned}
                onClick={() => dispatch({
                  type: 'set-pinned', blockId: block.blockId, pinned: !block.pinned,
                })}
              >
                {t(block.pinned ? 'studyWorkspace.unpin' : 'studyWorkspace.pin')}
              </button>
            )}
            {definition?.canAutoHide && (
              <button
                type="button"
                role="menuitemcheckbox"
                aria-checked={block.autoHide}
                onClick={() => dispatch({
                  type: 'set-auto-hide', blockId: block.blockId, autoHide: !block.autoHide,
                })}
              >
                {t('studyWorkspace.autoHide')}
              </button>
            )}
            {canDetach && (
              <button
                type="button"
                role="menuitem"
                data-study-action={isDetached ? 'attach-block' : 'detach-block'}
                onClick={() => {
                  if (isDetached) detach.attach(block.blockId);
                  else detach.detach(block.blockId);
                  setOpen(false);
                }}
              >
                {t(isDetached ? 'studyWorkspace.detach.return' : 'studyWorkspace.detach.detach')}
              </button>
            )}
            {block.blockId !== 'video' && (
              <button
                type="button"
                role="menuitem"
                data-study-action="remove-block"
                onClick={() => dispatch({ type: 'remove-block', blockId: block.blockId })}
              >
                {t('studyWorkspace.removeFromWorkspace')}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => dispatch({ type: 'reset-workspace', workspaceId: layout.workspaceId })}
            >
              {t('studyWorkspace.restoreDefault')}
            </button>
          </div>

          {/*
            Only when there is more than one monitor. A "Send to display" group holding
            one entry that means "leave it where it is" is noise, and this menu's whole
            job is to not be the old dock of permanently visible controls.
          */}
          {canDetach && displays.length > 1 && (
            <div
              className="study-block-menu-group"
              role="group"
              aria-label={t('studyWorkspace.detach.sendToDisplay')}
            >
              <span>{t('studyWorkspace.detach.sendToDisplay')}</span>
              {displays.map((display, index) => (
                <button
                  key={display.key}
                  type="button"
                  role="menuitem"
                  data-study-action="send-to-display"
                  data-display-key={display.key}
                  onClick={() => {
                    detach.sendToDisplay(block.blockId, display.key);
                    setOpen(false);
                  }}
                >
                  {display.label || t('studyWorkspace.detach.displayN', { n: index + 1 })}
                </button>
              ))}
            </div>
          )}

          {/* Removing a block changes this workspace's presentation only — the feature
              stays in the app and can be added back from the block library. */}
          <p className="study-block-menu-note">{t('studyWorkspace.removeNote')}</p>
        </div>
      )}
    </div>
  );
}
