import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  confirmDialog,
  AppChrome,
  Button,
  StatusBarField,
  StatusBarSpacer,
  Toolbar,
  ToolbarSpacer,
  type MenuBarMenu,
  useAeroMaterials,
} from '../components/ui';
import type { LibraryItem } from '../../shared/types';
import type { BookLevelEstimate } from '../../shared/bookLevelEstimate';
import Icon from '../components/Icons';
import BookOcrPanel from '../components/library/BookOcrPanel';
import { WIKI_CATEGORIES, randomWikiArticle } from '../wikiRandom';
import { fetchReadableArticle, articleBodyHtml } from '../wikiArticle';
import { getActiveProfile } from '../profileState';
import { enrichInboxItems } from '../inboxEnrich';
import {
  enrichBookLevelEstimates,
  getCachedBookLevel,
  onBookLevelInputsChanged,
} from '../bookLevelEstimate';
import { openExtensionSettings, openYoutubePlaylists } from '../extensionBridgeUi';
import { useT } from '../i18n';
import { LANG_TAGS } from '../../shared/i18n/core';
import { INBOX_FOLDER } from '../../shared/inboxMeta';
import {
  effectiveLang,
  effectiveLevelEstimate,
  levelSortKey,
} from '../../shared/libraryLevel';
import { useCoverArt } from '../utils/coverArt';
import { takeHandoff } from '../pendingHandoff';

interface Props {
  onOpen: (item: LibraryItem) => void;
}

/** 'all' and 'unfiled' are reserved views; anything else is a folder name. */
type FolderFilter = 'all' | 'unfiled' | string;

type LibrarySort =
  | 'date-desc'
  | 'date-asc'
  | 'title'
  | 'lang'
  | 'length'
  | 'level'
  | 'source';

type LibraryGroup = 'none' | 'lang' | 'level' | 'source';
type InboxLangFilter = 'all' | 'ja' | 'zh' | 'en' | 'unknown';

function hostOf(url: string | undefined): string {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Compact lang · L# chip for covers / table (Inbox or file-book levelMeta). */
function levelChipLabel(item: LibraryItem): string | null {
  const lv = effectiveLevelEstimate(item);
  const lang = effectiveLang(item);
  if (lv == null && !item.inboxMeta && !item.levelMeta) return null;
  const parts: string[] = [];
  if (lang !== 'unknown' || item.inboxMeta || item.levelMeta) parts.push(lang.toUpperCase());
  if (lv != null) parts.push(`L${lv}`);
  if (item.inboxMeta && item.inboxMeta.estMinutes > 0) parts.push(`${item.inboxMeta.estMinutes}m`);
  return parts.length ? parts.join(' · ') : null;
}

function inboxGroupKey(
  item: LibraryItem,
  group: LibraryGroup,
  bookEstimate?: BookLevelEstimate,
): string {
  if (group === 'lang') return effectiveLang(item);
  if (group === 'level') {
    const lv = levelSortKey(item, bookEstimate);
    return lv < 99 ? `L${lv}` : '—';
  }
  if (group === 'source') return hostOf(item.inboxMeta?.sourceUrl ?? item.sourcePath) || '—';
  return '';
}


/**
 * Can this item be turned into text by OCR?
 *
 * Page-image items (a scanned PDF, a .cbz/.zip of pages, an image folder) have
 * no text layer, so OCR is the only way to read or mine them. A normal EPUB
 * already carries text and must not be offered the conversion.
 */
function canOcrToText(item: LibraryItem): boolean {
  if (item.kind === 'manga') return true;
  // Page images still on disk: either not yet converted, or converted once and
  // eligible for a re-run (the only route to adding a bilingual build).
  if ((item.pageCount ?? 0) > 0) return true;
  const file = item.epubFile ?? '';
  return file.toLowerCase().endsWith('.pdf');
}

export default function LibraryView({ onOpen: onOpenProp }: Props) {
  // §5.10 ARCH: opening a book plays the tape-seek cue (wired pack only).
  const onOpen = (item: LibraryItem) => {
    if (document.documentElement.getAttribute('data-materials') === 'wired') {
      window.dispatchEvent(new CustomEvent('wired:tape-seek'));
    }
    onOpenProp(item);
  };
  const { t, lang } = useT();
  const aero = useAeroMaterials();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [active, setActive] = useState<FolderFilter>('all');
  const [sortBy, setSortBy] = useState<LibrarySort>('date-desc');
  const [groupBy, setGroupBy] = useState<LibraryGroup>('none');
  const [langFilter, setLangFilter] = useState<InboxLangFilter>('all');
  const [levelFilter, setLevelFilter] = useState<'all' | '1' | '2' | '3' | '4' | '5' | '6' | '7'>('all');
  const [watchFolder, setWatchFolder] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** Item id whose "file into folder…" menu is open. */
  const [fileMenu, setFileMenu] = useState<string | null>(null);
  /** Manga item id whose "set as cover" thumbnail picker is open. */
  const [coverMenu, setCoverMenu] = useState<string | null>(null);
  const [coverMenuPages, setCoverMenuPages] = useState<string[]>([]);
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
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** JLPT/HSK cover badges keyed by library item id. */
  const [bookLevels, setBookLevels] = useState<Record<string, BookLevelEstimate>>({});
  const levelEnrichCancel = useRef({ cancelled: false });

  useEffect(() => {
    // Scan the watch folder for anything new, then load.
    window.api.syncLibrary().then(async (list) => {
      setItems(await enrichInboxItems(list));
    });
    window.api.getWatchFolder().then(setWatchFolder);
    window.api.getLibraryFolders().then((fs) => {
      setFolders(fs.includes(INBOX_FOLDER) ? fs : [...fs, INBOX_FOLDER]);
    });
    // Deep-link from Chrome extension settings / capture UI.
    const focus = takeHandoff('libraryFocusFolder');
    if (focus) setActive(focus);
    // Live updates when files are dropped into the watch folder while open.
    const unsub = window.api.onLibraryChanged((list) => {
      void enrichInboxItems(list).then(setItems);
    });
    return unsub;
  }, []);

  // Seed badges from cache, then idle-enrich missing EPUB estimates.
  useEffect(() => {
    const seed: Record<string, BookLevelEstimate> = {};
    for (const it of items) {
      if (it.kind !== 'book') continue;
      const cached = getCachedBookLevel(it.id);
      if (cached) seed[it.id] = cached;
    }
    setBookLevels(seed);

    levelEnrichCancel.current.cancelled = true;
    const signal = { cancelled: false };
    levelEnrichCancel.current = signal;
    void enrichBookLevelEstimates(
      items,
      (bookId, estimate) => {
        if (signal.cancelled) return;
        setBookLevels((prev) => (prev[bookId] === estimate ? prev : { ...prev, [bookId]: estimate }));
      },
      signal,
    );
    return () => {
      signal.cancelled = true;
    };
  }, [items]);

  useEffect(() => {
    return onBookLevelInputsChanged(() => {
      setBookLevels({});
      // Re-trigger enrich by cloning items reference via functional update.
      setItems((prev) => [...prev]);
    });
  }, []);

  async function importFiles() {
    setBusy(true);
    try {
      setItems(await enrichInboxItems(await window.api.importFiles()));
    } finally {
      setBusy(false);
    }
  }

  async function importFolder() {
    setBusy(true);
    try {
      setItems(await enrichInboxItems(await window.api.importFolder()));
    } finally {
      setBusy(false);
    }
  }

  async function chooseWatchFolder() {
    setBusy(true);
    try {
      const res = await window.api.setWatchFolder();
      setWatchFolder(res.folder);
      setItems(await enrichInboxItems(res.items));
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
      setItems(await enrichInboxItems(await window.api.syncLibrary()));
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    const ok = await confirmDialog({
      title: t('library.remove.title'),
      message: t('library.remove.message'),
      confirmLabel: t('common.remove'),
      danger: true,
    });
    if (ok) {
      setItems(await window.api.removeItem(id));
      setSelectedId((current) => (current === id ? null : current));
    }
  }

  async function remove(e: MouseEvent, id: string) {
    e.stopPropagation();
    await removeItem(id);
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
      setFolderErr(t('library.folder.reserved'));
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
    const next = await enrichInboxItems(
      await window.api.importGenerated({
        title: art.title,
        html: articleBodyHtml(art.title, art.html, art.meta),
        source: art.url,
      }),
    );
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
    const body = pasteText.trim();
    if (!body) return;
    const esc = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = body
      .split(/\r?\n\s*\r?\n/)
      .map((pg) => `<p>${pg.split(/\r?\n/).map(esc).join('<br/>')}</p>`)
      .join('');
    const next = await enrichInboxItems(
      await window.api.importGenerated({
        title: pasteTitle.trim() || body.replace(/\s+/g, ' ').slice(0, 28),
        html,
      }),
    );
    setItems(next);
    setImportOpen(false);
    setPasteTitle('');
    setPasteText('');
  }

  /** Shared drop handling for every chip. */
  function chipDropProps(folder: string | null, allowReorder: boolean) {
    return {
      onDragOver: (e: React.DragEvent) => {
        const types = e.dataTransfer.types;
        if (types.includes('app/lib-item') || (allowReorder && types.includes('app/lib-folder'))) {
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
      title: t('library.deleteFolder.title'),
      message: t('library.deleteFolder.message', { name }),
      confirmLabel: t('library.deleteFolder.confirm'),
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

  async function openCoverMenu(e: MouseEvent, id: string) {
    e.stopPropagation();
    if (coverMenu === id) {
      setCoverMenu(null);
      return;
    }
    setCoverMenu(id);
    setCoverMenuPages([]);
    const pages = await window.api.getMangaPages(id);
    setCoverMenuPages(pages.slice(0, 20));
  }

  function relPathFromMediaUrl(url: string): string | null {
    const m = /^media:\/\/[^/]+\/(.+)$/.exec(url);
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function setCoverFromPage(e: MouseEvent, id: string, pageUrl: string) {
    e.stopPropagation();
    setCoverMenu(null);
    const rel = relPathFromMediaUrl(pageUrl);
    if (!rel) return;
    setItems(await window.api.setLibraryCover(id, rel));
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
    let list: LibraryItem[];
    if (active === 'all') list = items;
    else if (active === 'unfiled') {
      list = items.filter((it) => !it.folder || !folders.includes(it.folder));
    } else list = items.filter((it) => it.folder === active);

    if (langFilter !== 'all') {
      list = list.filter((it) => effectiveLang(it) === langFilter);
    }
    if (levelFilter !== 'all') {
      const lv = Number(levelFilter);
      list = list.filter((it) => levelSortKey(it, bookLevels[it.id]) === lv);
    }

    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (sortBy) {
        case 'date-asc':
          return (a.inboxMeta?.receivedAt ?? a.createdAt) - (b.inboxMeta?.receivedAt ?? b.createdAt);
        case 'title':
          return a.title.localeCompare(b.title);
        case 'lang':
          return effectiveLang(a).localeCompare(effectiveLang(b));
        case 'length':
          return (b.inboxMeta?.charCount ?? 0) - (a.inboxMeta?.charCount ?? 0);
        case 'level':
          return levelSortKey(a, bookLevels[a.id]) - levelSortKey(b, bookLevels[b.id]);
        case 'source':
          return hostOf(a.inboxMeta?.sourceUrl ?? a.sourcePath).localeCompare(
            hostOf(b.inboxMeta?.sourceUrl ?? b.sourcePath),
          );
        case 'date-desc':
        default:
          return (b.inboxMeta?.receivedAt ?? b.createdAt) - (a.inboxMeta?.receivedAt ?? a.createdAt);
      }
    });
    return sorted;
  }, [items, active, folders, sortBy, langFilter, levelFilter, bookLevels]);

  const groupedVisible = useMemo(() => {
    if (groupBy === 'none') return [{ key: '', items: visible }];
    const map = new Map<string, LibraryItem[]>();
    for (const it of visible) {
      const key = inboxGroupKey(it, groupBy, bookLevels[it.id]);
      const bucket = map.get(key);
      if (bucket) bucket.push(it);
      else map.set(key, [it]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, groupItems]) => ({ key, items: groupItems }));
  }, [visible, groupBy, bookLevels]);

  const hasLevelFilters = useMemo(
    () =>
      items.some(
        (it) =>
          effectiveLevelEstimate(it) != null ||
          Boolean(bookLevels[it.id]) ||
          Boolean(it.inboxMeta),
      ),
    [items, bookLevels],
  );
  const selectedItem = visible.find((it) => it.id === selectedId) ?? visible[0] ?? null;
  const activeLabel =
    active === 'all'
      ? t('library.filter.allItems')
      : active === 'unfiled'
        ? t('library.filter.unfiled')
        : String(active);

  // Digital Library chrome — Aero only (AppChrome pass-through in default theme).
  // Rebuild each render so t() stays current after language / shelf changes.
  const libMenus: MenuBarMenu[] = [
    {
      id: 'file',
      label: t('library.menu.file'),
      items: [
        { id: 'import-files', label: t('library.menu.importFiles'), disabled: busy, onSelect: importFiles },
        { id: 'import-folder', label: t('library.menu.importFolder'), disabled: busy, onSelect: importFolder },
        { separator: true, label: '' },
        {
          id: 'import-web',
          label: t('library.menu.importWeb'),
          disabled: busy,
          onSelect: () => setImportOpen(true),
        },
        {
          id: 'import-wiki',
          label: t('library.menu.importWiki'),
          disabled: busy,
          onSelect: () => setWikiOpen(true),
        },
      ],
    },
    {
      id: 'library',
      label: t('palette.section.library'),
      items: [
        { id: 'sync', label: t('library.menu.syncNow'), disabled: busy, onSelect: syncNow },
        {
          id: 'watch-folder',
          label: watchFolder ? t('library.menu.changeWatchFolder') : t('library.menu.setWatchFolder'),
          disabled: busy,
          onSelect: chooseWatchFolder,
        },
        {
          id: 'stop-watch',
          label: t('library.menu.stopWatch'),
          disabled: busy || !watchFolder,
          onSelect: stopWatching,
        },
        { separator: true, label: '' },
        { id: 'new-folder', label: t('library.menu.newFolder'), onSelect: () => setCreating(true) },
        {
          id: 'delete-folder',
          label: t('library.deleteFolder.title'),
          disabled: typeof active !== 'string' || active === 'all' || active === 'unfiled' || active === INBOX_FOLDER,
          onSelect: () => {
            if (typeof active === 'string' && folders.includes(active)) void deleteFolder(active);
          },
        },
      ],
    },
    {
      id: 'view',
      label: t('library.menu.view'),
      items: [
        {
          id: 'view-all',
          label: t('library.menu.viewAll', { count: items.length }),
          disabled: active === 'all',
          onSelect: () => setActive('all'),
        },
        {
          id: 'view-unfiled',
          label: t('library.menu.viewUnfiled', { count: counts.unfiled }),
          disabled: active === 'unfiled' || counts.unfiled === 0,
          onSelect: () => setActive('unfiled'),
        },
        ...folders.map((f) => ({
          id: `view-folder-${f}`,
          label: t('library.menu.viewFolder', { name: f, count: counts.byFolder.get(f) ?? 0 }),
          disabled: active === f,
          onSelect: () => setActive(f),
        })),
      ],
    },
  ];
  const libStatus = (
    <>
      <StatusBarField>{t('library.status.items', { count: items.length })}</StatusBarField>
      <StatusBarField>{activeLabel}</StatusBarField>
      <StatusBarSpacer />
      {visible.length !== items.length && (
        <StatusBarField>{t('library.status.shown', { count: visible.length })}</StatusBarField>
      )}
      {watchFolder && (
        <StatusBarField title={watchFolder}>{t('library.status.autoImportOn')}</StatusBarField>
      )}
    </>
  );

  return (
    <AppChrome menus={libMenus} status={libStatus} className="aero-library-chrome">
    <div className={`library${aero ? ' aero-library' : ''}`} onClick={() => setFileMenu(null)}>
      <header className="view-head">
        <p className="muted">{t('library.intro')}</p>
        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={importFiles}>
            {t('library.btn.importFiles')}
          </button>
          <button className="btn" disabled={busy} onClick={importFolder}>
            <Icon name="folder" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
            {t('library.btn.importFolder')}
          </button>
          <button className="btn" disabled={busy} onClick={() => setImportOpen(true)}>
            <Icon name="globe" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
            {t('library.btn.webPaste')}
          </button>
          <button className="btn" disabled={busy} onClick={() => setWikiOpen(true)}>
            <Icon name="dice" size={14} style={{ marginRight: 6, verticalAlign: '-2px' }} />
            {t('library.btn.randomWiki')}
          </button>
        </div>
      </header>

      {wikiOpen && (
        <>
          <div className="lib-import-backdrop" onClick={() => !wikiBusy && setWikiOpen(false)} />
          <div className="lib-import">
            <h3>
              <Icon name="dice" size={16} style={{ marginRight: 6, verticalAlign: '-3px' }} />
              {t('library.wiki.title')}
            </h3>
            <p className="muted lib-import-note">{t('library.wiki.note')}</p>
            <div className="wiki-cats">
              {WIKI_CATEGORIES.map((c, i) => (
                <button
                  key={c.labelKey}
                  className={`lib-folder-chip ${wikiCat === i ? 'active' : ''}`}
                  disabled={wikiBusy}
                  onClick={() => setWikiCat(i)}
                >
                  {t(c.labelKey)}
                </button>
              ))}
            </div>
            {wikiErr && <div className="lib-import-err">{wikiErr}</div>}
            <div className="lib-import-actions">
              <button className="btn" disabled={wikiBusy} onClick={() => setWikiOpen(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn primary" disabled={wikiBusy} onClick={() => void rollWiki()}>
                {wikiBusy ? (
                  t('library.wiki.rolling')
                ) : (
                  <>
                    <Icon name="dice" size={13} style={{ marginRight: 4, verticalAlign: '-2px' }} />
                    {t('library.wiki.roll')}
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
            <h3>{t('library.import.title')}</h3>
            <div className="lib-import-row">
              <input
                type="text"
                className="gram-search"
                placeholder={t('library.import.urlPlaceholder')}
                value={webUrl}
                onChange={(e) => setWebUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && void importFromUrl()}
                disabled={webBusy}
              />
              <button className="btn primary" disabled={webBusy || !webUrl.trim()} onClick={() => void importFromUrl()}>
                {webBusy ? t('library.import.fetching') : t('library.import.import')}
              </button>
            </div>
            {webErr && <div className="lib-import-err">{webErr}</div>}
            <p className="muted lib-import-note">{t('library.import.note')}</p>
            <h3>{t('library.import.pasteHeading')}</h3>
            <input
              type="text"
              className="gram-search lib-import-title"
              placeholder={t('library.import.titlePlaceholder')}
              value={pasteTitle}
              onChange={(e) => setPasteTitle(e.target.value)}
            />
            <textarea
              className="lib-import-text"
              placeholder={t('library.import.textPlaceholder')}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              lang={getActiveProfile().targetLang}
            />
            <div className="lib-import-actions">
              <button className="btn" onClick={() => setImportOpen(false)}>
                {t('common.cancel')}
              </button>
              <button className="btn primary" disabled={!pasteText.trim()} onClick={() => void importFromText()}>
                {t('library.import.importText')}
              </button>
            </div>
          </div>
        </>
      )}

      {aero ? (
        <div className="aero-library-workbench">
          <aside className="aero-library-tree" aria-label={t('library.aero.foldersAria')}>
            <div className="aero-library-pane-title">{t('library.aero.shelves')}</div>
            <button
              type="button"
              className={`aero-library-tree-row ${active === 'all' ? 'active' : ''} ${dropHover === '__all__' ? 'dragover' : ''}`}
              onClick={() => setActive('all')}
              {...chipDropProps(null, false)}
            >
              <Icon name="library" size={15} />
              <span>{t('library.filter.allItems')}</span>
              <strong>{items.length}</strong>
            </button>
            {folders.map((f) => (
              <button
                key={f}
                type="button"
                className={`aero-library-tree-row ${active === f ? 'active' : ''} ${dropHover === f ? 'dragover' : ''}`}
                onClick={() => setActive(f)}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('app/lib-folder', f);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                {...chipDropProps(f, true)}
              >
                <Icon name="folder" size={15} />
                <span>{f}</span>
                <strong>{counts.byFolder.get(f) ?? 0}</strong>
              </button>
            ))}
            {counts.unfiled > 0 && (
              <button
                type="button"
                className={`aero-library-tree-row ${active === 'unfiled' ? 'active' : ''}`}
                onClick={() => setActive('unfiled')}
                {...chipDropProps(null, false)}
              >
                <Icon name="folder" size={15} />
                <span>{t('library.filter.unfiled')}</span>
                <strong>{counts.unfiled}</strong>
              </button>
            )}
            <div className="aero-library-tree-create">
              {creating ? (
                <>
                  <input
                    autoFocus
                    className="lib-folder-input"
                    type="text"
                    value={newName}
                    placeholder={t('library.folderName')}
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
                  <Button size="sm" onClick={() => void createFolder()}>
                    {t('library.ok')}
                  </Button>
                </>
              ) : (
                <Button size="sm" leftIcon={<Icon name="plus" size={13} />} onClick={() => setCreating(true)}>
                  {t('library.newFolder')}
                </Button>
              )}
              {folderErr && <span className="lib-folder-err">{folderErr}</span>}
            </div>
            <div className="aero-library-watch">
              <div className="aero-library-pane-title">{t('library.aero.autoImport')}</div>
              <p title={watchFolder ?? undefined}>
                {watchFolder ? watchFolder : t('library.aero.noWatchFolder')}
              </p>
              <div className="aero-library-watch-actions">
                <Button size="sm" disabled={busy} leftIcon={<Icon name="refresh" size={13} />} onClick={syncNow}>
                  {t('library.aero.sync')}
                </Button>
                <Button size="sm" disabled={busy} onClick={chooseWatchFolder}>
                  {watchFolder ? t('library.aero.change') : t('library.aero.set')}
                </Button>
              </div>
            </div>
          </aside>

          <main className="aero-library-main">
            <Toolbar className="aero-library-toolbar" aria-label={t('library.aero.commandsAria')}>
              <Button size="sm" disabled={busy} leftIcon={<Icon name="plus" size={14} />} onClick={importFiles}>
                {t('library.aero.toolbar.import')}
              </Button>
              <Button size="sm" disabled={busy} leftIcon={<Icon name="folder" size={14} />} onClick={importFolder}>
                {t('library.aero.toolbar.folder')}
              </Button>
              <Button size="sm" disabled={busy} leftIcon={<Icon name="globe" size={14} />} onClick={() => setImportOpen(true)}>
                {t('library.aero.toolbar.web')}
              </Button>
              <Button size="sm" leftIcon={<Icon name="folder" size={14} />} onClick={() => setActive(INBOX_FOLDER)}>
                {t('library.toolbar.inbox')}
              </Button>
              <Button size="sm" leftIcon={<Icon name="download" size={14} />} onClick={() => openExtensionSettings()}>
                {t('library.toolbar.extension')}
              </Button>
              <Button size="sm" leftIcon={<Icon name="player" size={14} />} onClick={() => openYoutubePlaylists()}>
                {t('library.toolbar.youtube')}
              </Button>
              <ToolbarSpacer />
              <label className="muted" htmlFor="aero-lib-sort" style={{ fontSize: 11 }}>
                {t('library.sort.label')}
              </label>
              <select
                id="aero-lib-sort"
                className="media-model-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as LibrarySort)}
              >
                <option value="date-desc">{t('library.sort.dateDesc')}</option>
                <option value="date-asc">{t('library.sort.dateAsc')}</option>
                <option value="title">{t('library.sort.title')}</option>
                <option value="source">{t('library.sort.source')}</option>
                <option value="lang">{t('library.sort.lang')}</option>
                <option value="length">{t('library.sort.length')}</option>
                <option value="level">{t('library.sort.level')}</option>
              </select>
              <label className="muted" htmlFor="aero-lib-group" style={{ fontSize: 11 }}>
                {t('library.group.label')}
              </label>
              <select
                id="aero-lib-group"
                className="media-model-select"
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as LibraryGroup)}
              >
                <option value="none">{t('library.group.none')}</option>
                <option value="lang">{t('library.group.lang')}</option>
                <option value="level">{t('library.group.level')}</option>
                <option value="source">{t('library.group.source')}</option>
              </select>
              <span className="aero-library-filter-label">{activeLabel}</span>
            </Toolbar>
            {hasLevelFilters && (
              <div className="lib-inbox-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 12px 8px' }}>
                {(['all', 'ja', 'zh', 'en', 'unknown'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className={`lib-folder-chip${langFilter === lang ? ' active' : ''}`}
                    onClick={() => setLangFilter(lang)}
                  >
                    {lang === 'all' ? t('library.filter.all') : t(`library.inbox.lang.${lang}`)}
                  </button>
                ))}
                {(['all', '1', '2', '3', '4', '5', '6', '7'] as const).map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    className={`lib-folder-chip${levelFilter === lv ? ' active' : ''}`}
                    onClick={() => setLevelFilter(lv)}
                  >
                    {lv === 'all' ? t('library.filter.all') : `L${lv}`}
                  </button>
                ))}
              </div>
            )}
            {busy && <div className="banner">{t('library.busy')}</div>}
            {items.length === 0 ? (
              <div className="aero-library-empty">
                <Icon name="library" size={38} />
                <h2>{t('library.empty.title')}</h2>
                <p className="muted">{t('library.empty.desc')}</p>
                <Button variant="primary" onClick={importFiles}>
                  {t('library.empty.cta')}
                </Button>
              </div>
            ) : visible.length === 0 ? (
              <div className="aero-library-empty">
                <Icon name="folder" size={38} />
                <h2>{t('library.emptyFolder.title')}</h2>
                <p className="muted">{t('library.emptyFolder.desc')}</p>
              </div>
            ) : (
              <div className="aero-library-table" role="table" aria-label={t('library.table.aria')}>
                <div className="aero-library-row aero-library-row-head" role="row">
                  <span>{t('library.table.title')}</span>
                  <span>{t('library.table.type')}</span>
                  <span>{t('library.table.progress')}</span>
                  <span>{t('library.table.folder')}</span>
                </div>
                {groupedVisible.map((group) => (
                  <div key={group.key || 'flat'} className="lib-group">
                    {groupBy !== 'none' && group.key ? (
                      <div className="lib-group-head muted" style={{ fontSize: 12, padding: '8px 10px 4px', fontWeight: 600 }}>
                        {group.key}
                      </div>
                    ) : null}
                    {group.items.map((it) => {
                  const pct = Math.round((it.progress?.percent ?? 0) * 100);
                  const selected = selectedItem?.id === it.id;
                  return (
                    <button
                      key={it.id}
                      type="button"
                      className={`aero-library-row ${selected ? 'active' : ''}`}
                      onClick={() => setSelectedId(it.id)}
                      onDoubleClick={() => onOpen(it)}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData('app/lib-item', it.id);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                    >
                      <span className="aero-library-title-cell">
                        <CoverThumb item={it} />
                        <span title={it.title}>{it.title}</span>
                      </span>
                      <span>
                        {levelChipLabel(it) ?? libraryKindLabel(it, t)}
                      </span>
                      <span>{pct > 0 ? `${pct}%` : t('library.progress.notStarted')}</span>
                      <span>
                        {it.folder && folders.includes(it.folder) ? it.folder : t('library.filter.unfiled')}
                      </span>
                    </button>
                  );
                    })}
                  </div>
                ))}
              </div>
            )}
          </main>

          <aside className="aero-library-inspector" aria-label={t('library.inspector.aria')}>
            <div className="aero-library-pane-title">{t('library.inspector.details')}</div>
            {selectedItem ? (
              <>
                <CoverPreview item={selectedItem}>
                  <CoverLevelBadge estimate={bookLevels[selectedItem.id]} t={t} lang={lang} />
                </CoverPreview>
                <h3 title={selectedItem.title}>{selectedItem.title}</h3>
                <dl className="aero-library-meta">
                  <div>
                    <dt>{t('library.table.type')}</dt>
                    <dd>{libraryKindLabel(selectedItem, t)}</dd>
                  </div>
                  <div>
                    <dt>{t('library.table.progress')}</dt>
                    <dd>{Math.round((selectedItem.progress?.percent ?? 0) * 100)}%</dd>
                  </div>
                  <div>
                    <dt>{t('library.table.folder')}</dt>
                    <dd>
                      {selectedItem.folder && folders.includes(selectedItem.folder)
                        ? selectedItem.folder
                        : t('library.filter.unfiled')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('library.inspector.added')}</dt>
                    <dd>{new Date(selectedItem.createdAt).toLocaleDateString(LANG_TAGS[lang])}</dd>
                  </div>
                </dl>
                <div className="aero-library-inspector-actions">
                  <Button variant="primary" leftIcon={<Icon name="novels" size={14} />} onClick={() => onOpen(selectedItem)}>
                    {t('library.open')}
                  </Button>
                  {selectedItem.kind === 'manga' && (
                    <Button
                      leftIcon={<Icon name="image" size={14} />}
                      onClick={(e) => void openCoverMenu(e, selectedItem.id)}
                    >
                      {t('library.card.setCoverTitle')}
                    </Button>
                  )}
                  <Button leftIcon={<Icon name="close" size={14} />} onClick={() => void removeItem(selectedItem.id)}>
                    {t('common.remove')}
                  </Button>
                </div>
                {coverMenu === selectedItem.id && (
                  <div className="card-cover-menu aero-library-cover-menu" onClick={(e) => e.stopPropagation()}>
                    {coverMenuPages.length === 0 ? (
                      <div className="card-file-empty muted">{t('library.card.loadingPages')}</div>
                    ) : (
                      coverMenuPages.map((pageUrl) => (
                        <button
                          key={pageUrl}
                          className="card-cover-thumb"
                          onClick={(e) => void setCoverFromPage(e, selectedItem.id, pageUrl)}
                        >
                          <img src={pageUrl} alt="" draggable={false} />
                        </button>
                      ))
                    )}
                  </div>
                )}
                {/* Only page-image items have anything to OCR; a normal EPUB already has text. */}
                {canOcrToText(selectedItem) && <BookOcrPanel item={selectedItem} />}
              </>
            ) : (
              <p className="muted">{t('library.inspector.selectHint')}</p>
            )}
          </aside>
        </div>
      ) : (
        <>
      <div className="watch-bar">
        <span className="watch-icon">
          <Icon name="refresh" size={14} />
        </span>
        {watchFolder ? (
          <>
            <span className="watch-label">
              {t('library.watch.autoFrom')} <code>{watchFolder}</code>
            </span>
            <button className="btn small" disabled={busy} onClick={syncNow}>
              {t('library.menu.syncNow')}
            </button>
            <button className="btn small" disabled={busy} onClick={chooseWatchFolder}>
              {t('library.aero.change')}
            </button>
            <button className="btn small" disabled={busy} onClick={stopWatching}>
              {t('common.stop')}
            </button>
          </>
        ) : (
          <>
            <span className="watch-label muted">{t('library.watch.hint')}</span>
            <button className="btn small" disabled={busy} onClick={chooseWatchFolder}>
              {t('library.watch.setFolder')}
            </button>
          </>
        )}
      </div>

      {/* ----- folder chips: click to filter, drag books onto them, drag to reorder ----- */}
      <div className="lib-folders">
        <button
          className={`lib-folder-chip ${active === 'all' ? 'active' : ''} ${dropHover === '__all__' ? 'dragover' : ''}`}
          onClick={() => setActive('all')}
          title={t('library.chip.allTitle')}
          {...chipDropProps(null, false)}
        >
          {t('library.filter.all')} <span className="lib-chip-count">{items.length}</span>
        </button>
        {folders.map((f) => (
          <button
            key={f}
            className={`lib-folder-chip ${active === f ? 'active' : ''} ${dropHover === f ? 'dragover' : ''}`}
            onClick={() => setActive(f)}
            title={t('library.chip.folderTitle', { name: f })}
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
                title={t('library.chip.deleteTitle')}
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
            {t('library.filter.unfiled')} <span className="lib-chip-count">{counts.unfiled}</span>
          </button>
        )}
        {creating ? (
          <span className="lib-folder-chip lib-folder-editor">
            <input
              autoFocus
              className="lib-folder-input"
              type="text"
              value={newName}
              placeholder={t('library.folderNameEllipsis')}
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
            <span className="lib-chip-del" title={t('library.chip.createTitle')} onClick={() => void createFolder()}>
              <Icon name="check" size={11} />
            </span>
          </span>
        ) : (
          <button className="lib-folder-chip lib-folder-new" onClick={() => setCreating(true)}>
            {t('library.newFolderPlus')}
          </button>
        )}
        {folderErr && <span className="lib-folder-err">{folderErr}</span>}
      </div>

      <div className="lib-sort-row" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <label className="muted" htmlFor="lib-sort" style={{ fontSize: 12 }}>
          {t('library.sort.label')}
        </label>
        <select
          id="lib-sort"
          className="media-model-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as LibrarySort)}
          aria-label={t('library.sort.label')}
        >
          <option value="date-desc">{t('library.sort.dateDesc')}</option>
          <option value="date-asc">{t('library.sort.dateAsc')}</option>
          <option value="title">{t('library.sort.title')}</option>
          <option value="source">{t('library.sort.source')}</option>
          <option value="lang">{t('library.sort.lang')}</option>
          <option value="length">{t('library.sort.length')}</option>
          <option value="level">{t('library.sort.level')}</option>
        </select>
        <label className="muted" htmlFor="lib-group" style={{ fontSize: 12 }}>
          {t('library.group.label')}
        </label>
        <select
          id="lib-group"
          className="media-model-select"
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as LibraryGroup)}
          aria-label={t('library.group.label')}
        >
          <option value="none">{t('library.group.none')}</option>
          <option value="lang">{t('library.group.lang')}</option>
          <option value="level">{t('library.group.level')}</option>
          <option value="source">{t('library.group.source')}</option>
        </select>
        <button type="button" className="btn small" onClick={() => setActive(INBOX_FOLDER)}>
          {t('library.toolbar.inbox')}
        </button>
        <button type="button" className="btn small" onClick={() => openExtensionSettings()}>
          {t('library.toolbar.extension')}
        </button>
        <button type="button" className="btn small" onClick={() => openYoutubePlaylists()}>
          {t('library.toolbar.youtube')}
        </button>
      </div>

      {hasLevelFilters && (
        <div className="lib-inbox-filters" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
          {(['all', 'ja', 'zh', 'en', 'unknown'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              className={`lib-folder-chip${langFilter === lang ? ' active' : ''}`}
              onClick={() => setLangFilter(lang)}
            >
              {lang === 'all' ? t('library.filter.all') : t(`library.inbox.lang.${lang}`)}
            </button>
          ))}
          <span className="muted" style={{ fontSize: 12, alignSelf: 'center', marginLeft: 4 }}>
            {t('library.inbox.levelChips')}
          </span>
          {(['all', '1', '2', '3', '4', '5', '6', '7'] as const).map((lv) => (
            <button
              key={lv}
              type="button"
              className={`lib-folder-chip${levelFilter === lv ? ' active' : ''}`}
              onClick={() => setLevelFilter(lv)}
            >
              {lv === 'all' ? t('library.filter.all') : `L${lv}`}
            </button>
          ))}
        </div>
      )}

      {busy && <div className="banner">{t('library.busy')}</div>}

      {items.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">
            <Icon name="library" size={44} />
          </div>
          <h2>{t('library.empty.title')}</h2>
          <p className="muted">{t('library.empty.descClassic')}</p>
          <button className="btn primary" onClick={importFiles}>
            {t('library.empty.cta')}
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji">
            <Icon name="folder" size={44} />
          </div>
          <h2>{t('library.emptyFolder.title')}</h2>
          <p className="muted">{t('library.emptyFolder.descClassic')}</p>
        </div>
      ) : (
        <div className="lib-groups">
          {groupedVisible.map((group) => (
            <div key={group.key || 'flat'} className="lib-group">
              {groupBy !== 'none' && group.key ? (
                <div className="lib-group-head muted" style={{ fontSize: 12, margin: '8px 0 6px', fontWeight: 600 }}>
                  {group.key}
                </div>
              ) : null}
              <div className="grid">
                {group.items.map((it) => {
            const pct = Math.round((it.progress?.percent ?? 0) * 100);
            const chip = levelChipLabel(it);
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
                <CoverCard item={it}>
                  <span className="kind-badge">
                    {it.kind === 'book' ? t('library.kind.book') : t('library.kind.manga')}
                  </span>
                  {chip && (
                    <span className="kind-badge" style={{ top: 28 }}>
                      {chip}
                    </span>
                  )}
                  {it.kind === 'manga' &&
                    it.ocrMeta &&
                    (it.ocrMeta.completedAt || it.ocrMeta.ocrPages > 0) && (
                    <span
                      className={`manga-ocr-badge${it.ocrMeta.completedAt ? ' manga-ocr-badge--done' : ''}`}
                      title={
                        it.ocrMeta.completedAt
                          ? t('library.manga.ocrDoneTitle')
                          : t('library.manga.ocrPartialTitle', {
                              ocr: it.ocrMeta.ocrPages,
                              tr: it.ocrMeta.translatedPages,
                              total: it.pageCount ?? it.ocrMeta.ocrPages,
                            })
                      }
                    >
                      {it.ocrMeta.completedAt
                        ? t('library.manga.ocrDone')
                        : t('library.manga.ocrPartial', {
                            n: it.ocrMeta.ocrPages,
                            total: it.pageCount ?? it.ocrMeta.ocrPages,
                          })}
                    </span>
                  )}
                  <CoverLevelBadge estimate={bookLevels[it.id]} t={t} lang={lang} />
                  {pct > 0 && (
                    <div className="card-progress">
                      <div style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <button
                    className="card-remove"
                    title={t('library.card.removeTitle')}
                    onClick={(e) => remove(e, it.id)}
                  >
                    <Icon name="close" size={13} />
                  </button>
                  <button
                    className="card-file"
                    title={t('library.card.fileTitle')}
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
                        <div className="card-file-empty muted">{t('library.card.noFolders')}</div>
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
                          {t('library.card.removeFrom', { name: it.folder })}
                        </button>
                      )}
                    </div>
                  )}
                  {it.kind === 'manga' && (
                    <button
                      className="card-cover-btn"
                      title={t('library.card.setCoverTitle')}
                      onClick={(e) => void openCoverMenu(e, it.id)}
                    >
                      <Icon name="image" size={13} />
                    </button>
                  )}
                  {coverMenu === it.id && (
                    <div className="card-cover-menu" onClick={(e) => e.stopPropagation()}>
                      {coverMenuPages.length === 0 ? (
                        <div className="card-file-empty muted">{t('library.card.loadingPages')}</div>
                      ) : (
                        coverMenuPages.map((pageUrl) => (
                          <button
                            key={pageUrl}
                            className="card-cover-thumb"
                            onClick={(e) => void setCoverFromPage(e, it.id, pageUrl)}
                          >
                            <img src={pageUrl} alt="" draggable={false} />
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </CoverCard>
                <div className="card-title" title={it.title}>
                  {it.title}
                </div>
                <div className="card-sub muted">
                  {it.kind === 'manga'
                    ? t('library.pages', { count: it.pageCount ?? 0 })
                    : it.epubFile?.endsWith('.pdf')
                      ? t('library.kind.pdf')
                      : t('library.kind.epub')}
                  {pct > 0 ? ` · ${pct}%` : ''}
                  {it.folder && folders.includes(it.folder) && (
                    <>
                      {' · '}
                      <Icon name="folder" size={11} style={{ verticalAlign: '-2px' }} /> {it.folder}
                    </>
                  )}
                </div>
                {canOcrToText(it) && (
                  <button
                    type="button"
                    className="btn small library-card-convert"
                    aria-expanded={selectedId === it.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId((current) => (current === it.id ? null : it.id));
                    }}
                  >
                    {it.epubFile ? t('bookOcr.reconvert') : t('bookOcr.convert')}
                  </button>
                )}
                {selectedId === it.id && canOcrToText(it) && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <BookOcrPanel item={it} />
                  </div>
                )}
              </div>
            );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
        </>
      )}
    </div>
    </AppChrome>
  );
}

function libraryKindLabel(
  it: LibraryItem,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (it.kind === 'manga') return t('library.pages', { count: it.pageCount ?? 0 });
  return it.epubFile?.toLowerCase().endsWith('.pdf') ? t('library.kind.pdf') : t('library.kind.epub');
}

/**
 * The three places a library cover is painted, each resolving through
 * `useCoverArt` so a recorded-but-missing file degrades to the designed
 * gradient — and, where there is room for it, to the title — instead of an
 * empty bordered box. `data-cover` is what a live probe reads to tell an
 * item that has art from one that only claims to.
 */
function CoverCard({ item, children }: { item: LibraryItem; children: ReactNode }) {
  const { style, hasArt, resolution } = useCoverArt(item.title, item.coverPath, item.id);
  return (
    <div className="cover" style={style} data-cover={resolution}>
      {!hasArt && <span className="cover-title">{item.title}</span>}
      {children}
    </div>
  );
}

function CoverPreview({ item, children }: { item: LibraryItem; children: ReactNode }) {
  const { style, hasArt, resolution } = useCoverArt(item.title, item.coverPath, item.id);
  return (
    <div className="aero-library-preview" style={style} data-cover={resolution}>
      {!hasArt && <span>{item.title}</span>}
      {children}
    </div>
  );
}

/** The compact-list thumbnail: too small for a title, so gradient-only. */
function CoverThumb({ item }: { item: LibraryItem }) {
  const { style, resolution } = useCoverArt(item.title, item.coverPath, item.id);
  return <span className="aero-library-thumb" style={style} data-cover={resolution} />;
}

/** Bottom-right JLPT/HSK badge on a book cover; flashes once when it first appears. */
function CoverLevelBadge({
  estimate,
  t,
  lang,
}: {
  estimate: BookLevelEstimate | undefined;
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: string;
}) {
  const [flash, setFlash] = useState(false);
  const seen = useRef(false);

  useEffect(() => {
    if (!estimate) {
      seen.current = false;
      return;
    }
    if (seen.current) return;
    seen.current = true;
    setFlash(true);
    const id = window.setTimeout(() => setFlash(false), 900);
    return () => window.clearTimeout(id);
  }, [estimate, lang]);

  if (!estimate) return null;
  return (
    <span
      className={`cover-level-badge${flash ? ' cover-level-badge--flash' : ''}`}
      aria-label={t('library.cover.levelAria', { level: estimate.label })}
    >
      {estimate.label}
    </span>
  );
}
