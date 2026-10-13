/**
 * The popup's longest match across the cursor, the way 10ten and Yomitan scan.
 *
 * The readers resolve a click to ONE kuromoji token, so a click on 携帯電話 looked
 * up 携帯 and a click on 食べたい looked up 食べ. The dictionary knows longer
 * words than the tokenizer cuts: the popup sends the text from the clicked word
 * on (at most 16 code points, 10ten's window) to `dict:scanLongest`, which looks
 * every prefix up in one batched read and answers with the longest that is a real
 * entry (exact, reading or de-inflected — never a prefix near miss). The popup
 * opens on that, and keeps the clicked word one click away.
 *
 * Pure helpers here; the IPC and the state live in `DictionaryPopup`.
 */

/** Code points of the window sent for scanning (the main process caps at 16 anyway). */
export const POPUP_SCAN_WINDOW = 24;

/** Where a CJK word cannot continue (same break set as `shared/dictScan`). */
const CJK_BREAK = /[\s\p{P}\p{S}]/u;
const CJK_CHAR = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆〇ヶ]/u;

/**
 * The text from the clicked word on, found in the sentence the host passed as
 * context; '' when the word is not in it (then there is nothing to scan).
 */
export function scanWindowFor(query: string, context: string | undefined): string {
  const q = (query ?? '').trim();
  const c = context ?? '';
  if (!q || !c) return '';
  const at = c.indexOf(q);
  if (at < 0) return '';
  return [...c.slice(at)].slice(0, POPUP_SCAN_WINDOW).join('');
}

/**
 * Whether a scan could find anything longer than `query`: the window must run
 * on past the word with more CJK text before any break. A word at the end of
 * its sentence, or followed by punctuation, needs no IPC round trip.
 */
export function canScanLonger(query: string, windowText: string): boolean {
  const q = [...(query ?? '').trim()];
  const w = [...(windowText ?? '')];
  if (!q.length || w.length <= q.length) return false;
  if (!CJK_CHAR.test(q[0])) return false;
  const next = w[q.length];
  return Boolean(next) && !CJK_BREAK.test(next) && CJK_CHAR.test(next);
}

/**
 * The scan's answer when it is a longer word that starts with the clicked one;
 * '' otherwise (a miss, the same word, or a shorter match — the click itself
 * already chose at least that much).
 */
export function acceptLongestMatch(query: string, matched: string): string {
  const q = (query ?? '').trim();
  const m = (matched ?? '').trim();
  if (!q || !m || m === q) return '';
  if (!m.startsWith(q)) return '';
  return [...m].length > [...q].length ? m : '';
}
