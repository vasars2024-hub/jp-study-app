// The browser extension's entry lists (`/v1/scan`, `/v1/lookup`) under the
// user's dictionary display settings, so the extension popup shows the same
// grouping as the app's own Dictionary and popup.
//
// Dictionary ORDER needs no second read here: the lookup already returns rows in
// the user's source order (`dictionaries.priority`, or the language pair's own
// order), so within one headword the first entry is the user's first dictionary.
// Re-reading the source list would open the database in the main process on the
// extension's hot hover path for nothing.

import { arrangeWireEntries, type WireEntry } from '../../shared/dictDisplay';
import { readDictDisplayPrefs } from './displayPrefs';

export function arrangeEntriesForExtension<E extends WireEntry>(
  entries: readonly E[],
  orderedTitles?: readonly string[],
): Array<E & { collapsed?: boolean }> {
  return arrangeWireEntries(entries, readDictDisplayPrefs(), orderedTitles);
}
