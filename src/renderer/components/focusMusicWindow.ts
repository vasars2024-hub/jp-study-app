/**
 * Which song rows the Focus music picker mounts. Rows have a fixed height, so
 * the visible slice follows from the scroll offset alone; a few rows either
 * side keep keyboard focus and fast scrolling from landing on blank space.
 */
export const SONG_ROW_HEIGHT = 44;
const OVERSCAN = 6;

export function songListWindow(
  count: number,
  scrollTop: number,
  viewHeight: number,
): { start: number; end: number } {
  if (count <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / SONG_ROW_HEIGHT);
  const visible = Math.ceil(Math.max(viewHeight, SONG_ROW_HEIGHT) / SONG_ROW_HEIGHT);
  const start = Math.max(0, Math.min(count - 1, first - OVERSCAN));
  const end = Math.min(count, first + visible + OVERSCAN);
  return { start, end: Math.max(end, start + 1) };
}
