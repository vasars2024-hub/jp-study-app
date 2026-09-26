import { subtitleRecordLabel, type SubtitleRecord } from '../shared/subtitleRecord';
import { getMainLang, mt } from './i18n';

/**
 * A record's name for the player and the lists: its own label, an untitled
 * container stream as "Subtitle stream N" in the UI language (discovery used to
 * write "Stream N" in English into the record), else `fallback`.
 */
export function subtitleRecordName(
  record: Pick<SubtitleRecord, 'source' | 'label' | 'subtitleNumber' | 'streamIndex' | 'lang'>
    & Partial<Pick<SubtitleRecord, 'derivation' | 'translatedFromLabel' | 'translatedFromLang'>>,
  fallback = `${record.lang} (${record.source})`,
): string {
  return subtitleRecordLabel(record, mt, getMainLang()) ?? fallback;
}
