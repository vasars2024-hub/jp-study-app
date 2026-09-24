/**
 * How much of the Media Center top bar fits: how many primary destinations stay in
 * the bar (the rest fold into More, from the end) and whether the search field has
 * to shrink to an icon.
 *
 * Measured rather than container-queried because the widths that matter are the
 * labels', and they change with the UI language: "More" ran into the search box in
 * Japanese at 1280px, in English at 100% zoom, and in any narrow window.
 */

/** The search field's narrowest useful width, and its width as an icon button. */
export const TOPNAV_SEARCH_MIN = 200;
export const TOPNAV_SEARCH_ICON = 38;
/** The gap between nav buttons (`.gum-nav { gap }`). */
const NAV_GAP = 4;

export interface TopNavFit {
  /** Primary destinations shown in the bar, counted from the start. */
  visible: number;
  searchCollapsed: boolean;
}

/** How many of `widths` fit in `room` beside a More trigger `moreWidth` wide. Pure. */
export function fitNavCount(widths: readonly number[], moreWidth: number, room: number, gap = NAV_GAP): number {
  let used = moreWidth;
  let count = 0;
  for (const width of widths) {
    if (used + gap + width > room) break;
    used += gap + width;
    count += 1;
  }
  return count;
}

/**
 * The fit, given the room left for the nav with the search open and with it folded.
 * Search keeps its field while at least the first two destinations (Home, Library)
 * still fit; only then does it fold to an icon to make room. Pure.
 */
export function chooseTopNavFit(
  widths: readonly number[],
  moreWidth: number,
  roomWithField: number,
  roomWithIcon: number,
): TopNavFit {
  const keep = Math.min(2, widths.length);
  const withField = fitNavCount(widths, moreWidth, roomWithField);
  if (withField >= keep) return { visible: withField, searchCollapsed: false };
  return { visible: Math.max(withField, fitNavCount(widths, moreWidth, roomWithIcon)), searchCollapsed: true };
}

/**
 * Reads the bar. `bar` is the top bar; its in-flow children marked
 * `data-topnav-fixed` (brand, history arrows, Import) keep their width. `probe`
 * holds the destinations (`data-measure-item`) and More (`data-measure-more`) at
 * their natural widths. An unmeasured bar (0 wide — before layout, or in a test
 * without one) shows everything.
 */
export function fitTopNav(bar: HTMLElement, probe: HTMLElement, total: number): TopNavFit {
  const style = getComputedStyle(bar);
  const inner = bar.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0);
  if (!(inner > 0)) return { visible: total, searchCollapsed: false };
  const gap = parseFloat(style.columnGap) || 0;
  let fixed = 0;
  let parts = 0;
  for (const child of Array.from(bar.children) as HTMLElement[]) {
    if (!child.hasAttribute('data-topnav-fixed')) continue;
    const width = child.offsetWidth;
    if (width > 0) {
      fixed += width;
      parts += 1;
    }
  }
  const widths = (Array.from(probe.querySelectorAll('[data-measure-item]')) as HTMLElement[]).map((el) => el.offsetWidth);
  const more = (probe.querySelector('[data-measure-more]') as HTMLElement | null)?.offsetWidth ?? 0;
  // In-flow items: the fixed ones, the nav, the spacer and the search.
  const gaps = (parts + 3 - 1) * gap;
  const base = inner - fixed - gaps;
  return chooseTopNavFit(widths, more, base - TOPNAV_SEARCH_MIN, base - TOPNAV_SEARCH_ICON);
}
