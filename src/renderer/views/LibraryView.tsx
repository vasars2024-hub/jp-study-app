import {
  useCallback,
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
  availableFilterChips,
  effectiveLang,
  effectiveLevelEstimate,
  levelSortKey,
  matchesLibraryFilters,
} from '../../shared/libraryLevel';
import { useCoverArt } from '../utils/coverArt';
import {
  DEFAULT_LIBRARY_LAYOUT,
  LIBRARY_LAYOUTS,
  drawerState,
  libraryHostedActions,
  resolveSelection,
  type LibraryLayout,
} from '../utils/libraryShelf';
import { setHandoffJson, takeHandoff } from '../pendingHandoff';
import {
  ReadingCanvas,
  type ReadingCanvasTool,
} from '../components/liquid/ReadingCanvas';
import { ContextualSurface } from '../components/liquid/LiquidSurface';
import { READING_CANVAS_FILL_POLICY } from '../../shared/liquidReadingCanvas';
import { readingWorkspaceEntryFromLibraryItem } from '../../shared/readingWorkspace';
import { resolveReadingWorkspaceActions } from '../../shared/readingWorkspaceActions';
import type { ReadingWorkspaceActionId } from '../../shared/readingWorkspaceActions';

interface Props {
  onOpen: (item: LibraryItem) => void;
  /**
   * An item to select on arrival — Reading Lists' §11.1 *"an entry's cover →
   * the library item detail"*, and any other surface that wants to reveal a
   * book rather than open it.
   *
   * A bare `setSelectedId` would NOT be enough and that is the whole reason
   * this is a prop rather than a caller-side click. `resolveSelection` returns
   * `null` for an id that is not in `visible`, deliberately — so a book hidden
   * by the folder, language or level filter the user last left set would land
   * on a closed drawer and read as a dead link. Revealing therefore CLEARS
   * those three filters, which is also the honest thing to show: the user
   * asked for this book, not for their filter.
   */
  revealItemId?: string | null;
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

export default function LibraryView({ onOpen: onOpenProp, revealItemId = null }: Props) {
  // §5.10 ARCH: opening a book plays the tape-seek cue (wired pack only).
  const onOpen = (item: LibraryItem) => {
    if (document.documentElement.getAttribute('data-materials') === 'wired') {
      window.dispatchEvent(new CustomEvent('wired:tape-seek'));
    }
    onOpenProp(item);
  };
  /**
   * Performs one action from the shared Reading set.
   *
   * Every branch reuses wiring that already exists somewhere else in the app —
   * `dict:lookup` is the global dictionary overlay's own channel, and the
   * mining handoff is byte-for-byte what `NovelsContent.analyzeSelected`
   * dispatches. That is the point: unifying the *set* must not fork the
   * *mechanism*, or the same button would behave differently per surface.
   */
  const runReadingAction = (id: ReadingWorkspaceActionId, item: LibraryItem) => {
    if (id === 'read') {
      onOpen(item);
      return;
    }
    if (id === 'dictionary') {
      // The same expression the registry's applicability rule reasons about,
      // so what is looked up is what made the action available in the first
      // place. A provider-supplied native title is the better query whenever
      // one exists; a scanlation's English title is not a word.
      const work = readingWorkspaceEntryFromLibraryItem(item).work;
      const query = (work.titleNative || work.title).trim();
      if (query) window.dispatchEvent(new CustomEvent('dict:lookup', { detail: { query } }));
      return;
    }
    if (id === 'mine') {
      setHandoffJson('epubMining', { bookId: item.id, ui: 'simple' });
      window.dispatchEvent(new CustomEvent('os:open', { detail: 'flashcards' }));
      window.dispatchEvent(new CustomEvent('flashcards:openEpubMining'));
    }
  };
  const { t, lang } = useT();
  const aero = useAeroMaterials();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [active, setActive] = useState<FolderFilter>('all');
  const [sortBy, setSortBy] = useState<LibrarySort>('date-desc');
  const [groupBy, setGroupBy] = useState<LibraryGroup>('none');
  const [layout, setLayout] = useState<LibraryLayout>(DEFAULT_LIBRARY_LAYOUT);
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
  /** Escape/commit swaps the editor back for its trigger; send focus with it. */
  const folderTriggerRef = useRef<HTMLButtonElement>(null);
  const wasCreatingFolder = useRef(false);
  useEffect(() => {
    if (wasCreatingFolder.current && !creating) {
      folderTriggerRef.current?.focus({ preventScroll: true });
    }
    wasCreatingFolder.current = creating;
  }, [creating]);
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

  /**
   * §11.1's reveal. Keyed on the id, so asking for the SAME book twice — leave
   * the drawer, come back through the same cover — reveals it again; a
   * mount-only effect would answer the second click with nothing.
   *
   * The three filters are cleared with it. See `revealItemId`'s note: without
   * that, a book the user's own filter excludes resolves to `null` and the
   * drawer never opens, which is indistinguishable from a broken link.
   */
  useEffect(() => {
    if (!revealItemId) return;
    setActive('all');
    setLangFilter('all');
    setLevelFilter('all');
    setSelectedId(revealItemId);
  }, [revealItemId]);

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

  /** The active folder's items, before the language / level chips narrow them. */
  const scoped = useMemo(() => {
    if (active === 'all') return items;
    if (active === 'unfiled') return items.filter((it) => !it.folder || !folders.includes(it.folder));
    return items.filter((it) => it.folder === active);
  }, [items, active, folders]);

  /**
   * Folder chip counts, narrowed by the SAME language / level filter the grid applies.
   *
   * A chip counts what clicking it would show, or it is a promise the shelf does not keep:
   * measured live on the real library, `Manga 3` under the Japanese filter opened onto zero
   * books and the message "This folder is empty". `matchesLibraryFilters` is the one predicate
   * `visible` uses below, so the two cannot drift apart again.
   */
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    let unfiled = 0;
    let all = 0;
    for (const it of items) {
      if (!matchesLibraryFilters(it, bookLevels, { lang: langFilter, level: levelFilter })) continue;
      all += 1;
      if (it.folder && folders.includes(it.folder)) c.set(it.folder, (c.get(it.folder) ?? 0) + 1);
      else unfiled += 1;
    }
    return { byFolder: c, unfiled, all };
  }, [items, folders, bookLevels, langFilter, levelFilter]);

  const visible = useMemo(() => {
    const list = scoped.filter((it) =>
      matchesLibraryFilters(it, bookLevels, { lang: langFilter, level: levelFilter }),
    );

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
  }, [scoped, sortBy, langFilter, levelFilter, bookLevels]);

  /**
   * The scope holds books and the filter hid every one of them. Distinct from an empty folder,
   * because the remedy is the opposite: clear the filter, not file something in here.
   */
  const filterHidesAll = visible.length === 0 && scoped.length > 0;

  const clearFilters = useCallback(() => {
    setLangFilter('all');
    setLevelFilter('all');
  }, []);

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

  /**
   * Only the chips that can return something. The two banks used to render all thirteen
   * options unconditionally — five languages and L1–L7 — so a shelf of Japanese books still
   * offered Chinese, English and Unknown, and levels nothing in the library carries. A filter
   * that can only ever produce an empty result is both clutter and a dishonest control, and
   * measured on this library it was thirteen of the twenty-five controls a user has to scan
   * before doing anything (`baselines/cat5-l6-library.json`, rubric category 5 Q4).
   *
   * Scoped to the ACTIVE FOLDER, because that is the list the chips actually filter — offering
   * a level that exists only in a folder you are not looking at is the same dead control one
   * step removed. `all` is always kept, and so is whatever is currently selected: a filter you
   * can apply and then cannot see or undo is worse than the clutter this removes.
   */
  const filterOptions = useMemo(
    () => availableFilterChips(scoped, bookLevels, { lang: langFilter, level: levelFilter }),
    [scoped, bookLevels, langFilter, levelFilter],
  );

  /**
   * What the collapsed filter disclosure has to say out loud. A filter that is applied while
   * its chips are tucked away is a shelf that silently hides books, so the summary carries the
   * selection: closed and unfiltered it reads "Filter", closed and filtered it reads
   * "Filter — Japanese · L7". Empty string means nothing is filtered.
   *
   * Depends on `lang`, not `t`: `t` is stable across a language change and a memo keyed on it
   * would keep serving the old language's chip labels.
   */
  const activeFilterLabel = useMemo(() => {
    const parts: string[] = [];
    if (langFilter !== 'all') parts.push(t(`library.inbox.lang.${langFilter}`));
    if (levelFilter !== 'all') parts.push(`L${levelFilter}`);
    return parts.join(' · ');
    // No eslint-disable: react-hooks/exhaustive-deps is not a configured rule in
    // this repo, so the directive is itself an ESLint error. The deps below are
    // deliberate.
  }, [langFilter, levelFilter, lang]);
  // Deliberately not backfilled with the first visible item — see
  // resolveSelection. A drawer that re-selects something the moment you close
  // it is a drawer that cannot be closed.
  const selectedItem = resolveSelection(visible, selectedId);
  const activeLabel =
    active === 'all'
      ? t('library.filter.allItems')
      : active === 'unfiled'
        ? t('library.filter.unfiled')
        : String(active);

  /**
   * The detail drawer's body, built once and mounted by whichever shell is
   * live. Both the Aero workbench and the Study OS shelf show the same facts
   * and the same actions — a drawer that differs by theme is two products.
   */
  const detailBody = selectedItem ? (
    <>
      <CoverPreview item={selectedItem}>
        <CoverLevelBadge estimate={bookLevels[selectedItem.id]} t={t} lang={lang} />
      </CoverPreview>
      <h3 title={selectedItem.title}>{selectedItem.title}</h3>
      <dl className="aero-library-meta lib-drawer-meta">
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
      <div className="aero-library-inspector-actions lib-drawer-actions">
        {/*
          The unified Reading action set, not a Library-specific button row.
          Order, label and icon all come from the shared registry, so "Mine
          vocabulary" here is the same words and the same glyph as it is in
          Novels and Discover once those adopt it too.
        */}
        {resolveReadingWorkspaceActions(
          readingWorkspaceEntryFromLibraryItem(selectedItem),
          libraryHostedActions(selectedItem),
        ).map((action) => (
          <Button
            key={action.id}
            variant={action.primary ? 'primary' : undefined}
            data-reading-action={action.id}
            leftIcon={<Icon name={action.icon as Parameters<typeof Icon>[0]['name']} size={14} />}
            onClick={() => runReadingAction(action.id, selectedItem)}
          >
            {t(action.labelKey)}
          </Button>
        ))}
        {/* Shelf management, deliberately outside the shared set: neither
            belongs to Reading, and neither is offered by any other surface. */}
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
  ) : null;

  /** The drawer's own header: a title and the one control that closes it. */
  const drawerHead = (
    <div className="aero-library-drawer-head">
      <div className="aero-library-pane-title">{t('library.inspector.details')}</div>
      <button
        type="button"
        className="aero-library-drawer-close"
        aria-label={t('common.close')}
        title={t('common.close')}
        onClick={() => setSelectedId(null)}
      >
        <Icon name="close" size={13} />
      </button>
    </div>
  );

  /** The layout switch, shared by both shells so the shapes stay the same two. */
  const layoutSwitch = (
    <div className="aero-library-layout-switch lq-hit-scope" role="group" aria-label={t('library.layout.aria')}>
      {LIBRARY_LAYOUTS.map((mode) => (
        <button
          key={mode}
          type="button"
          className={`lib-folder-chip${layout === mode ? ' active' : ''}`}
          data-library-layout={mode}
          aria-pressed={layout === mode}
          onClick={() => setLayout(mode)}
        >
          <Icon
            name={mode === 'grid' ? 'image' : 'library'}
            size={12}
            style={{ marginRight: 4, verticalAlign: '-2px' }}
          />
          {t(`library.layout.${mode}`)}
        </button>
      ))}
    </div>
  );

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
          label: t('library.menu.viewAll', { count: counts.all }),
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

  /**
   * The classic shelf's detail drawer is a reading side tool, and L6's canvas
   * decides where it goes — this view no longer does.
   *
   * Same defect Captures had, in a different stylesheet:
   * `.lib-shell[data-drawer='open']` was `grid-template-columns: minmax(0, 1fr)
   * 262px` with a `@media (max-width: 900px)` stack, and A MEDIA QUERY READS THE
   * WINDOW. This view renders inside the Reading Finder's 820px pane and in
   * pop-outs, so at a 600px pane inside a 1264px window the query never fired:
   * the drawer kept its whole 262px column and a five-column list row was left
   * ~322px. `ReadingCanvas` measures its own box, so the same pane turns the
   * drawer into a dismissible sheet and gives the list all 600px.
   *
   * FILL policy because a catalogue is not prose — a 760px clamp would letterbox
   * a table for no reason. `scroll="page"` because the classic shelf scrolls the
   * page rather than a bounded stage, which is what keeps the drawer sticky
   * instead of stretching it to the height of the whole list.
   */
  const libraryTools: ReadingCanvasTool[] = [];
  if (layout === 'list' && selectedItem) {
    libraryTools.push({
      id: 'library-detail',
      label: t('library.inspector.details'),
      // 220 is the narrowest the meta `<dl>` keeps its term/value pairs on one
      // line; below it they wrap and the drawer reads as a paragraph.
      minWidth: 220,
      preferredWidth: 262,
      onClose: () => setSelectedId(null),
      // `drawerHead` deliberately not reused here: the canvas head already
      // renders the title and the close, and the Aero workbench still needs it.
      content: detailBody,
    });
  }

  return (
    <AppChrome menus={libMenus} status={libStatus} className="aero-library-chrome">
    <div className={`library${aero ? ' aero-library' : ''}`} onClick={() => setFileMenu(null)}>
      <ContextualSurface as="header" className="view-head">
        <p className="muted">{t('library.intro')}</p>
        {/*
          Four import routes side by side made the header the largest single block of
          controls on the surface, and only one of them is the dominant task. The other
          three are tucked behind a disclosure: one click away, still in the File menu
          (`import-folder` / `import-web` / `import-wiki` above), and nothing is removed.
          Progressive disclosure, not deletion — the reverse transition is the same click.
        */}
        <div className="actions">
          <button className="btn primary" disabled={busy} onClick={importFiles}>
            {t('library.btn.importFiles')}
          </button>
          <details className="lib-more">
            <summary className="btn lib-more-summary">{t('library.btn.moreImports')}</summary>
            <div className="lib-more-body">
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
          </details>
        </div>
      </ContextualSurface>

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
                  aria-pressed={wikiCat === i}
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
        <div className="aero-library-workbench" data-drawer={drawerState(selectedItem)}>
          <aside className="aero-library-tree" aria-label={t('library.aero.foldersAria')}>
            <div className="aero-library-pane-title">{t('library.aero.shelves')}</div>
            <button
              type="button"
              className={`aero-library-tree-row ${active === 'all' ? 'active' : ''} ${dropHover === '__all__' ? 'dragover' : ''}`}
              aria-pressed={active === 'all'}
              onClick={() => setActive('all')}
              {...chipDropProps(null, false)}
            >
              <Icon name="library" size={15} />
              <span>{t('library.filter.allItems')}</span>
              <strong>{counts.all}</strong>
            </button>
            {folders.map((f) => (
              <button
                key={f}
                type="button"
                className={`aero-library-tree-row ${active === f ? 'active' : ''} ${dropHover === f ? 'dragover' : ''}`}
                aria-pressed={active === f}
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
            {/* Kept while it is the active selection even at zero — a filter that removes the
                chip you are standing on leaves you somewhere you cannot see or leave. Same
                rule `availableFilterChips` states for the language and level chips. */}
            {(counts.unfiled > 0 || active === 'unfiled') && (
              <button
                type="button"
                className={`aero-library-tree-row ${active === 'unfiled' ? 'active' : ''}`}
                aria-pressed={active === 'unfiled'}
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
                    aria-label={t('library.folderName')}
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
                <Button
                  size="sm"
                  ref={folderTriggerRef}
                  leftIcon={<Icon name="plus" size={13} />}
                  onClick={() => setCreating(true)}
                >
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
              {layoutSwitch}
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
              <div className="lib-inbox-filters lq-hit-scope" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '0 12px 8px' }}>
                {filterOptions.langs.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className={`lib-folder-chip${langFilter === lang ? ' active' : ''}`}
                    aria-pressed={langFilter === lang}
                    onClick={() => setLangFilter(lang)}
                  >
                    {lang === 'all' ? t('library.filter.all') : t(`library.inbox.lang.${lang}`)}
                  </button>
                ))}
                {filterOptions.levels.map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    className={`lib-folder-chip${levelFilter === lv ? ' active' : ''}`}
                    aria-pressed={levelFilter === lv}
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
            ) : filterHidesAll ? (
              <div className="aero-library-empty">
                <Icon name="folder" size={38} />
                <h2>{t('library.emptyFilter.title')}</h2>
                <p className="muted">{t('library.emptyFilter.desc')}</p>
                <Button variant="primary" onClick={clearFilters}>
                  {t('library.emptyFilter.clear')}
                </Button>
              </div>
            ) : visible.length === 0 ? (
              <div className="aero-library-empty">
                <Icon name="folder" size={38} />
                <h2>{t('library.emptyFolder.title')}</h2>
                <p className="muted">{t('library.emptyFolder.desc')}</p>
              </div>
            ) : layout === 'grid' ? (
              <div className="aero-library-shelf">
                {groupedVisible.map((group) => (
                  <div key={group.key || 'flat'} className="lib-group">
                    {groupBy !== 'none' && group.key ? (
                      <div className="lib-group-head muted" style={{ fontSize: 12, padding: '8px 4px 4px', fontWeight: 600 }}>
                        {group.key}
                      </div>
                    ) : null}
                    <div className="aero-library-grid" role="group" aria-label={t('library.table.aria')}>
                      {group.items.map((it) => (
                        <LibraryTile
                          key={it.id}
                          item={it}
                          t={t}
                          lang={lang}
                          estimate={bookLevels[it.id]}
                          selected={selectedItem?.id === it.id}
                          onSelect={() => setSelectedId(it.id)}
                          onOpen={() => onOpen(it)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
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
                      aria-pressed={selected}
                      onClick={() => setSelectedId(it.id)}
                      onDoubleClick={() => onOpen(it)}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter' || e.target !== e.currentTarget) return;
                        e.preventDefault();
                        e.stopPropagation();
                        if (!e.repeat) onOpen(it);
                      }}
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

          {/*
            The detail pane is contextual, not permanent: with nothing selected
            it is not in the layout at all, and the shelf takes the width back.
            That is the whole difference between a drawer and a third column.
          */}
          {selectedItem && (
            <aside className="aero-library-inspector" aria-label={t('library.inspector.aria')}>
              {drawerHead}
              {detailBody}
            </aside>
          )}
        </div>
      ) : (
        <>
      {/*
        The watch bar is STATUS first and administration second, so the status stays in
        the summary — always readable, never a click away — and only the three actions
        tuck away. Collapsed in both states on purpose: the control count a user has to
        scan should not depend on whether a watch folder happens to be configured.
        All three live in the Library menu as well (`sync` / `watch-folder` / `stop-watch`).
      */}
      <details className="watch-bar lq-hit-scope">
        <summary className="watch-summary">
          <span className="watch-icon">
            <Icon name="refresh" size={14} />
          </span>
          {watchFolder ? (
            <span className="watch-label">
              {t('library.watch.autoFrom')} <code>{watchFolder}</code>
            </span>
          ) : (
            <span className="watch-label muted">{t('library.watch.hint')}</span>
          )}
        </summary>
        <div className="watch-actions">
          {watchFolder ? (
            <>
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
            <button className="btn small" disabled={busy} onClick={chooseWatchFolder}>
              {t('library.watch.setFolder')}
            </button>
          )}
        </div>
      </details>

      {/* ----- folder chips: click to filter, drag books onto them, drag to reorder ----- */}
      <div className="lib-folders lq-hit-scope">
        <button
          className={`lib-folder-chip ${active === 'all' ? 'active' : ''} ${dropHover === '__all__' ? 'dragover' : ''}`}
          aria-pressed={active === 'all'}
          onClick={() => setActive('all')}
          title={t('library.chip.allTitle')}
          {...chipDropProps(null, false)}
        >
          {t('library.filter.all')} <span className="lib-chip-count">{counts.all}</span>
        </button>
        {folders.map((f) => (
          <button
            key={f}
            className={`lib-folder-chip ${active === f ? 'active' : ''} ${dropHover === f ? 'dragover' : ''}`}
            aria-pressed={active === f}
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
        {(counts.unfiled > 0 || active === 'unfiled') && folders.length > 0 && (
          <button
            className={`lib-folder-chip ${active === 'unfiled' ? 'active' : ''} ${dropHover === '__all__' ? '' : ''}`}
            aria-pressed={active === 'unfiled'}
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
              aria-label={t('library.folderName')}
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
          <button
            ref={folderTriggerRef}
            className="lib-folder-chip lib-folder-new"
            onClick={() => setCreating(true)}
          >
            {t('library.newFolderPlus')}
          </button>
        )}
        {folderErr && <span className="lib-folder-err">{folderErr}</span>}
      </div>

      <div className="lib-sort-row lq-hit-scope" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
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
        {layoutSwitch}
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

      {/*
        The two refine banks live behind one disclosure. They are not the dominant task on this
        surface — opening a book is — and at rest they put ten more chips between a user and the
        shelf. Rubric category 5 Q4 measured 13 controls scanned before a single cover, against
        a bar of 12. Nothing is removed: <details> keeps them one click and one Enter away and
        gives the keyboard and screen-reader semantics for free, and the summary names whatever
        is currently filtering so a closed disclosure can never hide why books are missing.
      */}
      {hasLevelFilters && (
        <details className="lib-filter-bar lq-hit-scope">
          <summary className="lib-filter-summary">
            <span>{t('library.filter.refine')}</span>
            {activeFilterLabel && <span className="lib-filter-active">{activeFilterLabel}</span>}
          </summary>
          <div
            className="lib-inbox-filters lq-hit-scope"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 4 }}
          >
            {filterOptions.langs.map((lang) => (
              <button
                key={lang}
                type="button"
                className={`lib-folder-chip${langFilter === lang ? ' active' : ''}`}
                aria-pressed={langFilter === lang}
                onClick={() => setLangFilter(lang)}
              >
                {lang === 'all' ? t('library.filter.all') : t(`library.inbox.lang.${lang}`)}
              </button>
            ))}
            <span className="muted" style={{ fontSize: 12, alignSelf: 'center', marginLeft: 4 }}>
              {t('library.inbox.levelChips')}
            </span>
            {filterOptions.levels.map((lv) => (
              <button
                key={lv}
                type="button"
                className={`lib-folder-chip${levelFilter === lv ? ' active' : ''}`}
                aria-pressed={levelFilter === lv}
                onClick={() => setLevelFilter(lv)}
              >
                {lv === 'all' ? t('library.filter.all') : `L${lv}`}
              </button>
            ))}
          </div>
        </details>
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
      ) : filterHidesAll ? (
        <div className="empty">
          <div className="empty-emoji">
            <Icon name="folder" size={44} />
          </div>
          <h2>{t('library.emptyFilter.title')}</h2>
          <p className="muted">{t('library.emptyFilter.descClassic')}</p>
          <button className="btn primary" onClick={clearFilters}>
            {t('library.emptyFilter.clear')}
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
        <ReadingCanvas
          className="lib-shell"
          data-drawer={drawerState(layout === 'list' ? selectedItem : null)}
          tools={libraryTools}
          closeLabel={t('common.close')}
          policy={READING_CANVAS_FILL_POLICY}
          scroll="page"
          aria-label={t('library.table.aria')}
        >
        {layout === 'list' ? (
          <div className="lib-list-groups">
            {groupedVisible.map((group) => (
              <div key={group.key || 'flat'} className="lib-group">
                {groupBy !== 'none' && group.key ? (
                  <div className="lib-group-head muted" style={{ fontSize: 12, margin: '8px 0 6px', fontWeight: 600 }}>
                    {group.key}
                  </div>
                ) : null}
                <div className="lib-list" role="group" aria-label={t('library.table.aria')}>
                  <div className="lib-list-row lib-list-head" aria-hidden="true">
                    <span>{t('library.table.title')}</span>
                    <span>{t('library.table.type')}</span>
                    <span>{t('library.table.progress')}</span>
                    <span>{t('library.table.folder')}</span>
                  </div>
                  {group.items.map((it) => {
                    const pct = Math.round((it.progress?.percent ?? 0) * 100);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        className={`lib-list-row${selectedItem?.id === it.id ? ' active' : ''}`}
                        aria-pressed={selectedItem?.id === it.id}
                        data-library-row={it.id}
                        onClick={() => setSelectedId(it.id)}
                        onDoubleClick={() => onOpen(it)}
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter' || e.target !== e.currentTarget) return;
                          e.preventDefault();
                          e.stopPropagation();
                          if (!e.repeat) onOpen(it);
                        }}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('app/lib-item', it.id);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                      >
                        <span className="lib-list-title">
                          <CoverThumb item={it} />
                          <span title={it.title}>{it.title}</span>
                        </span>
                        <span>{levelChipLabel(it) ?? libraryKindLabel(it, t)}</span>
                        <span>{pct > 0 ? `${pct}%` : t('library.progress.notStarted')}</span>
                        <span>
                          {it.folder && folders.includes(it.folder) ? it.folder : t('library.filter.unfiled')}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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
                // Measured live 2026-09-06 on the user's own library (24 items):
                // this card was a bare `div` with an `onClick`, so the Covers
                // grid held exactly TWO focusable elements per item — Remove and
                // File — and NONE of them opened the book. The primary action of
                // the whole surface was mouse-only, and a screen reader was told
                // the card was a group of decorations.
                //
                // The shape is the one already used by `aero-library-tile`
                // further down this same file, so the two library grids now
                // answer the keyboard identically.
                role="button"
                tabIndex={0}
                aria-label={it.title}
                onClick={() => onOpen(it)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  // The nested Remove / File / Set-cover buttons handle their own
                  // keys. Without this guard, Enter on Remove would delete the
                  // item AND open it, because the keydown bubbles to the card.
                  if (e.target !== e.currentTarget) return;
                  // Space would scroll the grid out from under the card just picked.
                  e.preventDefault();
                  onOpen(it);
                }}
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
                    className="card-remove lq-hit-placed"
                    title={t('library.card.removeTitle')}
                    onClick={(e) => remove(e, it.id)}
                  >
                    <Icon name="close" size={13} />
                  </button>
                  <button
                    className="card-file lq-hit-placed"
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
                          aria-pressed={it.folder === f}
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
                      className="card-cover-btn lq-hit-placed"
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
        {/*
          The drawer itself is no longer here — it is `libraryTools` above, and
          the canvas places it. What still lives here is the rule about WHEN it
          exists at all: the drawer belongs to the compact list, where a row has
          nowhere to put its actions. A grid card already carries its own, and
          `selectedId` there drives the inline OCR panel, so opening a drawer on
          the same state would answer one click with two panels.
        */}
        </ReadingCanvas>
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
 * One shelf tile: the cover-first unit the grid is built from.
 *
 * Selection and opening are deliberately the same gestures the compact list
 * uses — single click (or Enter/Space) selects and fills the detail drawer,
 * double click opens — so switching layout does not change what a click means.
 * It stays draggable because filing into a folder by dragging is the only way
 * to file without going through the drawer.
 */
function LibraryTile({
  item,
  t,
  lang,
  estimate,
  selected,
  onSelect,
  onOpen,
}: {
  item: LibraryItem;
  t: (key: string, vars?: Record<string, string | number>) => string;
  lang: string;
  estimate: BookLevelEstimate | undefined;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const pct = Math.round((item.progress?.percent ?? 0) * 100);
  const chip = levelChipLabel(item);
  return (
    <div
      className={`aero-library-tile${selected ? ' active' : ''}`}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      data-library-tile={item.id}
      onClick={onSelect}
      onDoubleClick={onOpen}
      onKeyDown={(e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        // Space would scroll the shelf out from under the tile that was just picked.
        e.preventDefault();
        onSelect();
      }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('app/lib-item', item.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <CoverCard item={item}>
        {chip && <span className="kind-badge">{chip}</span>}
        <CoverLevelBadge estimate={estimate} t={t} lang={lang} />
        {pct > 0 && (
          <div className="card-progress">
            <div style={{ width: `${pct}%` }} />
          </div>
        )}
      </CoverCard>
      <span className="aero-library-tile-title" title={item.title}>
        {item.title}
      </span>
      <span className="aero-library-tile-sub muted">
        {libraryKindLabel(item, t)}
        {pct > 0 ? ` · ${pct}%` : ''}
      </span>
    </div>
  );
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
    <div className="aero-library-preview lib-drawer-cover" style={style} data-cover={resolution}>
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
