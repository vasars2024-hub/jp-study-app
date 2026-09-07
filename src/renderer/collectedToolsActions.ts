import { confirmDialog } from './components/ui';
import type { CollectedTool } from '../shared/collectedTools';
import type { TVars } from '../shared/i18n/core';

type Translate = (key: string, vars?: TVars) => string;

/**
 * The one guarded entry point to `tools:remove`, for every host.
 *
 * `removeTool` (`main/collectedTools.ts`) filters the tool out of the store and
 * saves — the shortcut and whatever note the user wrote on it are gone, with no
 * undo. There are exactly two call sites and until now only one of them asked:
 * D17 put the confirm on `ResourcesContent.removeTool`, and Blanc's app drawer
 * kept calling the channel bare. Guarding the host that was being walked rather
 * than the action is how a mode gap gets created by a fix, which is the D137
 * lesson applied to its own author.
 *
 * Reuses the `resources.myTools.*` strings on purpose. The tool, the note and
 * the consequence are identical in both hosts, so a second set of keys would be
 * two things to keep in step and one more place for them to drift — the same
 * reasoning D137 used to reuse Study OS's `media.remove.*` keys inside Blanc.
 */
export async function confirmRemoveCollectedTool(
  t: Translate,
  tool: CollectedTool | undefined,
): Promise<boolean> {
  return confirmDialog({
    title: t('resources.myTools.removeConfirm.title'),
    message: t('resources.myTools.removeConfirm.message', { name: tool?.name ?? tool?.url ?? '' }),
    confirmLabel: t('resources.myTools.remove'),
    danger: true,
  });
}
