// Pure lemma-reading selection: given the dictionary readings for the exact
// lemma and the kuromoji reading of the bare lemma, pick the dictionary-form
// reading (never a conjugated-surface reading like 会う → アッ). Output is
// always hiragana; the export option converts to katakana at render time.

import { kanaEquals, kataToHira } from './langs';

export function pickLemmaReading(
  dictReadings: string[],
  kuroReading: string,
  surfaceReading: string,
): string {
  const dict = dictReadings.map((r) => r.trim()).filter(Boolean);
  if (dict.length) {
    if (kuroReading) {
      // Several dictionary readings (行く: いく/ゆく) — kuromoji disambiguates.
      const match = dict.find((r) => kanaEquals(r, kuroReading));
      if (match) return kataToHira(match);
    }
    return kataToHira(dict[0]);
  }
  if (kuroReading) return kataToHira(kuroReading);
  return kataToHira(surfaceReading);
}
