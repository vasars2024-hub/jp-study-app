// @vitest-environment jsdom
/**
 * Regression: `onModelProgress` was ONE global slot.
 *
 * `translator.ts` held a single `modelProgressCb`. Three surfaces register on it while the same
 * ~15 s Qwen3 load is in flight — `TranslateContent`, `SentenceTranslatePopup` and
 * `ReaderCollectionPanel` — and the app is a multi-window shell where two of them are routinely
 * open at once. Two failures followed, and both are rubric category 8 (honest states):
 *
 *  - whoever registered LAST silently took the percentage away from the others;
 *  - the FIRST one to finish called `onModelProgress(null)` and took it away from everyone,
 *    including a load still running, which then sat on a frozen "Loading model…" with no number.
 *
 * `DictionaryResults.tsx` had already routed around this by subscribing to the preload binding
 * directly, with a comment naming the hazard — so the defect was known in-tree and fixed in
 * exactly one of four places. The fix is a Set, the shape `partialListeners` in the same module
 * always had.
 *
 * Driven through the real module against a fake preload, so it asserts the mechanism rather than
 * the source text.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Progress = { status?: string; file?: string; progress?: number };

/** The single main→renderer emitter the preload binding wraps. */
let emit: (p: Progress) => void = () => {};

async function loadTranslator() {
  vi.resetModules();
  const listeners = new Set<(p: Progress) => void>();
  emit = (p) => {
    for (const cb of [...listeners]) cb(p);
  };
  (window as unknown as { api: unknown }).api = {
    onTranslateModelProgress: (cb: (p: Progress) => void) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    onTranslatePartial: () => () => {},
  };
  return import('../translator');
}

describe('onModelProgress fans out to every subscriber', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('delivers one event to two concurrent subscribers', async () => {
    const { onModelProgress } = await loadTranslator();
    const translateView: Progress[] = [];
    const popup: Progress[] = [];

    onModelProgress((p) => translateView.push(p));
    onModelProgress((p) => popup.push(p));
    emit({ status: 'progress', progress: 42 });

    // The defect: with one slot, `translateView` was empty and only `popup` saw it.
    expect(translateView).toEqual([{ status: 'progress', progress: 42 }]);
    expect(popup).toEqual([{ status: 'progress', progress: 42 }]);
  });

  it('one subscriber unsubscribing does not silence the other', async () => {
    const { onModelProgress } = await loadTranslator();
    const stillLoading: Progress[] = [];
    const finished: Progress[] = [];

    const offStillLoading = onModelProgress((p) => stillLoading.push(p));
    const offFinished = onModelProgress((p) => finished.push(p));

    offFinished(); // the popup's `.finally` — the call that used to be `onModelProgress(null)`
    emit({ status: 'progress', progress: 71 });

    expect(finished).toHaveLength(0);
    expect(stillLoading).toEqual([{ status: 'progress', progress: 71 }]);
    offStillLoading();
  });

  it('the unsubscribe is idempotent and does not drop a later identical listener', async () => {
    const { onModelProgress } = await loadTranslator();
    const seen: Progress[] = [];
    const cb = (p: Progress) => seen.push(p);

    const offFirst = onModelProgress(cb);
    offFirst();
    offFirst(); // a `.finally` and an unmount both firing is normal, not a bug
    onModelProgress(cb); // the same component re-subscribing for its next request
    offFirst(); // the stale disposer must not remove the NEW subscription
    emit({ status: 'progress', progress: 5 });

    expect(seen).toEqual([{ status: 'progress', progress: 5 }]);
  });

  /**
   * The hazard the defensive copy in `ensureIpcHooks` exists for, stated precisely because the
   * obvious version of this test does NOT catch it: a `Set` iterator tolerates deleting an
   * element it has already visited, so a listener unsubscribing ITSELF is safe either way. What
   * is not safe is a listener unsubscribing a LATER one, which is an ordinary React sequence
   * here — the Translate view's handler sets state that unmounts the sentence popup, and the
   * popup's cleanup runs its disposer before the broadcast reaches it.
   */
  it('a listener unsubscribing a later one mid-broadcast does not skip it', async () => {
    const { onModelProgress } = await loadTranslator();
    const later: Progress[] = [];
    let offLater: () => void = () => {};
    onModelProgress(() => offLater());
    offLater = onModelProgress((p) => later.push(p));

    emit({ status: 'ready' });

    // Iterating the live Set skips `later` entirely: it is deleted before the iterator reaches it.
    expect(later).toEqual([{ status: 'ready' }]);
  });

  it('subscribes to the preload binding exactly once, however many callers register', async () => {
    vi.resetModules();
    const hook = vi.fn(() => () => {});
    (window as unknown as { api: unknown }).api = {
      onTranslateModelProgress: hook,
      onTranslatePartial: () => () => {},
    };
    const { onModelProgress } = await import('../translator');

    onModelProgress(() => {});
    onModelProgress(() => {});
    onModelProgress(() => {});

    expect(hook).toHaveBeenCalledTimes(1);
  });
});
