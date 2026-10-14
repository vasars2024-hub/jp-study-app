/**
 * The conversation partner (docs/AI_AUDIT.md N20): chat in the study language
 * with a partner at the learner's level.
 *
 * - Pick a scene, polite or casual speech and a level; furigana (pinyin for
 *   Chinese) on or off.
 * - Each partner reply is tokenized with the app's own tokenizer and coloured by
 *   the learner's knowledge store; its unknown-word rate is MEASURED here and
 *   shown against the i+1 target, so the level is checked rather than promised.
 * - "Correct my messages" puts an inline correction under the learner's message:
 *   the corrected sentence as a diff and a short reason. The learner's own text
 *   is never replaced.
 * - Any word (click it) or sentence can be mined through `mineToStudy`.
 * - Optional: replies read aloud by the system voice (`tts.ts`), and voice input
 *   through the LOCAL Whisper model (never downloaded without the install button).
 * - The history stays on this computer, capped, per profile and study language.
 * - With AI off or unavailable, scripted drills keep the view useful.
 *
 * Round 2 (docs/SCORECARD.md bug 44 and the row's gaps):
 * - A reply that failed or was cancelled leaves the learner's message with a
 *   Retry (also after the window was closed while it ran); opening a conversation
 *   always asks for a fresh line, so Start after Clear is not the cached opening.
 * - Memory across sessions: the words the learner met and did not know (or mined)
 *   are remembered per profile and language; a new conversation shows a few of
 *   them and asks the partner to bring them back, and each reply says which it did.
 * - A correction is saved as a card with its reason and the learner's own text.
 * - "Send what I say": voice input goes straight out (a hands-free loop with
 *   "Read replies aloud"); off by default, so the transcript is reviewed first.
 *
 * Round 3 (W2-A):
 * - The partner's reply streams in as it is written (`aiStream.tsx`); Cancel keeps
 *   what had arrived, and the turn keeps its Retry.
 * - Voice input is push-to-talk or HANDS-FREE (`useHandsFree.ts`): the microphone
 *   listens, the pause after the learner speaks sends it, the reply is read
 *   aloud, and talking over it — or Esc — interrupts the partner.
 *
 * Shared by the Study OS view and Blanc's panel; lazy-loaded by both.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  CONVERSATION_LEVELS,
  CONVERSATION_MESSAGE_MAX,
  CONVERSATION_SCENARIOS,
  capConversationTurns,
  emptyConversation,
  nextDrillLine,
  recallConversationWords,
  recalledWordsUsed,
  rememberConversationWords,
  unansweredTurn,
  unknownWordRate,
  type ConversationReplyResult,
  type ConversationScenario,
  type StoredConversation,
  type StoredConversationTurn,
} from '../../../shared/aiConversation';
import type { StudyLang } from '../../../shared/studyLang';
import type { WhisperModelTier } from '../../../shared/whisperModels';
import { useAiReadiness } from '../../aiSetupClient';
import { loadConversation, loadConversationMemory, saveConversation, saveConversationMemory } from '../../conversationStore';
import { useT } from '../../i18n';
import { getLevel } from '../../knownWords';
import { loadLocalAgentSettings } from '../../localAgentSettingsStore';
import { startMicRecording, transcribeRecording, whisperReadiness, type MicRecording } from '../../speechCapture';
import { getStudyLang } from '../../studyEnvironment';
import { speak, ttsAvailable } from '../../tts';
import { writeLocalStorageJson } from '../../localStorageWrite';
import { AiStudyStatus, AiSuggestionBadge, useAiStudyRequest } from '../ai/aiStudyRequest';
import { AiStreamDraft } from '../ai/aiStream';
import { knownWordSample } from '../flashcards/aiExampleCheck';
import { StudyDiff, WhisperInstallPrompt } from './SpeakParts';
import { useHandsFree, type HandsFreePhase } from './useHandsFree';
import {
  chineseRuby,
  displayTokensFor,
  japaneseRuby,
  pinyinFor,
  prepareStudyText,
  type DisplayToken,
} from './speakText';
import './speak.css';

const PREFS_KEY = 'jp-study.conversation.prefs.v1';
const REPLY_PREVIEW = { keys: ['reply'] } as const;
const KNOWN_SAMPLE = 60;
const SOURCE_TITLE = 'Conversation partner';

interface ChatPrefs {
  furigana: boolean;
  correct: boolean;
  autoSpeak: boolean;
  scripted: boolean;
  /** Voice input is sent as soon as it is transcribed (push-to-talk). */
  voiceSend: boolean;
  /** Push-to-talk, or the hands-free loop (voice activity, read aloud, interrupt). */
  voiceMode: 'push' | 'handsFree';
}

const DEFAULT_PREFS: ChatPrefs = { furigana: true, correct: true, autoSpeak: false, scripted: false, voiceSend: false, voiceMode: 'push' };

/** What the hands-free status line says in each phase. */
const HANDS_FREE_PHASE_KEYS: Record<Exclude<HandsFreePhase, 'off'>, string> = {
  starting: 'aiSpeak.handsFree.starting',
  listening: 'aiSpeak.handsFree.listening',
  hearing: 'aiSpeak.handsFree.hearing',
  transcribing: 'aiSpeak.handsFree.transcribing',
  waiting: 'aiSpeak.handsFree.waiting',
  speaking: 'aiSpeak.handsFree.speaking',
};

function loadPrefs(): ChatPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null') as Partial<ChatPrefs> | null;
    if (!raw || typeof raw !== 'object') return DEFAULT_PREFS;
    return {
      furigana: raw.furigana !== false,
      correct: raw.correct !== false,
      autoSpeak: raw.autoSpeak === true,
      scripted: raw.scripted === true,
      voiceSend: raw.voiceSend === true,
      voiceMode: raw.voiceMode === 'handsFree' ? 'handsFree' : 'push',
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

type VoiceState =
  | { kind: 'idle' }
  | { kind: 'recording' }
  | { kind: 'transcribing' }
  | { kind: 'needs-model'; tier: WhisperModelTier; sizeBytes: number }
  | { kind: 'failed' };

export default function ConversationPartner({ compact = false }: { compact?: boolean }) {
  const { t, lang: uiLang } = useT();
  const ai = useAiReadiness();
  const [studyLang] = useState<StudyLang>(() => getStudyLang());
  const [conv, setConv] = useState<StoredConversation>(() => loadConversation(studyLang));
  const [prefs, setPrefs] = useState<ChatPrefs>(loadPrefs);
  const [input, setInput] = useState('');
  const [textReady, setTextReady] = useState(studyLang !== 'ja');
  const [pinyin, setPinyin] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<{ turn: number; token: number } | null>(null);
  const [notice, setNotice] = useState('');
  const [clearArmed, setClearArmed] = useState(false);
  const [drillDone, setDrillDone] = useState(false);
  const [voice, setVoice] = useState<VoiceState>({ kind: 'idle' });
  const [lastMeta, setLastMeta] = useState<{ knownSampleSent: boolean } | null>(null);
  // The draft is the partner's line only: the translation and the correction come with the whole reply.
  const request = useAiStudyRequest<ConversationReplyResult>(REPLY_PREVIEW);
  const recording = useRef<MicRecording | null>(null);
  const voiceAbort = useRef<AbortController | null>(null);
  const loaded = useRef(false);

  const aiUsable = ai.loaded && ai.enabled && !prefs.scripted;
  const scripted = !aiUsable;
  const rubyLang = studyLang === 'ja' || studyLang === 'zh';
  const busy = request.state.status === 'running';

  // The hands-free loop sends what it heard through `send` (defined below, reached by ref).
  const sendRef = useRef<(text: string) => Promise<string | null>>(async () => null);
  const handsFree = useHandsFree({
    studyLang,
    readAloud: ttsAvailable(),
    onTranscript: (text) => sendRef.current(text),
  });
  const handsFreeOn = handsFree.phase !== 'off';

  // The latest state for callbacks that outlive a render (the voice recorder's
  // auto-stop, a reply arriving after other edits).
  const latest = useRef({ conv, prefs, scripted, busy, handsFreeOn });
  latest.current = { conv, prefs, scripted, busy, handsFreeOn };

  useEffect(() => {
    let alive = true;
    void prepareStudyText(studyLang).then((ok) => {
      if (alive) setTextReady(ok);
    });
    return () => {
      alive = false;
    };
  }, [studyLang]);

  // Persist after the first render only: loading must not write.
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      return;
    }
    saveConversation(studyLang, conv);
  }, [conv, studyLang]);

  useEffect(() => {
    writeLocalStorageJson(PREFS_KEY, prefs);
  }, [prefs]);

  const partnerTexts = useMemo(() => conv.turns.filter((turn) => turn.role === 'partner').map((turn) => turn.text), [conv.turns]);

  useEffect(() => {
    if (studyLang !== 'zh' || !prefs.furigana || !partnerTexts.length) return;
    let alive = true;
    void pinyinFor(partnerTexts).then((map) => {
      if (alive) setPinyin(map);
    });
    return () => {
      alive = false;
    };
  }, [partnerTexts, prefs.furigana, studyLang]);

  useEffect(() => () => {
    recording.current?.cancel();
    voiceAbort.current?.abort();
  }, []);

  const tokensByTurn = useMemo(
    () => conv.turns.map((turn) => (turn.role === 'partner' && textReady ? displayTokensFor(turn.text, studyLang) : null)),
    [conv.turns, studyLang, textReady],
  );

  // Memory across sessions: the new words of every AI reply, read once each.
  useEffect(() => {
    if (!textReady) return;
    let memory = loadConversationMemory(studyLang);
    let through = memory.through;
    conv.turns.forEach((turn, index) => {
      const tokens = tokensByTurn[index];
      if (turn.role !== 'partner' || turn.scripted || !tokens || turn.at <= memory.through) return;
      memory = rememberConversationWords(memory, unknownWordRate(tokens, getLevel).unknownWords, turn.at);
      through = Math.max(through, turn.at);
    });
    if (through !== memory.through) saveConversationMemory(studyLang, { ...memory, through });
  }, [conv.turns, studyLang, textReady, tokensByTurn]);

  const session = useMemo(() => {
    let unknown = 0;
    let total = 0;
    conv.turns.forEach((turn, index) => {
      const tokens = tokensByTurn[index];
      if (!tokens || turn.scripted) return;
      const rate = unknownWordRate(tokens, getLevel);
      unknown += rate.unknown;
      total += rate.total;
    });
    return total ? Math.round((unknown / total) * 100) : null;
  }, [conv.turns, tokensByTurn]);

  const update = (next: StoredConversation): void => setConv({ ...next, turns: capConversationTurns(next.turns) });

  /** The next scripted line (also what hands-free reads aloud), or null when the drill is done. */
  const appendDrill = (base: StoredConversation): string | null => {
    const line = nextDrillLine(base.scenario, studyLang, base.turns);
    if (!line) {
      setDrillDone(true);
      update(base);
      return null;
    }
    update({ ...base, turns: [...base.turns, { role: 'partner', text: line, scripted: true, at: Date.now() }] });
    return line;
  };

  /**
   * Asks the partner to answer `message` (the learner's turn stamped `at`; ''
   * opens the conversation) after `history`. The reply is appended to whatever
   * the conversation holds when it arrives; a failure or Cancel leaves the
   * learner's turn unanswered, which is what Retry answers.
   */
  const ask = async (
    base: StoredConversation,
    history: readonly StoredConversationTurn[],
    message: string,
    at: number,
  ): Promise<string | null> => {
    const { prefs: currentPrefs } = latest.current;
    const result = await request.run((requestId) => window.api.aiSpeakConversation({
      requestId,
      studyLang,
      answerLang: uiLang,
      scenario: base.scenario,
      formality: base.formality,
      level: base.level,
      knownWords: knownWordSample('', KNOWN_SAMPLE),
      recallWords: base.recall ?? [],
      history: history.map(({ role, text: turnText }) => ({ role, text: turnText })),
      message,
      correct: currentPrefs.correct && Boolean(message),
      shareStudyData: loadLocalAgentSettings().agentCloudShareStudyData,
      // An opening is always asked afresh: the cached one is the same line every time.
      ...(message ? {} : { refresh: true }),
    }));
    if (!result) return null;
    setLastMeta({ knownSampleSent: result.knownSampleSent });
    setConv((current) => {
      const turns = current.turns.map((turn) => (
        turn.role === 'user' && turn.at === at && result.correction ? { ...turn, correction: result.correction } : turn
      ));
      turns.push({ role: 'partner', text: result.reply, translation: result.translation, at: Math.max(Date.now(), at + 1) });
      return { ...current, turns: capConversationTurns(turns) };
    });
    // Hands-free reads the reply itself, and listens for an interruption while it does.
    if (latest.current.prefs.autoSpeak && !latest.current.handsFreeOn) speak(result.reply, studyLang);
    return result.reply;
  };

  /** Sends the composer's text (or `override`); resolves with the partner's reply, or null. */
  const send = async (override?: string): Promise<string | null> => {
    const { conv: current, scripted: isScripted, busy: isBusy } = latest.current;
    if (isBusy) return null;
    const text = (override ?? input).trim().slice(0, CONVERSATION_MESSAGE_MAX);
    if (!text && current.turns.length) return null;
    setNotice('');
    setSelected(null);
    const prior = current.turns;
    const at = Date.now();
    // A new conversation fixes the words it brings back from earlier ones.
    const opening = prior.length === 0;
    const recall = opening ? recallConversationWords(loadConversationMemory(studyLang), getLevel, at) : current.recall ?? [];
    const started: StoredConversation = opening ? { ...current, ...(recall.length ? { recall } : { recall: undefined }) } : current;
    const base: StoredConversation = text ? { ...started, turns: [...prior, { role: 'user', text, at }] } : started;
    if (override === undefined) setInput('');
    if (isScripted) return appendDrill(base);
    update(base);
    latest.current = { ...latest.current, conv: base };
    return ask(base, prior, text, at);
  };
  sendRef.current = (text) => send(text);

  const retry = async (): Promise<void> => {
    const { conv: current, busy: isBusy } = latest.current;
    const pending = unansweredTurn(current.turns);
    if (!pending || isBusy) return;
    setNotice('');
    await ask(current, pending.history, pending.turn.text, pending.turn.at);
  };

  // The engine the last reply came from (for the known-word note).
  const lastEngine = request.state.status === 'done' ? request.state.engine : undefined;

  const mine = async (word: string, reading: string, sentence: string, meaning: string, kind: 'vocabulary' | 'sentence'): Promise<void> => {
    // `meaning` is the card's back: the translation, or a correction's reason and the learner's own text.
    try {
      const { mineToStudy } = await import('../../studyMining');
      await mineToStudy({
        word,
        ...(reading ? { reading } : {}),
        ...(meaning ? { meaning } : {}),
        sentence,
        source: 'analysis',
        sourceTitle: SOURCE_TITLE,
        studyLang,
        studyKind: kind,
      });
      setNotice(t('aiSpeak.chat.mined', { word: kind === 'sentence' ? sentence : word }));
      if (kind === 'vocabulary') {
        saveConversationMemory(studyLang, rememberConversationWords(loadConversationMemory(studyLang), [word], Date.now()));
      }
    } catch {
      setNotice(t('aiSpeak.chat.mineFailed'));
    }
    setSelected(null);
  };

  const startVoice = async (): Promise<void> => {
    setNotice('');
    const readiness = await whisperReadiness(studyLang).catch(() => null);
    if (!readiness) {
      setVoice({ kind: 'failed' });
      return;
    }
    if (!readiness.ready) {
      setVoice({ kind: 'needs-model', tier: readiness.tier, sizeBytes: readiness.sizeBytes });
      return;
    }
    try {
      recording.current = await startMicRecording(undefined, (blob) => void finishVoice(blob));
      setVoice({ kind: 'recording' });
    } catch {
      setVoice({ kind: 'failed' });
    }
  };

  const finishVoice = async (blob: Blob | null): Promise<void> => {
    recording.current = null;
    if (!blob) {
      setVoice({ kind: 'idle' });
      return;
    }
    const controller = new AbortController();
    voiceAbort.current = controller;
    setVoice({ kind: 'transcribing' });
    const transcript = await transcribeRecording(blob, studyLang, controller.signal);
    if (controller.signal.aborted) return;
    voiceAbort.current = null;
    if (transcript.ok) {
      setVoice({ kind: 'idle' });
      // The hands-free loop sends it at once; otherwise it goes into the box for the learner to read first.
      if (latest.current.prefs.voiceSend && latest.current.conv.turns.length > 0 && !latest.current.busy) {
        await send(transcript.text);
        return;
      }
      setInput((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}${transcript.text}`.slice(0, CONVERSATION_MESSAGE_MAX));
    } else {
      setVoice({ kind: 'failed' });
    }
  };

  const stopVoice = async (): Promise<void> => {
    const current = recording.current;
    if (!current) return;
    await finishVoice(await current.stop());
  };

  const cancelVoice = (): void => {
    recording.current?.cancel();
    recording.current = null;
    voiceAbort.current?.abort();
    voiceAbort.current = null;
    setVoice({ kind: 'idle' });
  };

  const setVoiceMode = (voiceMode: ChatPrefs['voiceMode']): void => {
    // Leaving hands-free closes the microphone; leaving push-to-talk drops a take in progress.
    if (voiceMode === 'push') handsFree.stop();
    else cancelVoice();
    setPrefs({ ...prefs, voiceMode });
  };

  const setScenario = (scenario: ConversationScenario): void => {
    setDrillDone(false);
    update({ ...conv, scenario });
  };

  const clear = (): void => {
    if (!clearArmed) {
      setClearArmed(true);
      return;
    }
    request.reset();
    setClearArmed(false);
    setDrillDone(false);
    setSelected(null);
    update({ ...emptyConversation(studyLang), scenario: conv.scenario, formality: conv.formality, level: conv.level });
  };

  const pending = !busy ? unansweredTurn(conv.turns) : null;
  const recall = conv.recall ?? [];

  return (
    <section className={`speak-panel speak-chat${compact ? ' is-compact' : ''}`} aria-label={t('aiSpeak.chat.title')} data-conversation-partner="">
      <div className="speak-chat-head">
        <h2 className="speak-title">{t('aiSpeak.chat.title')}</h2>
        <p className="speak-note">{t('aiSpeak.chat.intro')}</p>
        <div className="speak-controls">
          <label className="speak-field">
            <span>{t('aiSpeak.chat.scene')}</span>
            <select value={conv.scenario} onChange={(event) => setScenario(event.currentTarget.value as ConversationScenario)}>
              {CONVERSATION_SCENARIOS.map((id) => (
                <option key={id} value={id}>{t(`aiSpeak.scenario.${id}`)}</option>
              ))}
            </select>
          </label>
          <label className="speak-field">
            <span>{t('aiSpeak.chat.formality')}</span>
            <select value={conv.formality} onChange={(event) => update({ ...conv, formality: event.currentTarget.value === 'casual' ? 'casual' : 'polite' })}>
              <option value="polite">{t('aiSpeak.chat.formality.polite')}</option>
              <option value="casual">{t('aiSpeak.chat.formality.casual')}</option>
            </select>
          </label>
          <label className="speak-field">
            <span>{t('aiSpeak.chat.level')}</span>
            <select value={conv.level} onChange={(event) => update({ ...conv, level: event.currentTarget.value })}>
              {CONVERSATION_LEVELS[studyLang].map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </label>
        </div>
        <div className="speak-controls">
          {rubyLang && (
            <label className="speak-check">
              <input type="checkbox" checked={prefs.furigana} onChange={(event) => setPrefs({ ...prefs, furigana: event.currentTarget.checked })} />
              <span>{t(studyLang === 'zh' ? 'aiSpeak.chat.pinyin' : 'aiSpeak.chat.furigana')}</span>
            </label>
          )}
          <label className="speak-check" data-ai-entry>
            <input type="checkbox" checked={prefs.correct} onChange={(event) => setPrefs({ ...prefs, correct: event.currentTarget.checked })} />
            <span>{t('aiSpeak.chat.correct')}</span>
          </label>
          {ttsAvailable() && (
            <label className="speak-check">
              <input type="checkbox" checked={prefs.autoSpeak} onChange={(event) => setPrefs({ ...prefs, autoSpeak: event.currentTarget.checked })} />
              <span>{t('aiSpeak.chat.autoSpeak')}</span>
            </label>
          )}
          <label className="speak-check" data-ai-entry>
            <input type="checkbox" checked={prefs.scripted} onChange={(event) => setPrefs({ ...prefs, scripted: event.currentTarget.checked })} />
            <span>{t('aiSpeak.chat.scriptedToggle')}</span>
          </label>
          <label className="speak-field">
            <span>{t('aiSpeak.voiceMode.label')}</span>
            <select
              value={prefs.voiceMode}
              data-speak-voice-mode=""
              onChange={(event) => setVoiceMode(event.currentTarget.value === 'handsFree' ? 'handsFree' : 'push')}
            >
              <option value="push">{t('aiSpeak.voiceMode.push')}</option>
              <option value="handsFree">{t('aiSpeak.voiceMode.handsFree')}</option>
            </select>
          </label>
          {prefs.voiceMode === 'push' && (
            <label className="speak-check">
              <input type="checkbox" checked={prefs.voiceSend} onChange={(event) => setPrefs({ ...prefs, voiceSend: event.currentTarget.checked })} />
              <span>{t('aiSpeak.chat.voiceSend')}</span>
            </label>
          )}
        </div>
        <p className="speak-note" role="status">
          {scripted ? t('aiSpeak.chat.scriptedMode') : t('aiSpeak.chat.aiMode')}
          {session !== null && <> {t('aiSpeak.chat.sessionRate', { percent: session })}</>}
        </p>
        {!scripted && lastMeta && !lastMeta.knownSampleSent && lastEngine === 'cloud' && (
          <p className="speak-note" data-ai-entry>{t('aiSpeak.chat.knownWithheld')}</p>
        )}
        {recall.length > 0 && (
          <p className="speak-note speak-recall" data-conversation-recall="">
            {t(scripted ? 'aiSpeak.chat.recallScripted' : 'aiSpeak.chat.recall')}{' '}
            <span lang={studyLang} className="speak-journal-words">{recall.join(studyLang === 'ru' ? ', ' : '、')}</span>
          </p>
        )}
      </div>

      <ol className="speak-log" role="log" aria-live="polite" aria-label={t('aiSpeak.chat.log')}>
        {conv.turns.map((turn, index) => (
          <li key={`${turn.at}-${index}`} className={`speak-turn is-${turn.role}`}>
            <span className="speak-who">{t(turn.role === 'user' ? 'aiSpeak.chat.you' : 'aiSpeak.chat.partner')}</span>
            {turn.role === 'partner' ? (
              <PartnerTurn
                turn={turn}
                tokens={tokensByTurn[index]}
                lang={studyLang}
                furigana={prefs.furigana && rubyLang}
                pinyin={pinyin}
                recall={recall}
                selectedToken={selected?.turn === index ? selected.token : null}
                onSelect={(token) => setSelected(selected?.turn === index && selected.token === token ? null : { turn: index, token })}
                onMineWord={(token) => void mine(token.lemma || token.surface, studyLang === 'ja' ? token.reading : '', turn.text, '', 'vocabulary')}
                onMineSentence={() => void mine(turn.text, '', turn.text, turn.translation ?? '', 'sentence')}
              />
            ) : (
              <UserTurn
                turn={turn}
                lang={studyLang}
                onMineCorrected={(correction) => void mine(
                  correction.corrected,
                  '',
                  correction.corrected,
                  t('aiSpeak.chat.correctionCardBack', { reason: correction.explanation, original: turn.text }),
                  'sentence',
                )}
              />
            )}
          </li>
        ))}
        {/* The partner's line as it is being written; it becomes a turn when the whole reply has arrived. */}
        {!scripted && request.state.status === 'running' && request.state.draft && (
          <li className="speak-turn is-partner is-drafting" data-conversation-draft="">
            <span className="speak-who">{t('aiSpeak.chat.partner')}</span>
            <div className="speak-bubble">
              <AiStreamDraft text={request.state.draft} state="drafting" lang={studyLang} />
            </div>
          </li>
        )}
      </ol>

      {notice && <p className="speak-note" role="status">{notice}</p>}
      {drillDone && <p className="speak-note" role="status">{t('aiSpeak.chat.drillDone')}</p>}
      {!scripted && (
        <AiStudyStatus
          state={request.state.status === 'running' ? { status: 'running' } : request.state}
          onCancel={request.cancel}
          busyKey="aiSpeak.chat.thinking"
          lang={studyLang}
        />
      )}
      {!scripted && pending && (
        <div className="speak-actions" data-conversation-retry="">
          <p className="speak-note" role="status">{t('aiSpeak.chat.unanswered')}</p>
          <button type="button" className="btn small primary speak-btn" onClick={() => void retry()}>
            {t('aiSpeak.chat.retry')}
          </button>
        </div>
      )}
      {!scripted && request.state.status === 'failed' && request.state.code !== 'cancelled' && (
        <div className="speak-actions">
          <button type="button" className="btn small speak-btn" onClick={() => appendDrill(conv)}>
            {t('aiSpeak.chat.useScripted')}
          </button>
        </div>
      )}

      {conv.turns.length === 0 ? (
        <div className="speak-actions">
          <button type="button" className="btn primary speak-btn" disabled={busy} onClick={() => void send()}>
            {t('aiSpeak.chat.start')}
          </button>
        </div>
      ) : (
        <form
          className="speak-composer"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <label className="speak-sr" htmlFor="speak-chat-input">{t('aiSpeak.chat.inputLabel')}</label>
          <textarea
            id="speak-chat-input"
            rows={compact ? 2 : 3}
            lang={studyLang}
            value={input}
            maxLength={CONVERSATION_MESSAGE_MAX}
            placeholder={t('aiSpeak.chat.placeholder')}
            onChange={(event) => setInput(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                void send();
              }
            }}
          />
          <div className="speak-actions">
            <button type="submit" className="btn primary speak-btn" disabled={busy || !input.trim()}>
              {t('aiSpeak.chat.send')}
            </button>
            {prefs.voiceMode === 'handsFree' ? (
              <button
                type="button"
                className={`btn speak-btn${handsFreeOn ? ' is-active' : ''}`}
                aria-pressed={handsFreeOn}
                disabled={handsFree.phase === 'starting'}
                onClick={() => (handsFreeOn ? handsFree.stop() : void handsFree.start())}
              >
                {t(handsFreeOn ? 'aiSpeak.handsFree.stop' : 'aiSpeak.handsFree.start')}
              </button>
            ) : voice.kind === 'recording' ? (
              <button type="button" className="btn speak-btn" onClick={() => void stopVoice()}>{t('aiSpeak.voice.stop')}</button>
            ) : (
              <button type="button" className="btn speak-btn" disabled={voice.kind === 'transcribing'} onClick={() => void startVoice()}>
                {t('aiSpeak.voice.start')}
              </button>
            )}
            <button type="button" className="btn speak-btn" onClick={clear}>
              {t(clearArmed ? 'aiSpeak.chat.clearConfirm' : 'aiSpeak.chat.clear')}
            </button>
          </div>
        </form>
      )}

      {voice.kind === 'recording' && <p className="speak-note" role="status">{t('aiSpeak.voice.recording')}</p>}
      {voice.kind === 'transcribing' && (
        <div className="speak-busy" role="status">
          <span className="ai-study-spinner" aria-hidden="true" />
          <span>{t('aiSpeak.voice.transcribing')}</span>
          <button type="button" className="btn small speak-btn" onClick={cancelVoice}>{t('aiStudy.cancel')}</button>
        </div>
      )}
      {voice.kind === 'failed' && <p className="speak-error" role="alert">{t('aiSpeak.voice.failed')}</p>}
      {voice.kind === 'needs-model' && (
        <WhisperInstallPrompt tier={voice.tier} sizeBytes={voice.sizeBytes} onInstalled={() => setVoice({ kind: 'idle' })} />
      )}
      {handsFreeOn && handsFree.phase !== 'off' && (
        <div className={`speak-handsfree is-${handsFree.phase}`} data-speak-handsfree={handsFree.phase}>
          <span
            className="speak-vad-level"
            aria-hidden="true"
            style={{ '--speak-level': handsFree.level.toFixed(2) } as CSSProperties}
          />
          <span className="speak-note" role="status">{t(HANDS_FREE_PHASE_KEYS[handsFree.phase])}</span>
          {handsFree.phase === 'speaking' && (
            <button type="button" className="btn small speak-btn" onClick={handsFree.interrupt}>
              {t('aiSpeak.handsFree.interrupt')}
            </button>
          )}
        </div>
      )}
      {handsFree.problem?.kind === 'mic' && <p className="speak-error" role="alert">{t('aiSpeak.voice.failed')}</p>}
      {handsFree.problem?.kind === 'unheard' && handsFreeOn && (
        <p className="speak-note" role="status">{t('aiSpeak.handsFree.unheard')}</p>
      )}
      {handsFree.problem?.kind === 'needs-model' && (
        <WhisperInstallPrompt tier={handsFree.problem.tier} sizeBytes={handsFree.problem.sizeBytes} onInstalled={handsFree.clearProblem} />
      )}
    </section>
  );
}

function RubyText({ runs }: { runs: { base: string; rt: string }[] }) {
  return (
    <>
      {runs.map((run, index) => (run.rt ? (
        <ruby key={index}>{run.base}<rt>{run.rt}</rt></ruby>
      ) : <span key={index}>{run.base}</span>))}
    </>
  );
}

function PartnerTurn({
  turn,
  tokens,
  lang,
  furigana,
  pinyin,
  recall,
  selectedToken,
  onSelect,
  onMineWord,
  onMineSentence,
}: {
  turn: StoredConversationTurn;
  tokens: DisplayToken[] | null;
  lang: StudyLang;
  furigana: boolean;
  pinyin: Record<string, string[]>;
  recall: readonly string[];
  selectedToken: number | null;
  onSelect: (token: number) => void;
  onMineWord: (token: DisplayToken) => void;
  onMineSentence: () => void;
}) {
  const { t } = useT();
  const [showTranslation, setShowTranslation] = useState(false);
  const rate = tokens && !turn.scripted ? unknownWordRate(tokens, getLevel) : null;
  const chosen = selectedToken !== null && tokens ? tokens[selectedToken] : null;
  const broughtBack = !turn.scripted ? recalledWordsUsed(tokens ?? [], turn.text, recall) : [];
  return (
    <div className="speak-bubble">
      <p className="speak-tokens" lang={lang}>
        {tokens ? tokens.map((token, index) => {
          const body = furigana
            ? <RubyText runs={lang === 'ja' ? japaneseRuby(token) : lang === 'zh' ? chineseRuby(token.surface, pinyin[token.surface]) : [{ base: token.surface, rt: '' }]} />
            : token.surface;
          if (!token.content) return <span key={index}>{body}</span>;
          return (
            <button
              key={index}
              type="button"
              className={`speak-word ${token.level ?? ''}`}
              aria-pressed={selectedToken === index}
              aria-label={t(`aiSpeak.chat.word.${token.level ?? 'is-new'}`, { word: token.surface })}
              onClick={() => onSelect(index)}
            >
              {body}
            </button>
          );
        }) : turn.text}
      </p>
      {chosen && (
        <div className="speak-actions">
          <button type="button" className="btn small speak-btn" onClick={() => onMineWord(chosen)}>
            {t('aiSpeak.chat.mineWord', { word: chosen.lemma || chosen.surface })}
          </button>
        </div>
      )}
      {rate && rate.total > 0 && (
        <p className={`speak-rate ${rate.onTarget ? 'is-on-target' : 'is-off-target'}`}>
          {t(rate.onTarget ? 'aiSpeak.chat.rateOnTarget' : 'aiSpeak.chat.rateOffTarget', {
            unknown: rate.unknown,
            total: rate.total,
            percent: Math.round(rate.rate * 100),
          })}
        </p>
      )}
      {turn.scripted && <p className="speak-meta">{t('aiSpeak.chat.scriptedLine')}</p>}
      {broughtBack.length > 0 && (
        <p className="speak-meta" data-recall-used="">
          {t('aiSpeak.chat.recallUsed', { words: broughtBack.join(lang === 'ru' ? ', ' : '、') })}
        </p>
      )}
      <div className="speak-actions">
        {turn.translation && (
          <button type="button" className="btn small speak-btn" aria-expanded={showTranslation} onClick={() => setShowTranslation(!showTranslation)}>
            {t(showTranslation ? 'aiSpeak.chat.hideTranslation' : 'aiSpeak.chat.showTranslation')}
          </button>
        )}
        {ttsAvailable() && (
          <button type="button" className="btn small speak-btn" onClick={() => speak(turn.text, lang)}>
            {t('aiSpeak.chat.speak')}
          </button>
        )}
        <button type="button" className="btn small speak-btn" onClick={onMineSentence}>
          {t('aiSpeak.chat.mineSentence')}
        </button>
      </div>
      {showTranslation && turn.translation && <p className="speak-translation">{turn.translation}</p>}
    </div>
  );
}

function UserTurn({
  turn,
  lang,
  onMineCorrected,
}: {
  turn: StoredConversationTurn;
  lang: StudyLang;
  onMineCorrected: (correction: NonNullable<StoredConversationTurn['correction']>) => void;
}) {
  const { t } = useT();
  return (
    <div className="speak-bubble">
      <p lang={lang}>{turn.text}</p>
      {turn.correction && (
        <div className="speak-correction" data-ai-entry>
          <AiSuggestionBadge />
          <p className="speak-label">{t('aiSpeak.chat.correction')}</p>
          <p><StudyDiff before={turn.text} after={turn.correction.corrected} lang={lang} /></p>
          <p>{turn.correction.explanation}</p>
          <div className="speak-actions">
            <button type="button" className="btn small speak-btn" onClick={() => turn.correction && onMineCorrected(turn.correction)}>
              {t('aiSpeak.chat.mineCorrected')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
