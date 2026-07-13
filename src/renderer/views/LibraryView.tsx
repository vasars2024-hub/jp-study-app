import { useEffect, useMemo, useState, type CSSProperties, type MouseEvent } from 'react';
import { confirmDialog, AppChrome, StatusBarField, StatusBarSpacer, type MenuBarMenu } from '../components/ui';
import type { LibraryItem } from '../../shared/types';
import Icon from '../components/Icons';
import { WIKI_CATEGORIES, randomWikiArticle } from '../wikiRandom';
import { fetchReadableArticle, articleBodyHtml } from '../wikiArticle';

interface Props {
  onOpen: (item: LibraryItem) => void;
}

/** 'all' and 'unfiled' are reserved views; anything else is a folder name. */
type FolderFilter = 'all' | 'unfiled' | string;

export default function LibraryView({ onOpen }: Props) {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [active, setActive] = useState<FolderFilter>('all');
  const [watchFolder, setWatchFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Item id whose "file into folder…" menu is open. */
  const [fileMenu, setFileMenu] = useState<string | null>(null);
  /** Inline "new folder" creator (window.prompt doesn't exist in Electron). */
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [folderErr, setFolderErr] = useState('');
  /** Folder chip currently hovered by a drag, for the drop highlight. */
  const [dropHover, setDropHover] = useState<string | null>(null);
  /** Web / paste import dialog. */
  const [importOpen, setImportOpen] = useState(false);
  const [webUrl, setWebUrl] = useState('');
  const [pasteTitle, setPasteTitle] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [webBusy, setWebBusy] = useState(false);
  const [webErr, setWebErr] = useState('');
  /** Random Wikipedia game panel. */
  const [wikiOpen, setWikiOpen] = useState(false);
  const [wikiCat, setWikiCat] = useState(0);
  const [wikiBusy, setWikiBusy] = useState(false);
  const [wikiErr, setWikiErr] = useState('');

  useEffect(() => {
    // Scan the watch folder for anything new, then load.
    window.api.syncLibrary().then(setItems);
    window.api.getWatchFolder().then(setWatchFolder);
    window.api.getLibraryFolders().then(setFolders);
    // Live updates when files are dropped into the watch folder while open.
    const unsub = window.api.onLibraryChanged(setItems);
    return unsub;
  }, []);

  async function importFiles() {
    setBusy(true);
    try {
      setItems(await window.api.importFiles());
    } finally {
      setBusy(false);
    }
  }

  async function importFolder() {
    setBusy(true);
    try {
      setItems(await window.api.importFolder());
    } finally {
      setBusy(false);
    }
  }

  async function chooseWatchFolder() {
    setBusy(true);
    try {
      const res = await window.api.setWatchFolder();
      setWatchFolder(res.folder);
      setItems(res.items);
    } finally {
      setBusy(false);
    }
  }

  async function stopWatching() {
    await window.api.clearWatchFolder();
    setWatchFolder(null);
  }

  async function syncNow() {
    setBusy(true);
    try {
      setItems(await window.api.syncLibrary());
    } finally {
      setBusy(false);
    }
  }

  async function remove(e: MouseEvent, id: string) {
    e.stopPropagation();
    const ok = await confirmDialog({
      title: 'Remove from library',
      message: 'Remove this item from your library? The imported copy will be deleted.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) {
      setItems(await window.api.removeItem(id));
    }
  }

  // ----- folders -----

  async function createFolder() {
    const name = newName.trim();
    if (!name) {
      setCreating(false);
      setNewName('');
      setFolderErr('');
      return;
    }
    if (name.toLowerCase() === 'all' || name.toLowerCase() === 'unfiled') {
      setFolderErr('That name is reserved — pick another one.');
      return;
    }
    if (folders.includes(name)) {
      setActive(name);
      setCreating(false);
      setNewName('');
      setFolderErr('');
      return;
    }
    const res = await window.api.setLibraryFolders([...folders, name]);
    setFolders(res.folders);
    setItems(res.items);
    setActive(name);
    setCreating(false);
    setNewName('');
    setFolderErr('');
  }

  /** Drag-and-drop: move a dragged folder chip so it sits before the target chip. */
  async function reorderFolder(dragged: string, target: string) {
    if (dragged === target || !folders.includes(dragged)) return;
    const next = folders.filter((f) => f !== dragged);
    const idx = next.indexOf(target);
    next.splice(idx === -1 ? next.length : idx, 0, dragged);
    const res = await window.api.setLibraryFolders(next);
    setFolders(res.folders);
    setItems(res.items);
  }

  /** Drag-and-drop: a book card was dropped on a folder chip (null = unfile). */
  async function dropIntoFolder(itemId: string, folder: string | null) {
    setItems(await window.api.setItemFolder(itemId, folder));
  }

  // ----- web / clipboard import -----

  /**
   * Fetch a page, extract the readable article and save it as an EPUB book.
   * Shared by the URL import dialog and the random-Wikipedia game.
   * Returns the updated library, or an error message string.
   */
  async function importArticle(u: string): Promise<LibraryItem[] | string> {
    let art: Awaited<ReturnType<typeof fetchReadableArticle>>;
    try {
      art = await fetchReadableArticle(u);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
    const next = await window.api.importGenerated({
      title: art.title,
      html: articleBodyHtml(art.title, art.html, art.meta),
      source: art.url,
    });
    setItems(next);
    return next;
  }

  async function importFromUrl() {
    const raw = webUrl.trim();
    if (!raw) return;
    const u = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setWebBusy(true);
    setWebErr('');
    try {
      const res = await importArticle(u);
      if (typeof res === 'string') {
        setWebErr(res);
        return;
      }
      setImportOpen(false);
      setWebUrl('');
    } finally {
      setWebBusy(false);
    }
  }

  /** The game: roll a random article from the chosen topic and open it. */
  async function rollWiki() {
    setWikiBusy(true);
    setWikiErr('');
    try {
      const { url } = await randomWikiArticle(WIKI_CATEGORIES[wikiCat]?.wikiCategory ?? null);
      const res = await importArticle(url);
      if (typeof res === 'string') {
        setWikiErr(res);
        return;
      }
      setWikiOpen(false);
      // Open the imported article (already in the library if rolled before).
      const book = res.find((i) => i.sourcePath === url) ?? res[0];
      if (book) onOpen(book);
    } catch (err) {
      setWikiErr(err instanceof Error ? err.message : String(err));
    } finally {
      setWikiBusy(false);
    }
  }

  async function importFromText() {
    const t = pasteText.trim();
    if (!t) return;
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = t
      .split(/\r?\n\s*\r?\n/)
      .map((pg) => `<p>${pg.split(/\r?\n/).map(esc).join('<br/>')}</p>`)
      .join('');
    const next = await window.api.importGenerated({
      title: pasteTitle.trim() || t.replace(/\s+/g, ' ').slice(0, 28),
      html,
    });
    setItems(next);
    setImportOpen(false);
    setPasteTitle('');
    setPasteText('');
  }

  /** Shared drop handling for every chip. */
  function chipDropProps(folder: string | null, allowReorder: boolean) {
    return {
      onDragOver: (e: React.DragEvent) => {
        const t = e.dataTransfer.types;
        if (t.includes('app/lib-item') || (allowReorder && t.includes('app/lib-folder'))) {
          e.preventDefault();
        }
      },
      onDragEnter: () => setDropHover(folder ?? '__all__'),
      onDragLeave: () => setDropHover((h) => (h === (folder ?? '__all__') ? null : h)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDropHover(null);
        const itemId = e.dataTransfer.getData('app/lib-item');
        const dragged = e.dataTransfer.getData('app/lib-folder');
        if (itemId) void dropIntoFolder(itemId, folder);
        else if (dragged && allowReorder && folder) void reorderFolder(dragged, folder);
      },
    };
  }

  async function deleteFolder(name: string) {
    const ok = await confirmDialog({
      title: 'Delete folder',
      message: `Delete the folder “${name}”? The books inside stay in your library (unfiled).`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    const res = await window.api.setLibraryFolders(folders.filter((f) => f !== name));
    setFolders(res.folders);
    setItems(res.items);
    if (active === name) setActive('all');
  }

  async function fileInto(e: MouseEvent, id: string, folder: string | null) {
    e.stopPropagation();
    setFileMenu(null);
    setItems(await window.api.setItemFolder(id, folder));
  }

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    let unfiled = 0;
    for (const it of items) {
      if (it.folder && folders.includes(it.folder)) c.set(it.folder, (c.get(it.folder) ?? 0) + 1);
      else unfiled += 1;
    }
    return { byFolder: c, unfiled };
  }, [items, folders]);

  const visible = useMemo(() => {
    if (active === 'all') return items;
    if (active === 'unfiled') return items.filter((it) => !it.folder || !folders.includes(it.folder));
    return items.filter((it) => it.folder === active);
  }, [items, active, folders]);

  // Digital Library chrome — Aero only (AppChrome pass-through in default theme).
  // File menu drives the existing import handlers; status bar shows the shelf.
  const libMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'import-files', label: 'Import file(s)…', disabled: busy, onSelect: importFiles },
        { id: 'import-folder', label: 'Import image folder…', disabled: busy, onSelect: importFolder },
        { separator: true, label: '' },
        { id: 'import-web', label: 'Import from web…', disabled: busy, onSelect: () => setImportOpen(true) },
        { id: 'import-wiki', label: 'Random Wikipedia…', disabled: busy, onSelect: () => setWikiOpen(true) },
      ],
    },
  ];
  const libStatus = (
    <>
      <StatusBarField>{items.length} items</StatusBarField>
      {active !== 'all' && <StatusBarField>Folder: {String(active)}</StatusBarField>}
      <StatusBarSpacer />
      {visible.length !== items.length && <StatusBarField>{visible.length} shown</StatusBarField>}
    </>
  );

  return (
    <AppChrome menus={libMenus} status={libStatus}>
    <div className="library" onClick={() => setFileMenu(null)}>
      <header className="view-head">
        <p className="muted">Your books and manga. Import files to start reading.</p>
        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={importFiles}>
            ＋ Import file(s)
          </button>
          <button className="btn" disabled={busy} onClick={importFolder}>
            <Icon name="folder" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
            Import image folder
          </button>
          <button className="btn" disabled={busy} onClick={() => setImportOpen(true)}>
            <Icon name="globe" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
            Web / paste
          </button>
          <button className="btn" disabled={busy} onClick={() => setWikiOpen(true)}>
            <Icon name="dice" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
            Random Wikipedia
          </button>
        </div>
      </header>

      {wikiOpen && (
        <>
          <div className="lib-import-backdrop" onClick={() => !wikiBusy && setWikiOpen(false)} />
          <div className="lib-import">
            <h3>
              <Icon name="dice" size={16} style={{ marginRight: 6, verticalAlign: '-3px' }} />
              Random Wikipedia
            </h3>
            <p className="muted lib-import-note">
              Pick a topic and get a random Japanese Wikipedia article as a book — a reading
              roulette. Dictionary, highlighting and progress all work on it.
            </p>
            <div className="wiki-cats">
              {WIKI_CATEGORIES.map((c, i) => (
                <button
                  key={c.label}
                  className={`lib-folder-chip ${wikiCat === i ? 'active' : ''}`}
                  disabled={wikiBusy}
                  onClick={() => setWikiCat(i)}
                >
                  {c.label}
                </button>
              ))}
            </div>
            {wikiErr && <div className="lib-import-err">{wikiErr}</div>}
            <div className="lib-import-actions">
              <button className="btn" disabled={wikiBusy} onClick={() => setWikiOpen(false)}>
                Cancel
              </button>
              <button className="btn primary" disabled={wikiBusy} onClick={() => void rollWiki()}>
                {wikiBusy ? (
                  '記事を探しています…'
                ) : (
                  <>
                    <Icon name="dice" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                    Roll an article
                  </>
                )}
              </button>
            </div>
          </div>
        </>
      )}

      {importOpen && (
        <>
          <div className="lib-import-backdrop" onClick={() => !webBusy && setImportOpen(false)} />
          <div className="lib-import">
            <h3>Import from the web</h3>
            <div className="lib-import-row">
              <input
                type="text"
                className="gram-search"
                placeholder="https:// article, blog post, news page…"
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void importFromUrl()}
                disabled={webBusy}
              />
              <button className="btn primary" disabled={webBusy || !webUrl.trim()} onClick={() => void importFromUrl()}>
                {webBusy ? 'Fetching…' : 'Import'}
              </button>
            </div>
            {webErr && <div className="lib-import-err">{webErr}</div>}
            <p className="muted lib-import-note">
              The readable article is extracted and saved as a book — dictionary, highlighting and
              progress all work on it.
            </p>
            <h3>…or paste text</h3>
            <input
              type="text"
              className="gram-search lib-import-title"
              placeholder="Title (optional)"
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
            />
            <textarea
              className="lib-import-text"
              placeholder="Paste Japanese or Chinese text here… (Ctrl+V)"
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
            />
            <div className="lib-import-actions">
              <button className="btn" onClick={() => setImportOpen(false)}>
                Cancel
              </button>
              <button className="btn primary" disabled={!pasteText.trim()} onClick={() => void importFromText()}>
                Import text
              </button>
            </div>
          </div>
        </>
      )}

      <div className="watch-bar">
        <span className="watch-icon">
          <Icon name="refresh" size={14} />
        </span>
        {watchFolder ? (
          <>
            <span className="watch-label">
              Auto-importing from <code>{watchFolder}</code>
            </span>
            <button className="btn small" disabled={busy} onClick={syncNow}>
              Sync now
            </button>
            <button className="btn small" disabled={busy} onClick={chooseWatchFolder}>
              Change
            </button>
            <button className="btn small" disabled={busy} onClick={stopWatching}>
              Stop
            </button>
          </>
        ) : (
          <>
            <span className="watch-label muted">
              Pick a folder and any book or manga you drop in will import automatically.
            </span>
            <button className="btn small" disabled={busy} onClick={chooseWatchFolder}>
              Set auto-import folder…
            </button>
          </>
        )}
      </div>

      {/* ----- folder chips: click to filter, drag books onto them, drag to reorder ----- */}
      <div className="lib-folders">
        <button
          className={`lib-folder-chip ${active === 'all' ? 'active' : ''} ${dropHover === '__all__' ? 'dragover' : ''}`}
          onClick={() => setActive('all')}
          title="Everything (drop a book here to take it out of its folder)"
          {...chipDropProps(null, false)}
        >
          All <span className="lib-chip-count">{items.length}</span>
        </button>
        {folders.map((f) => (
          <button
            key={f}
            className={`lib-folder-chip ${active === f ? 'active' : ''} ${dropHover === f ? 'dragover' : ''}`}
            onClick={() => setActive(f)}
            title={`${f} — drop books here to file them; drag to reorder`}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('app/lib-folder', f);
              e.dataTransfer.effectAllowed = 'move';
            }}
            {...chipDropProps(f, true)}
          >
            <Icon name="folder" size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />
            {f} <span className="lib-chip-count">{counts.byFolder.get(f) ?? 0}</span>
            {active === f && (
              <span
                className="lib-chip-del"
                title="Delete this folder (books stay)"
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteFolder(f);
                }}
              >
                <Icon name="close" size={11} />
              </span>
            )}
          </button>
        ))}
        {counts.unfiled > 0 && folders.length > 0 && (
          <button
            className={`lib-folder-chip ${active === 'unfiled' ? 'active' : ''} ${dropHover === '__all__' ? '' : ''}`}
            onClick={() => setActive('unfiled')}
            {...chipDropProps(null, false)}
          >
            Unfiled <span className="lib-chip-count">{counts.unfiled}</span>
          </button>
        )}
        {creating ? (
          <span className="lib-folder-chip lib-folder-editor">
            <input
              autoFocus
              className="lib-folder-input"
              type="text"
              value={newName}
              placeholder="Folder name…"
              onChange={(e) => {
                setNewName(e.target.value);
                setFolderErr('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createFolder();
                if (e.key === 'Escape') {
                  setCreating(false);
                  setNewName('');
                  setFolderErr('');
                }
              }}
            />
            <span className="lib-chip-del" title="Create" onClick={() => void createFolder()}>
              <Icon name="check" size={11} />
            </span>
          </span>
        ) : (
          <button className="lib-folder-chip lib-folder-new" onClick={() => setCreating(true)}>
            ＋ New folder
          </button>
        )}
        {folderErr && <span className="lib-folder-err">{folderErr}</span>}
      </div>

      {busy && <div className="banner">Importing… this can take a moment for large manga.</div>}

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">
            <Icon name="library" size={44} />
          </div>
          <h2>Your library is empty</h2>
          <p className="muted">
            Import an <strong>EPUB</strong> book, a <strong>PDF</strong>, or a{' '}
            <strong>CBZ/ZIP</strong> manga archive — or a folder of images.
          </p>
          <button className="btn primary" onClick={importFiles}>
            Import your first file
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">
            <Icon name="folder" size={44} />
          </div>
          <h2>This folder is empty</h2>
          <p className="muted">
            Use the folder button on any book to file it here, or switch back to <b>All</b>.
          </p>
        </div>
      ) : (
        <div className="grid">
          {visible.map((it) => {
            const pct = Math.round((it.progress?.percent ?? 0) * 100);
            return (
              <div
                key={it.id}
                className="card"
                onClick={() => onOpen(it)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('app/lib-item', it.id);
                  e.dataTransfer.effectAllowed = 'move';
                }}
              >
                <div className="cover" style={coverStyle(it)}>
                  {!it.coverPath && <span className="cover-title">{it.title}</span>}
                  <span className="kind-badge">{it.kind === 'book' ? 'BOOK' : 'MANGA'}</span>
                  {pct > 0 && (
                    <div className="card-progress">
                      <div style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <button
                    className="card-remove"
                    title="Remove from library"
                    onClick={(e) => remove(e, it.id)}
                  >
                    <Icon name="close" size={13} />
                  </button>
                  <button
                    className="card-file"
                    title="File into a folder"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFileMenu(fileMenu === it.id ? null : it.id);
                    }}
                  >
                    <Icon name="folder" size={13} />
                  </button>
                  {fileMenu === it.id && (
                    <div className="card-file-menu" onClick={(e) => e.stopPropagation()}>
                      {folders.length === 0 && (
                        <div className="card-file-empty muted">No folders yet — create one above.</div>
                      )}
                      {folders.map((f) => (
                        <button
                          key={f}
                          className={`card-file-opt ${it.folder === f ? 'active' : ''}`}
                          onClick={(e) => fileInto(e, it.id, f)}
                        >
                          <Icon name="folder" size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                          {f}
                        </button>
                      ))}
                      {it.folder && (
                        <button className="card-file-opt" onClick={(e) => fileInto(e, it.id, null)}>
                          <Icon name="close" size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                          Remove from “{it.folder}”
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div className="card-title" title={it.title}>
                  {it.title}
                </div>
                <div className="card-sub muted">
                  {it.kind === 'manga'
                    ? `${it.pageCount ?? 0} pages`
                    : it.epubFile?.endsWith('.pdf')
                      ? 'PDF'
                      : 'EPUB'}
                  {pct > 0 ? ` · ${pct}%` : ''}
                  {it.folder && folders.includes(it.folder) && (
                    <>
                      {' · '}
                      <Icon name="folder" size={11} style={{ verticalAlign: '-2px' }} /> {it.folder}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
    </AppChrome>
  );
}

function coverStyle(it: LibraryItem): CSSProperties {
  if (it.coverPath) {
    return { backgroundImage: `url("media://${it.id}/${it.coverPath}")` };
  }
  // Deterministic gradient derived from the title, so each book looks distinct.
  const hue = [...it.title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return {
    background: `linear-gradient(135deg, hsl(${hue} 45% 32%), hsl(${(hue + 40) % 360} 50% 18%))`,
  };
}
