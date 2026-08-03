/** Accept a dashboard/result deep link only when that series still exists. */
export function resolveResultSeriesHandoff(
  requestedId: string | null,
  availableIds: string[],
): string | null {
  const normalized = requestedId?.trim() ?? '';
  if (!normalized) return null;
  return availableIds.includes(normalized) ? normalized : null;
}
