/**
 * Where blocks actually land.
 *
 * The overlay hands this a map of `blockId -> element`; the workspace decides which of
 * them are on screen, in which dock, at what size. That split is the whole reason a new
 * Study Block does not require touching the layout: add a definition, add a renderer,
 * done.
 *
 * ## `keepMounted`
 *
 * Hidden normally means unmounted — the transcript tokenizes several hundred rows, and
 * paying for that while it is invisible is exactly the performance rule (§27). Two
 * blocks are exceptions and both for a measurable reason:
 *
 *   · `cardEditor` holds the mining draft and listens for `video.mineCurrentLine`. That
 *     shortcut exports whatever is on screen through a ref inside the panel, so
 *     unmounting the panel would silently turn a bound shortcut into a no-op — the
 *     exact class of defect `deletedPlayerDependents.test.ts` exists to catch.
 *   · `subtitles` is the cue line itself.
 *
 * A kept-mounted block is rendered with `hidden`, which removes it from layout and from
 * the accessibility tree, so it costs a subtree that never paints rather than a panel.
 */
import React from 'react';
import type {
  BlockPlacement,
  ResolvedBlock,
  StudyBlockId,
} from '../shared/studyWorkspace';
import { useT } from '../renderer/i18n';
import { useStudyWorkspace } from './StudyWorkspaceProvider';
import { studyBlockDefinition } from './studyBlockRegistry';
import StudyBlockMenu from './StudyBlockMenu';

export type BlockRenderers = Partial<Record<StudyBlockId, React.ReactNode>>;

/** Blocks whose state must outlive their visibility. See the header. */
const KEEP_MOUNTED: readonly StudyBlockId[] = ['cardEditor'];

function StudyBlockFrame({
  block,
  children,
  hidden,
}: {
  block: ResolvedBlock;
  children: React.ReactNode;
  hidden: boolean;
}): React.ReactElement {
  const { t } = useT();
  const { customizing } = useStudyWorkspace();
  const definition = studyBlockDefinition(block.blockId);

  return (
    <div
      className="study-block"
      data-block={block.blockId}
      data-placement={block.effectivePlacement}
      data-size={block.size}
      data-presence={block.effectivePresence}
      data-pinned={block.pinned ? 'true' : 'false'}
      data-dominant={block.dominant ? 'true' : 'false'}
      data-availability={definition?.availability ?? 'implemented'}
      hidden={hidden || undefined}
      aria-hidden={hidden || undefined}
      // Named for the customizer's outlines and for screen readers, which otherwise
      // meet an unlabelled region when a block is dragged out of its dock.
      role={hidden ? undefined : 'region'}
      aria-label={definition ? t(definition.titleKey) : block.blockId}
    >
      {customizing && !hidden && <StudyBlockMenu block={block} />}
      <div className="study-block-body">{children}</div>
    </div>
  );
}

function Dock({
  side,
  blocks,
  renderers,
  hiddenIds,
}: {
  side: BlockPlacement;
  blocks: readonly ResolvedBlock[];
  renderers: BlockRenderers;
  hiddenIds: ReadonlySet<StudyBlockId>;
}): React.ReactElement | null {
  const rendered = blocks.filter((block) => renderers[block.blockId] !== undefined);
  if (!rendered.length) return null;
  // A dock holding only kept-mounted, hidden blocks must not reserve a column.
  const anyVisible = rendered.some((block) => !hiddenIds.has(block.blockId));
  return (
    <div
      className="study-dock"
      data-dock={side}
      data-empty={anyVisible ? 'false' : 'true'}
      hidden={anyVisible ? undefined : true}
    >
      {rendered.map((block) => (
        <StudyBlockFrame
          key={block.blockId}
          block={block}
          hidden={hiddenIds.has(block.blockId)}
        >
          {renderers[block.blockId]}
        </StudyBlockFrame>
      ))}
    </div>
  );
}

export default function StudyDocks({
  renderers,
}: {
  renderers: BlockRenderers;
}): React.ReactElement {
  const { layout } = useStudyWorkspace();

  const { groups, hiddenIds } = React.useMemo(() => {
    const byPlacement = new Map<BlockPlacement, ResolvedBlock[]>();
    const hidden = new Set<StudyBlockId>();
    for (const block of layout.blocks) {
      const isHidden = block.effectivePresence === 'hidden';
      if (isHidden && !KEEP_MOUNTED.includes(block.blockId)) continue;
      if (isHidden) hidden.add(block.blockId);
      const list = byPlacement.get(block.effectivePlacement) ?? [];
      list.push(block);
      byPlacement.set(block.effectivePlacement, list);
    }
    for (const list of byPlacement.values()) {
      list.sort((a, b) => a.order - b.order);
    }
    return { groups: byPlacement, hiddenIds: hidden };
  }, [layout]);

  const get = (placement: BlockPlacement): readonly ResolvedBlock[] =>
    groups.get(placement) ?? [];

  return (
    <>
      <Dock side="left" blocks={get('left')} renderers={renderers} hiddenIds={hiddenIds} />
      <Dock side="right" blocks={get('right')} renderers={renderers} hiddenIds={hiddenIds} />
      <Dock side="bottom" blocks={get('bottom')} renderers={renderers} hiddenIds={hiddenIds} />
      <Dock side="floating" blocks={get('floating')} renderers={renderers} hiddenIds={hiddenIds} />
      <Dock side="overlay" blocks={get('overlay')} renderers={renderers} hiddenIds={hiddenIds} />
      {/* `detached` renders nothing here on purpose: the block is in another window. */}
    </>
  );
}
