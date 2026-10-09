import { useEffect, useMemo, useState } from 'react';
import {
  capturesForVisualNovel,
  createEmptyVisualNovelDatabase,
  VISUAL_NOVEL_ENGINE_NAMES,
  type VisualNovelEngine,
  type VisualNovelDatabase,
  type VisualNovelEntry,
  type VisualNovelRoute,
  type VisualNovelRouteStatus,
  type VisualNovelStatus,
  type VisualNovelTextCapture,
  type VisualNovelTextKind,
} from '../../../shared/visualNovel';
import type { VisualNovelHookState } from '../../../shared/visualNovelHook';
import {
  buildVisualNovelCaptureTarget,
  LENS_CAPTURE_TARGET_KEY,
} from '../../../shared/lensCaptureTarget';
import {
  analyzeVisualNovelCharacterSpeech,
  type VisualNovelCharacterSpeechProfile,
} from '../../../shared/visualNovelLanguage';
import {
  estimateVisualNovelDifficultyPrior,
  rankVisualNovelEntries,
} from '../../../shared/visualNovelRecommendations';
import type { VisualNovelSessionState } from '../../../shared/visualNovelCapture';
import {
  vnAddCapturedLineReason,
  vnAddEndingReason,
  vnAddRouteReason,
  vnAnalyzeReason,
  vnClearScenesReason,
  vnCreateCardsReason,
  vnCurrentSceneReason,
  vnLaunchReason,
  type VnActionState,
} from '../../../shared/vnActionReason';
import { analyzeMediaStudyCues, createMediaLanguageProfile, type MediaStudyAnalysis } from '../../mediaStudyWorkflow';
import { addVisualNovelStudyCards, mineVisualNovelLine, visualNovelMediaItem } from '../../visualNovelMining';
import { addMediaStudySessionProgress, loadMediaStudyDatabase, onMediaStudyDatabaseChanged, saveMediaLanguageProfile, startMediaStudySession } from '../../mediaStudyStore';
import { isLookupClick, lookupWordFromMouseUp, noteLookupPointerDown } from '../../wordLookup';
import { CAPTURE_KIND_KEYS } from './captureKindKeys';
import DictionaryPopup from '../DictionaryPopup';
import ReaderCollectionPanel from '../ReaderCollectionPanel';
import { useT } from '../../i18n';
import type { TVars } from '../../../shared/i18n/core';
import { confirmDialog } from '../ui/dialogService';
import { READING_CANVAS_FILL_POLICY } from '../../../shared/liquidReadingCanvas';
import { ReadingCanvas, type ReadingCanvasTool } from '../liquid/ReadingCanvas';
import { ContextualSurface } from '../liquid/LiquidSurface';
import MediaLanguageProfileCard from '../media/MediaLanguageProfileCard';
import MediaStudyAssistantPanel from '../media/MediaStudyAssistantPanel';
import VisualNovelImportPanel from './VisualNovelImportPanel';
import VisualNovelCommunityPanel from './VisualNovelCommunityPanel';
import VisualNovelGallery from './VisualNovelGallery';
import VisualNovelMetadataEditor from './VisualNovelMetadataEditor';
import VisualNovelRecommendationsPanel from './VisualNovelRecommendationsPanel';
import VisualNovelReleaseCatalog from './VisualNovelReleaseCatalog';
import VisualNovelScriptImportPanel from './VisualNovelScriptImportPanel';
import VisualNovelSentenceAssist from './VisualNovelSentenceAssist';
import VisualNovelSourcePanel from './VisualNovelSourcePanel';
import VisualNovelArt from './VisualNovelArt';
import { TRACKING_KEYS, VisualNovelCaptureBar, VisualNovelCaptureSetup } from './VisualNovelCaptureControls';
import { writeLocalStorageJson } from '../../localStorageWrite';
import { VISUAL_NOVEL_FOCUS_EVENT, onOpenIntent, takeVisualNovelFocus } from '../../openIntents';
import './visualNovel.css';
import { loadDeck, onDeckChanged } from '../../flashcardDeck';
import { visualNovelReadingStats } from '../../../shared/visualNovelReadingStats';
import { visualNovelStatsLine } from './visualNovelStatsLine';

interface ProgressDraft {
  status: VisualNovelStatus;
  route: string;
  chapter: string;
  scene: string;
  completion: string;
}

type MiningScope = 'all' | 'route' | 'chapter' | 'scenes';

/**
 * Wire-value -> catalog-key maps.
 *
 * Every one of these is a union whose members are kebab-case or otherwise not a
 * legal key suffix (`not-started`, `feminine-coded endings`), so a template key
 * cannot resolve them — the same reason `captureKindKeys.ts` exists next door.
 * They hold KEYS rather than labels because module-level data cannot call
 * `useT()` at declaration time (CLAUDE.md i18n rule 7); consumers resolve with
 * `t()` at render time.
 */
export const SCOPE_KEYS: Record<MiningScope, string> = {
  all: 'vnPanel.scope.all',
  route: 'vnPanel.scope.route',
  chapter: 'vnPanel.scope.chapter',
  scenes: 'vnPanel.scope.scenes',
};

export const STATUS_KEYS: Record<VisualNovelStatus, string> = {
  planned: 'vnPanel.status.planned',
  reading: 'vnPanel.status.reading',
  completed: 'vnPanel.status.completed',
  dropped: 'vnPanel.status.dropped',
  replaying: 'vnPanel.status.replaying',
};

export const ROUTE_STATUS_KEYS: Record<VisualNovelRouteStatus, string> = {
  'not-started': 'vnPanel.routeStatus.notStarted',
  reading: 'vnPanel.routeStatus.reading',
  completed: 'vnPanel.routeStatus.completed',
};

export const COMPAT_KEYS: Record<VisualNovelEntry['engineCompatibility'], string> = {
  supported: 'vnPanel.compat.supported',
  partial: 'vnPanel.compat.partial',
  manual: 'vnPanel.compat.manual',
  unknown: 'vnPanel.compat.unknown',
};

export const POLITENESS_KEYS: Record<VisualNovelCharacterSpeechProfile['politeness'], string> = {
  formal: 'vnPanel.politeness.formal',
  mixed: 'vnPanel.politeness.mixed',
  casual: 'vnPanel.politeness.casual',
};

export const REGISTER_KEYS: Record<VisualNovelCharacterSpeechProfile['politeness'], string> = {
  formal: 'vnPanel.speech.register.formal',
  mixed: 'vnPanel.speech.register.mixed',
  casual: 'vnPanel.speech.register.casual',
};

/**
 * `analyzeVisualNovelCharacterSpeech` is a SHARED module — it cannot call `t()`,
 * so it emits English marker tokens and an English `summary` for its non-UI
 * callers. The panel therefore recomposes the summary from the structured
 * fields beside it rather than rendering `profile.summary`, which is the shape
 * `vnPanel.speech.*` was written for. An unrecognised marker falls back to its
 * own token, so a marker added to the analyzer shows its name instead of a key.
 */
export const MARKER_KEYS: Record<string, string> = {
  assertive: 'vnPanel.marker.assertive',
  'feminine-coded endings': 'vnPanel.marker.feminineEndings',
  'informal polite speech': 'vnPanel.marker.informalPolite',
  'expressive elongation': 'vnPanel.marker.expressiveElongation',
};

export function speechSummary(
  profile: VisualNovelCharacterSpeechProfile,
  t: (key: string, vars?: TVars) => string,
): string {
  return [
    t(REGISTER_KEYS[profile.politeness]),
    profile.pronouns.length ? t('vnPanel.speech.uses', { pronouns: profile.pronouns.join('・') }) : '',
    profile.markers.map((marker) => MARKER_KEYS[marker] ? t(MARKER_KEYS[marker]) : marker).join(', '),
  ].filter(Boolean).join('; ');
}

/**
 * The workspace's sections. Reading comes first and is where the panel opens:
 * it used to be the fourth thing down a 3,699 px column behind ten disclosures,
 * below metadata, gallery and release editors that are touched once per title.
 */
export type VisualNovelTab = 'read' | 'study' | 'routes' | 'details' | 'setup';

export const TAB_KEYS: Record<VisualNovelTab, string> = {
  read: 'vnApp.tab.read',
  study: 'vnApp.tab.study',
  routes: 'vnApp.tab.routes',
  details: 'vnApp.tab.details',
  setup: 'vnApp.tab.setup',
};

const TABS = Object.keys(TAB_KEYS) as VisualNovelTab[];
/** Tabs whose panels live in the primary (reading) column. */
const PRIMARY_TABS: ReadonlySet<VisualNovelTab> = new Set(['read', 'study']);

/**
 * Minimum captured lines before the panel estimates difficulty from the
 * learner's own text. Below this a VNDB prior is shown, labelled as one.
 */
export const AUTO_ANALYZE_MIN_LINES = 30;
/** Re-estimate once this many new lines have arrived since the last estimate. */
const AUTO_ANALYZE_STEP = 25;
const AUTO_ANALYZE_WINDOW = 400;
/** Line count at the last automatic estimate, per novel, for this session. */
const autoAnalyzedLines = new Map<string, number>();

/**
 * What survives closing the window: the selected novel, the open tab, and
 * whether the library rail is shown. The section used to be a `useState(false)`
 * inside the Immersion view, so every close threw them away; the library toggle
 * was left out when the other two were persisted, so "Hide library" came back
 * shown on every reopen.
 */
const PANEL_STATE_KEY = 'vn-panel-state';

interface PanelState {
  selectedId: string;
  tab: VisualNovelTab;
  libraryOpen: boolean;
}

function readPanelState(): PanelState {
  try {
    const raw = JSON.parse(localStorage.getItem(PANEL_STATE_KEY) ?? '{}') as {
      selectedId?: unknown;
      tab?: unknown;
      libraryOpen?: unknown;
    };
    return {
      selectedId: typeof raw.selectedId === 'string' ? raw.selectedId : '',
      tab: TABS.includes(raw.tab as VisualNovelTab) ? raw.tab as VisualNovelTab : 'read',
      // Only an explicit `false` hides it: the library is how a first visit starts.
      libraryOpen: raw.libraryOpen !== false,
    };
  } catch {
    return { selectedId: '', tab: 'read', libraryOpen: true };
  }
}

function writePanelState(state: PanelState): void {
  // Storage unavailable: the panel still works, it just forgets.
  writeLocalStorageJson(PANEL_STATE_KEY, state);
}

const emptyProgress = (): ProgressDraft => ({
  status: 'planned',
  route: '',
  chapter: '',
  scene: '',
  completion: '0',
});

function displayCaptureContext(capture: VisualNovelTextCapture): string {
  return [capture.speaker, capture.chapter, capture.scene].filter(Boolean).join(' · ');
}

function captureSceneKey(capture: Pick<VisualNovelTextCapture, 'chapter' | 'scene'>): string {
  return `${capture.chapter.trim()}\u0000${capture.scene.trim()}`;
}

/**
 * The engine as chrome shows it. Product names are data and stay verbatim; `custom` and
 * `unknown` are UI words. The summary and the library rows printed the raw union member, so
 * a Japanese or Russian UI read the English word 'unknown' beside '不明' (V12).
 */
export function engineLabel(engine: VisualNovelEngine, t: (key: string, vars?: TVars) => string): string {
  if (engine === 'unknown') return t('vnApp.engine.unknown');
  if (engine === 'custom') return t('vnMeta.engineCustom');
  return VISUAL_NOVEL_ENGINE_NAMES[engine] ?? engine;
}

/**
 * Playtime, in the interface language.
 *
 * `vnPanel.duration.{hm,m}` had been written and translated into all four
 * catalogs and then never wired: this function returned `${hours}h ${minutes}m`
 * literals right beside them, so the panel read `3h 47m` in Japanese while its
 * own translations sat unused with zero consumers (D176). Nothing catches that —
 * `i18n-check` only asks whether a key is TRANSLATED, not whether it is USED.
 *
 * Deliberately not the shared `formatDuration`: this one floors rather than
 * rounds and never falls back to seconds, because a playtime of `45s` beside an
 * engine name would read as a failed launch rather than a short session.
 */
function formatDuration(totalSeconds: number, t: (key: string, vars?: TVars) => string): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return t('vnPanel.duration.hm', { hours, minutes });
  return t('vnPanel.duration.m', { minutes });
}

export default function VisualNovelPanel({
  onClose,
  standalone = false,
}: {
  /** The way back to the Immersion browser; absent when the panel IS the app. */
  onClose?: () => void;
  /** Rendered as the Visual Novels app: the window title already names it. */
  standalone?: boolean;
}) {
  const { t, lang } = useT();
  const [libraryOpen, setLibraryOpen] = useState(() => readPanelState().libraryOpen);
  const [database, setDatabase] = useState<VisualNovelDatabase>(createEmptyVisualNovelDatabase);
  // False until the first list answer. Until then the library and the workspace render nothing,
  // so the first paint is the settled layout: painting the empty library and its 'add a novel'
  // prompt, then the real list and summary a frame later, moved the Discover button and the
  // workspace on every open (V12 layout jumps, CLS 0.03).
  const [loaded, setLoaded] = useState(false);
  const [studyProfiles, setStudyProfiles] = useState(() => loadMediaStudyDatabase().profiles);
  const [selectedId, setSelectedId] = useState(() => readPanelState().selectedId);
  const [tab, setTab] = useState<VisualNovelTab>(() => readPanelState().tab);
  const [title, setTitle] = useState('');
  const [japaneseTitle, setJapaneseTitle] = useState('');
  const [executablePath, setExecutablePath] = useState('');
  const [captureText, setCaptureText] = useState('');
  const [captureTranslation, setCaptureTranslation] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [captureKind, setCaptureKind] = useState<VisualNovelTextKind>('dialogue');
  const [hookState, setHookState] = useState<VisualNovelHookState | null>(null);
  const [routeName, setRouteName] = useState('');
  const [routeCharacter, setRouteCharacter] = useState('');
  const [endingName, setEndingName] = useState('');
  const [endingDrafts, setEndingDrafts] = useState<Record<string, string>>({});
  const [routePendingRemoveId, setRoutePendingRemoveId] = useState('');
  const [selectedCaptureId, setSelectedCaptureId] = useState('');
  const [progress, setProgress] = useState<ProgressDraft>(emptyProgress);
  const [analysis, setAnalysis] = useState<MediaStudyAnalysis | null>(null);
  const [miningScope, setMiningScope] = useState<MiningScope>('all');
  const [selectedSceneKeys, setSelectedSceneKeys] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [sessionTracking, setSessionTracking] = useState<VisualNovelSessionState['tracking']>(null);
  const [clockNow, setClockNow] = useState(Date.now());
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  // The add-a-novel disclosure is controlled so the head's 'Add to library' can open it.
  const [addOpen, setAddOpen] = useState(false);
  const [popup, setPopup] = useState<{ query: string; x: number; y: number; context?: string } | null>(null);

  useEffect(() => writePanelState({ selectedId, tab, libraryOpen }), [selectedId, tab, libraryOpen]);

  // The status line holds a sentence already resolved in the language that was active
  // when the action finished (child panels report finished strings too), so after a
  // language switch it went on reading 'Visual novel added to the local library.' in a
  // Japanese UI. It is transient feedback about the last action; a switch clears it
  // rather than leave a stale sentence in the wrong language.
  useEffect(() => {
    setStatus('');
    setError('');
  }, [lang]);

  const reportStatus = (message: string, isError = false): void => {
    if (isError) {
      setError(message);
      setStatus('');
    } else {
      setStatus(message);
      setError('');
    }
  };

  useEffect(() => {
    let active = true;
    void window.api.visualNovelList().then((next) => {
      if (!active) return;
      setDatabase(next);
      setSelectedId((current) => current || next.entries[0]?.id || '');
      setLoaded(true);
    }, () => {
      if (active) setLoaded(true);
    });
    const off = window.api.onVisualNovelChanged((next) => {
      if (!active) return;
      setDatabase(next);
      setSelectedId((current) => next.entries.some((entry) => entry.id === current)
        ? current
        : next.entries[0]?.id ?? '');
    });
    return () => {
      active = false;
      off();
    };
  }, []);

  // "Open" on a visual novel in the Files app lands on that novel, not the last one viewed.
  useEffect(() => {
    const apply = (): void => {
      const id = takeVisualNovelFocus();
      if (id) setSelectedId(id);
    };
    apply();
    return onOpenIntent(VISUAL_NOVEL_FOCUS_EVENT, apply);
  }, []);

  useEffect(() => onMediaStudyDatabaseChanged((next) => setStudyProfiles(next.profiles)), []);

  useEffect(() => window.api.onVisualNovelHookChanged((next) => {
    if (next.visualNovelId === selectedId) setHookState(next);
  }), [selectedId]);

  const selected = database.entries.find((entry) => entry.id === selectedId) ?? null;
  const captures = useMemo(
    () => selected ? capturesForVisualNovel(database, selected.id) : [],
    [database, selected],
  );
  /** Re-count mined cards when the deck changes (a line mined from the reader overlay, say). */
  const [deckStamp, setDeckStamp] = useState(0);
  useEffect(() => onDeckChanged(() => setDeckStamp((n) => n + 1)), []);
  const readingStats = useMemo(() => {
    if (!selected) return null;
    const bookId = visualNovelMediaItem(selected).id;
    const mined = loadDeck().filter((card) => card.bookId === bookId).length;
    return visualNovelReadingStats(selected, captures, mined);
    // `deckStamp` is the change signal for the deck, not an input.
  }, [selected, captures, deckStamp]);
  const selectedCapture = captures.find((capture) => capture.id === selectedCaptureId)
    ?? captures[captures.length - 1]
    ?? null;
  const characterProfiles = useMemo(
    () => analyzeVisualNovelCharacterSpeech(captures),
    [captures],
  );
  const sceneOptions = useMemo(() => {
    const grouped = new Map<string, {
      key: string;
      chapter: string;
      scene: string;
      count: number;
    }>();
    for (const capture of captures) {
      const chapter = capture.chapter.trim();
      const scene = capture.scene.trim();
      if (!scene) continue;
      const key = captureSceneKey(capture);
      const existing = grouped.get(key);
      if (existing) existing.count += 1;
      else grouped.set(key, { key, chapter, scene, count: 1 });
    }
    return [...grouped.values()]
      .sort((a, b) => a.chapter.localeCompare(b.chapter) || a.scene.localeCompare(b.scene))
      .slice(0, 200);
  }, [captures]);
  const scopedCaptures = useMemo(() => {
    if (miningScope === 'route' && progress.route) {
      return captures.filter((capture) => capture.routeId === progress.route);
    }
    if (miningScope === 'chapter' && progress.chapter.trim()) {
      return captures.filter((capture) => capture.chapter === progress.chapter.trim());
    }
    if (miningScope === 'scenes') {
      return captures.filter((capture) => selectedSceneKeys.has(captureSceneKey(capture)));
    }
    return captures;
  }, [captures, miningScope, progress.chapter, progress.route, selectedSceneKeys]);
  const recommendationState = useMemo(
    () => rankVisualNovelEntries(database.entries, studyProfiles),
    [database.entries, studyProfiles],
  );
  // Category 8: `disabled` is DERIVED from the reason, never asserted beside it, so a button
  // that is grey with nothing saying why cannot be written here by accident. `hasEndingName`
  // is per-route and `hasReportDraft` belongs to the community panel; both are overridden at
  // their own call site rather than guessed here.
  const actionState: VnActionState = {
    busy,
    hasExecutablePath: !!selected?.executablePath,
    hasRouteName: !!routeName.trim(),
    hasEndingName: false,
    hasCaptureText: !!captureText.trim(),
    scopedCaptureCount: scopedCaptures.length,
    hasAnalysis: !!analysis,
    hasCurrentScene: !!progress.scene.trim(),
    selectedSceneCount: selectedSceneKeys.size,
    hasReportDraft: false,
  };
  const launchWhy = vnLaunchReason(actionState);
  const addRouteWhy = vnAddRouteReason(actionState);
  const addCapturedLineWhy = vnAddCapturedLineReason(actionState);
  const analyzeWhy = vnAnalyzeReason(actionState);
  const createCardsWhy = vnCreateCardsReason(actionState);
  const currentSceneWhy = vnCurrentSceneReason(actionState);
  const clearScenesWhy = vnClearScenesReason(actionState);
  // Spread rather than two attributes, because the ending draft is PER ROUTE: one call inside a
  // `.map` cannot end up grey with an explanation computed from a different route's draft.
  const endingReasonProps = (draft: string | undefined) => {
    const why = vnAddEndingReason({ ...actionState, hasEndingName: !!draft?.trim() });
    return { disabled: !!why, title: why ? t(why) : undefined };
  };

  useEffect(() => {
    if (!selected) {
      setProgress(emptyProgress());
      setAnalysis(null);
      setHookState(null);
      setSelectedSceneKeys(new Set());
      return;
    }
    setProgress({
      status: selected.status,
      route: selected.currentRouteId,
      chapter: selected.currentChapter,
      scene: selected.currentScene,
      completion: String(selected.completionPct),
    });
    setAnalysis(null);
    setSelectedSceneKeys(new Set());
    let active = true;
    void window.api.visualNovelHookState(selected.id).then((next) => {
      if (active) setHookState(next);
    });
    return () => {
      active = false;
    };
  }, [selected?.id]);

  useEffect(() => {
    let active = true;
    if (!selected) {
      setSessionStartedAt(null);
      return undefined;
    }
    const id = selected.id;
    void window.api.visualNovelSessionState(id).then((state) => {
      if (!active) return;
      setSessionStartedAt(state.startedAt);
      setSessionTracking(state.tracking ?? null);
    });
    // The session now ends by itself when the game exits, so the panel follows
    // main instead of assuming the timer runs until someone presses Stop.
    const off = typeof window.api.onVisualNovelSessionChanged === 'function'
      ? window.api.onVisualNovelSessionChanged((state) => {
        if (!active || state.visualNovelId !== id) return;
        setSessionStartedAt(state.startedAt);
        setSessionTracking(state.tracking ?? null);
      })
      : () => undefined;
    return () => {
      active = false;
      off();
    };
  }, [selected?.id]);

  useEffect(() => {
    if (!sessionStartedAt) return undefined;
    setClockNow(Date.now());
    const timer = window.setInterval((): void => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sessionStartedAt]);

  // Clipboard capture used to be a timer HERE, so it stopped the moment this
  // panel closed — i.e. when the user switched to the game. It now runs in main
  // (`main/immersion/visualNovelCaptureSession.ts`), starts with Launch and
  // stops when the game exits; `VisualNovelCaptureBar` shows and drives it.

  /*
   * Item 8: difficulty from the learner's own captured text, without asking.
   * Once enough lines exist the profile is (re)built in the background, so the
   * summary stops reading "Unrated" for a novel with hundreds of captured lines.
   */
  const selectedProfile = selected ? studyProfiles[`vn:${selected.id}`] : undefined;
  useEffect(() => {
    if (!selected || captures.length < AUTO_ANALYZE_MIN_LINES) return undefined;
    const analyzed = autoAnalyzedLines.get(selected.id) ?? selectedProfile?.sentences.total ?? 0;
    if (selectedProfile && captures.length - analyzed < AUTO_ANALYZE_STEP) return undefined;
    const count = captures.length;
    let active = true;
    const timer = window.setTimeout(() => {
      const recent = captures.slice(-AUTO_ANALYZE_WINDOW);
      void analyzeMediaStudyCues(recent.map((capture, index) => ({
        start: index,
        end: index + 1,
        text: capture.japanese,
      }))).then((value) => {
        if (!active) return;
        autoAnalyzedLines.set(selected.id, count);
        saveMediaLanguageProfile(createMediaLanguageProfile(visualNovelMediaItem(selected), value));
      }).catch(() => undefined);
    }, 1_500);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [selected?.id, captures.length, selectedProfile?.sentences.total]);

  const chooseExecutable = async (): Promise<void> => {
    const picked = await window.api.visualNovelPickExecutable();
    if (!picked) return;
    setExecutablePath(picked);
    if (!title.trim()) {
      setTitle((picked.split(/[\\/]/).pop() ?? '').replace(/\.[^.]+$/, ''));
    }
  };

  const addEntry = async (): Promise<void> => {
    setError('');
    const response = await window.api.visualNovelAdd({
      title,
      japaneseTitle,
      executablePath,
      installPath: executablePath ? executablePath.replace(/[\\/][^\\/]+$/, '') : '',
      language: 'ja',
    });
    if (!response.ok || !response.database) {
      setError(response.error ?? t('vnPanel.msg.addFailed'));
      return;
    }
    setDatabase(response.database);
    setSelectedId(response.database.entries[0]?.id ?? '');
    setTitle('');
    setJapaneseTitle('');
    setExecutablePath('');
    setStatus(t('vnPanel.msg.added'));
  };

  /**
   * Remove was the one action in this panel that reported nothing. Every other one calls
   * `setStatus`/`reportStatus`, so after deleting an entry the `role="status"` line still read
   * "Visual novel added to the local library." over an empty library — measured by the category-2
   * harness's live-region round trip, which is the whole reason that report exists. It also took
   * the returned database on trust: the handler answers with one whether or not the entry went,
   * so a silent no-op announced itself as a success.
   */
  const removeEntry = async (id: string, title: string): Promise<void> => {
    // `visual-novel:remove` does not remove one row. It filters `captures` by
    // `visualNovelId` too, so every sentence the reader mined out of this novel —
    // with its screenshot and any voice clip attached to it — is deleted in the
    // same `saveDatabase`, straight to disk, with no undo. The button said only
    // "Remove" and asked nothing, while the sibling capture row guards deleting
    // ONE sentence behind a two-step confirm. So the smaller destruction was
    // guarded and the larger one was not. The count is named because a confirm
    // that does not say what it takes is barely a confirm.
    const doomed = capturesForVisualNovel(database, id).length;
    const ok = await confirmDialog({
      title: t('vnPanel.confirm.remove.title'),
      message: doomed
        ? t('vnPanel.confirm.remove.message', { title, count: doomed })
        : t('vnPanel.confirm.remove.messageEmpty', { title }),
      confirmLabel: t('vnPanel.remove'),
      danger: true,
    });
    if (!ok) return;
    const next = await window.api.visualNovelRemove(id);
    setDatabase(next);
    if (next.entries.some((entry) => entry.id === id)) {
      reportStatus(t('vnPanel.msg.removeFailed', { title }), true);
      return;
    }
    setStatus(t('vnPanel.msg.removed', { title }));
  };

  const saveProgress = async (): Promise<void> => {
    if (!selected) return;
    const next = await window.api.visualNovelUpdateProgress(selected.id, {
      status: progress.status,
      currentRouteId: progress.route,
      currentChapter: progress.chapter,
      currentScene: progress.scene,
      completionPct: Number(progress.completion),
    });
    setDatabase(next);
    setStatus(t('vnPanel.msg.progressSaved'));
  };

  const launchVisualNovel = async (): Promise<void> => {
    if (!selected) return;
    const result = await window.api.visualNovelLaunch(selected.id);
    if (!result.ok) {
      // Typed: the raw spawn error (English, a path) is never the message.
      reportStatus(t(
        result.errorCode === 'missing-file'
          ? 'vnPanel.msg.launchMissing'
          : result.errorCode === 'no-executable' ? 'vnPanel.msg.launchNoExecutable' : 'vnPanel.msg.launchFailed',
      ), true);
      return;
    }
    setSessionStartedAt(result.startedAt ?? Date.now());
    reportStatus(t('vnPanel.msg.launched'));
  };

  const stopReadingTimer = async (): Promise<void> => {
    if (!selected) return;
    const result = await window.api.visualNovelStopSession(selected.id);
    setDatabase(result.database);
    setSessionStartedAt(null);
    setSessionTracking(null);
    reportStatus(result.stopped ? t('vnPanel.msg.timeSaved') : t('vnPanel.msg.noTimer'));
  };

  const captureLine = async (): Promise<void> => {
    if (!selected || !captureText.trim()) return;
    const response = await window.api.visualNovelCaptureText({
      visualNovelId: selected.id,
      kind: captureKind,
      japanese: captureText,
      translation: captureTranslation,
      speaker,
      routeId: progress.route,
      chapter: progress.chapter,
      scene: progress.scene,
      source: 'manual',
    });
    if (!response.ok || !response.database) {
      setError(response.error ?? t('vnPanel.msg.captureFailed'));
      return;
    }
    setDatabase(response.database);
    setCaptureText('');
    setCaptureTranslation('');
    setStatus(t('vnPanel.msg.textAdded'));
  };

  const captureScreenText = async (): Promise<void> => {
    if (!selected) return;
    writeLocalStorageJson(LENS_CAPTURE_TARGET_KEY, buildVisualNovelCaptureTarget({
      visualNovelId: selected.id,
      title: selected.title,
      routeId: progress.route,
      chapter: progress.chapter,
      scene: progress.scene,
    }));
    await window.api.lensOpen('select');
    reportStatus(t('vnPanel.msg.ocrPrompt', { title: selected.title }));
  };

  const toggleHookRelay = async (): Promise<void> => {
    if (!selected) return;
    if (hookState?.active) {
      setHookState(await window.api.visualNovelStopHook(selected.id));
      reportStatus(t('vnPanel.msg.hookStopped'));
      return;
    }
    const response = await window.api.visualNovelStartHook(selected.id);
    if (response.canceled) return;
    if (!response.ok || !response.state) {
      reportStatus(response.error ?? t('vnPanel.msg.hookStartFailed'), true);
      return;
    }
    setHookState(response.state);
    reportStatus(t('vnPanel.msg.hookStarted'));
  };

  const saveRoutes = async (routes: VisualNovelRoute[]): Promise<void> => {
    if (!selected) return;
    const response = await window.api.visualNovelUpdateRoutes(selected.id, routes);
    if (!response.ok || !response.database) {
      setError(response.error ?? t('vnPanel.msg.routesSaveFailed'));
      return;
    }
    setDatabase(response.database);
    setStatus(t('vnPanel.msg.routesSaved'));
  };

  const addRoute = async (): Promise<void> => {
    if (!selected || !routeName.trim()) return;
    const routeId = globalThis.crypto.randomUUID();
    await saveRoutes([...selected.routes, {
      id: routeId,
      name: routeName.trim(),
      character: routeCharacter.trim(),
      status: 'not-started',
      guideNotes: '',
      endings: endingName.trim()
        ? [{
          id: globalThis.crypto.randomUUID(),
          name: endingName.trim(),
          achieved: false,
          notes: '',
        }]
        : [],
    }]);
    setRouteName('');
    setRouteCharacter('');
    setEndingName('');
  };

  const updateRoute = async (
    routeId: string,
    mutate: (route: VisualNovelRoute) => VisualNovelRoute,
  ): Promise<void> => {
    if (!selected) return;
    await saveRoutes(selected.routes.map((route) => route.id === routeId ? mutate(route) : route));
  };

  const addEnding = async (routeId: string): Promise<void> => {
    const name = endingDrafts[routeId]?.trim();
    if (!name) return;
    await updateRoute(routeId, (route) => ({
      ...route,
      endings: [...route.endings, {
        id: globalThis.crypto.randomUUID(),
        name,
        achieved: false,
        notes: '',
      }],
    }));
    setEndingDrafts((current) => ({ ...current, [routeId]: '' }));
  };

  const analyzeCaptures = async (): Promise<void> => {
    if (!selected || !scopedCaptures.length) return;
    setBusy(true);
    setError('');
    try {
      const value = await analyzeMediaStudyCues(scopedCaptures.map((capture, index) => ({
        start: index,
        end: index + 1,
        text: capture.japanese,
      })));
      const item = visualNovelMediaItem(selected);
      if (miningScope === 'all') saveMediaLanguageProfile(createMediaLanguageProfile(item, value));
      const sessionId = startMediaStudySession({
        mediaId: item.id,
        title: item.title,
        action: 'analyze-japanese',
      });
      addMediaStudySessionProgress(sessionId, { vocabularyMined: value.vocabulary.length });
      setAnalysis(value);
      setStatus(t('vnPanel.msg.analyzed', {
        count: value.sentences.length,
        scope: t(SCOPE_KEYS[miningScope]),
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const toggleScene = (key: string): void => {
    setSelectedSceneKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectCurrentScene = (): void => {
    const key = `${progress.chapter.trim()}\u0000${progress.scene.trim()}`;
    if (progress.scene.trim() && sceneOptions.some((option) => option.key === key)) {
      setSelectedSceneKeys(new Set([key]));
    }
  };

  const createCards = async (): Promise<void> => {
    if (!selected || !analysis) return;
    setBusy(true);
    const added = await addVisualNovelStudyCards(selected, analysis, scopedCaptures)
      .finally(() => setBusy(false));
    setStatus(added.total
      ? t('vnPanel.msg.cardsAdded', {
        total: added.total,
        vocab: added.counts.vocabulary,
        sentences: added.counts.sentence,
        kanji: added.counts.kanji,
        grammar: added.counts.grammar,
      })
      : t('vnPanel.msg.noNewCards'));
  };

  const saveSelectedSentence = (): void => {
    if (!selected || !selectedCapture) return;
    void mineVisualNovelLine(selected, selectedCapture)
      .then((added) => setStatus(added ? t('vnPanel.msg.sentenceSaved') : t('vnPanel.msg.sentenceExists')))
      .catch(() => undefined);
  };

  const onTextMouseUp = (event: React.MouseEvent): void => {
    const hit = lookupWordFromMouseUp(event);
    if (!hit) {
      if (isLookupClick(event)) setPopup(null);
      return;
    }
    if (!hit.translate) {
      setPopup({ query: hit.query, x: hit.x, y: hit.y, context: hit.context });
    }
  };

  /**
   * The library is a LEADING reading tool, not a grid track.
   *
   * `.visual-novel-layout` was `minmax(220px, 290px) minmax(0, 1fr)` with a
   * `@media (max-width: 760px)` stack, and the media query reads the WINDOW
   * while this panel renders inside the Immersion floating window. In a 600px
   * pane inside a 1264px window it therefore never fires, the library keeps its
   * 220px minimum, and the workspace absorbs the entire shortfall — the same
   * defect Captures and Library had, measured rather than assumed.
   *
   * `side: 'leading'` because the library navigates INTO the document rather
   * than acting on it. 220/290 are the grid's own two numbers, kept so the
   * docked width at a wide canvas is byte-identical to what shipped.
   */
  const libraryTool: ReadingCanvasTool = {
    id: 'library',
    label: t('vnPanel.library'),
    side: 'leading',
    minWidth: 220,
    preferredWidth: 290,
    onClose: () => setLibraryOpen(false),
    content: !loaded ? (
      <div className="visual-novel-library" aria-busy="true" />
    ) : (
      <div className="visual-novel-library">
        {/* The rail opened with eight SETUP controls stacked above the list it is named for —
            three add-form fields, Browse, Add to library, and the JSON import/export/scan row —
            which is most of why the default state scanned 36 controls against §10.4's bar of 12.
            Adding a novel is a once-per-title task and the list is the everyday one, so setup
            goes behind a disclosure and the list and its recommendations stay in the open. */}
        <details
          className="visual-novel-add-disclosure"
          open={addOpen}
          onToggle={(event) => setAddOpen(event.currentTarget.open)}
        >
          <summary>{t('vnPanel.addToLibrary')}</summary>
          <div className="visual-novel-add">
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('vnPanel.titlePlaceholder')} aria-label={t('vnPanel.aria.title')} />
            <input value={japaneseTitle} onChange={(event) => setJapaneseTitle(event.target.value)} placeholder={t('vnPanel.japaneseTitlePlaceholder')} aria-label={t('vnPanel.aria.japaneseTitle')} />
            <div>
              <input value={executablePath} onChange={(event) => setExecutablePath(event.target.value)} placeholder={t('vnPanel.executablePlaceholder')} aria-label={t('vnPanel.aria.executable')} />
              <button className="btn small" type="button" onClick={() => void chooseExecutable()}>{t('vnPanel.browse')}</button>
            </div>
            {/* 'Add', not a third 'Add to library': the disclosure above already says it. */}
            <button
              className="btn small primary"
              type="button"
              disabled={!title.trim()}
              title={!title.trim() ? t('vnPanel.reason.needTitle') : undefined}
              onClick={() => void addEntry()}
            >
              {t('common.add')}
            </button>
          </div>
          <VisualNovelImportPanel
            onImported={(next) => {
              setDatabase(next);
              setSelectedId(next.entries[0]?.id ?? '');
            }}
            onStatus={reportStatus}
          />
        </details>
        <VisualNovelRecommendationsPanel
          context={recommendationState.context}
          recommendations={recommendationState.recommendations}
          entries={database.entries}
          onSelect={setSelectedId}
          onAdded={(next, id) => {
            setDatabase(next);
            setSelectedId(id);
          }}
          onStatus={reportStatus}
        />
        {/* The library list is this panel's primary object list and had no class handle at all —
            its rows could only be found by their own (translated) title text, which is the same
            defect the reader's back control had. Named after the panel's own convention so the
            selected row is observable to assistive tech as well as to a selector. */}
        <ul className="visual-novel-entries">
          {database.entries.map((entry) => (
            <li key={entry.id}>
              <button
                type="button"
                className={`visual-novel-entry${entry.id === selectedId ? ' is-selected' : ''}`}
                aria-current={entry.id === selectedId ? 'true' : undefined}
                onClick={() => setSelectedId(entry.id)}
              >
                <strong>{entry.title}</strong>
                <span>{engineLabel(entry.engine, t)} · {t(STATUS_KEYS[entry.status])} · {Math.round(entry.completionPct)}%</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    ),
  };

  /*
   * Difficulty, honestly sourced (item 8). The learner's own captured text wins
   * once there is enough of it; before that a VNDB prior is shown and SAYS it is
   * an estimate; with neither, the line says how many lines are still needed.
   */
  const difficultyLine = (() => {
    if (!selected) return '';
    const profile = selectedProfile && selectedProfile.sentences.total >= AUTO_ANALYZE_MIN_LINES
      ? selectedProfile
      : null;
    if (profile) {
      const coverage = t('vnApp.coverage', { percent: Math.round(profile.difficulty.knownRatio * 100) });
      const level = profile.difficulty.jlptLevel;
      return [
        level
          ? t('vnApp.difficulty.captured', { level, count: profile.sentences.total })
          : t('vnApp.difficulty.capturedNoLevel', { count: profile.sentences.total }),
        coverage,
      ].join(' · ');
    }
    const needed = Math.max(0, AUTO_ANALYZE_MIN_LINES - captures.length);
    const textLine = needed
      ? t('vnApp.difficulty.needLines', { count: needed })
      : t('vnApp.difficulty.pending');
    if (selected.tags.length || selected.estimatedPlaytimeHours) {
      const prior = estimateVisualNovelDifficultyPrior(selected);
      return [t('vnApp.difficulty.prior', { level: prior.jlpt }), textLine].join(' · ');
    }
    return textLine;
  })();
  const primaryTab = PRIMARY_TABS.has(tab);
  const tabId = (value: VisualNovelTab): string => `vn-tab-${value}`;
  const panelId = (value: VisualNovelTab): string => `vn-tabpanel-${value}`;
  const tabPanelProps = (value: VisualNovelTab) => ({
    role: 'tabpanel' as const,
    id: panelId(value),
    'aria-labelledby': tabId(value),
    className: `visual-novel-tabpanel visual-novel-tabpanel--${value}`,
    hidden: tab !== value,
  });

  return (
    <div className="visual-novel-panel">
      {/* The panel's own title-and-tools row is navigation/transport chrome, so §2.3 makes it a
          contextual surface rather than a local header. In the Visual Novels app the window
          title already names the surface, so the kicker and title are only drawn when this
          panel is embedded in the Immersion window. */}
      <ContextualSurface as="header" className="visual-novel-panel-head">
        {!standalone && (
          <div>
            <span className="media-study-mode-kicker">{t('vnPanel.kicker')}</span>
            <strong>{t('vnPanel.title')}</strong>
          </div>
        )}
        {/* One declared primary action in the head: Launch the selected novel, or with
            nothing selected, the way to the first entry. It mirrors the summary's Launch.
            With nothing selected it only shows while the library rail is CLOSED: with the
            rail open, the rail's own 'Add to library' disclosure is on screen and a second
            copy up here made three 'Add to library' controls in one window (V12). It now
            opens the rail AND the add form, so it lands on the fields, not on a list. */}
        {(selected || !libraryOpen) && (
          <button
            type="button"
            className="btn primary visual-novel-panel-primary"
            disabled={selected ? !!launchWhy : false}
            title={selected && launchWhy ? t(launchWhy) : undefined}
            onClick={() => {
              if (selected) {
                void launchVisualNovel();
                return;
              }
              setLibraryOpen(true);
              setAddOpen(true);
            }}
          >
            {selected ? t('vnPanel.launch') : t('vnPanel.addToLibrary')}
          </button>
        )}
        <div className="visual-novel-panel-tools">
          <button
            className="btn"
            type="button"
            aria-pressed={libraryOpen}
            onClick={() => setLibraryOpen((open) => !open)}
          >
            {libraryOpen ? t('immersion.hideLibrary') : t('immersion.showLibrary')}
          </button>
          {onClose && <button className="btn small" type="button" onClick={onClose}>{t('vnPanel.backToBrowser')}</button>}
        </div>
      </ContextualSurface>
      {/* Always mounted: a live region has to exist before its text changes to be announced. */}
      <p className={`visual-novel-status ${error ? 'media-error' : 'muted'}`} role="status">{error || status}</p>
      <ReadingCanvas
        className="visual-novel-layout"
        closeLabel={t('immersion.hideLibrary')}
        policy={READING_CANVAS_FILL_POLICY}
        tools={libraryOpen ? [libraryTool] : []}
      >
        <main className="visual-novel-workspace is-tabbed" aria-busy={loaded ? undefined : true}>
          {/* `muted` is presentation; `visual-novel-empty` is what says this IS the empty state. */}
          {loaded && !selected && <p className="muted visual-novel-empty">{t('vnPanel.emptyPrompt')}</p>}
          {selected && (
            <>
              <div className="visual-novel-column visual-novel-column--primary">
              <div className="visual-novel-summary">
                {selected.coverImageUrl && <VisualNovelArt src={selected.coverImageUrl} />}
                <div className="visual-novel-summary-title">
                  <strong>{selected.title}</strong>
                  <span>{selected.japaneseTitle}</span>
                  {selected.communityRating != null && (
                    <small>{t('vnPanel.votes', {
                      rating: selected.communityRating,
                      votes: selected.communityVoteCount,
                    })}</small>
                  )}
                  <small className="visual-novel-difficulty">{difficultyLine}</small>
                </div>
                <span title={sessionTracking ? t(TRACKING_KEYS[sessionTracking]) : undefined}>
                  {/* An undetected engine has, by definition, unknown compatibility: saying it
                      twice ('Engine unknown · Unknown') is noise, so the pair collapses. */}
                  {engineLabel(selected.engine, t)}
                  {selected.engine === 'unknown' ? '' : ` · ${t(COMPAT_KEYS[selected.engineCompatibility])}`}
                  {' · '}
                  {formatDuration(
                    selected.totalPlaytimeSec
                    + (sessionStartedAt ? Math.max(0, (clockNow - sessionStartedAt) / 1000) : 0),
                    t,
                  )}
                  {sessionStartedAt ? ` · ${t('vnPanel.timing')}` : ''}
                </span>
                {readingStats && readingStats.lines > 0 && (
                  <small className="visual-novel-reading-stats" data-vn-reading-stats="">
                    {visualNovelStatsLine(readingStats, t, lang)}
                  </small>
                )}
                <div className="visual-novel-summary-actions">
                  <button className="btn small" type="button" disabled={!!launchWhy} title={launchWhy ? t(launchWhy) : undefined} onClick={() => void launchVisualNovel()}>{t('vnPanel.launch')}</button>
                  {sessionStartedAt && <button className="btn small" type="button" onClick={() => void stopReadingTimer()}>{t('vnPanel.stopTimer')}</button>}
                  <button className="btn small" type="button" onClick={() => void removeEntry(selected.id, selected.title)}>{t('vnPanel.remove')}</button>
                </div>
              </div>
              {/* Tabs rather than ten stacked disclosures. Every panel stays MOUNTED and is
                  only `hidden`, so a half-typed route note or capture draft survives a tab
                  switch, and the reading tab is where the panel opens. */}
              <div className="visual-novel-tabs" role="tablist" aria-label={t('vnApp.aria.tabs')}>
                {TABS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    id={tabId(value)}
                    aria-controls={panelId(value)}
                    aria-selected={tab === value}
                    tabIndex={tab === value ? 0 : -1}
                    className={tab === value ? 'is-active' : ''}
                    onClick={() => setTab(value)}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
                      event.preventDefault();
                      const step = event.key === 'ArrowRight' ? 1 : -1;
                      const next = TABS[(TABS.indexOf(value) + step + TABS.length) % TABS.length];
                      setTab(next);
                      (event.currentTarget.parentElement?.querySelector(`#${tabId(next)}`) as HTMLElement | null)?.focus();
                    }}
                  >
                    {t(TAB_KEYS[value])}
                  </button>
                ))}
              </div>
              <div {...tabPanelProps('read')}>
              <VisualNovelCaptureBar entry={selected} />
              {/* Automatic capture (above) is the everyday path; screen OCR, typing a line by
                  hand and the hook-file relay are the fallbacks, so they stay compact here. */}
              <div className="visual-novel-capture">
                <div className="visual-novel-capture-actions">
                  <button className="btn small" type="button" onClick={() => void captureScreenText()}>{t('vnPanel.captureScreenText')}</button>
                  <details className="visual-novel-capture-manual">
                    {/* The hook relay keeps running while this is shut; the summary reports it. */}
                    <summary>
                      {t('vnPanel.addCapturedLine')}
                      {hookState?.active && <small>{t('vnPanel.hookListening', { count: hookState.capturedLines })}</small>}
                    </summary>
                    <div className="visual-novel-capture-manual-fields">
                      <div className="visual-novel-capture-manual-head">
                        <select value={captureKind} onChange={(event) => setCaptureKind(event.target.value as VisualNovelTextKind)} aria-label={t('vnPanel.aria.captureKind')}>
                          {(Object.keys(CAPTURE_KIND_KEYS) as VisualNovelTextKind[]).map((kind) => (
                            <option key={kind} value={kind}>{t(CAPTURE_KIND_KEYS[kind])}</option>
                          ))}
                        </select>
                        <input value={speaker} onChange={(event) => setSpeaker(event.target.value)} placeholder={t('vnPanel.speakerPlaceholder')} aria-label={t('vnPanel.aria.speaker')} />
                      </div>
                      <textarea value={captureText} onChange={(event) => setCaptureText(event.target.value)} placeholder={t('vnPanel.capturePlaceholder')} />
                      <textarea value={captureTranslation} onChange={(event) => setCaptureTranslation(event.target.value)} placeholder={t('vnPanel.captureTranslationPlaceholder')} />
                      <div className="visual-novel-capture-manual-actions">
                        <button className="btn small" type="button" disabled={!!addCapturedLineWhy} title={addCapturedLineWhy ? t(addCapturedLineWhy) : undefined} onClick={() => void captureLine()}>{t('vnPanel.addCapturedLine')}</button>
                        <button type="button" className={`btn small${hookState?.active ? ' is-active' : ''}`} onClick={() => void toggleHookRelay()}>
                          {hookState?.active ? t('vnPanel.stopHook') : t('vnPanel.startHook')}
                        </button>
                        {hookState?.active && (
                          <small title={hookState.filePath}>
                            {t('vnPanel.hookListening', { count: hookState.capturedLines })}
                            {hookState.lastError ? ` · ${hookState.lastError}` : ''}
                          </small>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
              </div>
              <section className="visual-novel-reading-overlay" aria-label={t('vnPanel.aria.overlay')}>
                <div className="visual-novel-reading-head"><strong>{t('vnPanel.overlayHead')}</strong><span>{t('vnPanel.lines', { count: captures.length })}</span></div>
                <div className="visual-novel-capture-list wk-on" data-dict-owner="" onPointerDown={noteLookupPointerDown} onMouseUp={onTextMouseUp}>
                  {captures.map((capture) => (
                    <button
                      key={capture.id}
                      type="button"
                      className={`visual-novel-capture-row${capture.id === selectedCapture?.id ? ' is-selected' : ''}`}
                      aria-current={capture.id === selectedCapture?.id ? 'true' : undefined}
                      onClick={() => setSelectedCaptureId(capture.id)}
                    >
                      <small>{displayCaptureContext(capture) || t(CAPTURE_KIND_KEYS[capture.kind])}</small>
                      <span>{capture.japanese}</span>
                      {capture.translation && <em>{capture.translation}</em>}
                    </button>
                  ))}
                </div>
              </section>
              {selectedCapture && (
                <VisualNovelSentenceAssist
                  entry={selected}
                  capture={selectedCapture}
                  onDatabase={setDatabase}
                  onStatus={reportStatus}
                  onSaveCard={saveSelectedSentence}
                />
              )}
              </div>
              <div {...tabPanelProps('study')}>
              <div className="visual-novel-analysis-actions">
                <select value={miningScope} onChange={(event) => setMiningScope(event.target.value as MiningScope)} aria-label={t('vnPanel.aria.miningScope')}>
                  <option value="all">{t('vnPanel.scope.all')}</option>
                  <option value="route" disabled={!progress.route}>{t('vnPanel.scope.route')}</option>
                  <option value="chapter" disabled={!progress.chapter.trim()}>{t('vnPanel.scope.chapter')}</option>
                  <option value="scenes" disabled={!sceneOptions.length}>{t('vnPanel.scope.scenes')}</option>
                </select>
                <button className="btn small" type="button" disabled={!!analyzeWhy} title={analyzeWhy ? t(analyzeWhy) : undefined} onClick={() => void analyzeCaptures()}>{busy ? t('vnPanel.analyzing') : t('vnPanel.analyzeScope', { scope: t(SCOPE_KEYS[miningScope]) })}</button>
                <button className="btn small" type="button" disabled={!!createCardsWhy} title={createCardsWhy ? t(createCardsWhy) : undefined} onClick={() => void createCards()}>{t('vnPanel.createCards')}</button>
                <button className="btn small" type="button" onClick={() => setCollectionOpen(true)}>{t('vnPanel.openDeck')}</button>
              </div>
              {miningScope === 'scenes' && (
                <details className="visual-novel-scene-picker" open>
                  <summary>
                    {t('vnPanel.scenePickerSummary', {
                      selected: selectedSceneKeys.size,
                      lines: scopedCaptures.length,
                    })}
                  </summary>
                  <div className="visual-novel-scene-picker-actions">
                    <button className="btn small" type="button" disabled={!!currentSceneWhy} title={currentSceneWhy ? t(currentSceneWhy) : undefined} onClick={selectCurrentScene}>{t('vnPanel.currentScene')}</button>
                    <button className="btn small" type="button" onClick={() => setSelectedSceneKeys(new Set(sceneOptions.map((option) => option.key)))}>{t('vnPanel.allScenes')}</button>
                    <button className="btn small" type="button" disabled={!!clearScenesWhy} title={clearScenesWhy ? t(clearScenesWhy) : undefined} onClick={() => setSelectedSceneKeys(new Set())}>{t('vnPanel.clear')}</button>
                  </div>
                  <div className="visual-novel-scene-options">
                    {sceneOptions.map((option) => (
                      <label key={option.key}>
                        <input
                          type="checkbox"
                          checked={selectedSceneKeys.has(option.key)}
                          onChange={() => toggleScene(option.key)}
                        />
                        <span>{[option.chapter, option.scene].filter(Boolean).join(' · ')}</span>
                        <small>{t('vnPanel.lines', { count: option.count })}</small>
                      </label>
                    ))}
                  </div>
                </details>
              )}
              {analysis && (
                <div className="visual-novel-analysis-summary">
                  <span>{t('vnPanel.difficulty', { level: analysis.level?.label ?? t('vnPanel.unrated') })}</span>
                  <span>{t('vnPanel.words', { count: analysis.vocabulary.length })}</span>
                  <span>{t('vnPanel.kanji', { count: analysis.kanji.length })}</span>
                  <span>{t('vnPanel.knownCoverage', { percent: Math.round(analysis.comprehensibility.knownRatio * 100) })}</span>
                </div>
              )}
              {characterProfiles.length > 0 && (
                <section className="visual-novel-character-profiles" aria-label={t('vnPanel.aria.characters')}>
                  <div className="visual-novel-reading-head"><strong>{t('vnPanel.charactersHead')}</strong><span>{t('vnPanel.speakers', { count: characterProfiles.length })}</span></div>
                  <div>
                    {characterProfiles.map((profile) => (
                      <article key={profile.speaker}>
                        <div><strong>{profile.speaker}</strong><span>{t('vnPanel.lines', { count: profile.lineCount })} · {t(POLITENESS_KEYS[profile.politeness])}</span></div>
                        <p>{speechSummary(profile, t)}</p>
                        {profile.sentenceEndings.length > 0 && <small>{t('vnPanel.commonSignals', { signals: profile.sentenceEndings.join(' · ') })}</small>}
                      </article>
                    ))}
                  </div>
                </section>
              )}
              <MediaLanguageProfileCard mediaId={`vn:${selected.id}`} />
              {selectedCapture && (
                <MediaStudyAssistantPanel
                  mediaId={`vn:${selected.id}`}
                  mediaTitle={selected.title}
                  sentence={selectedCapture.japanese}
                  jlptLevel={analysis?.level?.label ?? null}
                />
              )}
              </div>
              </div>
              <div className="visual-novel-column visual-novel-column--setup" hidden={primaryTab}>
              <div {...tabPanelProps('details')}>
              <VisualNovelMetadataEditor
                entry={selected}
                onSaved={setDatabase}
                onStatus={reportStatus}
              />
              <VisualNovelGallery entry={selected} />
              <VisualNovelSourcePanel
                entry={selected}
                recommendationContext={recommendationState.context}
                onApplied={setDatabase}
                onStatus={reportStatus}
              />
              <VisualNovelReleaseCatalog entry={selected} />
              <VisualNovelCommunityPanel
                entry={selected}
                onDatabase={setDatabase}
                onStatus={reportStatus}
              />
              </div>
              <div {...tabPanelProps('routes')}>
              {/* Bookkeeping: edited when a session ends. Its own tab now, so it no longer
                  needs the disclosure it hid behind in the single long column. */}
              <section className="visual-novel-progress-section" aria-label={t('vnPanel.progressHead')}>
                <div className="visual-novel-reading-head"><strong>{t('vnPanel.progressHead')}</strong></div>
              <div className="visual-novel-progress">
                <label>{t('vnPanel.statusLabel')}<select value={progress.status} onChange={(event) => setProgress((current) => ({ ...current, status: event.target.value as VisualNovelStatus }))}>{(Object.keys(STATUS_KEYS) as VisualNovelStatus[]).map((value) => <option key={value} value={value}>{t(STATUS_KEYS[value])}</option>)}</select></label>
                <label>{t('vnPanel.route')}<select value={progress.route} onChange={(event) => setProgress((current) => ({ ...current, route: event.target.value }))}><option value="">{t('vnPanel.noRoute')}</option>{selected.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
                <label>{t('vnPanel.chapter')}<input value={progress.chapter} onChange={(event) => setProgress((current) => ({ ...current, chapter: event.target.value }))} /></label>
                <label>{t('vnPanel.scene')}<input value={progress.scene} onChange={(event) => setProgress((current) => ({ ...current, scene: event.target.value }))} /></label>
                <label>{t('vnPanel.completion')}<input type="number" min="0" max="100" value={progress.completion} onChange={(event) => setProgress((current) => ({ ...current, completion: event.target.value }))} /></label>
                <button className="btn small" type="button" onClick={() => void saveProgress()}>{t('vnPanel.saveProgress')}</button>
              </div>
              </section>
              <section className="visual-novel-routes" aria-label={t('vnPanel.aria.routes')}>
                <div className="visual-novel-reading-head"><strong>{t('vnPanel.routesHead')}</strong><span>{t('vnPanel.routesCount', {
                  done: selected.routes.filter((route) => route.status === 'completed').length,
                  total: selected.routes.length,
                })}</span></div>
                {/* Same reasoning as the progress editor: routes are declared once and read
                    many times, so the three-field add form goes behind a disclosure and the
                    route LIST below stays open. */}
                <details className="visual-novel-route-disclosure">
                  <summary>{t('vnPanel.addRoute')}</summary>
                  <div className="visual-novel-route-add">
                    <input value={routeName} onChange={(event) => setRouteName(event.target.value)} placeholder={t('vnPanel.routeNamePlaceholder')} aria-label={t('vnPanel.aria.routeName')} />
                    <input value={routeCharacter} onChange={(event) => setRouteCharacter(event.target.value)} placeholder={t('vnPanel.characterPlaceholder')} aria-label={t('vnPanel.aria.routeCharacter')} />
                    <input value={endingName} onChange={(event) => setEndingName(event.target.value)} placeholder={t('vnPanel.firstEndingPlaceholder')} aria-label={t('vnPanel.aria.endingName')} />
                    <button className="btn small" type="button" disabled={!!addRouteWhy} title={addRouteWhy ? t(addRouteWhy) : undefined} onClick={() => void addRoute()}>{t('vnPanel.addRoute')}</button>
                  </div>
                </details>
                <div className="visual-novel-route-list">
                  {selected.routes.map((route) => (
                    <article key={route.id}>
                      <div>
                        <strong>{route.name}</strong>
                        <span>{route.character || t('vnPanel.generalRoute')}</span>
                        <select
                          value={route.status}
                          aria-label={t('vnPanel.aria.routeStatus', { name: route.name })}
                          onChange={(event) => void updateRoute(route.id, (current) => ({
                            ...current,
                            status: event.target.value as VisualNovelRouteStatus,
                          }))}
                        >
                          {(Object.keys(ROUTE_STATUS_KEYS) as VisualNovelRouteStatus[]).map((value) => (
                            <option key={value} value={value}>{t(ROUTE_STATUS_KEYS[value])}</option>
                          ))}
                        </select>
                        <button className="btn small" type="button" onClick={() => {
                          if (routePendingRemoveId !== route.id) {
                            setRoutePendingRemoveId(route.id);
                            return;
                          }
                          setRoutePendingRemoveId('');
                          void saveRoutes(selected.routes.filter((candidate) => candidate.id !== route.id));
                        }}>
                          {routePendingRemoveId === route.id ? t('vnPanel.confirmRemoveRoute') : t('vnPanel.removeRoute')}
                        </button>
                      </div>
                      <label className="visual-novel-route-guide">
                        {t('vnPanel.routeGuideNotes')}
                        <textarea
                          key={`${route.id}:${route.guideNotes}`}
                          defaultValue={route.guideNotes}
                          placeholder={t('vnPanel.routeGuidePlaceholder')}
                          onBlur={(event) => {
                            if (event.target.value !== route.guideNotes) {
                              void updateRoute(route.id, (current) => ({
                                ...current,
                                guideNotes: event.target.value,
                              }));
                            }
                          }}
                        />
                      </label>
                      {route.endings.map((ending) => (
                        <div className="visual-novel-ending-row" key={ending.id}>
                          <label>
                            <input
                              type="checkbox"
                              checked={ending.achieved}
                              onChange={(event) => void updateRoute(route.id, (current) => ({
                                ...current,
                                endings: current.endings.map((candidate) => candidate.id === ending.id
                                  ? { ...candidate, achieved: event.target.checked }
                                  : candidate),
                              }))}
                            />
                            {ending.name}
                          </label>
                          <input
                            key={`${ending.id}:${ending.notes}`}
                            defaultValue={ending.notes}
                            placeholder={t('vnPanel.endingNotesPlaceholder')}
                            aria-label={t('vnPanel.aria.endingNotes', { name: ending.name })}
                            onBlur={(event) => {
                              if (event.target.value !== ending.notes) {
                                void updateRoute(route.id, (current) => ({
                                  ...current,
                                  endings: current.endings.map((candidate) => candidate.id === ending.id
                                    ? { ...candidate, notes: event.target.value }
                                    : candidate),
                                }));
                              }
                            }}
                          />
                          <button className="btn small" type="button" onClick={() => void updateRoute(route.id, (current) => ({
                            ...current,
                            endings: current.endings.filter((candidate) => candidate.id !== ending.id),
                          }))}>{t('vnPanel.remove')}</button>
                        </div>
                      ))}
                      <div className="visual-novel-ending-add">
                        <input
                          value={endingDrafts[route.id] ?? ''}
                          onChange={(event) => setEndingDrafts((current) => ({
                            ...current,
                            [route.id]: event.target.value,
                          }))}
                          placeholder={t('vnPanel.addEndingPlaceholder')}
                          aria-label={t('vnPanel.aria.addEnding', { name: route.name })}
                        />
                        <button className="btn small" type="button" {...endingReasonProps(endingDrafts[route.id])} onClick={() => void addEnding(route.id)}>{t('vnPanel.addEnding')}</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              </div>
              <div {...tabPanelProps('setup')}>
              <VisualNovelCaptureSetup entry={selected} database={database} onDatabase={setDatabase} />
              <VisualNovelScriptImportPanel
                entry={selected}
                onImported={setDatabase}
                onStatus={reportStatus}
              />
              </div>
              </div>
            </>
          )}
        </main>
      </ReadingCanvas>
      {popup && <DictionaryPopup {...popup} onClose={() => setPopup(null)} />}
      {selected && (
        <ReaderCollectionPanel
          bookId={`vn:${selected.id}`}
          bookTitle={selected.title}
          open={collectionOpen}
          onClose={() => setCollectionOpen(false)}
        />
      )}
    </div>
  );
}
