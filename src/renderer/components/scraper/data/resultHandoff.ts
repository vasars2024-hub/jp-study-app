/**
 * Accept a dashboard/result deep link only when that entry still exists.
 *
 * Library entries are keyed per run (`librarySeriesId` → `jobId:seriesId`). A
 * request for a run whose result is no longer stored falls back to the newest
 * stored run of the same series, so a Dashboard card never lands on nothing
 * while that show is still in the library. `availableIds` is in library order,
 * newest first.
 */
export function resolveResultSeriesHandoff(
  requestedId: string | null,
  availableIds: string[],
): string | null {
  const normalized = requestedId?.trim() ?? '';
  if (!normalized) return null;
  if (availableIds.includes(normalized)) return normalized;
  const separator = normalized.indexOf(':');
  const seriesId = separator >= 0 ? normalized.slice(separator + 1) : normalized;
  if (!seriesId) return null;
  return availableIds.find((id) => id.endsWith(`:${seriesId}`)) ?? null;
}
