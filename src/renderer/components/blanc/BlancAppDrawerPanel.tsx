/**
 * App Drawer — Blanc Pillar 3. Folders of shortcuts: apps/files via the native
 * picker, http(s) links, and Blanc's own built-in tools, nested one level deep.
 *
 * No Study OS counterpart exists for this surface (unlike the Pillar 2 parity
 * ports), so there is no `*Content.tsx` split here — this follows the same
 * single-file shape as the other Blanc-only utility panels in
 * `BlancReadyToolPanels.tsx` (`WorkspaceLauncherPanel`, `BatchConverterPanel`).
 *
 * Store: this reuses `shared/collectedTools.ts` (the Resources app's "My
 * tools" store) rather than adding a third parallel store — `kind`/`folderId`
 * are additive to that schema. See BLANC_REFINEMENT_PLAN.md, Pillar 3.
 *
 * Retires `workspace-launcher`: on first mount, if a saved-workspaces
 * localStorage blob exists and hasn't been migrated yet, each workspace
 * becomes a folder here (non-destructive — the original key is left in place).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../Icons';
import { alertDialog, confirmDialog, showToast } from '../ui';
import { useT } from '../../i18n';
import { LANG_TAGS } from '../../../shared/i18n/core';
import { blancToolLabel } from './blancToolLabels';
import { listBlancToolboxModules } from '../../../shared/toolboxRegistry';
import type {
  CollectedFolder,
  CollectedTool,
  CollectedToolKind,
} from '../../../shared/collectedTools';
import { readWorkspaces, WORKSPACE_LAUNCHER_KEY } from './blancWorkspaces';
import { confirmRemoveCollectedTool } from '../../collectedToolsActions';

const MIGRATED_FLAG_KEY = `${WORKSPACE_LAUNCHER_KEY}.migrated`;

/** The 8 Blanc-only tool ids have no shared TOOLBOX_MODULES entry to read a
 * label from (see BlancShell.tsx's BLANC_ONLY_LABELS) — duplicated here rather
 * than imported to avoid a static import from the shell into one of its own
 * lazy panels. This list is stable; it has changed twice in the project's
 * history. The English label is what a new tool shortcut stores as its `name`
 * (the store is shared with Resources' "My tools"); the drawer itself displays
 * the translated name via `blancToolLabel`. */
const BLANC_ONLY_TOOL_LABELS: Record<string, string> = {
  // Every Blanc-only tool a user can launch. `coverage` is a developer tool
  // (hidden from learners) and is not offered; Central Agent, Files, Discover,
  // Local AI Agent and Visual Novels were missing, so they could not be added.
  agent: 'Agent',
  files: 'Files',
  notebook: 'Notebook',
  translate: 'Translate',
  music: 'Music',
  novels: 'Novels',
  'visual-novels': 'Visual Novels',
  discover: 'Discover',
  games: 'Games',
  immersion: 'Immersion',
  visualizer: 'Visualizer',
  'local-agent': 'Local AI Agent',
};

function pickableTools(): { id: string; label: string }[] {
  const fromRegistry = listBlancToolboxModules()
    // The drawer itself, and Context Search (retired into Master search).
    .filter((m) => m.id !== 'app-drawer' && m.id !== 'context-search')
    .map((m) => ({ id: m.id, label: m.label }));
  const blancOnly = Object.entries(BLANC_ONLY_TOOL_LABELS).map(([id, label]) => ({ id, label }));
  return [...fromRegistry, ...blancOnly];
}

function kindLabelKey(kind: CollectedToolKind): string {
  if (kind === 'link') return 'blanc.drawer.kind.link';
  if (kind === 'tool') return 'blanc.drawer.kind.tool';
  return 'blanc.drawer.kind.app';
}

function kindIcon(kind: CollectedToolKind): 'globe' | 'wrench' | 'app' {
  if (kind === 'link') return 'globe';
  if (kind === 'tool') return 'wrench';
  return 'app';
}

function openTool(toolId: string): void {
  window.dispatchEvent(new CustomEvent('toolbox:open-tool', { detail: toolId }));
}

function useAppDrawer() {
  const { t } = useT();
  const [tools, setTools] = useState<CollectedTool[]>([]);
  const [folders, setFolders] = useState<CollectedFolder[]>([]);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    try {
      const store = await window.api.toolsList();
      setTools(store.tools);
      setFolders(store.folders);
    } catch {
      /* ignore */
    }
  }, []);

  // One-time, non-destructive migration from workspace-launcher's
  // localStorage store into folders on this store.
  useEffect(() => {
    // `cancelled` stops a migration still in flight from writing status into a
    // panel the user already left; the try/catch turns a rejected IPC (or a
    // storage error) into a message instead of an unhandled rejection. The
    // flag is written only after a complete pass, so an interrupted migration
    // simply runs again next time — `toolsAdd` de-duplicates by URL.
    let cancelled = false;
    void (async () => {
      try {
        if (window.localStorage.getItem(MIGRATED_FLAG_KEY)) {
          await reload();
          return;
        }
        const workspaces = readWorkspaces();
        if (workspaces.length === 0) {
          window.localStorage.setItem(MIGRATED_FLAG_KEY, '1');
          await reload();
          return;
        }
        for (const workspace of workspaces) {
          if (cancelled) return;
          const folderResult = await window.api.toolsAddFolder(workspace.name, null);
          if (!folderResult?.ok || !folderResult.folder) continue;
          for (const target of workspace.targets) {
            const isLink = /^https?:\/\//i.test(target.target.trim());
            await window.api.toolsAdd({
              url: target.target,
              name: target.label,
              kind: isLink ? 'link' : 'app',
              folderId: folderResult.folder.id,
              source: 'app',
            });
          }
        }
        window.localStorage.setItem(MIGRATED_FLAG_KEY, '1');
        if (cancelled) return;
        setStatus(t('blanc.drawer.status.migrated', { count: workspaces.length }));
        await reload();
      } catch (error) {
        if (cancelled) return;
        setStatus(t('blanc.refine.error.detail', { detail: error instanceof Error ? error.message : String(error) }));
        await reload();
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once per mount by design — this is a one-shot migration guarded by
    // MIGRATED_FLAG_KEY, not a live subscription.
  }, []);

  const createFolder = useCallback(
    async (name: string, parentFolderId: string | null) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const result = await window.api.toolsAddFolder(trimmed, parentFolderId);
      if (result?.ok) setStatus(t('blanc.drawer.status.created', { name: trimmed }));
      else setStatus(result?.error || t('blanc.drawer.status.createFailed'));
      await reload();
    },
    [reload, t],
  );

  const renameFolder = useCallback(
    async (id: string, name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      await window.api.toolsRenameFolder(id, trimmed);
      await reload();
    },
    [reload],
  );

  // Part of D142. The folder itself is the only thing destroyed —
  // `collectedTools.removeFolder` re-parents every shortcut to the drawer root
  // rather than deleting it. That is exactly what the confirm has to SAY (D138:
  // a guard that exists and does not name what survives is still not honest),
  // so the message carries the count and the reassurance, and the empty case
  // gets its own sentence so it never reads "0 shortcuts".
  const deleteFolder = useCallback(
    async (id: string) => {
      const folder = folders.find((candidate) => candidate.id === id);
      const contained = tools.filter((tool) => tool.folderId === id).length;
      const ok = await confirmDialog({
        title: t('blancDrawer.deleteFolder.title'),
        message: contained > 0
          ? t('blancDrawer.deleteFolder.message', { name: folder?.name ?? '', count: contained })
          : t('blancDrawer.deleteFolder.messageEmpty', { name: folder?.name ?? '' }),
        confirmLabel: t('blancDrawer.deleteFolder.confirm'),
        danger: true,
      });
      if (!ok) return false;
      try {
        await window.api.toolsRemoveFolder(id);
      } catch (error) {
        showToast({
          message: t('blancDrawer.deleteFolder.failed', {
            reason: error instanceof Error ? error.message : String(error),
          }),
          kind: 'error',
        });
        await reload();
        return false;
      }
      setStatus(t('blanc.drawer.status.folderDeleted'));
      await reload();
      return true;
    },
    [folders, reload, t, tools],
  );

  const addLink = useCallback(
    async (url: string, name: string, folderId: string | null) => {
      const trimmed = url.trim();
      if (!/^https?:\/\//i.test(trimmed)) {
        setStatus(t('blanc.drawer.status.linkInvalid'));
        return;
      }
      const result = await window.api.toolsAdd({
        url: trimmed,
        name: name.trim() || trimmed,
        kind: 'link',
        folderId,
        source: 'app',
      });
      setStatus(
        result?.ok
          ? result.duplicate
            ? t('blanc.drawer.status.linkDuplicate')
            : t('blanc.drawer.status.added', { name: name.trim() || trimmed })
          : result?.error || t('blanc.drawer.status.linkFailed'),
      );
      await reload();
    },
    [reload, t],
  );

  const addPicked = useCallback(
    async (folderId: string | null) => {
      setBusy(true);
      try {
        const picked = await window.api.pickShortcut();
        if (!picked) return;
        const result = await window.api.toolsAdd({
          url: picked.target,
          name: picked.name || picked.target,
          kind: 'app',
          folderId,
          favicon: picked.icon || undefined,
          source: 'app',
        });
        setStatus(
          result?.ok
            ? result.duplicate
              ? t('blanc.drawer.status.shortcutDuplicate')
              : t('blanc.drawer.status.added', { name: picked.name || picked.target })
            : result?.error || t('blanc.drawer.status.shortcutFailed'),
        );
      } finally {
        setBusy(false);
      }
      await reload();
    },
    [reload, t],
  );

  const addToolShortcut = useCallback(
    async (toolId: string, label: string, displayLabel: string, folderId: string | null) => {
      if (!toolId) return;
      const result = await window.api.toolsAdd({
        url: toolId,
        name: label || toolId,
        kind: 'tool',
        folderId,
        source: 'app',
      });
      setStatus(
        result?.ok
          ? result.duplicate
            ? t('blanc.drawer.status.toolDuplicate')
            : t('blanc.drawer.status.added', { name: displayLabel || label || toolId })
          : result?.error || t('blanc.drawer.status.toolFailed'),
      );
      await reload();
    },
    [reload, t],
  );

  // D142/D143 — one defect, found on both branches at once, resolved to the better
  // half of each. The SHAPE is the incoming one and it is right: the confirm lives in
  // `collectedToolsActions`, so a third host cannot reintroduce the gap the way this
  // one did. The failure TOAST is mine and the incoming version does not have it —
  // D17 found both halves in Resources and a swallowed `tools:remove` rejection is
  // still indistinguishable from a dead button.
  const removeItem = useCallback(
    async (id: string) => {
      if (!await confirmRemoveCollectedTool(t, tools.find((candidate) => candidate.id === id))) return;
      try {
        await window.api.toolsRemove(id);
      } catch (error) {
        showToast({
          message: t('resources.myTools.removeFailed', {
            reason: error instanceof Error ? error.message : String(error),
          }),
          kind: 'error',
        });
      }
      await reload();
    },
    [reload, t, tools],
  );

  const moveItem = useCallback(
    async (id: string, folderId: string | null) => {
      await window.api.toolsMoveItem(id, folderId);
      await reload();
    },
    [reload],
  );

  const launchItem = useCallback(async (item: CollectedTool): Promise<string> => {
    if (item.kind === 'tool') {
      openTool(item.url);
      return '';
    }
    const error = await window.api.launchTarget(item.url);
    return error ? `${item.name}: ${error}` : '';
  }, []);

  const launchFolder = useCallback(
    async (folder: CollectedFolder) => {
      const items = tools.filter((tool) => tool.folderId === folder.id);
      if (items.length === 0) return;
      setBusy(true);
      setStatus(t('blanc.drawer.status.launching', { count: items.length }));
      const failures: string[] = [];
      let openedTool = false;
      try {
        for (const item of items) {
          // Blanc shows one active panel at a time — only the first 'tool'
          // shortcut in the folder actually opens; later ones would just
          // replace it, so they're skipped rather than silently thrashing
          // the panel. Apps/files/links all launch independently and don't
          // have this limitation.
          if (item.kind === 'tool') {
            if (openedTool) continue;
            openedTool = true;
          }
          // A rejected launch counts as that item's failure; it must not
          // abandon the rest of the folder or leave the drawer stuck busy.
          const failure = await launchItem(item).catch((error: unknown) =>
            `${item.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
          if (failure) failures.push(failure);
        }
      } finally {
        setBusy(false);
      }
      const opened = items.length - failures.length;
      setStatus(
        failures.length
          ? t('blanc.drawer.status.partialFailure', {
              opened,
              total: items.length,
              failures: failures.join('; '),
            })
          : t('blanc.drawer.status.openedAll', { count: opened }),
      );
    },
    [tools, launchItem, t],
  );

  return {
    tools,
    folders,
    status,
    busy,
    createFolder,
    renameFolder,
    deleteFolder,
    addLink,
    addPicked,
    addToolShortcut,
    removeItem,
    moveItem,
    launchItem,
    launchFolder,
  };
}

type AppDrawerState = ReturnType<typeof useAppDrawer>;

function AddShortcutForm({
  state,
  folderId,
}: {
  state: AppDrawerState;
  folderId: string | null;
}) {
  const [kind, setKind] = useState<'app' | 'link' | 'tool'>('app');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const [toolId, setToolId] = useState('');
  const { t, lang } = useT();
  const tools = useMemo(
    () =>
      pickableTools()
        .map((tool) => ({ ...tool, display: blancToolLabel(t, tool.id) }))
        .sort((a, b) => a.display.localeCompare(b.display, LANG_TAGS[lang])),
    // `lang` re-resolves the translated names; `t` itself is stable.
    [lang],
  );

  return (
    <div className="blanc-form-grid">
      <label>
        {t('blanc.drawer.form.addShortcut')}
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="app">{t('blanc.drawer.form.kindApp')}</option>
          <option value="link">{t('blanc.drawer.kind.link')}</option>
          <option value="tool">{t('blanc.drawer.kind.tool')}</option>
        </select>
      </label>
      {kind === 'app' && (
        <div className="blanc-row-actions">
          <button type="button" disabled={state.busy} onClick={() => void state.addPicked(folderId)}>
            {t('blanc.drawer.form.chooseApp')}
          </button>
        </div>
      )}
      {kind === 'link' && (
        <div className="blanc-row-actions">
          <input
            type="text"
            value={linkName}
            placeholder={t('blanc.drawer.form.namePlaceholder')}
            onChange={(e) => setLinkName(e.target.value)}
          />
          <input
            type="text"
            value={linkUrl}
            placeholder="https://example.com"
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                void state.addLink(linkUrl, linkName, folderId);
                setLinkUrl('');
                setLinkName('');
              }
            }}
          />
          <button
            type="button"
            disabled={!linkUrl.trim()}
            onClick={() => {
              void state.addLink(linkUrl, linkName, folderId);
              setLinkUrl('');
              setLinkName('');
            }}
          >
            {t('blanc.drawer.form.addLink')}
          </button>
        </div>
      )}
      {kind === 'tool' && (
        <div className="blanc-row-actions">
          <select value={toolId} onChange={(e) => setToolId(e.target.value)}>
            <option value="">{t('blanc.drawer.form.chooseTool')}</option>
            {tools.map((tool) => (
              <option key={tool.id} value={tool.id}>
                {tool.display}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!toolId}
            onClick={() => {
              const picked = tools.find((tool) => tool.id === toolId);
              void state.addToolShortcut(toolId, picked?.label ?? toolId, picked?.display ?? toolId, folderId);
              setToolId('');
            }}
          >
            {t('blanc.drawer.form.addTool')}
          </button>
        </div>
      )}
    </div>
  );
}

function ItemRow({
  item,
  state,
  folders,
}: {
  item: CollectedTool;
  state: AppDrawerState;
  folders: CollectedFolder[];
}) {
  const { t } = useT();
  return (
    <tr>
      <td>
        <span className="blanc-row-actions">
          <Icon name={kindIcon(item.kind)} size={14} />
          {/* A tool shortcut's stored name is the registry's English label, so
              the drawer shows the tool's name in the UI language instead. */}
          {item.kind === 'tool' ? blancToolLabel(t, item.url) : item.name}
        </span>
      </td>
      <td>{t(kindLabelKey(item.kind))}</td>
      <td className="blanc-note">{item.kind === 'tool' ? item.url : item.url}</td>
      <td>
        <div className="blanc-row-actions">
          <button
            type="button"
            disabled={state.busy}
            onClick={() => {
              void state.launchItem(item).then((failure) => {
                if (failure) void alertDialog({ title: t('desktop.dialog.openFailed'), message: failure });
              });
            }}
          >
            {t('common.open')}
          </button>
          {folders.length > 0 && (
            <select
              value={item.folderId ?? ''}
              onChange={(e) => void state.moveItem(item.id, e.target.value || null)}
            >
              <option value="">{t('blanc.drawer.root')}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => void state.removeItem(item.id)}>
            {t('common.remove')}
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function BlancAppDrawerPanel() {
  const { t } = useT();
  const state = useAppDrawer();
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');

  const openFolder = state.folders.find((f) => f.id === openFolderId) ?? null;
  // Nesting caps at one level: only a root folder (no parent of its own) may
  // hold subfolders.
  const canHoldSubfolders = openFolder ? !openFolder.parentFolderId : true;
  const rootFolders = state.folders.filter((f) => !f.parentFolderId);
  const subfolders = openFolder ? state.folders.filter((f) => f.parentFolderId === openFolder.id) : [];
  const visibleItems = state.tools.filter((tool) => tool.folderId === openFolderId);
  const moveTargets = state.folders.filter((f) => f.id !== openFolderId);

  return (
    <div className="blanc-tool-detail blanc-app-drawer">
      <fieldset>
        <legend>{t('blanc.tool.appDrawer')}</legend>
        <p className="blanc-note">{t('blanc.drawer.intro')}</p>
        {openFolder ? (
          <div className="blanc-row-actions">
            <button type="button" onClick={() => setOpenFolderId(null)}>
              {t('blanc.drawer.back')}
            </button>
            <button
              type="button"
              disabled={state.busy || visibleItems.length === 0}
              onClick={() => void state.launchFolder(openFolder)}
            >
              {state.busy
                ? t('blanc.drawer.launchingBusy')
                : t('blanc.drawer.launchAll', { count: visibleItems.length })}
            </button>
            {renaming ? (
              <span className="blanc-row-actions">
                <input
                  type="text"
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void state.renameFolder(openFolder.id, renameDraft);
                      setRenaming(false);
                    }
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    void state.renameFolder(openFolder.id, renameDraft);
                    setRenaming(false);
                  }}
                >
                  {t('common.save')}
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setRenameDraft(openFolder.name);
                  setRenaming(true);
                }}
              >
                {t('blanc.drawer.rename')}
              </button>
            )}
            <button
              type="button"
              /* The folder view closes only if the delete actually happened —
                 closing it first made Cancel look like it had worked. */
              onClick={() => {
                void (async () => {
                  if (await state.deleteFolder(openFolder.id)) setOpenFolderId(null);
                })();
              }}
            >
              {t('blancDrawer.deleteFolder.confirm')}
            </button>
          </div>
        ) : (
          <div className="blanc-row-actions">
            <input
              type="text"
              value={newFolderName}
              placeholder={t('blanc.drawer.newFolderPlaceholder')}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  void state.createFolder(newFolderName, null);
                  setNewFolderName('');
                }
              }}
            />
            <button
              type="button"
              disabled={!newFolderName.trim()}
              onClick={() => {
                void state.createFolder(newFolderName, null);
                setNewFolderName('');
              }}
            >
              {t('blanc.drawer.createFolder')}
            </button>
          </div>
        )}
        {state.status && <p className="blanc-note">{state.status}</p>}
      </fieldset>

      <fieldset>
        <legend>{openFolder ? openFolder.name : t('blanc.drawer.root')}</legend>
        <AddShortcutForm state={state} folderId={openFolderId} />

        {!openFolder && rootFolders.length > 0 && (
          <div className="blanc-row-actions">
            {rootFolders.map((f) => {
              const count =
                state.tools.filter((tool) => tool.folderId === f.id).length +
                state.folders.filter((sf) => sf.parentFolderId === f.id).length;
              return (
                <button type="button" key={f.id} onClick={() => setOpenFolderId(f.id)}>
                  <Icon name="folder" size={14} /> {f.name} ({count})
                </button>
              );
            })}
          </div>
        )}

        {openFolder && canHoldSubfolders && subfolders.length > 0 && (
          <div className="blanc-row-actions">
            {subfolders.map((f) => {
              const count = state.tools.filter((tool) => tool.folderId === f.id).length;
              return (
                <button type="button" key={f.id} onClick={() => setOpenFolderId(f.id)}>
                  <Icon name="folder" size={14} /> {f.name} ({count})
                </button>
              );
            })}
          </div>
        )}

        {openFolder && canHoldSubfolders && (
          <details>
            <summary className="blanc-note">{t('blanc.drawer.addSubfolder')}</summary>
            <SubfolderForm state={state} parentFolderId={openFolder.id} />
          </details>
        )}

        {visibleItems.length > 0 ? (
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th>{t('blanc.drawer.col.name')}</th>
                  <th>{t('blanc.drawer.col.kind')}</th>
                  <th>{t('blanc.drawer.col.target')}</th>
                  <th>{t('blanc.drawer.col.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <ItemRow key={item.id} item={item} state={state} folders={moveTargets} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="blanc-note">
            {openFolder ? t('blanc.drawer.emptyFolder') : t('blanc.drawer.emptyRoot')}
          </p>
        )}
      </fieldset>
    </div>
  );
}

function SubfolderForm({ state, parentFolderId }: { state: AppDrawerState; parentFolderId: string }) {
  const { t } = useT();
  const [name, setName] = useState('');
  return (
    <div className="blanc-row-actions">
      <input
        type="text"
        value={name}
        placeholder={t('blanc.drawer.subfolderPlaceholder')}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            void state.createFolder(name, parentFolderId);
            setName('');
          }
        }}
      />
      <button
        type="button"
        disabled={!name.trim()}
        onClick={() => {
          void state.createFolder(name, parentFolderId);
          setName('');
        }}
      >
        {t('blanc.drawer.create')}
      </button>
    </div>
  );
}
