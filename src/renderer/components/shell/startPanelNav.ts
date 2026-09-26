/**
 * Roving movement inside the Start panel (see `StartPanel.tsx`), as a pure function
 * so the key contract is testable without a panel: both arrow axes step through the
 * items in reading order and wrap, Home / End jump to the ends. `null` means the key
 * is not a movement key and must be left alone.
 */
export function startKeyTarget(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowDown':
    case 'ArrowRight':
      return index < 0 ? 0 : (index + 1) % count;
    case 'ArrowUp':
    case 'ArrowLeft':
      return index < 0 ? count - 1 : (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
