/**
 * music2 — the video study loop, for synced lyrics.
 *
 * Pause after each line, repeat the line being sung, and mine the current line
 * with one key. The timing is the video player's own cue clock
 * (`media/studyCueClock.ts`), driven by the music element: one armed timer per
 * boundary, so a repeat lands on the line's end instead of a `timeupdate` late
 * and replaying the first syllable of the next line.
 *
 * The clock runs only in the LEADER window (the one that owns the sound) and
 * only while a switch is on; a follower window shows the switches and lets the
 * leader act. The three commands are `music.*` ids of their own, unbound by
 * default, for the reason `keyboardShortcuts.ts` gives beside them.
 */
import { useEffect, useRef } from 'react';
import { createStudyCueClock } from '../../../media/studyCueClock';
import type { VideoCoreStudyCue } from '../../../shared/videoCoreStudy';
import { getLeaderAudioElement } from '../../playerBus';
import { registerCommandHandler } from '../../keyboardShortcuts';
import { patchMusicStudyPrefs, useMusicStudyPrefs, type MusicStudyPrefs } from '../../musicStudyPrefs';
import { useT } from '../../i18n';
import HelpLink from '../onboarding/HelpLink';
import './musicStudy.css';

export interface MusicStudyBarProps {
  /** The synced cue sheet (`musicTransportCues`), empty for plain lyrics. */
  cues: readonly VideoCoreStudyCue[];
  /** Changes when the track changes, so the clock re-binds. */
  trackKey: string;
  seek: (sec: number) => void;
  /** Mine the line being sung now. */
  onMineCurrent: () => void;
  mineDisabled?: boolean;
}

const TOGGLES: Array<{ key: keyof MusicStudyPrefs; labelKey: string; titleKey: string }> = [
  { key: 'autoPause', labelKey: 'music2.study.autoPause', titleKey: 'music2.study.autoPauseTitle' },
  { key: 'lineLoop', labelKey: 'music2.study.lineLoop', titleKey: 'music2.study.lineLoopTitle' },
  { key: 'knownHighlight', labelKey: 'music2.study.known', titleKey: 'music2.study.knownTitle' },
  { key: 'readingAid', labelKey: 'music2.study.readingAid', titleKey: 'music2.study.readingAidTitle' },
];

export default function MusicStudyBar({ cues, trackKey, seek, onMineCurrent, mineDisabled = false }: MusicStudyBarProps) {
  const { t } = useT();
  const prefs = useMusicStudyPrefs();
  const synced = cues.length > 0;

  const cuesRef = useRef(cues);
  cuesRef.current = cues;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const seekRef = useRef(seek);
  seekRef.current = seek;
  const mineRef = useRef(onMineCurrent);
  mineRef.current = onMineCurrent;

  const clockWanted = synced && (prefs.autoPause || prefs.lineLoop);
  useEffect(() => {
    if (!clockWanted) return undefined;
    const media = getLeaderAudioElement();
    if (!media) return undefined;
    const clock = createStudyCueClock({
      video: media,
      getCues: () => cuesRef.current,
      getDelaySec: () => 0,
      getMode: () => ({ autoPause: prefsRef.current.autoPause, lineLoop: prefsRef.current.lineLoop, ab: null }),
      onStudyCue: () => undefined,
      pause: () => media.pause(),
      seek: (sec) => seekRef.current(sec),
    });
    return () => clock.dispose();
  }, [clockWanted, trackKey]);

  // Registered once, reading through refs — same reasoning as the cue transport's ids.
  useEffect(() => {
    const offs = [
      registerCommandHandler('music.toggleAutoPause', () => {
        patchMusicStudyPrefs({ autoPause: !prefsRef.current.autoPause });
      }),
      registerCommandHandler('music.toggleLineLoop', () => {
        patchMusicStudyPrefs({ lineLoop: !prefsRef.current.lineLoop });
      }),
      registerCommandHandler('music.mineLine', () => {
        mineRef.current();
      }),
    ];
    return () => offs.forEach((off) => off());
  }, []);

  return (
    <div
      className="music-study-bar"
      role="group"
      aria-label={t('music2.study.label')}
      // The lyrics pane turns a mouse-up into a dictionary lookup; a switch is not a word.
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
    >
      {TOGGLES.map((toggle) => {
        // The timing switches need a synced sheet; colouring and reading aid do not.
        const needsSync = toggle.key === 'autoPause' || toggle.key === 'lineLoop';
        if (needsSync && !synced) return null;
        const on = prefs[toggle.key];
        return (
          <button
            key={toggle.key}
            type="button"
            className={`music-study-toggle${on ? ' is-on' : ''}`}
            aria-pressed={on}
            title={t(toggle.titleKey)}
            onClick={() => patchMusicStudyPrefs({ [toggle.key]: !on })}
          >
            {t(toggle.labelKey)}
          </button>
        );
      })}
      {synced && (
        <button
          type="button"
          className="music-study-toggle music-study-mine"
          onClick={onMineCurrent}
          disabled={mineDisabled}
          title={t('music2.study.mineTitle')}
        >
          {t('music2.study.mine')}
        </button>
      )}
      <HelpLink topic="music" />
    </div>
  );
}
