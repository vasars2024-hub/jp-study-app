import type { MediaStudyAction, MediaStudyActionId } from '../../../shared/mediaStudyIntegration';

type Translate = (key: string) => string;

const LABEL_KEYS: Record<MediaStudyActionId, string> = {
  'study-episode': 'media.study.action.studyEpisode',
  'mine-vocabulary': 'media.study.action.mineVocabulary',
  'create-flashcards': 'media.study.action.createFlashcards',
  'review-sentences': 'media.study.action.reviewSentences',
  'analyze-japanese': 'media.study.action.analyzeJapanese',
};

const STATE_LABEL_KEYS: Record<string, string> = {
  'Waiting for transcription': 'media.study.action.waitingTranscription',
  'Analyze generated transcript': 'media.study.action.analyzeGenerated',
  'Transcribe & Analyze': 'media.study.action.transcribeAndAnalyze',
};

const REASON_KEYS: Record<string, string> = {
  'Load subtitles to review sentences.': 'media.study.reason.needsSubtitles',
  'A transcription is already running for this episode.': 'media.study.reason.transcriptionRunning',
  'No transcript yet — this runs Whisper first, then analyzes.': 'media.study.reason.willTranscribe',
  'The only Japanese text for this episode is machine-generated.': 'media.study.reason.generatedTranscript',
};

export function mediaStudyActionLabel(action: MediaStudyAction, t: Translate): string {
  return t(STATE_LABEL_KEYS[action.label] ?? LABEL_KEYS[action.id]);
}

export function mediaStudyActionReason(action: MediaStudyAction, t: Translate): string | undefined {
  if (!action.reason) return undefined;
  const key = REASON_KEYS[action.reason];
  return key ? t(key) : action.reason;
}
