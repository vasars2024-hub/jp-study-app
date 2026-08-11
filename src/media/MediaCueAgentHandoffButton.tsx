/**
 * "Ask the Agent" for the subtitle line the player is on, with the frame it is on.
 *
 * The third producer that can carry a picture, after ReadingLens and the
 * visual-novel capture, and the first whose picture does not exist until the
 * gesture asks for it — the lens hands over a JPEG main has just made and a VN
 * capture's screenshot was saved when the line was captured, but a video frame is
 * only ever *now*. `cueFrameCapture.ts` makes it at click time, bounded.
 *
 * A separate component rather than a few more lines inside `VideoCoreMiningPanel`,
 * for the reason `VisualNovelAgentHandoffButton` records: that panel carries
 * another track's uncommitted work, so what this slice adds there has to stay small
 * enough to reconstruct against `HEAD` byte-for-byte. The whole gesture — the
 * `t()` calls, the capture, the busy state — lives behind one prop boundary.
 *
 * Two deliberate omissions, both about not claiming more than is true:
 *
 * - **No scene.** `mediaCueAgentContext`'s second argument is the turns around the
 *   line, and this panel is given one cue and nothing either side of it. An empty
 *   scene falls back to the line, which is what the producer already does and what
 *   its tests already pin. The *frame* is the context here, and filling the field
 *   from the draft's translation would put a translation where the prompt builder
 *   renders surrounding Japanese.
 * - **No `entityId`.** `VideoCoreMiningSource.mediaId` is an AniList id;
 *   `MediaStudyMode`, the other `media-cue` producer, discloses a media-library
 *   item id. Passing one namespace as the other would be false provenance. The
 *   producer still namespaces this anonymous cue, so it cannot replace a cue
 *   carrying the library id; it simply makes no stronger identity claim than the
 *   data this component has. The show is still named in the conversation title,
 *   exactly as `MediaStudyMode` titles it.
 */

import { useState } from 'react';
import { AGENT_NAVIGATION_SECTION_LABEL_KEYS } from '../shared/agentNavigation';
import {
  handOffToAgent,
  mediaCueAgentContext,
  routeAgentContext,
} from '../renderer/agentContextHandoff';
import { useT } from '../renderer/i18n';
import { captureAgentFrameDataUrl } from './cueFrameCapture';

export default function MediaCueAgentHandoffButton({
  line,
  mediaTitle,
  video,
}: {
  /** The cue as the player is showing it. */
  line: string;
  /** Titles the conversation; never the line, which `media-cue` keeps off disk. */
  mediaTitle: string;
  /** `null` while nothing is playing — then the line travels without a frame. */
  video: HTMLVideoElement | null;
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const text = line.trim();

  // Not a `useCallback`: it calls `t()`, and depending on `t` is the documented way
  // to go stale across a language switch (CLAUDE.md §6). A plain function reads the
  // current `t` on every click.
  const ask = async (): Promise<void> => {
    if (!text || busy) return;
    setBusy(true);
    try {
      const dataUrl = captureAgentFrameDataUrl(video);
      await handOffToAgent(
        mediaCueAgentContext(text, ''),
        t('agent.conversation.fromMedia', { label: mediaTitle || text.slice(0, 40) }),
        // `player` — the Media Center — rather than the producer's own `media`,
        // which names no window and would yield a suggestion that could only fail
        // its allowlist check. Same choice `MediaStudyMode` makes, for one reason.
        routeAgentContext('player', t(AGENT_NAVIGATION_SECTION_LABEL_KEYS.player)),
        dataUrl ? { dataUrl, name: t('agent.handoff.frame.name') } : undefined,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      data-study-action="ask-agent"
      disabled={busy || !text}
      onClick={() => void ask()}
    >
      {busy ? t('mediaWorkspace.mining.askingAgent') : t('mediaWorkspace.mining.askAgent')}
    </button>
  );
}
