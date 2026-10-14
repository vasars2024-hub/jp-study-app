/**
 * The conversation partner's hands-free loop: listen → the learner speaks → the
 * pause after it sends it → the partner's reply is read aloud → listen again.
 * Talking over the partner's voice, or pressing Esc, interrupts it.
 *
 * The microphone and the decision of when speech starts and ends live in
 * `voiceActivity.ts`; the transcript comes from the LOCAL Whisper model, as with
 * push-to-talk. This hook only sequences the phases and owns their cleanup, so
 * closing the panel always closes the microphone and stops the voice.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { StudyLang } from '../../../shared/studyLang';
import type { WhisperModelTier } from '../../../shared/whisperModels';
import { whisperReadiness } from '../../speechCapture';
import { speak, stopSpeaking, ttsAvailable } from '../../tts';
import { startVoiceLoop, type VoiceLoop } from './voiceActivity';

export type HandsFreePhase =
  | 'off'
  | 'starting'
  /** Waiting for the learner to speak. */
  | 'listening'
  /** The learner is speaking; the pause after it ends the turn. */
  | 'hearing'
  | 'transcribing'
  /** The partner's reply is being written. */
  | 'waiting'
  /** The partner's reply is being read aloud; speaking or Esc interrupts. */
  | 'speaking';

export type HandsFreeProblem =
  | { kind: 'mic' }
  | { kind: 'needs-model'; tier: WhisperModelTier; sizeBytes: number }
  /** The last utterance gave no text (too quiet, or only noise). */
  | { kind: 'unheard' };

export interface HandsFreeOptions {
  studyLang: StudyLang;
  /**
   * Sends what was said; resolves with the partner's reply to read aloud, or
   * null when there is none (a failure, a Cancel). The loop listens again either way.
   */
  onTranscript: (text: string) => Promise<string | null>;
  /** Read replies aloud (otherwise the loop goes straight back to listening). */
  readAloud: boolean;
}

/** How often the end of the partner's voice is checked (speechSynthesis has no reliable end event for every voice). */
const SPEAKING_POLL_MS = 200;

export function useHandsFree({ studyLang, onTranscript, readAloud }: HandsFreeOptions) {
  const [phase, setPhase] = useState<HandsFreePhase>('off');
  const [level, setLevel] = useState(0);
  const [problem, setProblem] = useState<HandsFreeProblem | null>(null);
  const loop = useRef<VoiceLoop | null>(null);
  const transcribing = useRef<AbortController | null>(null);
  const speakingTimer = useRef<number | null>(null);
  const session = useRef(0);
  const latest = useRef({ onTranscript, readAloud, studyLang });
  latest.current = { onTranscript, readAloud, studyLang };

  const clearSpeakingTimer = (): void => {
    if (speakingTimer.current !== null) window.clearInterval(speakingTimer.current);
    speakingTimer.current = null;
  };

  const listen = useCallback((): void => {
    clearSpeakingTimer();
    loop.current?.setMode('listen');
    setPhase('listening');
  }, []);

  const stop = useCallback((): void => {
    session.current += 1;
    clearSpeakingTimer();
    transcribing.current?.abort();
    transcribing.current = null;
    loop.current?.stop();
    loop.current = null;
    stopSpeaking();
    setLevel(0);
    setPhase('off');
  }, []);

  /** Stops the partner's voice and listens at once. */
  const interrupt = useCallback((): void => {
    if (!loop.current) return;
    stopSpeaking();
    listen();
  }, [listen]);

  const handleUtterance = useCallback(async (pcm: Float32Array, mine: number): Promise<void> => {
    const current = loop.current;
    if (!current || mine !== session.current) return;
    current.setMode('paused');
    setPhase('transcribing');
    const controller = new AbortController();
    transcribing.current = controller;
    let text = '';
    try {
      const { transcribePcm } = await import('../../whisperTranscribePcm');
      const result = await transcribePcm(pcm, latest.current.studyLang, { signal: controller.signal });
      text = result.ok ? (result.text ?? '').trim() : '';
    } catch {
      text = '';
    }
    if (mine !== session.current || controller.signal.aborted) return;
    transcribing.current = null;
    if (!text) {
      setProblem({ kind: 'unheard' });
      listen();
      return;
    }
    setProblem(null);
    setPhase('waiting');
    let reply: string | null = null;
    try {
      reply = await latest.current.onTranscript(text);
    } catch {
      reply = null;
    }
    if (mine !== session.current || !loop.current) return;
    if (reply && latest.current.readAloud && ttsAvailable() && speak(reply, latest.current.studyLang)) {
      // The partner talks; the learner talking over it interrupts (stricter start).
      loop.current.setMode('barge-in');
      setPhase('speaking');
      clearSpeakingTimer();
      // speechSynthesis may report `speaking` only once the voice has started, so
      // "finished" is two quiet polls in a row, not the first one.
      let quietPolls = 0;
      speakingTimer.current = window.setInterval(() => {
        const busy = typeof speechSynthesis !== 'undefined' && (speechSynthesis.speaking || speechSynthesis.pending);
        quietPolls = busy ? 0 : quietPolls + 1;
        if (quietPolls < 2) return;
        if (mine === session.current && loop.current?.mode === 'barge-in') listen();
        else clearSpeakingTimer();
      }, SPEAKING_POLL_MS);
      return;
    }
    listen();
  }, [listen]);

  const start = useCallback(async (): Promise<void> => {
    if (loop.current) return;
    const mine = ++session.current;
    setProblem(null);
    setPhase('starting');
    const readiness = await whisperReadiness(latest.current.studyLang).catch(() => null);
    if (mine !== session.current) return;
    if (!readiness) {
      setProblem({ kind: 'mic' });
      setPhase('off');
      return;
    }
    if (!readiness.ready) {
      setProblem({ kind: 'needs-model', tier: readiness.tier, sizeBytes: readiness.sizeBytes });
      setPhase('off');
      return;
    }
    try {
      const opened = await startVoiceLoop({
        onLevel: (value) => {
          if (mine === session.current) setLevel(value);
        },
        onSpeechStart: (interrupted) => {
          if (mine !== session.current) return;
          if (interrupted) {
            clearSpeakingTimer();
            stopSpeaking();
          }
          setPhase('hearing');
        },
        onUtterance: (pcm) => {
          void handleUtterance(pcm, mine);
        },
        onDiscard: () => {
          if (mine === session.current) setPhase('listening');
        },
      });
      if (mine !== session.current) {
        opened.stop();
        return;
      }
      loop.current = opened;
      setPhase('listening');
    } catch {
      if (mine !== session.current) return;
      setProblem({ kind: 'mic' });
      setPhase('off');
    }
  }, [handleUtterance]);

  // Esc interrupts the partner's voice while the loop runs.
  useEffect(() => {
    if (phase === 'off') return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || phase !== 'speaking') return;
      event.preventDefault();
      event.stopPropagation();
      interrupt();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [phase, interrupt]);

  // Closing the panel closes the microphone and silences the partner.
  useEffect(() => () => {
    session.current += 1;
    clearSpeakingTimer();
    transcribing.current?.abort();
    loop.current?.stop();
    loop.current = null;
  }, []);

  return { phase, level, problem, start, stop, interrupt, clearProblem: () => setProblem(null) };
}
