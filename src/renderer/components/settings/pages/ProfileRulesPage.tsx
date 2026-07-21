import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SettingsCard from '../SettingsCard';
import { useSettings } from '../SettingsContext';
import { useT } from '../../../i18n';
import { getActiveProfile, getProfiles, onProfileChanged } from '../../../profileState';
import type { StudyProfile } from '../../../../shared/profiles';
import {
  EMPTY_PROFILE_RULES,
  MINE_CATEGORIES,
  firstShadowingRuleIndex,
  normalizeProfileRulesStore,
  resolveProfileMatch,
  ruleMatchesEverything,
  type MineCardKind,
  type MineCategory,
  type MineLanguage,
  type MineSource,
  type ProfileRule,
  type ProfileRuleContext,
  type ProfileRulesStore,
} from '../../../../shared/profileRules';

type SourceOpt = MineSource | 'any';
type CardKindOpt = MineCardKind | 'any';
type LanguageOpt = MineLanguage | 'any';
type CategoryOpt = MineCategory | 'any';

const SOURCES: SourceOpt[] = ['any', 'extension', 'epub', 'audio', 'reader', 'dictionary', 'other'];
const CARD_KINDS: CardKindOpt[] = ['any', 'word', 'sentence'];
const LANGUAGES: LanguageOpt[] = ['any', 'ja', 'zh', 'ru', 'unknown'];
const CATEGORIES: CategoryOpt[] = ['any', ...MINE_CATEGORIES];

// Concrete option sets for the "Test a card" simulator (no wildcards — a real
// mined card always has a specific source / kind / language).
const TEST_SOURCES: MineSource[] = ['extension', 'epub', 'audio', 'reader', 'dictionary', 'other'];
const TEST_CARD_KINDS: MineCardKind[] = ['word', 'sentence'];
const TEST_LANGUAGES: MineLanguage[] = ['ja', 'zh', 'ru', 'unknown'];
type TestCategory = MineCategory | 'none';
const TEST_CATEGORIES: TestCategory[] = ['none', ...MINE_CATEGORIES];

interface TestCard {
  source: MineSource;
  cardKind: MineCardKind;
  language: MineLanguage;
  category: TestCategory;
}

function newRuleId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function moveRule(rules: ProfileRule[], index: number, dir: -1 | 1): ProfileRule[] {
  const j = index + dir;
  if (j < 0 || j >= rules.length) return rules;
  const next = rules.slice();
  const tmp = next[index]!;
  next[index] = next[j]!;
  next[j] = tmp;
  return next;
}

export default function ProfileRulesPage() {
  const { t, lang } = useT();
  const { focusSettingId } = useSettings();
  const [store, setStore] = useState<ProfileRulesStore>(EMPTY_PROFILE_RULES);
  const storeRef = useRef(store);
  storeRef.current = store;
  const [profiles, setProfiles] = useState<StudyProfile[]>(() => getProfiles());
  const [active, setActive] = useState<StudyProfile>(() => getActiveProfile());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const saveGen = useRef(0);

  const [test, setTest] = useState<TestCard>(() => {
    const a = getActiveProfile();
    return { source: 'dictionary', cardKind: 'word', language: a.targetLang, category: 'none' };
  });

  useEffect(
    () =>
      onProfileChanged((snap) => {
        setProfiles(snap.profiles);
        setActive(snap.profiles.find((p) => p.id === snap.activeProfileId) ?? getActiveProfile());
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const raw = await window.api.profileRulesGet();
        if (!cancelled) {
          const next = normalizeProfileRulesStore(raw);
          storeRef.current = next;
          setStore(next);
        }
      } catch {
        if (!cancelled) {
          const next = { ...EMPTY_PROFILE_RULES, rules: [] as ProfileRule[] };
          storeRef.current = next;
          setStore(next);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const flash = useCallback((text: string) => {
    setMsg(text);
    window.setTimeout(() => setMsg(null), 2200);
  }, []);

  const persist = useCallback(
    async (next: ProfileRulesStore) => {
      storeRef.current = next;
      setStore(next);
      const gen = ++saveGen.current;
      setSaving(true);
      try {
        const saved = await window.api.profileRulesSet(next);
        if (gen !== saveGen.current) return;
        const normalized = normalizeProfileRulesStore(saved);
        storeRef.current = normalized;
        setStore(normalized);
      } catch {
        if (gen === saveGen.current) flash(t('settings.profileRules.saveFailed'));
      } finally {
        if (gen === saveGen.current) setSaving(false);
      }
    },
    [flash, t, lang],
  );

  const patchRules = (rules: ProfileRule[]) => {
    void persist({ schemaVersion: 1, rules });
  };

  const updateRule = (index: number, patch: Partial<ProfileRule>) => {
    const rules = storeRef.current.rules.map((r, i) => {
      if (i !== index) return r;
      const next: ProfileRule = { ...r, ...patch };
      if (patch.match) next.match = { ...r.match, ...patch.match };
      return next;
    });
    patchRules(rules);
  };

  const addRule = () => {
    const fallbackId = active?.id || profiles[0]?.id || '';
    if (!fallbackId) {
      flash(t('settings.profileRules.noProfiles'));
      return;
    }
    const rule: ProfileRule = {
      id: newRuleId(),
      enabled: true,
      label: t('settings.profileRules.newLabel'),
      match: { source: 'any', cardKind: 'any', language: 'any', category: 'any' },
      profileId: fallbackId,
    };
    patchRules([...storeRef.current.rules, rule]);
  };

  const removeRule = (index: number) => {
    patchRules(storeRef.current.rules.filter((_, i) => i !== index));
  };

  const sourceLabel = (v: SourceOpt) => t(`settings.profileRules.source.${v}`);
  const cardKindLabel = (v: CardKindOpt) => t(`settings.profileRules.cardKind.${v}`);
  const languageLabel = (v: LanguageOpt) => t(`settings.profileRules.language.${v}`);
  const categoryLabel = (v: CategoryOpt) => t(`settings.profileRules.category.${v}`);

  const profileById = useMemo(() => {
    const m = new Map<string, StudyProfile>();
    for (const p of profiles) m.set(p.id, p);
    return m;
  }, [profiles]);

  // Small "Deck X · Note type Y" line so the destination is concrete, not just a name.
  const destLine = (p: StudyProfile | undefined) =>
    p
      ? `${t('settings.profileRules.deck')}: ${p.anki.deckName || '—'} · ${t('settings.profileRules.noteType')}: ${p.anki.modelName || '—'}`
      : '';

  // ----- Live "Test a card" resolution --------------------------------------
  const testCtx: ProfileRuleContext = {
    source: test.source,
    cardKind: test.cardKind,
    language: test.language,
    category: test.category === 'none' ? undefined : test.category,
  };
  const testResolved = resolveProfileMatch(store.rules, testCtx, active?.id || '');
  const testRuleIndex = testResolved.matchedRule
    ? store.rules.findIndex((r) => r.id === testResolved.matchedRule!.id)
    : -1;
  const testDestProfile = profileById.get(testResolved.profileId) || active;

  // ----- Destination summary (which profiles receive cards) -----------------
  const summary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of store.rules) {
      if (!r.enabled) continue;
      counts.set(r.profileId, (counts.get(r.profileId) ?? 0) + 1);
    }
    return [...counts.entries()].map(([id, count]) => ({
      id,
      count,
      profile: profileById.get(id),
    }));
  }, [store.rules, profileById]);

  return (
    <>
      <SettingsCard
        id="profile-rules"
        title={t('settings.profileRules.title')}
        description={t('settings.profileRules.desc')}
        highlight={focusSettingId === 'profile-rules'}
      >
        {/* A. Default destination — the anchor for the whole mental model. */}
        <div className="pr-banner" role="note">
          <span className="pr-banner-icon" aria-hidden="true">
            ★
          </span>
          <div className="pr-banner-text">
            <div className="pr-banner-head">
              {t('settings.profileRules.defaultDest.label')}
              <span className="pr-banner-profile">{active?.label || active?.id || '—'}</span>
            </div>
            <div className="muted pr-dest-line">{destLine(active)}</div>
            <div className="muted pr-banner-hint">{t('settings.profileRules.defaultDest.hint')}</div>
          </div>
        </div>

        {/* B. Live simulator — pick a card, see exactly where it lands. */}
        <div className="pr-tester">
          <div className="pr-tester-head">
            <strong>{t('settings.profileRules.tester.title')}</strong>
            <span className="muted" style={{ fontSize: 12 }}>
              {t('settings.profileRules.tester.hint')}
            </span>
          </div>
          <div className="pr-tester-row">
            <label className="sp-field pr-tester-field">
              <span className="muted pr-field-label">{t('settings.profileRules.matchSource')}</span>
              <select
                className="set-select"
                value={test.source}
                onChange={(e) => setTest((s) => ({ ...s, source: e.target.value as MineSource }))}
              >
                {TEST_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {sourceLabel(s)}
                  </option>
                ))}
              </select>
            </label>
            <label className="sp-field pr-tester-field">
              <span className="muted pr-field-label">{t('settings.profileRules.matchCardKind')}</span>
              <select
                className="set-select"
                value={test.cardKind}
                onChange={(e) => setTest((s) => ({ ...s, cardKind: e.target.value as MineCardKind }))}
              >
                {TEST_CARD_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {cardKindLabel(k)}
                  </option>
                ))}
              </select>
            </label>
            <label className="sp-field pr-tester-field">
              <span className="muted pr-field-label">{t('settings.profileRules.matchLanguage')}</span>
              <select
                className="set-select"
                value={test.language}
                onChange={(e) => setTest((s) => ({ ...s, language: e.target.value as MineLanguage }))}
              >
                {TEST_LANGUAGES.map((l) => (
                  <option key={l} value={l}>
                    {languageLabel(l)}
                  </option>
                ))}
              </select>
            </label>
            <label className="sp-field pr-tester-field">
              <span className="muted pr-field-label">{t('settings.profileRules.matchCategory')}</span>
              <select
                className="set-select"
                value={test.category}
                onChange={(e) =>
                  setTest((s) => ({ ...s, category: e.target.value as TestCategory }))
                }
              >
                {TEST_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c === 'none' ? t('settings.profileRules.tester.noCategory') : categoryLabel(c)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className={`pr-result${testResolved.usedDefault ? ' is-default' : ' is-rule'}`}
            aria-live="polite"
          >
            <span className="pr-result-verdict">
              {testResolved.usedDefault
                ? t('settings.profileRules.tester.resultDefault')
                : t('settings.profileRules.tester.resultRule', {
                    n: testRuleIndex + 1,
                    label: testResolved.matchedRule?.label ?? '',
                  })}
            </span>
            <span className="pr-result-arrow" aria-hidden="true">
              →
            </span>
            <span className="pr-result-dest">
              <strong>{testDestProfile?.label || testDestProfile?.id || '—'}</strong>
              <span className="muted pr-dest-line">{destLine(testDestProfile)}</span>
            </span>
          </div>
        </div>

        {/* C. The rules themselves. */}
        <div className="pr-rules-head">
          <strong>{t('settings.profileRules.rulesHeading')}</strong>
          <p className="muted os-set-hint" style={{ marginTop: 4 }}>
            {t('settings.profileRules.firstMatch')}
          </p>
          <p className="muted os-set-hint" style={{ marginTop: 4 }}>
            {t('settings.profileRules.usageNote')}
          </p>
        </div>
        <div className="os-viz-row" style={{ marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="btn small primary"
            disabled={loading || saving}
            onClick={addRule}
          >
            {t('settings.profileRules.add')}
          </button>
          {msg && (
            <span className="muted" style={{ fontSize: 12 }} aria-live="polite">
              {msg}
            </span>
          )}
        </div>

        {loading ? (
          <p className="muted os-set-hint" style={{ marginTop: 12 }}>
            {t('settings.profileRules.loading')}
          </p>
        ) : store.rules.length === 0 ? (
          <p className="muted os-set-hint" style={{ marginTop: 12 }}>
            {t('settings.profileRules.empty')}
          </p>
        ) : (
          <ul className="pr-rule-list">
            {store.rules.map((rule, index) => {
              const target = profileById.get(rule.profileId);
              const missing = !target;
              const everything = rule.enabled && ruleMatchesEverything(rule);
              const shadowedBy = firstShadowingRuleIndex(store.rules, index);
              const isHit = index === testRuleIndex;
              return (
                <li
                  key={rule.id}
                  className={`pr-rule${rule.enabled ? '' : ' is-off'}${isHit ? ' pr-rule-hit' : ''}`}
                >
                  <div className="pr-rule-top">
                    <span className="pr-order">
                      {t('settings.profileRules.order', { n: index + 1 })}
                    </span>
                    <label className="os-toggle os-toggle-compact" style={{ flexShrink: 0 }}>
                      <input
                        type="checkbox"
                        checked={rule.enabled}
                        onChange={(e) => updateRule(index, { enabled: e.target.checked })}
                        aria-label={t('settings.profileRules.enabled')}
                      />
                      <span>{rule.enabled ? t('common.on') : t('common.off')}</span>
                    </label>
                    <input
                      className="gram-search pr-rule-label"
                      type="text"
                      value={rule.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        const rules = storeRef.current.rules.map((r, i) =>
                          i === index ? { ...r, label } : r,
                        );
                        const next = { schemaVersion: 1 as const, rules };
                        storeRef.current = next;
                        setStore(next);
                      }}
                      onBlur={() => {
                        void persist(storeRef.current);
                      }}
                      aria-label={t('settings.profileRules.label')}
                    />
                    <span className="mini-app-manage-acts" style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        className="btn small"
                        disabled={index === 0 || saving}
                        onClick={() => patchRules(moveRule(storeRef.current.rules, index, -1))}
                        aria-label={t('settings.profileRules.moveUp')}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        disabled={index === store.rules.length - 1 || saving}
                        onClick={() => patchRules(moveRule(storeRef.current.rules, index, 1))}
                        aria-label={t('settings.profileRules.moveDown')}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn small"
                        disabled={saving}
                        onClick={() => removeRule(index)}
                      >
                        {t('common.remove')}
                      </button>
                    </span>
                  </div>

                  {(missing || everything || shadowedBy !== -1) && (
                    <div className="pr-badges">
                      {missing && (
                        <span className="pr-badge warn">
                          {t('settings.profileRules.badge.missingProfile')}
                        </span>
                      )}
                      {shadowedBy !== -1 && (
                        <span className="pr-badge warn">
                          {t('settings.profileRules.badge.shadowed', { n: shadowedBy + 1 })}
                        </span>
                      )}
                      {everything && (
                        <span className="pr-badge info">
                          {t('settings.profileRules.badge.matchesEverything')}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="pr-zones">
                    <div className="pr-zone">
                      <div className="pr-zone-title">{t('settings.profileRules.whenCard')}</div>
                      <div className="pr-cond-grid">
                        <label className="sp-field">
                          <span className="muted pr-field-label">
                            {t('settings.profileRules.matchSource')}
                          </span>
                          <select
                            className="set-select"
                            value={rule.match.source ?? 'any'}
                            onChange={(e) =>
                              updateRule(index, { match: { source: e.target.value as SourceOpt } })
                            }
                          >
                            {SOURCES.map((s) => (
                              <option key={s} value={s}>
                                {sourceLabel(s)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="sp-field">
                          <span className="muted pr-field-label">
                            {t('settings.profileRules.matchCardKind')}
                          </span>
                          <select
                            className="set-select"
                            value={rule.match.cardKind ?? 'any'}
                            onChange={(e) =>
                              updateRule(index, {
                                match: { cardKind: e.target.value as CardKindOpt },
                              })
                            }
                          >
                            {CARD_KINDS.map((k) => (
                              <option key={k} value={k}>
                                {cardKindLabel(k)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="sp-field">
                          <span className="muted pr-field-label">
                            {t('settings.profileRules.matchLanguage')}
                          </span>
                          <select
                            className="set-select"
                            value={rule.match.language ?? 'any'}
                            onChange={(e) =>
                              updateRule(index, {
                                match: { language: e.target.value as LanguageOpt },
                              })
                            }
                          >
                            {LANGUAGES.map((l) => (
                              <option key={l} value={l}>
                                {languageLabel(l)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="sp-field">
                          <span className="muted pr-field-label">
                            {t('settings.profileRules.matchCategory')}
                          </span>
                          <select
                            className="set-select"
                            value={rule.match.category ?? 'any'}
                            onChange={(e) =>
                              updateRule(index, {
                                match: { category: e.target.value as CategoryOpt },
                              })
                            }
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c} value={c}>
                                {categoryLabel(c)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>

                    <div className="pr-flow-arrow" aria-hidden="true">
                      →
                    </div>

                    <div className="pr-zone pr-zone-dest">
                      <div className="pr-zone-title">{t('settings.profileRules.sendTo')}</div>
                      <label className="sp-field">
                        <span className="muted pr-field-label">
                          {t('settings.profileRules.targetProfile')}
                        </span>
                        <select
                          className="set-select"
                          value={rule.profileId}
                          onChange={(e) => updateRule(index, { profileId: e.target.value })}
                        >
                          {profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                          {rule.profileId && missing && (
                            <option value={rule.profileId}>
                              {t('settings.profileRules.missingProfile', { id: rule.profileId })}
                            </option>
                          )}
                        </select>
                      </label>
                      {!missing && <div className="muted pr-dest-line">{destLine(target)}</div>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* E. Destination summary — see at a glance which profiles receive cards. */}
        {!loading && store.rules.length > 0 && (
          <div className="pr-summary">
            <div className="pr-summary-title muted">{t('settings.profileRules.summary.title')}</div>
            <div className="pr-summary-chips">
              {summary.map((s) => (
                <span key={s.id} className="pr-chip">
                  <strong>
                    {s.profile?.label || t('settings.profileRules.missingProfile', { id: s.id })}
                  </strong>
                  <span className="pr-chip-count">{s.count}</span>
                </span>
              ))}
              <span className="pr-chip pr-chip-default">
                <strong>{active?.label || active?.id || '—'}</strong>
                <span className="pr-chip-count">
                  {t('settings.profileRules.summary.defaultChip')}
                </span>
              </span>
            </div>
          </div>
        )}
      </SettingsCard>
    </>
  );
}
