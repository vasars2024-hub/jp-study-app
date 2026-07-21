/**
 * Renderer enrich pass for Library levels.
 * - Inbox articles: knownRatio / levelEstimate via textSample (Phase 9).
 * - File-imported EPUBs: same L1–L7 path via sampleBookText → levelMeta.
 */

import type { LibraryItem } from '../shared/types';
import { detectInboxLang, levelFromKnownRatio } from '../shared/inboxMeta';
import { scoreTextComprehensibility } from './comprehensibility';

export async function enrichInboxItem(item: LibraryItem): Promise<LibraryItem | null> {
  const meta = item.inboxMeta;
  if (!meta) return null;
  if (meta.levelEstimate != null) return null;
  const sample = (meta.textSample || item.title || '').trim();
  if (!sample) return null;

  try {
    const score = await scoreTextComprehensibility(sample);
    if (score.totalWords <= 0) return null;
    const knownRatio = score.knownRatio;
    const levelEstimate = levelFromKnownRatio(knownRatio);
    await window.api.updateInboxMeta(item.id, { knownRatio, levelEstimate });
    return {
      ...item,
      inboxMeta: { ...meta, knownRatio, levelEstimate },
    };
  } catch {
    return null;
  }
}

/** Known-ratio L-level for file EPUBs (no inboxMeta). */
export async function enrichFileBookLevel(item: LibraryItem): Promise<LibraryItem | null> {
  if (item.kind !== 'book') return null;
  if (item.inboxMeta) return null;
  // levelEstimate alone is enough — knownRatio can be 0 for very hard text.
  if (item.levelMeta?.levelEstimate != null) return null;
  if (item.epubFile?.toLowerCase().endsWith('.pdf')) return null;

  try {
    const sample = (await window.api.sampleBookText(item.id, 40_000))?.trim();
    if (!sample) return null;

    const lang = detectInboxLang(sample);
    const score = await scoreTextComprehensibility(sample);
    if (score.totalWords <= 0) return null;

    const knownRatio = score.knownRatio;
    const levelEstimate = levelFromKnownRatio(knownRatio);
    const levelMeta = { lang, knownRatio, levelEstimate };
    await window.api.updateLevelMeta(item.id, levelMeta, { broadcast: false });
    return { ...item, levelMeta };
  } catch {
    return null;
  }
}

export async function enrichInboxItems(items: LibraryItem[]): Promise<LibraryItem[]> {
  const out = [...items];
  for (let i = 0; i < out.length; i++) {
    const it = out[i];
    if (it.inboxMeta) {
      if (it.inboxMeta.levelEstimate != null) continue;
      const next = await enrichInboxItem(it);
      if (next) out[i] = next;
      continue;
    }
    if (it.kind === 'book') {
      if (it.levelMeta?.levelEstimate != null) continue;
      const next = await enrichFileBookLevel(it);
      if (next) out[i] = next;
    }
  }
  return out;
}
