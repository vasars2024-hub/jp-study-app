/**
 * The dial for the monthly spending ceiling, and the honest report of what has
 * been spent against it.
 *
 * It sits beside the per-request cost cap and the provider rates rather than in
 * Settings, because those are the numbers this ceiling is compared against and
 * this is where a user who was just refused is standing. Until this panel
 * existed the ceiling could only be set over IPC — enforcement with no control a
 * user could reach, which is a worse failure than no ceiling at all.
 *
 * Two things it must never do, both of which the ledger's own doc comments
 * demand:
 *
 * - report the total as if it covered everything. Requests made with no rates
 *   entered are counted in `unpricedRequests` and contribute nothing to the sum,
 *   so the surface says how many there were rather than letting a small number
 *   read as a small bill.
 * - let a user believe erasing the record raises the ceiling. It does not, and
 *   the confirmation says so in the same sentence that asks.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { confirmDialog } from '../ui';
import { Button } from '../ui/Button';
import {
  clearAgentSpend,
  loadAgentSpend,
  onAgentSpendChanged,
  setAgentSpendBudget,
} from '../../agentSpendClient';
import type {
  AgentSpendFailureCode,
  AgentSpendResult,
  AgentSpendSnapshotPayload,
} from '../../../shared/agentSpendBridge';
import {
  AGENT_SPEND_BUDGET_MAX_USD,
  AGENT_SPEND_BUDGET_MIN_USD,
  AGENT_SPEND_EPSILON_USD,
} from '../../../shared/agentSpendLedger';
import { formatAgentCostUsd } from '../../../shared/agentProviderPricing';

/**
 * What the checkbox turns the ceiling on to when the user has never set one.
 * Deliberately not `0`: `0` is a real setting meaning "refuse every priced
 * request", and arriving there by ticking a box would look like the feature was
 * broken rather than like a choice.
 */
const DEFAULT_BUDGET_USD = 10;

const ERROR_KEYS: Record<AgentSpendFailureCode, string> = {
  'invalid-request': 'agent.spend.error.invalidRequest',
  'read-failed': 'agent.spend.error.readFailed',
  'write-failed': 'agent.spend.error.writeFailed',
  'bridge-unavailable': 'agent.spend.error.bridgeUnavailable',
};

function budgetDraftOf(budgetUsd: number | null): string {
  return budgetUsd === null ? '' : String(budgetUsd);
}

export function AgentSpendPanel({ disabled = false }: { disabled?: boolean }): React.ReactElement {
  const { t } = useT();
  const [snapshot, setSnapshot] = useState<AgentSpendSnapshotPayload | null>(null);
  const [failure, setFailure] = useState<AgentSpendFailureCode | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  /**
   * The last ceiling this window saw, so unticking and re-ticking the box offers
   * it back instead of the default. Held in a ref rather than state because
   * nothing renders from it.
   */
  const lastBudget = useRef<number>(DEFAULT_BUDGET_USD);

  const adopt = useCallback((result: AgentSpendResult): void => {
    if (!result.ok) {
      setFailure(result.code);
      return;
    }
    setFailure(null);
    setSnapshot(result.snapshot);
    const { budgetUsd } = result.snapshot.ledger;
    if (budgetUsd !== null) lastBudget.current = budgetUsd;
    setDraft(budgetDraftOf(budgetUsd));
  }, []);

  useEffect(() => {
    let live = true;
    // Subscribed before the load, so a request main completes during hydration
    // is not lost between the read and the first render.
    const unsubscribe = onAgentSpendChanged((pushed) => {
      if (!live) return;
      setFailure(null);
      setSnapshot(pushed);
      // The pushed ceiling is adopted, but the draft is NOT overwritten while
      // the user is mid-edit: main pushes on every recorded request, and having
      // a half-typed limit replaced under the cursor by a background event is
      // how a user ends up setting a number they never typed.
      if (pushed.ledger.budgetUsd !== null) lastBudget.current = pushed.ledger.budgetUsd;
    });
    void loadAgentSpend().then((result) => {
      if (live) adopt(result);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [adopt]);

  const ledger = snapshot?.ledger ?? null;
  const totals = snapshot?.currentPeriod ?? null;
  const budgetUsd = ledger?.budgetUsd ?? null;
  const spentUsd = totals?.spentUsd ?? 0;
  const remainingUsd = budgetUsd === null ? 0 : Math.max(0, budgetUsd - spentUsd);
  const exhausted = budgetUsd !== null && spentUsd + AGENT_SPEND_EPSILON_USD >= budgetUsd;
  const blocked = disabled || busy || snapshot === null;

  async function commitBudget(next: number | null): Promise<void> {
    setBusy(true);
    try {
      adopt(await setAgentSpendBudget(next));
    } finally {
      setBusy(false);
    }
  }

  function toggleBudget(on: boolean): void {
    void commitBudget(on ? lastBudget.current : null);
  }

  /**
   * Committed on blur rather than on every keystroke: each write crosses IPC and
   * reaches disk, and typing "12" through "1" would persist a $1 ceiling on the
   * way. A value outside the store's own bounds is not sent — the boundary would
   * refuse it, and refusing it here says so without a round trip.
   */
  function commitDraft(): void {
    if (budgetUsd === null) return;
    const raw = draft.trim();
    if (raw === '') {
      setDraft(budgetDraftOf(budgetUsd));
      return;
    }
    const parsed = Number(raw);
    if (
      !Number.isFinite(parsed)
      || parsed < AGENT_SPEND_BUDGET_MIN_USD
      || parsed > AGENT_SPEND_BUDGET_MAX_USD
    ) {
      setFailure('invalid-request');
      setDraft(budgetDraftOf(budgetUsd));
      return;
    }
    if (parsed === budgetUsd) return;
    void commitBudget(parsed);
  }

  async function eraseRecord(): Promise<void> {
    if (!totals) return;
    const ok = await confirmDialog({
      title: t('agent.spend.clearTitle'),
      message: t('agent.spend.clearConfirm', {
        amount: formatAgentCostUsd(spentUsd),
        count: totals.requests + totals.unpricedRequests,
      }),
      confirmLabel: t('agent.spend.clear'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      adopt(await clearAgentSpend());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="agent-spend-panel">
      <p className="agent-budget-note">{t('agent.spend.title')}</p>

      {failure ? (
        <p className="agent-budget-warning">{t(ERROR_KEYS[failure])}</p>
      ) : null}

      {snapshot === null ? (
        failure ? null : <p className="agent-budget-note">{t('agent.spend.loading')}</p>
      ) : (
        <>
          <p className="agent-budget-usage">
            {t('agent.spend.total', {
              amount: formatAgentCostUsd(spentUsd),
              period: snapshot.period,
              count: totals?.requests ?? 0,
            })}
          </p>
          {totals && totals.unpricedRequests > 0 ? (
            <p className="agent-budget-warning">
              {t('agent.spend.unpriced', { count: totals.unpricedRequests })}
            </p>
          ) : null}

          <label className="agent-check">
            <input
              type="checkbox"
              checked={budgetUsd !== null}
              onChange={(event) => toggleBudget(event.target.checked)}
              disabled={blocked}
            />
            <span>{t('agent.spend.limitEnable')}</span>
          </label>

          {budgetUsd !== null ? (
            <>
              <label className="agent-field agent-budget-field">
                <span>{t('agent.spend.limit')}</span>
                <input
                  type="number"
                  min={AGENT_SPEND_BUDGET_MIN_USD}
                  max={AGENT_SPEND_BUDGET_MAX_USD}
                  step={0.01}
                  value={draft}
                  onChange={(event) => setDraft(event.currentTarget.value)}
                  onBlur={commitDraft}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                  disabled={blocked}
                />
              </label>
              <p className={exhausted ? 'agent-budget-warning' : 'agent-budget-usage'}>
                {exhausted
                  ? t('agent.spend.exhausted')
                  : t('agent.spend.remaining', { amount: formatAgentCostUsd(remainingUsd) })}
              </p>
            </>
          ) : null}

          <p className="agent-budget-note">{t('agent.spend.limitNote')}</p>

          {/* The design-system button, not `.agent-action`: this panel also renders in
              Settings > AI and in Blanc, where agent.css (and the `--agent-*` vars it
              scopes to `.agent-shell`) is not loaded, and there it was Chromium's grey
              slab (round-3 sweep, every configuration). */}
          <Button
            size="sm"
            variant="danger"
            className="agent-spend-clear"
            onClick={() => void eraseRecord()}
            disabled={blocked || (totals?.requests ?? 0) + (totals?.unpricedRequests ?? 0) === 0}
          >
            {t('agent.spend.clear')}
          </Button>
        </>
      )}
    </div>
  );
}

export default AgentSpendPanel;
