/** Accept a dashboard source deep link only when the provider still exists. */
export function resolveSourceHandoff(
  requestedId: string | null,
  availableIds: string[],
): string | null {
  const normalized = requestedId?.trim() ?? '';
  if (!normalized) return null;
  return availableIds.includes(normalized) ? normalized : null;
}
