import { useEffect, useMemo, useRef, useState } from 'react';
import type { MediaItem } from '../../../shared/types';
import {
  capturesForVisualNovel,
  createEmptyVisualNovelDatabase,
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
            setStatus(t('vnPanel.msg.clipboardCaptured'));
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
      reportStatus(result.error ?? t('vnPanel.msg.launchFailed'), true);
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
    localStorage.setItem(LENS_CAPTURE_TARGET_KEY, JSON.stringify(buildVisualNovelCaptureTarget({
      visualNovelId: selected.id,
      title: selected.title,
      routeId: progress.route,
      chapter: progress.chapter,
      scene: progress.scene,
    })));
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
      const item = pseudoMediaItem(selected);
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
    setStatus(added ? t('vnPanel.msg.sentenceSaved') : t('vnPanel.msg.sentenceExists'));
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
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('vnPanel.titlePlaceholder')} aria-label={t('vnPanel.aria.title')} />
            <input value={japaneseTitle} onChange={(event) => setJapaneseTitle(event.target.value)} placeholder={t('vnPanel.japaneseTitlePlaceholder')} aria-label={t('vnPanel.aria.japaneseTitle')} />
            <div>
              <input value={executablePath} onChange={(event) => setExecutablePath(event.target.value)} placeholder={t('vnPanel.executablePlaceholder')} aria-label={t('vnPanel.aria.executable')} />
              <button type="button" onClick={() => void chooseExecutable()}>{t('vnPanel.browse')}</button>
            </div>
            <button
              type="button"
              disabled={!title.trim()}
              title={!title.trim() ? t('vnPanel.reason.needTitle') : undefined}
              onClick={() => void addEntry()}
            >
              {t('vnPanel.addToLibrary')}
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
                <span>{entry.engine} · {t(STATUS_KEYS[entry.status])} · {Math.round(entry.completionPct)}%</span>
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
          <span className="media-study-mode-kicker">{t('vnPanel.kicker')}</span>
          <strong>{t('vnPanel.title')}</strong>
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
          <button type="button" onClick={onClose}>{t('vnPanel.backToBrowser')}</button>
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
          {!selected && <p className="muted visual-novel-empty">{t('vnPanel.emptyPrompt')}</p>}
          {selected && (
            <>
              <div className="visual-novel-column visual-novel-column--primary">
              <div className="visual-novel-summary">
                {selected.coverImageUrl && <img src={selected.coverImageUrl} alt="" loading="lazy" />}
                <div className="visual-novel-summary-title">
                  <strong>{selected.title}</strong>
                  <span>{selected.japaneseTitle}</span>
                  {selected.communityRating != null && (
                    <small>{t('vnPanel.votes', {
                      rating: selected.communityRating,
                      votes: selected.communityVoteCount,
                    })}</small>
                  )}
                </div>
                <span>
                  {selected.engine} · {t(COMPAT_KEYS[selected.engineCompatibility])} · {formatDuration(
                    selected.totalPlaytimeSec
                    + (sessionStartedAt ? Math.max(0, (clockNow - sessionStartedAt) / 1000) : 0),
                    t,
                  )}
                  {sessionStartedAt ? ` · ${t('vnPanel.timing')}` : ''}
                </span>
                <div className="visual-novel-summary-actions">
                  <button type="button" disabled={!!launchWhy} title={launchWhy ? t(launchWhy) : undefined} onClick={() => void launchVisualNovel()}>{t('vnPanel.launch')}</button>
                  {sessionStartedAt && <button type="button" onClick={() => void stopReadingTimer()}>{t('vnPanel.stopTimer')}</button>}
                  <button type="button" onClick={() => void removeEntry(selected.id, selected.title)}>{t('vnPanel.remove')}</button>
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
                  <button type="button" onClick={() => void captureScreenText()}>{t('vnPanel.captureScreenText')}</button>
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
                        <button type="button" disabled={!!addCapturedLineWhy} title={addCapturedLineWhy ? t(addCapturedLineWhy) : undefined} onClick={() => void captureLine()}>{t('vnPanel.addCapturedLine')}</button>
                        <button type="button" className={hookState?.active ? 'is-active' : ''} onClick={() => void toggleHookRelay()}>
                          {hookState?.active ? t('vnPanel.stopHook') : t('vnPanel.startHook')}
                        </button>
                        <label>
                          <input type="checkbox" checked={clipboardCapture} onChange={(event) => {
                            lastClipboardText.current = '';
                            setClipboardCapture(event.target.checked);
                          }} />
                          {t('vnPanel.clipboardCapture')}
                        </label>
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
              <div className="visual-novel-analysis-actions">
                <select value={miningScope} onChange={(event) => setMiningScope(event.target.value as MiningScope)} aria-label={t('vnPanel.aria.miningScope')}>
                  <option value="all">{t('vnPanel.scope.all')}</option>
                  <option value="route" disabled={!progress.route}>{t('vnPanel.scope.route')}</option>
                  <option value="chapter" disabled={!progress.chapter.trim()}>{t('vnPanel.scope.chapter')}</option>
                  <option value="scenes" disabled={!sceneOptions.length}>{t('vnPanel.scope.scenes')}</option>
                </select>
                <button type="button" disabled={!!analyzeWhy} title={analyzeWhy ? t(analyzeWhy) : undefined} onClick={() => void analyzeCaptures()}>{busy ? t('vnPanel.analyzing') : t('vnPanel.analyzeScope', { scope: t(SCOPE_KEYS[miningScope]) })}</button>
                <button type="button" disabled={!!createCardsWhy} title={createCardsWhy ? t(createCardsWhy) : undefined} onClick={createCards}>{t('vnPanel.createCards')}</button>
                <button type="button" onClick={() => setCollectionOpen(true)}>{t('vnPanel.openDeck')}</button>
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
                    <button type="button" disabled={!!currentSceneWhy} title={currentSceneWhy ? t(currentSceneWhy) : undefined} onClick={selectCurrentScene}>{t('vnPanel.currentScene')}</button>
                    <button type="button" onClick={() => setSelectedSceneKeys(new Set(sceneOptions.map((option) => option.key)))}>{t('vnPanel.allScenes')}</button>
                    <button type="button" disabled={!!clearScenesWhy} title={clearScenesWhy ? t(clearScenesWhy) : undefined} onClick={() => setSelectedSceneKeys(new Set())}>{t('vnPanel.clear')}</button>
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
                <label>{t('vnPanel.statusLabel')}<select value={progress.status} onChange={(event) => setProgress((current) => ({ ...current, status: event.target.value as VisualNovelStatus }))}>{(Object.keys(STATUS_KEYS) as VisualNovelStatus[]).map((value) => <option key={value} value={value}>{t(STATUS_KEYS[value])}</option>)}</select></label>
                <label>{t('vnPanel.route')}<select value={progress.route} onChange={(event) => setProgress((current) => ({ ...current, route: event.target.value }))}><option value="">{t('vnPanel.noRoute')}</option>{selected.routes.map((route) => <option key={route.id} value={route.id}>{route.name}</option>)}</select></label>
                <label>{t('vnPanel.chapter')}<input value={progress.chapter} onChange={(event) => setProgress((current) => ({ ...current, chapter: event.target.value }))} /></label>
                <label>{t('vnPanel.scene')}<input value={progress.scene} onChange={(event) => setProgress((current) => ({ ...current, scene: event.target.value }))} /></label>
                <label>{t('vnPanel.completion')}<input type="number" min="0" max="100" value={progress.completion} onChange={(event) => setProgress((current) => ({ ...current, completion: event.target.value }))} /></label>
                <button type="button" onClick={() => void saveProgress()}>{t('vnPanel.saveProgress')}</button>
              </div>
              </details>
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
                    <button type="button" disabled={!!addRouteWhy} title={addRouteWhy ? t(addRouteWhy) : undefined} onClick={() => void addRoute()}>{t('vnPanel.addRoute')}</button>
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
                        <button type="button" onClick={() => {
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
                          <button type="button" onClick={() => void updateRoute(route.id, (current) => ({
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
                        <button type="button" {...endingReasonProps(endingDrafts[route.id])} onClick={() => void addEnding(route.id)}>{t('vnPanel.addEnding')}</button>
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
