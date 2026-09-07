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
import { listBlancToolboxModules } from '../../../shared/toolboxRegistry';
import type {
  CollectedFolder,
  CollectedTool,
  CollectedToolKind,
} from '../../../shared/collectedTools';
import { readWorkspaces, WORKSPACE_LAUNCHER_KEY } from './BlancReadyToolPanels';
import { confirmRemoveCollectedTool } from '../../collectedToolsActions';
import { useT } from '../../i18n';

const MIGRATED_FLAG_KEY = `${WORKSPACE_LAUNCHER_KEY}.migrated`;

/** The 8 Blanc-only tool ids have no shared TOOLBOX_MODULES entry to read a
 * label from (see BlancShell.tsx's BLANC_ONLY_LABELS) — duplicated here rather
 * than imported to avoid a static import from the shell into one of its own
 * lazy panels. This list is stable; it has changed twice in the project's
 * history. */
const BLANC_ONLY_TOOL_LABELS: Record<string, string> = {
  coverage: 'Coverage',
  notebook: 'Notebook',
  translate: 'Translate',
  music: 'Music',
  novels: 'Novels',
  games: 'Games',
  immersion: 'Immersion',
  visualizer: 'Visualizer',
};

function pickableTools(): { id: string; label: string }[] {
  const fromRegistry = listBlancToolboxModules()
    .filter((m) => m.id !== 'app-drawer')
    .map((m) => ({ id: m.id, label: m.label }));
  const blancOnly = Object.entries(BLANC_ONLY_TOOL_LABELS).map(([id, label]) => ({ id, label }));
  return [...fromRegistry, ...blancOnly].sort((a, b) => a.label.localeCompare(b.label));
}

function kindLabel(kind: CollectedToolKind): string {
  if (kind === 'link') return 'Link';
  if (kind === 'tool') return 'Blanc tool';
  return 'App / file';
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
    void (async () => {
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
      setStatus(`Migrated ${workspaces.length} workspace(s) from Workspace Launcher.`);
      await reload();
    })();
    // Runs once per mount by design — this is a one-shot migration guarded by
    // MIGRATED_FLAG_KEY, not a live subscription.
  }, []);

  const createFolder = useCallback(
    async (name: string, parentFolderId: string | null) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      const result = await window.api.toolsAddFolder(trimmed, parentFolderId);
      if (result?.ok) setStatus(`Created "${trimmed}".`);
      else setStatus(result?.error || 'Could not create folder.');
      await reload();
    },
    [reload],
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

  const deleteFolder = useCallback(
    async (id: string) => {
      await window.api.toolsRemoveFolder(id);
      setStatus('Folder deleted; its shortcuts moved to the drawer root.');
      await reload();
    },
    [reload],
  );

  const addLink = useCallback(
    async (url: string, name: string, folderId: string | null) => {
      const trimmed = url.trim();
      if (!/^https?:\/\//i.test(trimmed)) {
        setStatus('Enter a full http:// or https:// address.');
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
            ? 'That link is already saved.'
            : `Added ${name.trim() || trimmed}.`
          : result?.error || 'Could not add link.',
      );
      await reload();
    },
    [reload],
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
              ? 'That shortcut is already saved.'
              : `Added ${picked.name || picked.target}.`
            : result?.error || 'Could not add shortcut.',
        );
      } finally {
        setBusy(false);
      }
      await reload();
    },
    [reload],
  );

  const addToolShortcut = useCallback(
    async (toolId: string, label: string, folderId: string | null) => {
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
            ? 'That tool shortcut is already saved.'
            : `Added ${label || toolId}.`
          : result?.error || 'Could not add tool shortcut.',
      );
      await reload();
    },
    [reload],
  );

  // D143. The same `tools:remove` that Resources guards at D17 was reached bare
  // from here — same store, same tool, same note, one host asking and the other
  // not. The confirm lives in `collectedToolsActions` so a third host cannot
  // reintroduce the gap. Blanc chrome is plain English by policy, but a reused
  // shared dialog is shared content and stays translated.
  const removeItem = useCallback(
    async (id: string) => {
      if (!await confirmRemoveCollectedTool(t, tools.find((candidate) => candidate.id === id))) return;
      await window.api.toolsRemove(id);
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
      const items = tools.filter((t) => t.folderId === folder.id);
      if (items.length === 0) return;
      setBusy(true);
      setStatus(`Launching ${items.length} item(s)...`);
      const failures: string[] = [];
      let openedTool = false;
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
        const failure = await launchItem(item);
        if (failure) failures.push(failure);
      }
      setBusy(false);
      const opened = items.length - failures.length;
      setStatus(
        failures.length
          ? `Opened ${opened} of ${items.length}. Failed — ${failures.join('; ')}`
          : `Opened all ${opened} item(s).`,
      );
    },
    [tools, launchItem],
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
  const tools = useMemo(() => pickableTools(), []);

  return (
    <div className="blanc-form-grid">
      <label>
        Add shortcut
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          <option value="app">App or file</option>
          <option value="link">Link</option>
          <option value="tool">Blanc tool</option>
        </select>
      </label>
      {kind === 'app' && (
        <div className="blanc-row-actions">
          <button type="button" disabled={state.busy} onClick={() => void state.addPicked(folderId)}>
            Choose app or file...
          </button>
        </div>
      )}
      {kind === 'link' && (
        <div className="blanc-row-actions">
          <input
            type="text"
            value={linkName}
            placeholder="Name"
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
            Add link
          </button>
        </div>
      )}
      {kind === 'tool' && (
        <div className="blanc-row-actions">
          <select value={toolId} onChange={(e) => setToolId(e.target.value)}>
            <option value="">Choose a tool...</option>
            {tools.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!toolId}
            onClick={() => {
              const label = tools.find((t) => t.id === toolId)?.label ?? toolId;
              void state.addToolShortcut(toolId, label, folderId);
              setToolId('');
            }}
          >
            Add tool shortcut
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
  return (
    <tr>
      <td>
        <span className="blanc-row-actions">
          <Icon name={kindIcon(item.kind)} size={14} />
          {item.name}
        </span>
      </td>
      <td>{kindLabel(item.kind)}</td>
      <td className="blanc-note">{item.kind === 'tool' ? item.url : item.url}</td>
      <td>
        <div className="blanc-row-actions">
          <button
            type="button"
            disabled={state.busy}
            onClick={() => {
              void state.launchItem(item).then((failure) => {
                if (failure) window.alert(failure);
              });
            }}
          >
            Open
          </button>
          {folders.length > 0 && (
            <select
              value={item.folderId ?? ''}
              onChange={(e) => void state.moveItem(item.id, e.target.value || null)}
            >
              <option value="">Drawer root</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => void state.removeItem(item.id)}>
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function BlancAppDrawerPanel() {
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
  const visibleItems = state.tools.filter((t) => t.folderId === openFolderId);
  const moveTargets = state.folders.filter((f) => f.id !== openFolderId);

  return (
    <div className="blanc-tool-detail blanc-app-drawer">
      <fieldset>
        <legend>App Drawer</legend>
        <p className="blanc-note">
          Group the apps, files, links, and Blanc tools you use together into folders, then launch a
          whole folder in one click.
        </p>
        {openFolder ? (
          <div className="blanc-row-actions">
            <button type="button" onClick={() => setOpenFolderId(null)}>
              Back to drawer
            </button>
            <button
              type="button"
              disabled={state.busy || visibleItems.length === 0}
              onClick={() => void state.launchFolder(openFolder)}
            >
              {state.busy ? 'Launching...' : `Launch all (${visibleItems.length})`}
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
                  Save
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
                Rename
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setOpenFolderId(null);
                void state.deleteFolder(openFolder.id);
              }}
            >
              Delete folder
            </button>
          </div>
        ) : (
          <div className="blanc-row-actions">
            <input
              type="text"
              value={newFolderName}
              placeholder="New folder name"
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
              Create folder
            </button>
          </div>
        )}
        {state.status && <p className="blanc-note">{state.status}</p>}
      </fieldset>

      <fieldset>
        <legend>{openFolder ? openFolder.name : 'Drawer root'}</legend>
        <AddShortcutForm state={state} folderId={openFolderId} />

        {!openFolder && rootFolders.length > 0 && (
          <div className="blanc-row-actions">
            {rootFolders.map((f) => {
              const count =
                state.tools.filter((t) => t.folderId === f.id).length +
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
              const count = state.tools.filter((t) => t.folderId === f.id).length;
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
            <summary className="blanc-note">Add a subfolder</summary>
            <SubfolderForm state={state} parentFolderId={openFolder.id} />
          </details>
        )}

        {visibleItems.length > 0 ? (
          <div className="blanc-table-wrap">
            <table className="blanc-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Kind</th>
                  <th>Target</th>
                  <th>Actions</th>
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
            {openFolder ? 'No shortcuts in this folder yet.' : 'No unfiled shortcuts. Add one above, or open a folder.'}
          </p>
        )}
      </fieldset>
    </div>
  );
}

function SubfolderForm({ state, parentFolderId }: { state: AppDrawerState; parentFolderId: string }) {
  const [name, setName] = useState('');
  return (
    <div className="blanc-row-actions">
      <input
        type="text"
        value={name}
        placeholder="Subfolder name"
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
        Create
      </button>
    </div>
  );
}
