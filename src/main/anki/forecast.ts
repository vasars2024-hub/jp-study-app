// Due-card forecast (study-native track item 7).
//
// Read-only by construction: the only AnkiConnect action used is `findCards`,
// which searches. There is no write path here and none should be added — the
// panel this feeds is a read-only view.
//
// Why `prop:due=N` searches rather than reading card `due` fields: AnkiConnect's
// raw `due` value is days-since-collection-creation for review cards but a unix
// timestamp for learning cards, and converting either to a calendar day needs
// the collection's creation day, which AnkiConnect does not expose. Asking Anki
// `prop:due=3` instead makes Anki's own scheduler answer the question, which is
// both correct across card types and immune to our getting the arithmetic wrong.
//
// Cost: FORECAST_DAYS + 1 searches (8 today), each a cheap id-list query. Run on
// demand from the panel, not on a timer — a forecast nobody is looking at should
// not poll.

import {
  FORECAST_DAYS,
  emptyForecast,
  type DueForecast,
  type ForecastDay,
} from '../../shared/reviewForecast';
import { invoke } from './client';

/**
 * Suspended cards never come up for review, so counting them would inflate the
 * forecast with work the user has explicitly deferred. Buried cards are excluded
 * for the same reason, but only for today — Anki un-buries them tomorrow, so the
 * later days must not filter them out.
 */
const NOT_SUSPENDED = '-is:suspended';

function dayQuery(offset: number): string {
  const buried = offset === 0 ? ' -is:buried' : '';
  return `${NOT_SUSPENDED}${buried} prop:due=${offset}`;
}

/** Overdue: anything the scheduler already considers late. */
const OVERDUE_QUERY = `${NOT_SUSPENDED} prop:due<0`;

/**
 * Query Anki for the coming week's due counts.
 *
 * Never throws: a transport failure becomes `{ ok: false, error }` so the panel
 * can show the reason verbatim instead of an empty chart that looks like "no
 * reviews due".
 */
export async function getDueForecast(signal?: AbortSignal): Promise<DueForecast> {
  try {
    const overdueIds = (await invoke('findCards', { query: OVERDUE_QUERY }, { signal })) ?? [];
    const days: ForecastDay[] = [];
    for (let offset = 0; offset < FORECAST_DAYS; offset += 1) {
      // Sequential, matching intervals.ts: bulk AnkiConnect calls are kept
      // one-at-a-time so a forecast cannot saturate the add-on's single worker.
      const ids = (await invoke('findCards', { query: dayQuery(offset) }, { signal })) ?? [];
      days.push({ offsetDays: offset, due: ids.length });
    }
    return { ok: true, overdue: overdueIds.length, days, generatedAt: Date.now() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return emptyForecast(message || 'Anki query failed');
  }
}
