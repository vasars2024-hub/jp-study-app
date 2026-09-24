// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  AGENT_COMPOSER_REASON_KEYS,
  agentPlanDisabledReason,
  agentSendDisabledReason,
  type AgentComposerState,
} from '../agentComposerReason';
import { CATALOGS, en } from '../i18n/catalogs/all';
import { UI_LANGS, translate } from '../i18n/core';

/**
 * The defect these rules exist for: `Create action plan` and `Send` were greyed
 * out with no `title`, no `aria-describedby` and no prose in their row — two
 * mute pairs on the category-8 sweep. Six and seven ORed conditions respectively,
 * so a constant sentence would have been wrong in almost every case.
 *
 * The interesting property is PRIORITY, not presence, which is why the rules were
 * lifted out of the shell to be testable at all.
 */
const READY: AgentComposerState = {
  busy: false,
  planning: false,
  attachmentReading: false,
  attachmentCount: 0,
  draft: 'summarise this',
  planObjectiveTooLong: false,
  knownInputOverBudget: false,
  visionUnsupported: false,
  sensitiveConsentRequired: false,
  cloudSensitiveConsent: false,
};
const state = (over: Partial<AgentComposerState>): AgentComposerState => ({ ...READY, ...over });

describe('agent composer disabled reasons', () => {
  it('says nothing when the composer is ready — the enabled case', () => {
    expect(agentPlanDisabledReason(READY)).toBeUndefined();
    expect(agentSendDisabledReason(READY)).toBeUndefined();
  });

  it('names each condition on its own', () => {
    expect(agentSendDisabledReason(state({ busy: true }))).toBe('agent.execute.reason.busy');
    expect(agentSendDisabledReason(state({ planning: true }))).toBe('agent.execute.reason.busy');
    expect(agentSendDisabledReason(state({ attachmentReading: true })))
      .toBe('agent.execute.reason.attachmentReading');
    expect(agentSendDisabledReason(state({ draft: '   ' })))
      .toBe('agent.execute.reason.emptyDraft');
    expect(agentSendDisabledReason(state({ knownInputOverBudget: true })))
      .toBe('agent.execute.inputOverBudget');
    expect(agentSendDisabledReason(state({ visionUnsupported: true })))
      .toBe('agent.attachment.visionUnsupported');
    expect(agentSendDisabledReason(state({ sensitiveConsentRequired: true })))
      .toBe('agent.execute.reason.needsConsent');

    expect(agentPlanDisabledReason(state({ attachmentCount: 2 })))
      .toBe('agent.plan.attachmentsUnsupported');
    expect(agentPlanDisabledReason(state({ draft: '' })))
      .toBe('agent.plan.reason.emptyObjective');
    expect(agentPlanDisabledReason(state({ planObjectiveTooLong: true })))
      .toBe('agent.plan.error.invalid-objective');
  });

  it('consent is satisfied by the checkbox rather than by the requirement going away', () => {
    expect(agentSendDisabledReason(state({ sensitiveConsentRequired: true, cloudSensitiveConsent: true })))
      .toBeUndefined();
  });

  it('reports the rule the user should act on first, not the last one that matched', () => {
    // The ordering that matters: an empty draft CANNOT be over budget, so a
    // state carrying both must report the empty draft. Reversing these two sends
    // the user hunting for a length problem they do not have.
    expect(agentSendDisabledReason(state({ draft: '', knownInputOverBudget: true })))
      .toBe('agent.execute.reason.emptyDraft');
    // A request in flight outranks everything: nothing else is actionable until
    // it finishes.
    expect(agentSendDisabledReason(state({ busy: true, draft: '', visionUnsupported: true })))
      .toBe('agent.execute.reason.busy');
    // Attached files block plan creation whatever the objective says, so clearing
    // them is the first move even when the objective is also empty.
    expect(agentPlanDisabledReason(state({ attachmentCount: 1, draft: '' })))
      .toBe('agent.plan.attachmentsUnsupported');
  });

  it('the enabled case is reachable from every single-condition failure', () => {
    // The negative control for the whole file: if any rule matched unconditionally
    // the suite above would still pass, because every assertion sets its own flag.
    // Clearing that one flag has to bring the button back.
    const flags: Partial<AgentComposerState>[] = [
      { busy: true }, { planning: true }, { attachmentReading: true },
      { draft: '' }, { knownInputOverBudget: true }, { visionUnsupported: true },
      { sensitiveConsentRequired: true },
    ];
    for (const flag of flags) {
      expect(agentSendDisabledReason(state(flag)), `${JSON.stringify(flag)} disables`).toBeDefined();
      expect(agentSendDisabledReason(READY), 'clearing it re-enables').toBeUndefined();
    }
  });
});

describe('agent composer reason strings', () => {
  it('every key a rule can return exists in all four catalogs and renders', () => {
    for (const lang of UI_LANGS) {
      for (const key of AGENT_COMPOSER_REASON_KEYS) {
        expect(CATALOGS[lang][key], `${key} missing from ${lang}`).toBeDefined();
        const text = translate(key, { limit: 8000 } as never, {
          lang, catalog: CATALOGS[lang], fallback: en,
        });
        expect(text, `${lang} left a raw key for ${key}`).not.toBe(key);
        expect(text, `${lang} left an uninterpolated brace in ${key}`).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('actually translates rather than falling back to English', () => {
    for (const lang of UI_LANGS.filter((l) => l !== 'en')) {
      for (const key of AGENT_COMPOSER_REASON_KEYS) {
        const opts = { lang, catalog: CATALOGS[lang], fallback: en };
        expect(
          translate(key, { limit: 8000 } as never, opts),
          `${lang} renders the English sentence for ${key}`,
        ).not.toBe(translate(key, { limit: 8000 } as never, { ...opts, lang: 'en', catalog: en }));
      }
    }
  });
});

describe('agent composer AI readiness', () => {
  const SET_UP = {
    aiEnabled: true,
    targetIsLocal: true,
    targetReady: true,
    agentEnabled: true,
    plannerReady: true,
  };

  it('blocks Send on a local target with no model, ahead of an empty draft', () => {
    const blocked = state({ draft: '', setup: { ...SET_UP, targetReady: false } });
    expect(agentSendDisabledReason(blocked)).toBe('agent.execute.reason.localModelMissing');
  });

  it('names a missing key, not a missing model, on a cloud target', () => {
    const blocked = state({ setup: { ...SET_UP, targetIsLocal: false, targetReady: false } });
    expect(agentSendDisabledReason(blocked)).toBe('agent.execute.reason.cloudKeyMissing');
  });

  it('says AI is off before anything else the user could fix', () => {
    const off = state({ setup: { ...SET_UP, aiEnabled: false, targetReady: false } });
    expect(agentSendDisabledReason(off)).toBe('agent.execute.reason.aiOff');
    expect(agentPlanDisabledReason(off)).toBe('agent.execute.reason.aiOff');
  });

  it('gates plans on the Agent switch and on having a planner', () => {
    expect(agentPlanDisabledReason(state({ setup: { ...SET_UP, agentEnabled: false } })))
      .toBe('agent.plan.reason.agentDisabled');
    expect(agentPlanDisabledReason(state({ setup: { ...SET_UP, plannerReady: false } })))
      .toBe('agent.plan.reason.noPlanner');
    // Chat does not need the Agent switch: it is a conversation, not an action.
    expect(agentSendDisabledReason(state({ setup: { ...SET_UP, agentEnabled: false } }))).toBeUndefined();
  });

  it('blocks nothing while readiness is still unknown', () => {
    expect(agentSendDisabledReason(state({ setup: undefined }))).toBeUndefined();
  });
});
