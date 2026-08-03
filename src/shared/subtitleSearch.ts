export function normalizeSubtitleSearch(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
}

export function findSubtitleMatches(
  cues: readonly { text: string }[],
  queryValue: string,
  limit = 200,
): number[] {
  const query = normalizeSubtitleSearch(queryValue);
  if (!query) return [];
  const boundedLimit = Math.max(1, Math.min(500, Math.floor(limit)));
  const matches: number[] = [];
  for (let index = 0; index < cues.length && matches.length < boundedLimit; index += 1) {
    if (normalizeSubtitleSearch(cues[index].text).includes(query)) matches.push(index);
  }
  return matches;
}

export function wrapSubtitleMatch(
  currentPosition: number,
  matchCount: number,
  direction: -1 | 1,
): number {
  if (matchCount <= 0) return -1;
  const current = Number.isFinite(currentPosition) ? Math.floor(currentPosition) : -1;
  return (current + direction + matchCount) % matchCount;
}
