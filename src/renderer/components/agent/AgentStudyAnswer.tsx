/**
 * A study-coach answer, rendered: the answer's lines, what can be done from it, and the
 * app data it is based on ("Based on: 23 cards due in your deck, 140 reviews in the last 14
 * days…"). Persisted answers carry catalog keys, so they re-render in the current language.
 * Study content (words, sentences, titles) is shown as written.
 */
import type { AgentAnswerAction, AgentStudyAnswer } from '../../../shared/agentStudyCoach';
import { useT } from '../../i18n';
import { useStudyLanguage } from '../../useStudyLanguage';
import { openSectionSurface } from '../../sectionSurface';
import { requestArenaGame } from '../../games/arenaIntent';
import { requestFlashcardsFocus } from '../../openIntents';
import type { GameId } from '../../games/types';
import './agentStudyCoach.css';

function runAction(action: AgentAnswerAction): void {
  if (action.kind === 'open-section') openSectionSurface(action.section);
  else if (action.kind === 'arena') {
    requestArenaGame({
      gameId: action.gameId as GameId,
      autostart: true,
      ...(action.material ? { material: action.material } : {}),
      ...(action.rounds ? { rounds: action.rounds } : {}),
    });
  } else requestFlashcardsFocus({ folder: null, cardId: null, search: action.search });
}

export function AgentStudyAnswerView({ answer }: { answer: AgentStudyAnswer }) {
  const { t } = useT();
  const { tag: studyTag } = useStudyLanguage();
  return (
    <div className="agent-study-answer">
      <strong className="agent-study-answer-title">{t(answer.titleKey, answer.titleVars)}</strong>
      {answer.lines.length > 0 && (
        <ul className="agent-study-answer-lines">
          {answer.lines.map((line, index) => (
            <li key={index}>
              {line.study ? <b lang={studyTag}>{line.study}</b> : null}
              {line.study ? ' ' : null}
              <span>{t(line.key, line.vars)}</span>
            </li>
          ))}
        </ul>
      )}
      {answer.actions && answer.actions.length > 0 && (
        <div className="agent-study-answer-actions">
          {answer.actions.map((action, index) => (
            <button key={index} type="button" className="agent-action" onClick={() => runAction(action)}>
              {t(action.labelKey)}
            </button>
          ))}
        </div>
      )}
      {answer.citations.length > 0 && (
        <div className="agent-study-sources" aria-label={t('agent2.sources.title')}>
          <span className="agent-study-sources-head">{t('agent2.sources.title')}</span>
          <ul>
            {answer.citations.map((citation, index) => (
              <li key={index}>
                <span className="agent-chip">{t(`agent2.source.${citation.source}`)}</span>{' '}
                {t(citation.key, citation.vars)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
