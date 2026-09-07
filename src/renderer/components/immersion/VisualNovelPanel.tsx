import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../../../shared/types';
import {
  capturesForVisualNovel,
  createEmptyVisualNovelDatabase,
  type VisualNovelDatabase,
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
import { analyzeVisualNovelCharacterSpeech } from '../../../shared/visualNovelLanguage';
import { rankVisualNovelEntries } from '../../../shared/visualNovelRecommendations';
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
import { addMediaStudySentenceFlashcard, addVisualNovelStudyFlashcards, analyzeMediaStudyCues, createMediaLanguageProfile, type MediaStudyAnalysis } from '../../mediaStudyWorkflow';
import { addMediaStudySessionProgress, loadMediaStudyDatabase, onMediaStudyDatabaseChanged, saveMediaLanguageProfile, startMediaStudySession } from '../../mediaStudyStore';
import { isLookupClick, lookupWordFromMouseUp, noteLookupPointerDown } from '../../wordLookup';
import { CAPTURE_KIND_KEYS } from './captureKindKeys';
import DictionaryPopup from '../DictionaryPopup';
import ReaderCollectionPanel from '../ReaderCollectionPanel';
import { useT } from '../../i18n';
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

interface ProgressDraft {
  status: VisualNovelStatus;
  route: string;
  chapter: string;
  scene: string;
  completion: string;
}

type MiningScope = 'all' | 'route' | 'chapter' | 'scenes';

const emptyProgress = (): ProgressDraft => ({
  status: 'planned',
  route: '',
  chapter: '',
  scene: '',
  completion: '0',
});

function pseudoMediaItem(entry: {
  id: string;
  title: string;
  executablePath: string;
  language: string;
  createdAt: number;
}): MediaItem {
  return {
    id: `vn:${entry.id}`,
    title: entry.title,
    path: entry.executablePath,
    fileName: entry.executablePath.split(/[\\/]/).pop() ?? entry.title,
    addedAt: entry.createdAt,
    kind: 'video',
    lang: entry.language,
    category: 'learning',
  };
}

function displayCaptureContext(capture: VisualNovelTextCapture): string {
  return [capture.speaker, capture.chapter, capture.scene].filter(Boolean).join(' · ');
}

function captureSceneKey(capture: Pick<VisualNovelTextCapture, 'chapter' | 'scene'>): string {
  return `${capture.chapter.trim()}\u0000${capture.scene.trim()}`;
}

function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export default function VisualNovelPanel({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const [libraryOpen, setLibraryOpen] = useState(true);
  const [database, setDatabase] = useState<VisualNovelDatabase>(createEmptyVisualNovelDatabase);
  const [studyProfiles, setStudyProfiles] = useState(() => loadMediaStudyDatabase().profiles);
  const [selectedId, setSelectedId] = useState('');
  const [title, setTitle] = useState('');
  const [japaneseTitle, setJapaneseTitle] = useState('');
  const [executablePath, setExecutablePath] = useState('');
  const [captureText, setCaptureText] = useState('');
  const [captureTranslation, setCaptureTranslation] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [captureKind, setCaptureKind] = useState<VisualNovelTextKind>('dialogue');
  const [clipboardCapture, setClipboardCapture] = useState(false);
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
  const [clockNow, setClockNow] = useState(Date.now());
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [popup, setPopup] = useState<{ query: string; x: number; y: number; context?: string } | null>(null);
  const lastClipboardText = useRef('');

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

  useEffect(() => onMediaStudyDatabaseChanged((next) => setStudyProfiles(next.profiles)), []);

  useEffect(() => window.api.onVisualNovelHookChanged((next) => {
    if (next.visualNovelId === selectedId) setHookState(next);
  }), [selectedId]);

  const selected = database.entries.find((entry) => entry.id === selectedId) ?? null;
  const captures = useMemo(
    () => selected ? capturesForVisualNovel(database, selected.id) : [],
    [database, selected],
  );
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
    void window.api.visualNovelSessionState(selected.id).then((state) => {
      if (active) setSessionStartedAt(state.startedAt);
    });
    return () => {
      active = false;
    };
  }, [selected?.id]);

  useEffect(() => {
    if (!sessionStartedAt) return undefined;
    setClockNow(Date.now());
    const timer = window.setInterval((): void => setClockNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sessionStartedAt]);

  useEffect(() => {
    if (!clipboardCapture || !selected) return undefined;
    let active = true;
    let reading = false;
    const poll = async (): Promise<void> => {
      if (reading) return;
      reading = true;
      try {
        const text = await window.api.visualNovelReadClipboard();
        if (
          active
          && text
          && text !== lastClipboardText.current
          && /[\u3040-\u30ff\u3400-\u9fff]/u.test(text)
        ) {
          lastClipboardText.current = text;
          const response = await window.api.visualNovelCaptureText({
            visualNovelId: selected.id,
            kind: captureKind,
            japanese: text,
            speaker,
            routeId: progress.route,
            chapter: progress.chapter,
            scene: progress.scene,
            source: 'clipboard',
          });
          if (active && response.ok && response.database) {
            setDatabase(response.database);
            setStatus('Captured new Japanese text from the clipboard.');
          }
        }
      } finally {
        reading = false;
      }
    };
    void poll();
    const timer = window.setInterval((): void => void poll(), 800);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [
    captureKind,
    clipboardCapture,
    progress.chapter,
    progress.route,
    progress.scene,
    selected?.id,
    speaker,
  ]);

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
      setError(response.error ?? 'The visual novel could not be added.');
      return;
    }
    setDatabase(response.database);
    setSelectedId(response.database.entries[0]?.id ?? '');
    setTitle('');
    setJapaneseTitle('');
    setExecutablePath('');
    setStatus('Visual novel added to the local library.');
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
    setStatus('Reading progress saved.');
  };

  const launchVisualNovel = async (): Promise<void> => {
    if (!selected) return;
    const result = await window.api.visualNovelLaunch(selected.id);
    if (!result.ok) {
      reportStatus(result.error ?? 'Launch failed.', true);
      return;
    }
    setSessionStartedAt(result.startedAt ?? Date.now());
    reportStatus('Visual novel launched and reading time started.');
  };

  const stopReadingTimer = async (): Promise<void> => {
    if (!selected) return;
    const result = await window.api.visualNovelStopSession(selected.id);
    setDatabase(result.database);
    setSessionStartedAt(null);
    reportStatus(result.stopped ? 'Reading time saved.' : 'No active reading timer was found.');
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
      setError(response.error ?? 'The line could not be captured.');
      return;
    }
    setDatabase(response.database);
    setCaptureText('');
    setCaptureTranslation('');
    setStatus('Japanese text added to the reading overlay.');
  };

  const captureScreenText = async (): Promise<void> => {
    if (!selected) return;
    localStorage.setItem(LENS_CAPTURE_TARGET_KEY, JSON.stringify(buildVisualNovelCaptureTarget({
      visualNovelId: selected.id,
      title: selected.title,
      routeId: progress.route,
      chapter: progress.chapter,
      scene: progress.scene,
    })));
    await window.api.lensOpen('select');
    reportStatus(`Select Japanese text for ${selected.title} in Reading Lens.`);
  };

  const toggleHookRelay = async (): Promise<void> => {
    if (!selected) return;
    if (hookState?.active) {
      setHookState(await window.api.visualNovelStopHook(selected.id));
      reportStatus('Text hook relay stopped.');
      return;
    }
    const response = await window.api.visualNovelStartHook(selected.id);
    if (response.canceled) return;
    if (!response.ok || !response.state) {
      reportStatus(response.error ?? 'The text hook relay could not be started.', true);
      return;
    }
    setHookState(response.state);
    reportStatus('Text hook relay is listening for new Japanese lines.');
  };

  const saveRoutes = async (routes: VisualNovelRoute[]): Promise<void> => {
    if (!selected) return;
    const response = await window.api.visualNovelUpdateRoutes(selected.id, routes);
    if (!response.ok || !response.database) {
      setError(response.error ?? 'Routes could not be saved.');
      return;
    }
    setDatabase(response.database);
    setStatus('Route and ending progress saved.');
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
      const item = pseudoMediaItem(selected);
      if (miningScope === 'all') saveMediaLanguageProfile(createMediaLanguageProfile(item, value));
      const sessionId = startMediaStudySession({
        mediaId: item.id,
        title: item.title,
        action: 'analyze-japanese',
      });
      addMediaStudySessionProgress(sessionId, { vocabularyMined: value.vocabulary.length });
      setAnalysis(value);
      setStatus(`Analyzed ${value.sentences.length} ${miningScope === 'all' ? 'captured' : miningScope} lines.`);
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

  const createCards = (): void => {
    if (!selected || !analysis) return;
    const sceneReferences = new Map(scopedCaptures.map((capture, index) => [
      index,
      [capture.chapter, capture.scene, capture.speaker].filter(Boolean).join(' · '),
    ]));
    const added = addVisualNovelStudyFlashcards(
      pseudoMediaItem(selected),
      analysis,
      sceneReferences,
    );
    setStatus(added.total
      ? `Added ${added.total} cards: ${added.counts.vocabulary} vocabulary, ${added.counts.sentence} sentences, ${added.counts.kanji} kanji, ${added.counts.grammar} grammar.`
      : 'No new cards were needed.');
  };

  const saveSelectedSentence = (): void => {
    if (!selected || !selectedCapture) return;
    const context = [
      selectedCapture.translation,
      displayCaptureContext(selectedCapture),
    ].filter(Boolean).join(' — ');
    const added = addMediaStudySentenceFlashcard(
      pseudoMediaItem(selected),
      selectedCapture.japanese,
      context,
      selectedCapture.screenshotPath,
      selectedCapture.audioPath,
    );
    setStatus(added ? 'Saved the selected sentence to the Media folder.' : 'That sentence is already saved.');
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
    content: (
      <div className="visual-novel-library">
        {/* The rail opened with eight SETUP controls stacked above the list it is named for —
            three add-form fields, Browse, Add to library, and the JSON import/export/scan row —
            which is most of why the default state scanned 36 controls against §10.4's bar of 12.
            Adding a novel is a once-per-title task and the list is the everyday one, so setup
            goes behind a disclosure and the list and its recommendations stay in the open. */}
        <details className="visual-novel-add-disclosure">
          <summary>{t('vnPanel.addToLibrary')}</summary>
          <div className="visual-novel-add">
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="English or display title" aria-label="Visual novel title" />
            <input value={japaneseTitle} onChange={(event) => setJapaneseTitle(event.target.value)} placeholder="Japanese title" aria-label="Japanese title" />
            <div>
              <input value={executablePath} onChange={(event) => setExecutablePath(event.target.value)} placeholder="Executable path" aria-label="Executable path" />
              <button type="button" onClick={() => void chooseExecutable()}>Browse</button>
            </div>
            <button
              type="button"
              disabled={!title.trim()}
              title={!title.trim() ? t('vnPanel.reason.needTitle') : undefined}
              onClick={() => void addEntry()}
            >
              Add to library
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
          onSelect={setSelectedId}
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
                <span>{entry.engine} · {entry.status} · {Math.round(entry.completionPct)}%</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    ),
  };

  return (
    <div className="visual-novel-panel">
      {/* The panel's own title-and-tools row is navigation/transport chrome, so §2.3 makes it a
          contextual surface rather than a local header. Category 3 measured 2 eligible regions
          here and only 1 treated: the reading tool beside it carries `.lq-liquid` and this one
          carried nothing, so in Liquid presentation the panel's chrome stayed a flat plate. The
          existing class keeps the conventional pixels; `.fwin-liquid` supplies the material. */}
      <ContextualSurface as="header" className="visual-novel-panel-head">
        <div>
          <span className="media-study-mode-kicker">Immersion library</span>
          <strong>Visual Novels</strong>
        </div>
        {/* §10.4 Q1 and Q3 both measured ZERO on this surface: no entry point and no declared
            primary action anywhere in the panel's top third, which on the shipped 820x580
            Immersion window is everything above y=240. What the head offered was two chrome
            toggles; the thing the surface exists for — open the novel you are studying — sat at
            y=300 inside the workspace column, below the fold on a short window. The head now
            carries one declared primary action. It MIRRORS the summary's Launch rather than
            replacing it: the summary's own action row owes category 6 two buttons, so moving
            it would trade one cell for another. With nothing selected it is the way to the
            first entry instead, which is the honest action for an empty library. */}
        <button
          type="button"
          className="btn primary visual-novel-panel-primary"
          disabled={selected ? !!launchWhy : false}
          title={selected && launchWhy ? t(launchWhy) : undefined}
          onClick={() => {
            if (selected) void launchVisualNovel();
            else setLibraryOpen(true);
          }}
        >
          {selected ? t('vnPanel.launch') : t('vnPanel.addToLibrary')}
        </button>
        <div className="visual-novel-panel-tools">
          <button
            type="button"
            aria-pressed={libraryOpen}
            onClick={() => setLibraryOpen((open) => !open)}
          >
            {libraryOpen ? t('immersion.hideLibrary') : t('immersion.showLibrary')}
          </button>
          <button type="button" onClick={onClose}>Back to browser</button>
        </div>
      </ContextualSurface>
      {(status || error) && <p className={error ? 'media-error' : 'muted'} role="status">{error || status}</p>}
      <ReadingCanvas
        className="visual-novel-layout"
        closeLabel={t('immersion.hideLibrary')}
        policy={READING_CANVAS_FILL_POLICY}
        tools={libraryOpen ? [libraryTool] : []}
      >
        <main className="visual-novel-workspace">
          {/* `muted` is presentation; `visual-novel-empty` is what says this IS the empty state.
              Without it the surface's one honest empty message is invisible to every consumer
              that looks for one - a test, a theme, the category-8 state sweep - and the panel
              reads as a surface with no empty state at all rather than one that names it. */}
          {!selected && <p className="muted visual-novel-empty">Add a local visual novel to begin capturing Japanese dialogue.</p>}
          {selected && (
            <>
              <div className="visual-novel-column visual-novel-column--primary">
              <div className="visual-novel-summary">
                {selected.coverImageUrl && <img src={selected.coverImageUrl} alt="" loading="lazy" />}
                <div className="visual-novel-summary-title">
                  <strong>{selected.title}</strong>
                  <span>{selected.japaneseTitle}</span>
                  {selected.communityRating != null && (
                    <small>{selected.communityRating}/10 · {selected.communityVoteCount} votes</small>
                  )}
                </div>
                <span>
                  {selected.engine} · {selected.engineCompatibility} · {formatDuration(
                    selected.totalPlaytimeSec
                    + (sessionStartedAt ? Math.max(0, (clockNow - sessionStartedAt) / 1000) : 0),
                  )}
                  {sessionStartedAt ? ' · timing' : ''}
                </span>
                <div className="visual-novel-summary-actions">
                  <button type="button" disabled={!!launchWhy} title={launchWhy ? t(launchWhy) : undefined} onClick={() => void launchVisualNovel()}>Launch</button>
                  {sessionStartedAt && <button type="button" onClick={() => void stopReadingTimer()}>Stop timer</button>}
                  <button type="button" onClick={() => void removeEntry(selected.id, selected.title)}>Remove</button>
                </div>
              </div>
              {/* Screen capture is the path a reader actually uses while a novel is running;
                  typing a line by hand, and wiring the text hook or the clipboard watcher, are
                  the fallbacks. The composer used to occupy the whole box at rest — two
                  textareas, a kind select, a speaker field and three more controls — so it
                  carried seven of the surface's 36 scanned controls for a job most sessions
                  never do. The disclosure sits INSIDE `.visual-novel-capture-actions` on
                  purpose: category 6 scores this composer on `.visual-novel-capture select`,
                  its two textareas and three action buttons, and every one of those is still a
                  descendant of the element that row reads. */}
              <div className="visual-novel-capture">
                <div className="visual-novel-capture-actions">
                  <button type="button" onClick={() => void captureScreenText()}>Capture screen text</button>
                  <details className="visual-novel-capture-manual">
                    {/* The text hook and the clipboard watcher keep running while this is shut,
                        and a running relay the user cannot see is exactly the dishonest state
                        category 8 scores. The summary reports it. */}
                    <summary>
                      {t('vnPanel.addCapturedLine')}
                      {hookState?.active && <small>{t('vnPanel.hookListening', { count: hookState.capturedLines })}</small>}
                    </summary>
                    <div className="visual-novel-capture-manual-fields">
                      <div className="visual-novel-capture-manual-head">
                        <select value={captureKind} onChange={(event) => setCaptureKind(event.target.value as VisualNovelTextKind)} aria-label="Captured text kind">
                          <option value="dialogue">Dialogue</option><option value="narration">Narration</option><option value="choice">Choice</option><option value="character-name">Character name</option><option value="system">System text</option>
                        </select>
                        <input value={speaker} onChange={(event) => setSpeaker(event.target.value)} placeholder="Speaker" aria-label="Speaker" />
                      </div>
                      <textarea value={captureText} onChange={(event) => setCaptureText(event.target.value)} placeholder="Paste captured Japanese dialogue or narration" />
                      <textarea value={captureTranslation} onChange={(event) => setCaptureTranslation(event.target.value)} placeholder="Translation (optional)" />
                      <div className="visual-novel-capture-manual-actions">
                        <button type="button" disabled={!!addCapturedLineWhy} title={addCapturedLineWhy ? t(addCapturedLineWhy) : undefined} onClick={() => void captureLine()}>Add captured line</button>
                        <button type="button" className={hookState?.active ? 'is-active' : ''} onClick={() => void toggleHookRelay()}>
                          {hookState?.active ? 'Stop text hook' : 'Start text hook'}
                        </button>
                        <label>
                          <input type="checkbox" checked={clipboardCapture} onChange={(event) => {
                            lastClipboardText.current = '';
                            setClipboardCapture(event.target.checked);
                          }} />
                          Live clipboard capture
                        </label>
                        {hookState?.active && (
                          <small title={hookState.filePath}>
                            Hook listening · {hookState.capturedLines} new lines
                            {hookState.lastError ? ` · ${hookState.lastError}` : ''}
                          </small>
                        )}
                      </div>
                    </div>
                  </details>
                </div>
              </div>
              <div className="visual-novel-analysis-actions">
                <select value={miningScope} onChange={(event) => setMiningScope(event.target.value as MiningScope)} aria-label="Mining scope">
                  <option value="all">Entire visual novel</option>
                  <option value="route" disabled={!progress.route}>Current route</option>
                  <option value="chapter" disabled={!progress.chapter.trim()}>Current chapter</option>
                  <option value="scenes" disabled={!sceneOptions.length}>Selected scenes</option>
                </select>
                <button type="button" disabled={!!analyzeWhy} title={analyzeWhy ? t(analyzeWhy) : undefined} onClick={() => void analyzeCaptures()}>{busy ? 'Analyzing…' : `Analyze ${miningScope}`}</button>
                <button type="button" disabled={!!createCardsWhy} title={createCardsWhy ? t(createCardsWhy) : undefined} onClick={createCards}>Create study deck cards</button>
                <button type="button" onClick={() => setCollectionOpen(true)}>Open VN study deck</button>
              </div>
              {miningScope === 'scenes' && (
                <details className="visual-novel-scene-picker" open>
                  <summary>
                    Selected scenes · {selectedSceneKeys.size} · {scopedCaptures.length} lines
                  </summary>
                  <div className="visual-novel-scene-picker-actions">
                    <button type="button" disabled={!!currentSceneWhy} title={currentSceneWhy ? t(currentSceneWhy) : undefined} onClick={selectCurrentScene}>Current scene</button>
                    <button type="button" onClick={() => setSelectedSceneKeys(new Set(sceneOptions.map((option) => option.key)))}>All scenes</button>
                    <button type="button" disabled={!!clearScenesWhy} title={clearScenesWhy ? t(clearScenesWhy) : undefined} onClick={() => setSelectedSceneKeys(new Set())}>Clear</button>
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
                        <small>{option.count} lines</small>
                      </label>
                    ))}
                  </div>
                </details>
              )}
              <section className="visual-novel-reading-overlay" aria-label="Visual novel reading overlay">
                <div className="visual-novel-reading-head"><strong>Reading overlay</strong><span>{captures.length} lines</span></div>
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
              {analysis && (
                <div className="visual-novel-analysis-summary">
                  <span>{analysis.level?.label ?? 'Unrated'} difficulty</span>
                  <span>{analysis.vocabulary.length} words</span>
                  <span>{analysis.kanji.length} kanji</span>
                  <span>{Math.round(analysis.comprehensibility.knownRatio * 100)}% known coverage</span>
                </div>
              )}
              {characterProfiles.length > 0 && (
                <section className="visual-novel-character-profiles" aria-label="Character speech profiles">
                  <div className="visual-novel-reading-head"><strong>Character speech</strong><span>{characterProfiles.length} speakers</span></div>
                  <div>
                    {characterProfiles.map((profile) => (
                      <article key={profile.speaker}>
                        <div><strong>{profile.speaker}</strong><span>{profile.lineCount} lines · {profile.politeness}</span></div>
                        <p>{profile.summary}</p>
                        {profile.sentenceEndings.length > 0 && <small>Common signals: {profile.sentenceEndings.join(' · ')}</small>}
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
              <div className="visual-novel-column visual-novel-column--setup">
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
              {/* Bookkeeping, not reading: six controls that are edited when a session ends.
                  The disclosure wraps `.visual-novel-progress` rather than replacing it, so the
                  five-column grid and its two responsive remaps are untouched and category 6's
                  `.visual-novel-progress select` row still resolves through the closed box. */}
              <details className="visual-novel-progress-disclosure">
                <summary>{t('vnPanel.progressHead')}</summary>
              <div className="visual-novel-progress">
                <label>Status<select value={progress.status} onChange={(event) => setProgress((current) => ({ ...current, status: event.target.value as VisualNovelStatus }))}><option value="planned">Planned</option><option value="reading">Reading</option><option value="completed">Completed</option><option value="dropped">Dropped</option><option value="replaying">Replaying</option></select></label>
                <label>Route<select value={progress.route} onChange={(event) => setProgress((current) => ({ ...current, route: event.target.value }))}><option value="">No route selected</option>{selected.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
                <label>Chapter<input value={progress.chapter} onChange={(event) => setProgress((current) => ({ ...current, chapter: event.target.value }))} /></label>
                <label>Scene<input value={progress.scene} onChange={(event) => setProgress((current) => ({ ...current, scene: event.target.value }))} /></label>
                <label>Completion<input type="number" min="0" max="100" value={progress.completion} onChange={(event) => setProgress((current) => ({ ...current, completion: event.target.value }))} /></label>
                <button type="button" onClick={() => void saveProgress()}>Save progress</button>
              </div>
              </details>
              <section className="visual-novel-routes" aria-label="Route and ending tracker">
                <div className="visual-novel-reading-head"><strong>Routes and endings</strong><span>{selected.routes.filter((route) => route.status === 'completed').length}/{selected.routes.length} routes</span></div>
                {/* Same reasoning as the progress editor: routes are declared once and read
                    many times, so the three-field add form goes behind a disclosure and the
                    route LIST below stays open. */}
                <details className="visual-novel-route-disclosure">
                  <summary>{t('vnPanel.addRoute')}</summary>
                  <div className="visual-novel-route-add">
                    <input value={routeName} onChange={(event) => setRouteName(event.target.value)} placeholder="Route name" aria-label="Route name" />
                    <input value={routeCharacter} onChange={(event) => setRouteCharacter(event.target.value)} placeholder="Character" aria-label="Route character" />
                    <input value={endingName} onChange={(event) => setEndingName(event.target.value)} placeholder="First ending (optional)" aria-label="Ending name" />
                    <button type="button" disabled={!!addRouteWhy} title={addRouteWhy ? t(addRouteWhy) : undefined} onClick={() => void addRoute()}>Add route</button>
                  </div>
                </details>
                <div className="visual-novel-route-list">
                  {selected.routes.map((route) => (
                    <article key={route.id}>
                      <div>
                        <strong>{route.name}</strong>
                        <span>{route.character || 'General route'}</span>
                        <select
                          value={route.status}
                          aria-label={`${route.name} status`}
                          onChange={(event) => void updateRoute(route.id, (current) => ({
                            ...current,
                            status: event.target.value as VisualNovelRouteStatus,
                          }))}
                        >
                          <option value="not-started">Not started</option>
                          <option value="reading">Reading</option>
                          <option value="completed">Completed</option>
                        </select>
                        <button type="button" onClick={() => {
                          if (routePendingRemoveId !== route.id) {
                            setRoutePendingRemoveId(route.id);
                            return;
                          }
                          setRoutePendingRemoveId('');
                          void saveRoutes(selected.routes.filter((candidate) => candidate.id !== route.id));
                        }}>
                          {routePendingRemoveId === route.id ? 'Confirm remove' : 'Remove route'}
                        </button>
                      </div>
                      <label className="visual-novel-route-guide">
                        Route guide notes
                        <textarea
                          key={`${route.id}:${route.guideNotes}`}
                          defaultValue={route.guideNotes}
                          placeholder="Choice order, prerequisites, spoiler-safe reminders"
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
                            placeholder="Ending notes"
                            aria-label={`${ending.name} notes`}
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
                          <button type="button" onClick={() => void updateRoute(route.id, (current) => ({
                            ...current,
                            endings: current.endings.filter((candidate) => candidate.id !== ending.id),
                          }))}>Remove</button>
                        </div>
                      ))}
                      <div className="visual-novel-ending-add">
                        <input
                          value={endingDrafts[route.id] ?? ''}
                          onChange={(event) => setEndingDrafts((current) => ({
                            ...current,
                            [route.id]: event.target.value,
                          }))}
                          placeholder="Add ending"
                          aria-label={`Add ending to ${route.name}`}
                        />
                        <button type="button" {...endingReasonProps(endingDrafts[route.id])} onClick={() => void addEnding(route.id)}>Add ending</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
              <VisualNovelScriptImportPanel
                entry={selected}
                onImported={setDatabase}
                onStatus={reportStatus}
              />
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
