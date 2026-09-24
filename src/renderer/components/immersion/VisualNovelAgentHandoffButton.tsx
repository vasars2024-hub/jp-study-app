/**
 * "Ask the Agent" for one captured visual-novel line, with the scene it was
 * captured from.
 *
 * A separate component rather than three more lines inside
 * `VisualNovelSentenceAssist` for a reason that is about this repository rather
 * than about design: every file in `components/immersion/` currently carries
 * another track's uncommitted work, so the wiring this needs there has to stay
 * small enough to reconstruct against `HEAD` byte-for-byte. Keeping the whole
 * gesture — the `t()` calls, the image read, the busy state — behind one prop
 * boundary is what makes that possible.
 *
 * ReadingLens is the other producer of an Agent image attachment and this is
 * deliberately the same shape (`shared/agentImageStaging.ts` holds the capture
 * in main between the two windows; the persisted workspace may not carry it).
 * Two differences are worth naming:
 *
 * - **The picture is already on disk.** The lens hands over a JPEG main just
 *   made; a VN capture's screenshot was saved when the line was captured, and is
 *   read back through `visual-novel:readCaptureImage`. That handler refuses
 *   anything outside the managed capture directory and anything over 1 MiB, so
 *   what arrives here is always png or jpeg and always well inside the vision
 *   lane's own 4 MiB bound — no downscaling step is needed or wanted.
 * - **There is a place to go back to.** The lens deliberately attaches no route
 *   item because it draws over other applications; this gesture happens inside
 *   the Immersion window, which is a navigable section, so the Agent can offer
 *   to take the user back to it.
 */

import { useState } from 'react';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../../../shared/agentNavigation';
import type { VisualNovelTextCapture } from '../../../shared/visualNovel';
import {
  handOffToAgent,
  routeAgentContext,
  visualNovelCaptureAgentContext,
} from '../../agentContextHandoff';
import { useT } from '../../i18n';

/**
 * The capture's screenshot as a `data:` URL, preferring one the caller already
 * read.
 *
 * The parent loads the picture into its own state to show it, and that state is
 * empty for the first frames after a capture is selected. Handing off during
 * that window would send the question without the picture and say nothing about
 * it — the silent drop the vision lane refuses a provider for. So an empty prop
 * is not treated as "no screenshot": the path is what decides, and the read is
 * repeated here when the prop has not arrived yet.
 *
 * A failed read returns an empty string rather than throwing, and the caller
 * passes it on. `handOffToAgent` then reports `image-failed`, announces it and
 * still opens the Agent — which is the honest outcome, because the text really
 * did land.
 */
async function captureScreenshotDataUrl(
  screenshotPath: string,
  known: string,
): Promise<string> {
  if (known) return known;
  const result = await window.api.visualNovelReadCaptureImage(screenshotPath);
  return result.ok && result.dataUrl ? result.dataUrl : '';
}

export default function VisualNovelAgentHandoffButton({
  capture,
  screenshotDataUrl,
}: {
  capture: VisualNovelTextCapture;
  /** What the parent has already read, or `''` while that read is in flight. */
  screenshotDataUrl: string;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const line = capture.japanese.trim();

  // Not a `useCallback`: it calls `t()`, and depending on `t` is the documented
  // way to go stale across a language switch (CLAUDE.md §6). A plain function
  // reads the current `t` on every click.
  const ask = async (): Promise<void> => {
    if (!line || busy) return;
    setBusy(true);
    try {
      const image = capture.screenshotPath
        ? {
          dataUrl: await captureScreenshotDataUrl(capture.screenshotPath, screenshotDataUrl),
          name: t('agent.handoff.capture.name'),
        }
        : undefined;
      await handOffToAgent(
        visualNovelCaptureAgentContext(line, capture.scene, capture.visualNovelId),
        t('agent.conversation.fromVisualNovel', { label: line.slice(0, 40) }),
        routeAgentContext('immersion', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.immersion)),
        image,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button data-ai-entry type="button" disabled={busy || !line} onClick={() => void ask()}>
      {busy ? t('vnAssist.working') : t('vnAssist.askAgent')}
    </button>
  );
}
