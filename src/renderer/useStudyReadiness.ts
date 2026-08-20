/**
 * The Readiness surface's data, in one place, because two shells now show it.
 *
 * `MediaWorkspaceHost` owned this loader while the adopted overlay was the only place
 * Readiness existed. The Media Center's sidebar now carries the same destination, and a
 * second copy would be a second opinion about the three things below — which is the exact
 * shape `mediaWorkspaceAvailability.ts` and `MediaSurfaceShell.tsx` were both split out to
 * avoid.
 *
 * **The panel takes three props and the other two are not decoration.** `onAnalyse` alone
 * makes the button render and fire, but readiness lives in the orchestrator document, which
 * the panel takes as a prop and does not own: with no `orchestrator`, `joinSeanimeStudyLibrary`
 * finds no snapshot for any file, so every linked row is pinned at `unanalyzed` forever,
 * `ready` and `stale` are unreachable, and a successful analyse changes nothing the user can
 * see. `fingerprints` is what separates a current score from `stale`.
 *
 * `renderer/mediaStudyOrchestrator` is `await import()`ed rather than imported, and that is
 * load-bearing rather than tidy: it reaches the known-words store, the level lists and the
 * frequency dictionaries, so a static import would drag all of it into whatever chunk the
 * caller lives in — including `MediaWorkspaceHost`, whose standing promise is that a build
 * with the sidecar off starts up unchanged.
 */
import { useCallback, useEffect, useState } from 'react';
// Type-only, so both erase at build time.
import type { StudyOrchestratorDocument } from '../shared/mediaStudyOrchestrator';
import type { StudyReadinessFingerprints } from '../shared/seanimeStudyLibrary';
import type { SeanimeStudyAnalyseAction } from './components/reading/SeanimeStudyLibraryPanel';
import { useT } from './i18n';

export interface StudyReadinessData {
  /** `undefined` until read — the prop's own shape, so callers pass it straight through. */
  document: StudyOrchestratorDocument | undefined;
  fingerprints: StudyReadinessFingerprints | undefined;
  analyse: SeanimeStudyAnalyseAction;
}

/**
 * @param active Whether the Readiness surface is actually showing. The read is deferred
 *   until it is: a shell that merely *has* the destination must not pay for it.
 */
export function useStudyReadiness(active: boolean): StudyReadinessData {
  const { t, lang } = useT();
  // `doc`, not `document`: shadowing the global inside a renderer module is a trap for
  // whoever adds a DOM read here later.
  const [doc, setDoc] = useState<StudyOrchestratorDocument | null>(null);
  const [fingerprints, setFingerprints] = useState<StudyReadinessFingerprints | null>(null);

  /**
   * The `study:changed` subscription is what makes the analyse row transition at all. The
   * main-process `persist()` broadcasts the whole document on every write, so a successful
   * prepare pushes a fresher document here and the row re-derives its badge from real
   * readiness — the panel's own header says the badge can only change "once whoever supplies
   * the document supplies a fresher one", and this is that supplier.
   */
  useEffect(() => {
    if (!active) return;
    let dead = false;
    let release: (() => void) | undefined;
    void (async () => {
      try {
        const { currentStudyReadinessFingerprints, initializeStudyOrchestrator } =
          await import('./mediaStudyOrchestrator');
        const [next, prints] = await Promise.all([
          initializeStudyOrchestrator(),
          currentStudyReadinessFingerprints(),
        ]);
        if (dead) return;
        setDoc(next);
        setFingerprints(prints);
        release = window.api.onStudyChanged((fresh) => setDoc(fresh));
      } catch {
        // A readiness document that cannot be read is a panel with no scores, which is
        // exactly what it renders from `undefined`. It is not a reason to blank the surface.
      }
    })();
    return () => {
      dead = true;
      release?.();
    };
  }, [active]);

  /**
   * `unanalyzed` and `stale` are the only states that render the button, and
   * `joinSeanimeStudyLibrary` gives both a `studyMediaId` and a `subtitleRecordId` — the two
   * arguments `prepareStudyMediaById` takes. The guard below is therefore unreachable by
   * construction rather than defensive-in-case; it reuses the `unlinked` row's own wording
   * instead of inventing a string for a case that cannot arrive.
   */
  const analyse = useCallback<SeanimeStudyAnalyseAction>(async (entry) => {
    if (!entry.studyMediaId) throw new Error(t('studyLibrary.action.unlinked'));
    const { prepareStudyMediaById } = await import('./mediaStudyOrchestrator');
    const result = await prepareStudyMediaById(entry.studyMediaId, entry.subtitleRecordId);
    return result.status === 'queued-transcription'
      ? { status: 'queued-transcription', stage: result.stage }
      : {
        status: 'prepared',
        candidateCount: result.candidateCount,
        readinessCategory: result.readinessCategory,
      };
    // `lang`, never `t` — `t`'s identity is stable by design, so depending on it goes stale
    // after a language switch instead of erroring (CLAUDE.md i18n rule 6).
  }, [lang]);

  return { document: doc ?? undefined, fingerprints: fingerprints ?? undefined, analyse };
}
