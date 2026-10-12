/**
 * The Study command box's optional AI fallback: free text ("only keep words I
 * heard at least three times", "N3の単語を外して") mapped onto ONE of the
 * workspace's existing typed operations.
 *
 * It runs only when the deterministic parser (`parseStudyCommand`) understood
 * nothing, it never executes anything itself — the renderer shows the parsed
 * intent and the user confirms — and the reply is re-derived by
 * `normalizeStudyCommandIntent`, so a model can only ever produce an operation
 * the box could already run by hand. "none" is a valid reply: nothing matched.
 *
 * Pure: the renderer and main both read it.
 */
import { clipText, normalizeAiStudyRequestId, PLAIN_TEXT_RULE } from './aiStudyCommon';
import { normalizeStudyCommandIntent, type StudyCommandIntent } from './studyFilterRecipe';

export const STUDY_COMMAND_PROMPT_VERSION = 1;

export interface StudyCommandAiRequest {
  requestId?: string;
  refresh?: boolean;
  text: string;
}

export function normalizeStudyCommandAiRequest(input: unknown): StudyCommandAiRequest | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const text = clipText(raw.text, 300);
  if (!text) return null;
  const requestId = normalizeAiStudyRequestId(raw.requestId);
  return {
    ...(requestId ? { requestId } : {}),
    ...(raw.refresh === true ? { refresh: true } : {}),
    text,
  };
}

export function studyCommandKeyParts(request: StudyCommandAiRequest): string[] {
  return [request.text.toLocaleLowerCase()];
}

export function buildStudyCommandPrompt(request: StudyCommandAiRequest): string {
  return [
    'A language learner typed a command into the vocabulary workspace of a study app. The command may be in any language.',
    `Command: ${request.text}`,
    '',
    'Map it to exactly one operation, or "none" if it asks for anything else:',
    '- "filter": change the vocabulary filters. Fields (leave a field at its "unchanged" value when the command does not mention it):',
    '  "excludedJlptLevels": JLPT levels to remove, from N5 N4 N3 N2 N1 (empty list = unchanged);',
    '  "minimumOccurrences": keep only words heard at least this many times (0 = unchanged);',
    '  "maximumCards": keep at most this many cards (0 = unchanged);',
    '  "excludeKnown", "excludeInternalDuplicates", "excludeAnkiDuplicates", "excludeProperNouns": "on", "off" or "unchanged".',
    '- "undo-filter": undo the last filter change.',
    '- "preview-anki": preview the Anki export.',
    '- "preview-cards": preview the cards.',
    'Reply with JSON with every field present: "op" plus the filter fields.',
    PLAIN_TEXT_RULE,
  ].join('\n');
}

const TRI_STATE = ['on', 'off', 'unchanged'] as const;

export const STUDY_COMMAND_SCHEMA = {
  type: 'object',
  properties: {
    op: { type: 'string', enum: ['filter', 'undo-filter', 'preview-anki', 'preview-cards', 'none'] },
    excludedJlptLevels: { type: 'array', items: { type: 'string' } },
    minimumOccurrences: { type: 'integer' },
    maximumCards: { type: 'integer' },
    excludeKnown: { type: 'string', enum: [...TRI_STATE] },
    excludeInternalDuplicates: { type: 'string', enum: [...TRI_STATE] },
    excludeAnkiDuplicates: { type: 'string', enum: [...TRI_STATE] },
    excludeProperNouns: { type: 'string', enum: [...TRI_STATE] },
  },
  required: [
    'op',
    'excludedJlptLevels',
    'minimumOccurrences',
    'maximumCards',
    'excludeKnown',
    'excludeInternalDuplicates',
    'excludeAnkiDuplicates',
    'excludeProperNouns',
  ],
} as const;

export interface StudyCommandAiReply {
  op: string;
  excludedJlptLevels?: string[];
  minimumOccurrences?: number;
  maximumCards?: number;
  excludeKnown?: string;
  excludeInternalDuplicates?: string;
  excludeAnkiDuplicates?: string;
  excludeProperNouns?: string;
}

const flag = (value: string | undefined): boolean | undefined =>
  (value === 'on' ? true : value === 'off' ? false : undefined);

/** The model's reply as a typed intent, or `null` ("none", or nothing usable). */
export function finalizeStudyCommandReply(parsed: StudyCommandAiReply): StudyCommandIntent | null {
  if (parsed.op !== 'filter') return normalizeStudyCommandIntent({ op: parsed.op });
  return normalizeStudyCommandIntent({
    op: 'filter',
    args: {
      excludedJlptLevels: parsed.excludedJlptLevels ?? [],
      ...(parsed.minimumOccurrences ? { minimumOccurrences: parsed.minimumOccurrences } : {}),
      ...(parsed.maximumCards ? { maximumCards: parsed.maximumCards } : {}),
      excludeKnown: flag(parsed.excludeKnown),
      excludeInternalDuplicates: flag(parsed.excludeInternalDuplicates),
      excludeAnkiDuplicates: flag(parsed.excludeAnkiDuplicates),
      excludeProperNouns: flag(parsed.excludeProperNouns),
    },
  });
}

export function isStudyCommandIntent(value: unknown): value is StudyCommandIntent {
  const normalized = normalizeStudyCommandIntent(value);
  return normalized !== null && JSON.stringify(normalized) === JSON.stringify(value);
}
