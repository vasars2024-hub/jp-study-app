/**
 * Drop anything, anywhere on the desktop, and it goes where it belongs.
 *
 * Replaces the two-bucket handler this shell used to carry, which understood
 * books and A/V and silently discarded everything else — including files the
 * app has a perfectly good importer for. Three things are new: a visible drop
 * affordance (there was none), a triage sheet for genuinely ambiguous files,
 * and an undo.
 *
 * Dispatch lives here rather than in main because every importer this calls is
 * an `ipcMain.handle` with no exported function behind it; see the note at the
 * top of `main/fileRouter.ts`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DropPlan } from '../../main/fileRouter';
import type { DropTargetId } from '../../shared/fileRouting';
import { extOf } from '../../shared/mediaKind';
import { useT } from '../i18n';
import { loadFileDropPrefs, onFileDropPrefsChanged, type FileDropPrefs } from '../fileDropPrefs';
import { showOsToast } from './ToastHost';
import Icon from './Icons';
import { importApkgCards } from '../apkgImport';
import { removeDeckCards } from '../flashcardDeck';

/** Everything needed to reverse one routed file. */
interface UndoEntry {
  targetId: DropTargetId;
  label: string;
  /** Library/media ids created by the import, for removal. */
  libraryIds: string[];
  mediaIds: string[];
  /** Wallpaper: the path that was in place before. */
  previousWallpaper?: string | null;
  /** Flashcards created by an .apkg card import, for exact removal on undo. */
  deckCardIds?: string[];
}

const TARGETS_IN_TRIAGE: DropTargetId[] = [
  'library-book',
  'library-manga',
  'media',
  'subtitle',
  'wallpaper',
  'anki-cards',
  'anki-level',
  'dictionary-yomitan',
  'frequency-dict',
  'shortcut',
];

export default function DropRouter({
  onOpenSection,
}: {
  /** Focus the app that just received the file. */
  onOpenSection?: (section: string) => void;
}) {
  const { t } = useT();
  const [prefs, setPrefs] = useState<FileDropPrefs>(loadFileDropPrefs);
  const [dragging, setDragging] = useState(false);
  const [triage, setTriage] = useState<DropPlan[] | null>(null);
  const [choices, setChoices] = useState<Record<string, DropTargetId>>({});
  const [busy, setBusy] = useState(false);
  // Nested dragenter/dragleave fire per element; count them so the affordance
  // does not flicker as the cursor crosses child nodes.
  const dragDepth = useRef(0);

  useEffect(() => onFileDropPrefsChanged(setPrefs), []);

  const execute = useCallback(
    async (plan: DropPlan, target: DropTargetId): Promise<UndoEntry | null> => {
      const label = t(`fileDrop.target.${target}`);
      switch (target) {
        case 'library-book':
        case 'library-manga': {
          const paths = plan.isDirectory
            ? await window.api.fileDropFolderFiles(plan.path)
            : [plan.path];
          if (!paths.length) return null;
          const items = await window.api.importPaths(paths);
          onOpenSection?.(target === 'library-manga' ? 'library' : 'library');
          return {
            targetId: target,
            label,
            libraryIds: (items ?? []).map((i) => i.id),
            mediaIds: [],
          };
        }
        case 'media': {
          const paths = plan.isDirectory
            ? await window.api.fileDropFolderFiles(plan.path)
            : [plan.path];
          if (!paths.length) return null;
          const items = await window.api.addMediaPaths(paths);
          onOpenSection?.('player');
          return {
            targetId: target,
            label,
            libraryIds: [],
            mediaIds: (items ?? []).map((i) => i.id),
          };
        }
        case 'wallpaper': {
          const previous = await window.api.getWallpaper().catch(() => null);
          await window.api.setWallpaperFromPath(plan.path);
          return { targetId: target, label, libraryIds: [], mediaIds: [], previousWallpaper: previous };
        }
        case 'anki-level': {
          await window.api.importApkg(plan.path);
          onOpenSection?.('anki');
          return { targetId: target, label, libraryIds: [], mediaIds: [] };
        }
        case 'anki-cards': {
          const res = await importApkgCards(plan.path);
          if (!res.ok) throw new Error(res.error ?? 'apkg-card-import-failed');
          onOpenSection?.('flashcards');
          // Undo removes exactly the rows this import created, by id — the deck
          // is shared with every other card source, so removing "the last N" or
          // the whole deck group would take the user's own cards with it.
          return {
            targetId: target,
            label,
            libraryIds: [],
            mediaIds: [],
            deckCardIds: (res.added ?? []).map((c) => c.id),
          };
        }
        case 'dictionary-yomitan': {
          const res = await window.api.dictImportYomitan(plan.path);
          if (!res?.ok) {
            showOsToast(t('fileDrop.toast.failed', { name: plan.name }), 'err');
            return null;
          }
          onOpenSection?.('dictionary');
          return { targetId: target, label, libraryIds: [], mediaIds: [] };
        }
        case 'frequency-dict': {
          const res = await window.api.miningImportFrequencyDict(plan.path);
          if (!res?.ok) {
            showOsToast(t('fileDrop.toast.failed', { name: plan.name }), 'err');
            return null;
          }
          return { targetId: target, label, libraryIds: [], mediaIds: [] };
        }
        case 'subtitle': {
          // The player owns subtitle attachment; hand it the path and let the
          // open media session pick it up.
          window.dispatchEvent(
            new CustomEvent('media:attach-subtitle', { detail: { path: plan.path } }),
          );
          onOpenSection?.('player');
          return { targetId: target, label, libraryIds: [], mediaIds: [] };
        }
        case 'shortcut': {
          window.dispatchEvent(
            new CustomEvent('desktop:add-shortcut', {
              detail: { target: plan.path, name: plan.name.replace(/\.[^.]+$/, '') },
            }),
          );
          return { targetId: target, label, libraryIds: [], mediaIds: [] };
        }
        case 'deck-csv':
        case 'vn-script':
        case 'backup':
        case 'folder':
        case 'unknown':
        default:
          // Named, not silently swallowed. These have no path-in importer yet;
          // saying so is the honest outcome and beats pretending it worked.
          showOsToast(t('fileDrop.toast.noDestination', { name: plan.name }), 'warn');
          return null;
      }
    },
    [onOpenSection, t],
  );

  const undo = useCallback(async (entries: UndoEntry[]) => {
    for (const entry of entries) {
      try {
        for (const id of entry.libraryIds) await window.api.removeItem(id);
        for (const id of entry.mediaIds) await window.api.removeMedia(id);
        if (entry.targetId === 'wallpaper' && entry.previousWallpaper) {
          await window.api.setWallpaperFromPath(entry.previousWallpaper);
        }
        if (entry.deckCardIds?.length) removeDeckCards(entry.deckCardIds);
      } catch {
        /* a partially-reversible plan still reverses what it can */
      }
    }
    showOsToast(t('fileDrop.toast.undone'), 'ok');
  }, [t]);

  const runPlans = useCallback(
    async (plans: DropPlan[], explicit?: Record<string, DropTargetId>) => {
      setBusy(true);
      const done: UndoEntry[] = [];
      try {
        for (const plan of plans) {
          const override = explicit?.[plan.path] ?? prefs.overrides[extOf(plan.name)];
          const target = override ?? plan.candidates[0]?.target ?? 'unknown';
          const entry = await execute(plan, target);
          if (entry) done.push(entry);
        }
      } finally {
        setBusy(false);
      }

      if (!done.length) return;
      const summary =
        done.length === 1
          ? t('fileDrop.toast.routedOne', { name: plans[0]?.name ?? '', target: done[0].label })
          : t('fileDrop.toast.routedMany', { count: String(done.length) });
      showOsToast(
        summary,
        'ok',
        prefs.undoDepth > 0
          ? { label: t('fileDrop.action.undo'), run: () => void undo(done) }
          : undefined,
      );
    },
    [execute, prefs.overrides, prefs.undoDepth, t, undo],
  );

  useEffect(() => {
    const hasFiles = (e: DragEvent): boolean => Boolean(e.dataTransfer?.types.includes('Files'));

    const onEnter = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onOver = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    };
    const onLeave = (e: DragEvent): void => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onDrop = (e: DragEvent): void => {
      const files = Array.from(e.dataTransfer?.files ?? []);
      dragDepth.current = 0;
      setDragging(false);
      if (!files.length) return;
      e.preventDefault();
      const paths = files
        .map((f) => {
          try {
            return window.api.getFilePath(f);
          } catch {
            return '';
          }
        })
        .filter(Boolean);
      if (!paths.length) return;

      void (async () => {
        const plans = await window.api.fileDropClassify(paths);
        if (!plans.length) return;
        const mustAsk =
          !prefs.autoRoute ||
          prefs.alwaysTriage ||
          plans.some((p) => {
            if (prefs.overrides[extOf(p.name)]) return false;
            const top = p.candidates[0];
            return !top || top.confidence === 'ambiguous' || top.target === 'unknown';
          });
        if (mustAsk) {
          setChoices(
            Object.fromEntries(
              plans.map((p) => [p.path, prefs.overrides[extOf(p.name)] ?? p.candidates[0]?.target ?? 'unknown']),
            ),
          );
          setTriage(plans);
          return;
        }
        await runPlans(plans);
      })();
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragover', onOver);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [prefs, runPlans]);

  return (
    <>
      {dragging && !triage && (
        <div className="dropr-affordance" aria-hidden>
          <div className="dropr-affordance-card">
            <Icon name="download" />
            <div className="dropr-affordance-title">{t('fileDrop.affordance.title')}</div>
            <div className="dropr-affordance-hint">{t('fileDrop.affordance.hint')}</div>
          </div>
        </div>
      )}

      {triage && (
        <div className="dropr-sheet-scrim" role="presentation">
          <div
            className="dropr-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={t('fileDrop.triage.title')}
          >
            <h2 className="dropr-sheet-title">{t('fileDrop.triage.title')}</h2>
            <p className="dropr-sheet-sub">{t('fileDrop.triage.subtitle')}</p>
            <div className="dropr-rows">
              {triage.map((plan) => (
                <div className="dropr-row" key={plan.path}>
                  <div className="dropr-row-name" title={plan.path}>
                    {plan.name}
                    {plan.folderSummary && (
                      <span className="dropr-row-meta">
                        {t('fileDrop.triage.folderMeta', {
                          images: String(plan.folderSummary.images),
                          media: String(plan.folderSummary.media),
                          books: String(plan.folderSummary.books),
                        })}
                      </span>
                    )}
                    {plan.candidates[0] && (
                      <span className="dropr-row-reason">{t(plan.candidates[0].reasonKey)}</span>
                    )}
                  </div>
                  <label className="dropr-row-pick">
                    <span className="sr-only">{t('fileDrop.triage.destinationFor', { name: plan.name })}</span>
                    <select
                      value={choices[plan.path] ?? 'unknown'}
                      onChange={(e) =>
                        setChoices((prev) => ({ ...prev, [plan.path]: e.target.value as DropTargetId }))
                      }
                    >
                      {/* Candidates the classifier proposed come first, then
                          every other destination, so the user is never boxed in
                          by a wrong guess. */}
                      {plan.candidates.map((c) => (
                        <option key={`c-${c.target}`} value={c.target}>
                          {t(`fileDrop.target.${c.target}`)}
                        </option>
                      ))}
                      {TARGETS_IN_TRIAGE.filter(
                        (id) => !plan.candidates.some((c) => c.target === id),
                      ).map((id) => (
                        <option key={`o-${id}`} value={id}>
                          {t(`fileDrop.target.${id}`)}
                        </option>
                      ))}
                      <option value="unknown">{t('fileDrop.target.skip')}</option>
                    </select>
                  </label>
                </div>
              ))}
            </div>
            <div className="dropr-sheet-actions">
              <button type="button" className="os-btn" onClick={() => setTriage(null)} disabled={busy}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="os-btn os-btn-primary"
                disabled={busy}
                onClick={() => {
                  const plans = triage;
                  const picked = choices;
                  setTriage(null);
                  void runPlans(plans, picked);
                }}
              >
                {t('fileDrop.triage.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
