/**
 * Novel-finder logic and the shared workbench blocks (filters / table /
 * inspector), used by Study OS's `NovelsView` and Blanc's `BlancNovelsPanel`.
 *
 * Pillar 2 (BLANC_REFINEMENT_PLAN.md): Blanc previously had `NovelReader` only
 * — reading, no catalogue. The catalogue is the Jiten search + local catalogue
 * + plan-to-read store, all of which live in the shared `jiten` IPC and the
 * `data/novels` module. What was view-local was the state machine tying them
 * together and the three-pane workbench markup.
 *
 * The `jiten-*` presentation classes live in `styles.css`, which both shells
 * load, so the blocks render styled in either bundle. Each shell supplies its
 * own toolbar and chrome — Study OS its aero `Toolbar`/`AppChrome`, Blanc its
 * `fieldset`/`legend`. Nothing here may import `AppChrome`/`MenuBar`/`StatusBar`
 * or the `components/ui` barrel (which would drag them into Blanc's bundle).
 */
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import Icon from '../Icons';
import {
  buildSourceLinks,
  difficultyLabel,
  JITEN_GENRES,
  jitenGenreId,
  jitenGenreName,
  type JitenDeck,
  type JitenPlanEntry,
  type JitenSourceLink,
  type JitenSourceProfile,
  type JitenStore,
} from '../../../shared/jiten';
import {
  novelsAnalyzeEpubReason,
  novelsDownloadEpubReason,
  novelsImportFileReason,
  novelsJitenMineReason,
  novelsOpenSourceReason,
  novelsPlanReason,
} from '../../../shared/novelsActionReason';
import {
  NOVELS,
  NOVEL_TYPES,
  DIFFICULTY_ORDER,
  GENRES,
  type Novel,
  type NovelType,
  type Difficulty,
  type Genre,
} from '../../data/novels';
import { setHandoffJson } from '../../pendingHandoff';
import { useT } from '../../i18n';

type TypeFilter = 'All' | 'Novel' | 'WebNovel' | 'Local';
type DiffFilter = 'All' | Difficulty | 'Unknown';
type AvailabilityFilter = 'all' | 'with-source' | 'direct';
type ImportFilter = 'all' | 'imported' | 'not-imported';
type AnalysisFilter = 'all' | 'analyzed' | 'not-analyzed';
type SortKey = 'difficulty' | 'title' | 'author' | 'source' | 'status';
type CandidateKind = 'jiten' | 'local';

interface NovelCandidate {
  id: string;
  kind: CandidateKind;
  titleJp: string;
  englishTitle?: string;
  author?: string;
  type: 'Novel' | 'WebNovel' | 'Local';
  difficultyRaw?: number;
  difficultyLabel: string;
  genres: string[];
  tags: string[];
  coverUrl?: string;
  description?: string;
  sourceLinks: JitenSourceLink[];
  jitenDeckId?: number;
  characterCount?: number;
  wordCount?: number;
  uniqueWordCount?: number;
  sentenceCount?: number;
  deck?: JitenDeck;
  localNovel?: Novel;
}

const PLAN_KEY = 'jp-novels-planned';

export const DIFFICULTY_CLASS: Record<Difficulty | 'Unknown', string> = {
  Beginner: 'd-beginner',
  Easy: 'd-easy',
  Moderate: 'd-moderate',
  Hard: 'd-hard',
  'Very Hard': 'd-veryhard',
  Unknown: 'd-unknown',
};

const NOVEL_TYPE_SET = new Set<string>(NOVEL_TYPES);
const DIFFICULTY_SET = new Set<string>(DIFFICULTY_ORDER);
const GENRE_SET = new Set<string>(GENRES);
const JLPT_SET = new Set(['N5', 'N4', 'N3', 'N2', 'N1']);
const LINK_KINDS = new Set(['free', 'store', 'info']);

function openLink(url: string): void {
  void window.api.openExternal(url);
}

function openFlashcardsMining(): void {
  window.dispatchEvent(new CustomEvent('os:open', { detail: 'flashcards' }));
  window.dispatchEvent(new CustomEvent('flashcards:openEpubMining'));
}

function coverStyle(seed: string): CSSProperties {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  const h2 = (h + 34) % 360;
  return { background: `linear-gradient(135deg, hsl(${h} 38% 28%), hsl(${h2} 42% 18%))` };
}

function sanitizeRemoteNovel(raw: unknown): Novel | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.titleJp !== 'string' || !o.titleJp.trim()) return null;
  if (typeof o.author !== 'string' || !o.author.trim()) return null;
  if (typeof o.type !== 'string' || !NOVEL_TYPE_SET.has(o.type)) return null;
  if (typeof o.difficulty !== 'string' || !DIFFICULTY_SET.has(o.difficulty)) return null;
  const genres = Array.isArray(o.genres)
    ? o.genres.filter((g): g is Genre => typeof g === 'string' && GENRE_SET.has(g))
    : [];
  const links = Array.isArray(o.links)
    ? o.links
        .filter((l): l is { label: string; url: string; kind: string } => {
          if (!l || typeof l !== 'object') return false;
          const x = l as Record<string, unknown>;
          return typeof x.label === 'string' && typeof x.url === 'string' && typeof x.kind === 'string' && LINK_KINDS.has(x.kind);
        })
        .map((l) => ({ label: l.label, url: l.url, kind: l.kind as Novel['links'][number]['kind'] }))
    : [];
  return {
    id: typeof o.id === 'string' && o.id ? o.id : o.titleJp,
    titleJp: o.titleJp,
    reading: typeof o.reading === 'string' ? o.reading : undefined,
    titleEn: typeof o.titleEn === 'string' ? o.titleEn : undefined,
    author: o.author,
    authorEn: typeof o.authorEn === 'string' ? o.authorEn : undefined,
    type: o.type as NovelType,
    genres,
    year: typeof o.year === 'number' ? o.year : undefined,
    difficulty: o.difficulty as Difficulty,
    jlpt: typeof o.jlpt === 'string' && JLPT_SET.has(o.jlpt) ? (o.jlpt as Novel['jlpt']) : undefined,
    freeOnAozora: Boolean(o.freeOnAozora),
    synopsis: typeof o.synopsis === 'string' ? o.synopsis : '',
    links,
  };
}

function localCandidate(novel: Novel, profiles: JitenSourceProfile[]): NovelCandidate {
  const localLinks: JitenSourceLink[] = novel.links.map((link, index) => ({
    id: `local-${novel.id}-${index}`,
    label: link.label,
    url: link.url,
    direct: false,
  }));
  const profileLinks = buildSourceLinks(
    {
      titleJp: novel.titleJp,
      originalTitle: novel.titleJp,
      author: novel.author,
      romajiTitle: novel.reading,
      englishTitle: novel.titleEn,
    },
    profiles,
  );
  return {
    id: `local-${novel.id}`,
    kind: 'local',
    titleJp: novel.titleJp,
    englishTitle: novel.titleEn,
    author: novel.authorEn ?? novel.author,
    type: 'Local',
    difficultyRaw: DIFFICULTY_ORDER.indexOf(novel.difficulty),
    difficultyLabel: novel.difficulty,
    genres: novel.genres,
    tags: novel.jlpt ? [novel.jlpt] : [],
    description: novel.synopsis,
    sourceLinks: dedupeLinks([...localLinks, ...profileLinks]),
    localNovel: novel,
  };
}

function jitenCandidate(deck: JitenDeck, profiles: JitenSourceProfile[]): NovelCandidate {
  const rawDifficulty = deck.difficultyRaw ?? deck.difficulty;
  const sourceLinks = buildSourceLinks(deck, profiles, deck.links);
  return {
    id: `jiten-${deck.deckId}`,
    kind: 'jiten',
    titleJp: deck.originalTitle,
    englishTitle: deck.englishTitle,
    author: undefined,
    type: deck.mediaType === 8 ? 'WebNovel' : 'Novel',
    difficultyRaw: rawDifficulty,
    difficultyLabel: difficultyLabel(rawDifficulty),
    genres: deck.genres?.map(jitenGenreName) ?? [],
    tags: deck.tags?.map((tag) => tag.name) ?? [],
    coverUrl: deck.coverName,
    description: deck.description,
    sourceLinks,
    jitenDeckId: deck.deckId,
    characterCount: deck.characterCount,
    wordCount: deck.wordCount,
    uniqueWordCount: deck.uniqueWordCount,
    sentenceCount: deck.sentenceCount,
    deck,
  };
}

/**
 * A row built from a plan entry alone, for the case where nothing else can
 * produce one.
 *
 * The table is assembled from the LIVE sources — the bundled/remote local
 * catalogue and whatever Jiten search returned this session — and the plan was
 * then used only as a lookup to decorate them. So a planned title that no live
 * source happens to offer right now simply did not exist: with the Plan filter
 * on, the chip counted it (`store.plan.length`) while the table silently left
 * it out. On this machine that was two of six — both Jiten-planned, one already
 * `mined` — invisible for as long as the session had not searched Jiten, which
 * is the state the app starts in.
 *
 * A plan entry carries its own title, difficulty, genres, description and
 * source links, so it can stand alone. The row is deliberately built from what
 * was stored rather than refetched: the point is that the user's plan is never
 * hidden by a source being unavailable.
 */
function planCandidate(entry: JitenPlanEntry, profiles: JitenSourceProfile[]): NovelCandidate {
  const rawDifficulty = entry.difficultyRaw;
  return {
    id: entry.id,
    kind: entry.jitenDeckId != null ? 'jiten' : 'local',
    titleJp: entry.titleJp,
    englishTitle: entry.englishTitle,
    author: entry.author,
    type: entry.jitenDeckId == null ? 'Local' : entry.mediaType === 8 ? 'WebNovel' : 'Novel',
    difficultyRaw: rawDifficulty,
    difficultyLabel: entry.difficultyLabel ?? difficultyLabel(rawDifficulty),
    genres: entry.genres ?? [],
    tags: entry.tags ?? [],
    coverUrl: entry.coverUrl,
    description: entry.description,
    sourceLinks: dedupeLinks([
      ...(entry.sourceLinks ?? []),
      ...buildSourceLinks(entry, profiles),
    ]),
    jitenDeckId: entry.jitenDeckId,
  };
}

function dedupeLinks(links: JitenSourceLink[]): JitenSourceLink[] {
  const seen = new Set<string>();
  return links.filter((link) => {
    if (seen.has(link.url)) return false;
    seen.add(link.url);
    return true;
  });
}

function textMatches(candidate: NovelCandidate, query: string): boolean {
  if (!query) return true;
  const hay = [
    candidate.titleJp,
    candidate.englishTitle,
    candidate.author,
    candidate.type,
    candidate.difficultyLabel,
    candidate.description,
    ...candidate.genres,
    ...candidate.tags,
  ].join(' ').toLowerCase();
  return hay.includes(query);
}

function localPlanEntry(candidate: NovelCandidate, existing?: JitenPlanEntry): JitenPlanEntry {
  const now = Date.now();
  return {
    id: candidate.id,
    titleJp: candidate.titleJp,
    author: candidate.author,
    englishTitle: candidate.englishTitle,
    coverUrl: candidate.coverUrl,
    description: candidate.description,
    genres: candidate.genres,
    tags: candidate.tags,
    difficultyRaw: candidate.difficultyRaw,
    difficultyLabel: candidate.difficultyLabel,
    sourceLinks: candidate.sourceLinks,
    selectedSourceId: existing?.selectedSourceId ?? candidate.sourceLinks[0]?.id,
    importedLibraryItemId: existing?.importedLibraryItemId,
    acquisitionStatus: existing?.acquisitionStatus ?? 'planned',
    notes: existing?.notes,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    minedAt: existing?.minedAt,
    error: existing?.error,
  };
}

function linkFromEntry(entry: JitenPlanEntry | null, candidate: NovelCandidate | null): JitenSourceLink[] {
  return entry?.sourceLinks.length ? entry.sourceLinks : candidate?.sourceLinks ?? [];
}

export function useNovels() {
  // The status banner is the workbench's only channel for "what just happened",
  // and every message in it was an English literal — so a Japanese, Chinese or
  // Russian user got English the moment anything succeeded or refused. The
  // `error.message` cases stay untranslated on purpose: those are the source's
  // own words, not ours.
  const { t } = useT();
  const [query, setQuery] = useState('');
  const [type, setType] = useState<TypeFilter>('All');
  const [diff, setDiff] = useState<DiffFilter>('All');
  const [genre, setGenre] = useState('All');
  const [availability, setAvailability] = useState<AvailabilityFilter>('all');
  const [importFilter, setImportFilter] = useState<ImportFilter>('all');
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilter>('all');
  const [sort, setSort] = useState<SortKey>('difficulty');
  const [planOnly, setPlanOnly] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [store, setStore] = useState<JitenStore | null>(null);
  const [sourceDrafts, setSourceDrafts] = useState<JitenSourceProfile[]>([]);
  const [apiBaseDraft, setApiBaseDraft] = useState('');
  const [apiKeyDraft, setApiKeyDraft] = useState('');
  const [showSources, setShowSources] = useState(false);
  const [jitenDecks, setJitenDecks] = useState<JitenDeck[]>([]);
  const [remoteNovels, setRemoteNovels] = useState<Novel[]>([]);
  const [loadingJiten, setLoadingJiten] = useState(false);
  const [refreshingNovels, setRefreshingNovels] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [directUrl, setDirectUrl] = useState('');

  const applyStore = useCallback((next: JitenStore) => {
    setStore(next);
    setSourceDrafts(next.sourceProfiles.map((profile) => ({ ...profile })));
    setApiBaseDraft(next.config.apiBaseUrl);
    setApiKeyDraft(next.config.apiKey ?? '');
  }, []);

  const refreshStore = useCallback(async () => {
    const next = await window.api.jitenGetStore();
    applyStore(next);
    return next;
  }, [applyStore]);

  const applyRemote = useCallback((cat: { novels: unknown[] } | null) => {
    if (!cat) return;
    const clean = cat.novels.map(sanitizeRemoteNovel).filter((item): item is Novel => item !== null);
    setRemoteNovels(clean);
  }, []);

  const refreshJiten = useCallback(
    async (genreOverride?: string): Promise<void> => {
      setLoadingJiten(true);
      setStatus('');
      try {
        const activeGenre = genreOverride ?? genre;
        const genreId = activeGenre === 'All' ? undefined : jitenGenreId(activeGenre);
        const result = await window.api.jitenSearchDecks({
          query: query.trim() || undefined,
          mediaTypes: type === 'WebNovel' ? [8] : type === 'Novel' ? [4] : [4, 8],
          limit: 100,
          sortBy: sort === 'title' ? 'title' : sort === 'difficulty' ? 'difficulty' : 'rating',
          genres: genreId != null ? [String(genreId)] : undefined,
        });
        setJitenDecks(result.decks);
        if (!result.decks.length) setStatus(t('novels.msg.noJitenMatch'));
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setLoadingJiten(false);
      }
    },
    [genre, query, sort, type],
  );

  const refreshNovels = useCallback(async () => {
    setRefreshingNovels(true);
    try {
      const fresh = await window.api.novelsRefresh();
      applyRemote(fresh);
    } catch {
      /* remote catalogue is optional */
    } finally {
      setRefreshingNovels(false);
    }
  }, [applyRemote]);

  useEffect(() => {
    void refreshStore();
    void (async () => {
      try {
        const cached = await window.api.novelsGet();
        applyRemote(cached);
      } catch {
        /* remote catalogue is optional */
      }
    })();
  }, [applyRemote, refreshStore]);

  const allLocalNovels = useMemo(() => {
    const key = (nv: Novel) => `${nv.titleJp.trim()}|${nv.author.trim()}`.toLowerCase();
    const seen = new Set(NOVELS.map(key));
    const extra = remoteNovels.filter((nv) => !seen.has(key(nv)));
    return [...NOVELS, ...extra];
  }, [remoteNovels]);

  useEffect(() => {
    if (!store || !allLocalNovels.length) return;
    const raw = localStorage.getItem(PLAN_KEY);
    if (!raw) return;
    let ids: string[] = [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    } catch {
      ids = [];
    }
    if (!ids.length) {
      localStorage.removeItem(PLAN_KEY);
      return;
    }
    void (async () => {
      const existing = new Set(store.plan.map((entry) => entry.id));
      let latest = store;
      try {
        for (const id of ids) {
          const novel = allLocalNovels.find((item) => item.id === id);
          if (!novel || existing.has(`local-${novel.id}`)) continue;
          latest = await window.api.jitenUpsertPlan(localPlanEntry(localCandidate(novel, latest.sourceProfiles)));
          existing.add(`local-${novel.id}`);
        }
        // The legacy key is this plan's only copy until every entry reaches the
        // main-process store. Dropping it up front meant one failed upsert —
        // an unavailable handler, a write error — silently destroyed a saved
        // plan with nothing left to retry from.
        localStorage.removeItem(PLAN_KEY);
      } catch {
        /* keep the legacy plan on disk so a later mount can migrate it again */
      }
      applyStore(latest);
    })();
  }, [allLocalNovels, applyStore, store]);

  const profiles = store?.sourceProfiles ?? [];
  const localCandidates = useMemo(
    () => allLocalNovels.map((novel) => localCandidate(novel, profiles)),
    [allLocalNovels, profiles],
  );
  const jitenCandidates = useMemo(
    () => jitenDecks.map((deck) => jitenCandidate(deck, profiles)),
    [jitenDecks, profiles],
  );
  const candidatePlan = useMemo(() => {
    const map = new Map<string, JitenPlanEntry>();
    for (const entry of store?.plan ?? []) {
      map.set(entry.id, entry);
      if (entry.jitenDeckId != null) map.set(`jiten-${entry.jitenDeckId}`, entry);
    }
    return map;
  }, [store]);

  // Plan entries no live source produced this session. See `planCandidate`:
  // without these the Plan chip counts rows the table cannot show.
  const orphanPlanCandidates = useMemo(() => {
    const known = new Set<string>();
    for (const candidate of localCandidates) known.add(candidate.id);
    for (const candidate of jitenCandidates) known.add(candidate.id);
    const out: NovelCandidate[] = [];
    for (const entry of store?.plan ?? []) {
      if (known.has(entry.id)) continue;
      known.add(entry.id);
      out.push(planCandidate(entry, profiles));
    }
    return out;
  }, [jitenCandidates, localCandidates, profiles, store]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const live = type === 'Local' || !jitenCandidates.length ? localCandidates : [...jitenCandidates, ...localCandidates];
    const combined = orphanPlanCandidates.length ? [...live, ...orphanPlanCandidates] : live;
    const filtered = combined.filter((candidate) => {
      const plan = candidatePlan.get(candidate.id) ?? null;
      const links = linkFromEntry(plan, candidate);
      const imported = Boolean(plan?.importedLibraryItemId);
      const analyzed = plan?.acquisitionStatus === 'analyzed' || plan?.acquisitionStatus === 'mined';
      return (
        (type === 'All' || type === 'Local' || candidate.type === type) &&
        (!planOnly || Boolean(plan)) &&
        (diff === 'All' || candidate.difficultyLabel === diff) &&
        (genre === 'All' || candidate.genres.includes(genre) || candidate.tags.includes(genre)) &&
        (availability === 'all' || (availability === 'with-source' ? links.length > 0 : links.some((link) => link.direct))) &&
        (importFilter === 'all' || (importFilter === 'imported' ? imported : !imported)) &&
        (analysisFilter === 'all' || (analysisFilter === 'analyzed' ? analyzed : !analyzed)) &&
        textMatches(candidate, q)
      );
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      const planA = candidatePlan.get(a.id);
      const planB = candidatePlan.get(b.id);
      switch (sort) {
        case 'title':
          return a.titleJp.localeCompare(b.titleJp, 'ja');
        case 'author':
          return (a.author ?? '').localeCompare(b.author ?? '', 'ja') || a.titleJp.localeCompare(b.titleJp, 'ja');
        case 'source':
          return a.kind.localeCompare(b.kind) || a.titleJp.localeCompare(b.titleJp, 'ja');
        case 'status':
          return (planA?.acquisitionStatus ?? 'unplanned').localeCompare(planB?.acquisitionStatus ?? 'unplanned');
        case 'difficulty':
        default:
          return (a.difficultyRaw ?? 99) - (b.difficultyRaw ?? 99) || a.titleJp.localeCompare(b.titleJp, 'ja');
      }
    });
    return sorted.slice(0, 250);
  }, [
    analysisFilter,
    availability,
    candidatePlan,
    diff,
    genre,
    importFilter,
    jitenCandidates,
    localCandidates,
    orphanPlanCandidates,
    planOnly,
    query,
    sort,
    type,
  ]);

  const selectedCandidate = useMemo(
    () => candidates.find((candidate) => candidate.id === selectedId) ?? candidates[0] ?? null,
    [candidates, selectedId],
  );
  const selectedPlan = selectedCandidate ? candidatePlan.get(selectedCandidate.id) ?? null : null;
  const selectedLinks = linkFromEntry(selectedPlan, selectedCandidate);
  const selectedLink = selectedLinks.find((link) => link.id === selectedPlan?.selectedSourceId) ?? selectedLinks[0] ?? null;
  const directCandidateUrl = directUrl.trim() || (selectedLink?.direct ? selectedLink.url : '');

  const genreOptions = useMemo(() => {
    const set = new Set<string>([...GENRES, ...Object.values(JITEN_GENRES)]);
    for (const candidate of [...jitenCandidates, ...localCandidates, ...orphanPlanCandidates]) {
      candidate.genres.forEach((item) => set.add(item));
      candidate.tags.forEach((item) => set.add(item));
    }
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [jitenCandidates, localCandidates, orphanPlanCandidates]);

  async function ensurePlanned(candidate: NovelCandidate): Promise<JitenPlanEntry | null> {
    const existing = candidatePlan.get(candidate.id);
    if (existing) return existing;
    setBusy(true);
    try {
      let entry: JitenPlanEntry | null;
      if (candidate.kind === 'jiten' && candidate.deck) {
        const detail = candidate.jitenDeckId ? await window.api.jitenGetDeckDetail(candidate.jitenDeckId) : null;
        entry = await window.api.jitenPlanFromDeck(detail ?? candidate.deck);
      } else {
        entry = localPlanEntry(candidate);
      }
      if (!entry) return null;
      const next = await window.api.jitenUpsertPlan(entry);
      applyStore(next);
      return next.plan.find((item) => item.id === entry?.id) ?? entry;
    } finally {
      setBusy(false);
    }
  }

  async function removeFromPlan(entry: JitenPlanEntry): Promise<void> {
    setBusy(true);
    try {
      applyStore(await window.api.jitenRemovePlan(entry.id));
      setStatus(t('novels.msg.removedFromPlan', { title: entry.titleJp }));
    } finally {
      setBusy(false);
    }
  }

  async function updatePlan(id: string, patch: Partial<JitenPlanEntry>): Promise<JitenStore> {
    const next = await window.api.jitenUpdatePlan(id, patch);
    applyStore(next);
    return next;
  }

  async function saveSources(): Promise<void> {
    setBusy(true);
    try {
      await window.api.jitenUpdateConfig({ apiBaseUrl: apiBaseDraft, apiKey: apiKeyDraft });
      const next = await window.api.jitenSetSourceProfiles(sourceDrafts);
      applyStore(next);
      setStatus(t('novels.msg.sourcesSaved'));
      setShowSources(false);
      void refreshJiten();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function patchSource(index: number, patch: Partial<JitenSourceProfile>): void {
    setSourceDrafts((prev) => prev.map((profile, i) => (i === index ? { ...profile, ...patch } : profile)));
  }

  function addSource(): void {
    const id = `source-${Date.now().toString(36)}`;
    setSourceDrafts((prev) => [
      ...prev,
      {
        id,
        name: 'Custom source',
        enabled: true,
        mode: 'external',
        searchUrlTemplate: 'https://example.com/search?q={titleJp}',
        directUrlTemplate: '',
      },
    ]);
  }

  function removeSource(index: number): void {
    setSourceDrafts((prev) => prev.filter((_, i) => i !== index));
  }

  async function importLocalEpub(entry: JitenPlanEntry): Promise<string | null> {
    const before = await window.api.listLibrary();
    const beforeIds = new Set(before.map((item) => item.id));
    const after = await window.api.importFiles();
    // `library:importFiles` answers a cancelled dialog with the whole existing
    // library (main/library.ts), so "nothing new" is the ordinary cancel path.
    // Falling back to the first EPUB in the library linked the plan entry to an
    // unrelated book, flipped it to `imported`, and named that book as imported.
    const imported = after.find((item) => !beforeIds.has(item.id) && item.kind === 'book' && item.epubFile);
    if (!imported) return null;
    await updatePlan(entry.id, {
      importedLibraryItemId: imported.id,
      acquisitionStatus: 'imported',
      error: undefined,
    });
    setStatus(t('novels.msg.imported', { title: imported.title }));
    return imported.id;
  }

  async function importDirect(entry: JitenPlanEntry): Promise<string | null> {
    const url = directCandidateUrl;
    if (!url) {
      setStatus(t('novels.msg.chooseDirect'));
      return null;
    }
    setBusy(true);
    try {
      const result = await window.api.jitenImportDirectEpub({
        url,
        title: entry.titleJp,
        planId: entry.id,
        sourceId: selectedLink?.id,
      });
      if (result.store) applyStore(result.store);
      if (!result.ok || !result.item) {
        setStatus(result.error ?? t('novels.msg.epubImportFailed'));
        return null;
      }
      setStatus(t('novels.msg.imported', { title: result.item.title }));
      return result.item.id;
    } finally {
      setBusy(false);
    }
  }

  async function importLocalSelected(): Promise<void> {
    if (!selectedCandidate) return;
    const entry = await ensurePlanned(selectedCandidate);
    if (entry) await importLocalEpub(entry);
  }

  async function importDirectSelected(): Promise<void> {
    if (!selectedCandidate) return;
    const entry = await ensurePlanned(selectedCandidate);
    if (entry) await importDirect(entry);
  }

  async function analyzeSelected(): Promise<void> {
    if (!selectedCandidate) return;
    const entry = await ensurePlanned(selectedCandidate);
    if (!entry) return;
    let bookId = entry.importedLibraryItemId;
    if (!bookId) {
      bookId = directCandidateUrl ? await importDirect(entry) : await importLocalEpub(entry);
    }
    if (!bookId) {
      setStatus(t('novels.msg.importFirst'));
      return;
    }
    setHandoffJson('epubMining', { bookId, ui: 'simple' });
    await updatePlan(entry.id, { importedLibraryItemId: bookId, acquisitionStatus: 'analyzed' });
    openFlashcardsMining();
  }

  async function mineJitenSelected(): Promise<void> {
    if (!selectedCandidate?.jitenDeckId) {
      setStatus(t('novels.msg.jitenOnly'));
      return;
    }
    const entry = await ensurePlanned(selectedCandidate);
    if (!entry) return;
    setHandoffJson('jitenMining', {
      deckId: selectedCandidate.jitenDeckId,
      title: selectedCandidate.titleJp,
    });
    openFlashcardsMining();
  }

  async function planSelected(): Promise<void> {
    if (!selectedCandidate) return;
    const entry = await ensurePlanned(selectedCandidate);
    if (entry) setStatus(t('novels.msg.planned', { title: entry.titleJp }));
  }

  async function selectSource(linkId: string): Promise<void> {
    if (!selectedCandidate) return;
    const entry = await ensurePlanned(selectedCandidate);
    if (!entry) return;
    await updatePlan(entry.id, { selectedSourceId: linkId, acquisitionStatus: 'linked' });
  }

  function selectCandidate(id: string): void {
    setSelectedId(id);
    setDirectUrl('');
  }

  function changeGenre(next: string): void {
    setGenre(next);
    if (jitenDecks.length || jitenGenreId(next) != null) void refreshJiten(next);
  }

  return {
    // filter state
    query, setQuery,
    type, setType,
    diff, setDiff,
    genre, changeGenre,
    availability, setAvailability,
    importFilter, setImportFilter,
    analysisFilter, setAnalysisFilter,
    sort, setSort,
    planOnly, setPlanOnly,
    // sources
    showSources, setShowSources,
    sourceDrafts, apiBaseDraft, setApiBaseDraft, apiKeyDraft, setApiKeyDraft,
    patchSource, addSource, removeSource, saveSources,
    // data
    store, jitenDecks, candidates, candidatePlan, genreOptions,
    loadingJiten, refreshingNovels, busy, status,
    refreshJiten, refreshNovels,
    // selection
    selectedId, selectCandidate,
    selectedCandidate, selectedPlan, selectedLinks, selectedLink,
    directUrl, setDirectUrl, directCandidateUrl,
    // actions
    planSelected, removeFromPlan, updatePlan, selectSource,
    importLocalSelected, importDirectSelected, analyzeSelected, mineJitenSelected,
  };
}

export type NovelsState = ReturnType<typeof useNovels>;

/** The filter rail (`<aside className="jiten-filters">` body) plus source manager. */
export function NovelsFilters({ state }: { state: NovelsState }) {
  const { t } = useT();
  return (
    <>
      <label>
        {t('novels.filter.type')}
        <select value={state.type} onChange={(e) => state.setType(e.target.value as TypeFilter)}>
          <option value="All">{t('novels.filter.all')}</option>
          <option value="Novel">{t('novels.filter.jitenNovels')}</option>
          <option value="WebNovel">{t('novels.filter.jitenWebNovels')}</option>
          <option value="Local">{t('novels.filter.localCatalogue')}</option>
        </select>
      </label>
      <label>
        {t('novels.filter.difficulty')}
        <select value={state.diff} onChange={(e) => state.setDiff(e.target.value as DiffFilter)}>
          <option value="All">{t('novels.filter.all')}</option>
          {[...DIFFICULTY_ORDER, 'Unknown'].map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('novels.filter.genreOrTag')}
        <select value={state.genre} onChange={(e) => state.changeGenre(e.target.value)}>
          {/* The genre NAMES come from data/novels and Jiten and stay
              untranslated (CLAUDE.md i18n rule 4 -- study content, not chrome).
              The 'All' sentinel is chrome and is the one entry that must move. */}
          {state.genreOptions.map((item) => (
            <option key={item} value={item}>
              {item === 'All' ? t('novels.filter.all') : item}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('novels.filter.source')}
        <select value={state.availability} onChange={(e) => state.setAvailability(e.target.value as AvailabilityFilter)}>
          <option value="all">{t('novels.filter.any')}</option>
          <option value="with-source">{t('novels.filter.hasLink')}</option>
          <option value="direct">{t('novels.filter.directEpub')}</option>
        </select>
      </label>
      <label>
        {t('novels.filter.import')}
        <select value={state.importFilter} onChange={(e) => state.setImportFilter(e.target.value as ImportFilter)}>
          <option value="all">{t('novels.filter.any')}</option>
          <option value="imported">{t('novels.filter.imported')}</option>
          <option value="not-imported">{t('novels.filter.notImported')}</option>
        </select>
      </label>
      <label>
        {t('novels.filter.mining')}
        <select value={state.analysisFilter} onChange={(e) => state.setAnalysisFilter(e.target.value as AnalysisFilter)}>
          <option value="all">{t('novels.filter.any')}</option>
          <option value="analyzed">{t('novels.filter.analyzed')}</option>
          <option value="not-analyzed">{t('novels.filter.notAnalyzed')}</option>
        </select>
      </label>
      <label>
        {t('novels.filter.sort')}
        <select value={state.sort} onChange={(e) => state.setSort(e.target.value as SortKey)}>
          <option value="difficulty">{t('novels.sort.difficulty')}</option>
          <option value="title">{t('novels.sort.title')}</option>
          <option value="author">{t('novels.sort.author')}</option>
          <option value="source">{t('novels.sort.source')}</option>
          <option value="status">{t('novels.sort.status')}</option>
        </select>
      </label>

      {state.showSources && (
        <section className="jiten-source-manager">
          <div className="jiten-source-manager-head">
            <b>{t('novels.sources.heading')}</b>
            <button type="button" className="btn small" onClick={state.addSource}>
              <Icon name="plus" size={12} />
              {t('novels.sources.add')}
            </button>
          </div>
          <label>
            {t('novels.sources.jitenApi')}
            <input value={state.apiBaseDraft} onChange={(e) => state.setApiBaseDraft(e.target.value)} placeholder="https://api.jiten.moe/api" />
          </label>
          <label>
            {t('novels.sources.apiKey')}
            <input value={state.apiKeyDraft} onChange={(e) => state.setApiKeyDraft(e.target.value)} type="password" placeholder={t('novels.sources.optional')} />
          </label>
          <div className="jiten-source-list">
            {state.sourceDrafts.map((profile, index) => (
              <div key={profile.id} className="jiten-source-row">
                <label className="jiten-source-enabled">
                  <input
                    type="checkbox"
                    checked={profile.enabled}
                    onChange={(e) => state.patchSource(index, { enabled: e.target.checked })}
                  />
                  {t('novels.sources.enabled')}
                </label>
                {/* The row's own name. It had no label, no placeholder and no
                    aria-label, so it announced as a bare edit field -- and the
                    three Remove buttons beside it announced identically, with
                    nothing in the row to tell them apart. */}
                <input
                  value={profile.name}
                  onChange={(e) => state.patchSource(index, { name: e.target.value })}
                  aria-label={t('novels.sources.name')}
                  placeholder={t('novels.sources.name')}
                />
                <select
                  value={profile.mode}
                  aria-label={t('novels.sources.mode')}
                  onChange={(e) => state.patchSource(index, { mode: e.target.value as JitenSourceProfile['mode'] })}
                >
                  <option value="external">{t('novels.sources.modeExternal')}</option>
                  <option value="direct">{t('novels.sources.modeDirect')}</option>
                  <option value="both">{t('novels.sources.modeBoth')}</option>
                </select>
                <input
                  value={profile.searchUrlTemplate}
                  onChange={(e) => state.patchSource(index, { searchUrlTemplate: e.target.value })}
                  placeholder={t('novels.sources.searchUrlPlaceholder', { token: '{titleJp}' })}
                />
                <input
                  value={profile.directUrlTemplate ?? ''}
                  onChange={(e) => state.patchSource(index, { directUrlTemplate: e.target.value })}
                  placeholder={t('novels.sources.directUrlPlaceholder')}
                />
                <button
                  type="button"
                  className="btn small subtle"
                  aria-label={t('novels.sources.removeNamed', { name: profile.name || t('novels.sources.name') })}
                  onClick={() => state.removeSource(index)}
                >
                  {t('novels.sources.remove')}
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="btn primary" disabled={state.busy} onClick={() => void state.saveSources()}>
            {t('novels.sources.save')}
          </button>
        </section>
      )}
    </>
  );
}

/** The candidate table (`<main className="jiten-table-wrap">` body). */
export function NovelsTable({ state }: { state: NovelsState }) {
  const { t } = useT();
  return (
    <>
      <div className="jiten-table-head">
        <span aria-hidden="true" />
        <span>{t('novels.table.title')}</span>
        <span>{t('novels.table.source')}</span>
        <span>{t('novels.table.difficulty')}</span>
        <span>{t('novels.table.status')}</span>
        <span>{t('novels.table.links')}</span>
      </div>
      {state.candidates.length === 0 ? (
        <div className="jiten-empty">{t('novels.table.empty')}</div>
      ) : (
        state.candidates.map((candidate) => {
          const plan = state.candidatePlan.get(candidate.id);
          const links = linkFromEntry(plan ?? null, candidate);
          return (
            <button
              key={candidate.id}
              type="button"
              className={`jiten-row ${state.selectedCandidate?.id === candidate.id ? 'active' : ''}`}
              aria-pressed={state.selectedCandidate?.id === candidate.id}
              onClick={() => state.selectCandidate(candidate.id)}
            >
              <span className="jiten-row-cover" style={!candidate.coverUrl ? coverStyle(candidate.id) : undefined}>
                {candidate.coverUrl ? <img src={candidate.coverUrl} alt="" loading="lazy" /> : null}
              </span>
              <span className="jiten-row-title">
                <b lang="ja">{candidate.titleJp}</b>
                <small>{candidate.englishTitle || candidate.author || candidate.tags.slice(0, 2).join(', ')}</small>
              </span>
              <span>{candidate.kind === 'jiten' ? 'Jiten' : t('novels.kind.local')}</span>
              <span className={`nov-diff ${DIFFICULTY_CLASS[candidate.difficultyLabel as Difficulty | 'Unknown'] ?? 'd-unknown'}`}>
                {candidate.difficultyLabel}
              </span>
              <span>{plan?.acquisitionStatus ?? t('novels.plan.unplanned')}</span>
              <span>{links.length}</span>
            </button>
          );
        })
      )}
    </>
  );
}

/** The inspector pane (`<aside className="jiten-inspector">` body). */
export function NovelsInspector({ state }: { state: NovelsState }) {
  const { t } = useT();
  const { selectedCandidate, selectedPlan, selectedLinks, selectedLink, busy, directCandidateUrl } = state;
  if (!selectedCandidate) {
    return <div className="jiten-empty">{t('novels.inspector.selectPrompt')}</div>;
  }
  // Category 8: `disabled` is DERIVED from the reason, never asserted beside it, so a button
  // that is grey with nothing saying why cannot be written here by accident.
  const actionState = {
    busy,
    hasSelectedLink: !!selectedLink,
    hasDirectEpubUrl: !!directCandidateUrl,
    hasJitenDeck: !!selectedCandidate.jitenDeckId,
    isPlanned: !!selectedPlan,
  };
  const planWhy = novelsPlanReason(actionState);
  const openSourceWhy = novelsOpenSourceReason(actionState);
  const importFileWhy = novelsImportFileReason(actionState);
  const downloadEpubWhy = novelsDownloadEpubReason(actionState);
  const analyzeEpubWhy = novelsAnalyzeEpubReason(actionState);
  const jitenMineWhy = novelsJitenMineReason(actionState);
  return (
    <>
      <div className="jiten-cover" style={!selectedCandidate.coverUrl ? coverStyle(selectedCandidate.id) : undefined}>
        {selectedCandidate.coverUrl ? (
          <img src={selectedCandidate.coverUrl} alt="" />
        ) : (
          <span lang="ja">{selectedCandidate.titleJp}</span>
        )}
      </div>
      <div className="jiten-inspector-title">
        <h2 lang="ja">{selectedCandidate.titleJp}</h2>
        <p className="muted">{selectedCandidate.englishTitle || selectedCandidate.author || selectedCandidate.type}</p>
      </div>
      <dl className="jiten-meta">
        <div><dt>{t('novels.meta.type')}</dt><dd>{selectedCandidate.type}</dd></div>
        <div><dt>{t('novels.meta.difficulty')}</dt><dd>{selectedCandidate.difficultyLabel}</dd></div>
        <div><dt>{t('novels.meta.plan')}</dt><dd>{selectedPlan?.acquisitionStatus ?? t('novels.plan.unplanned')}</dd></div>
        {selectedCandidate.jitenDeckId && <div><dt>{t('novels.meta.jitenDeck')}</dt><dd>{selectedCandidate.jitenDeckId}</dd></div>}
        {selectedCandidate.wordCount != null && <div><dt>{t('novels.meta.words')}</dt><dd>{selectedCandidate.wordCount.toLocaleString()}</dd></div>}
        {selectedCandidate.uniqueWordCount != null && <div><dt>{t('novels.meta.unique')}</dt><dd>{selectedCandidate.uniqueWordCount.toLocaleString()}</dd></div>}
        {selectedCandidate.sentenceCount != null && <div><dt>{t('novels.meta.sentences')}</dt><dd>{selectedCandidate.sentenceCount.toLocaleString()}</dd></div>}
      </dl>
      <div className="jiten-tags">
        {[...selectedCandidate.genres, ...selectedCandidate.tags].slice(0, 10).map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      {selectedCandidate.description && <p className="jiten-description">{selectedCandidate.description}</p>}

      <div className="jiten-actions">
        {selectedPlan ? (
          <button type="button" className="btn subtle" disabled={!!planWhy} title={planWhy ? t(planWhy) : undefined} onClick={() => void state.removeFromPlan(selectedPlan)}>
            <Icon name="close" size={14} />
            {t('novels.action.remove')}
          </button>
        ) : (
          <button type="button" className="btn primary" disabled={!!planWhy} title={planWhy ? t(planWhy) : undefined} onClick={() => void state.planSelected()}>
            <Icon name="star" size={14} />
            {t('novels.action.plan')}
          </button>
        )}
        <button type="button" className="btn" disabled={!!openSourceWhy} title={openSourceWhy ? t(openSourceWhy) : undefined} onClick={() => selectedLink && openLink(selectedLink.url)}>
          <Icon name="external" size={14} />
          {t('novels.action.openSource')}
        </button>
        <button type="button" className="btn" disabled={!!importFileWhy} title={importFileWhy ? t(importFileWhy) : undefined} onClick={() => void state.importLocalSelected()}>
          <Icon name="library" size={14} />
          {t('novels.action.importFile')}
        </button>
        <button type="button" className="btn" disabled={!!downloadEpubWhy} title={downloadEpubWhy ? t(downloadEpubWhy) : undefined} onClick={() => void state.importDirectSelected()}>
          <Icon name="download" size={14} />
          {t('novels.action.downloadEpub')}
        </button>
        <button type="button" className="btn primary" disabled={!!analyzeEpubWhy} title={analyzeEpubWhy ? t(analyzeEpubWhy) : undefined} onClick={() => void state.analyzeSelected()}>
          <Icon name="scan" size={14} />
          {t('novels.action.analyzeEpub')}
        </button>
        <button type="button" className="btn" disabled={!!jitenMineWhy} title={jitenMineWhy ? t(jitenMineWhy) : undefined} onClick={() => void state.mineJitenSelected()}>
          <Icon name="flashcards" size={14} />
          {t('novels.action.jitenMine')}
        </button>
      </div>

      <section className="jiten-source-pick">
        <b>{t('novels.sourceLinks')}</b>
        {selectedLinks.length === 0 ? (
          <p className="muted">{t('novels.noSourceTemplate')}</p>
        ) : (
          <div className="jiten-source-buttons lq-hit-scope">
            {selectedLinks.map((link) => (
              <button
                key={link.id}
                type="button"
                className={link.id === selectedLink?.id ? 'active' : ''}
                aria-pressed={link.id === selectedLink?.id}
                onClick={() => void state.selectSource(link.id)}
              >
                {link.label}
                {link.direct ? <span>EPUB</span> : null}
              </button>
            ))}
          </div>
        )}
        <label>
          {t('novels.directEpubUrl')}
          <input
            value={state.directUrl}
            onChange={(e) => state.setDirectUrl(e.target.value)}
            placeholder="https://example.com/book.epub"
          />
        </label>
      </section>

      {selectedPlan && (
        <label className="jiten-notes">
          {t('novels.notes')}
          <textarea
            key={selectedPlan.id}
            defaultValue={selectedPlan.notes ?? ''}
            onBlur={(e) => void state.updatePlan(selectedPlan.id, { notes: e.target.value })}
            rows={3}
            placeholder={t('novels.notesPlaceholder')}
          />
        </label>
      )}
    </>
  );
}
