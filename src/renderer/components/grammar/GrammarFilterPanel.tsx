import { useMemo, useState } from 'react';
import {
  CATEGORY_BY_ID,
  GRAMMAR_REGISTERS,
  CEFR_LEVELS,
  HSK_LEVELS,
  JLPT_LEVELS,
  categoriesByGroup,
  isUnofficialLevel,
  levelsForGrammarLang,
  type GrammarLevel,
  type NormalizedGrammarPoint,
} from '../../data/grammar';
import { FUNCTIONS_BY_CATEGORY } from '../../data/grammar/taxonomy';
import { GRAMMAR_FUNCTION_LABELS } from '../../data/grammar/functions';
import {
  DEFAULT_PRACTICE_FILTERS,
  categoryCounts,
  familiarityFilterCounts,
  functionCounts,
  listFilterCounts,
  GRAMMAR_LIST_IDS,
  type FilterablePoint,
  type PracticeFilters,
} from '../../data/grammar/practiceFilters';
import type { GxLevel } from '../../grammarFamiliarity';
import { useT } from '../../i18n';

// Sourced from types.ts rather than redeclared here — a local copy could drift
// from the GrammarRegister union without failing to compile.
const REGISTERS = GRAMMAR_REGISTERS;
const FAMILIARITY_BANDS: GxLevel[] = [0, 1, 2, 3];
const FAMILIARITY_KEYS = ['new', 'learning', 'familiar', 'known'] as const;

/**
 * Filter sidebar for the grammar library.
 *
 * Replaces a flat column of 185 machine-translated checkboxes, 96 of which
 * matched zero records. Categories are now grouped, counted against the other
 * active filters, and collapsed by default so the panel is scannable.
 */
export default function GrammarFilterPanel({
  filters,
  corpus,
  onChange,
}: {
  filters: PracticeFilters;
  corpus: readonly (NormalizedGrammarPoint | FilterablePoint)[];
  onChange: (next: PracticeFilters) => void;
}) {
  const { t, lang: uiLang } = useT();
  const [catSearch, setCatSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [openCats, setOpenCats] = useState<Set<string>>(() => new Set());
  const [selectedOnly, setSelectedOnly] = useState(false);

  function patch(partial: Partial<PracticeFilters>) {
    onChange({ ...filters, ...partial });
  }

  function toggleIn<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  const levelOptions: GrammarLevel[] = useMemo(() => {
    if (filters.lang !== 'all') return levelsForGrammarLang(filters.lang);
    return [...JLPT_LEVELS, ...HSK_LEVELS, ...CEFR_LEVELS];
  }, [filters.lang]);

  /* Same options, split by framework so the two scales stay visually distinct. */
  const levelBands: Array<{ labelKey: string; levels: GrammarLevel[] }> = useMemo(() => {
    if (filters.lang === 'zh')
      return [{ labelKey: 'grammar.filter.levels.hsk', levels: [...HSK_LEVELS] }];
    if (filters.lang === 'ja')
      return [{ labelKey: 'grammar.filter.levels.jlpt', levels: [...JLPT_LEVELS] }];
    if (filters.lang === 'ru')
      return [{ labelKey: 'grammar.filter.levels.cefr', levels: [...CEFR_LEVELS] }];
    return [
      { labelKey: 'grammar.filter.levels.jlpt', levels: [...JLPT_LEVELS] },
      { labelKey: 'grammar.filter.levels.hsk', levels: [...HSK_LEVELS] },
      { labelKey: 'grammar.filter.levels.cefr', levels: [...CEFR_LEVELS] },
    ];
  }, [filters.lang]);

  /* Counts exclude the category filter itself, so a chip's number is what
   * clicking it will actually yield rather than its global total. */
  const counts = useMemo(() => categoryCounts(corpus, filters), [corpus, filters]);

  /* Same "count against the other active filters" rule as the categories, so a
   * band's number is what ticking it yields rather than its corpus-wide total. */
  const famCounts = useMemo(() => familiarityFilterCounts(corpus, filters), [corpus, filters]);

  const fnCounts = useMemo(() => functionCounts(corpus, filters), [corpus, filters]);

  /* Favourites / study queue — the learner's own lists, counted the same way. */
  const listCounts = useMemo(() => listFilterCounts(corpus, filters), [corpus, filters]);

  const groups = useMemo(() => {
    const langFilter = filters.lang === 'all' ? undefined : filters.lang;
    const q = catSearch.trim().toLowerCase();
    return categoriesByGroup(langFilter)
      .map((g) => ({
        group: g.group,
        categories: g.categories.filter((c) => {
          if (selectedOnly && !filters.categories.includes(c.id)) return false;
          if (!q) return true;
          const label = t(c.labelKey).toLowerCase();
          return label.includes(q) || c.id.includes(q);
        }),
      }))
      .filter((g) => g.categories.length > 0);
    // `t` is identity-stable by design, so the catalog language must be an
    // explicit dependency (see CLAUDE.md, i18n workflow).
  }, [filters.lang, filters.categories, catSearch, selectedOnly, t, uiLang]);

  const activeChips = useMemo(() => {
    const chips: Array<{ key: string; label: string; clear: () => void }> = [];
    if (filters.lang !== 'all') {
      chips.push({
        key: 'lang',
        label: t(`grammar.practice.lang.${filters.lang}`),
        clear: () => patch({ lang: 'all', levels: [] }),
      });
    }
    for (const lv of filters.levels) {
      chips.push({
        key: `lv-${lv}`,
        label: lv,
        clear: () => patch({ levels: filters.levels.filter((l) => l !== lv) }),
      });
    }
    for (const c of filters.categories) {
      chips.push({
        key: `cat-${c}`,
        label: t(CATEGORY_BY_ID.get(c)?.labelKey ?? c),
        clear: () => patch({ categories: filters.categories.filter((x) => x !== c) }),
      });
    }
    for (const f of filters.functions) {
      chips.push({
        key: `fn-${f}`,
        label: GRAMMAR_FUNCTION_LABELS[f] ?? f,
        clear: () => patch({ functions: filters.functions.filter((x) => x !== f) }),
      });
    }
    for (const c of filters.excludeCategories) {
      chips.push({
        key: `ex-${c}`,
        label: `− ${t(CATEGORY_BY_ID.get(c)?.labelKey ?? c)}`,
        clear: () => patch({ excludeCategories: filters.excludeCategories.filter((x) => x !== c) }),
      });
    }
    for (const r of filters.registers) {
      chips.push({
        key: `reg-${r}`,
        label: t(`grammar.register.${r}`),
        clear: () => patch({ registers: filters.registers.filter((x) => x !== r) }),
      });
    }
    for (const l of filters.lists) {
      chips.push({
        key: `list-${l}`,
        label: t(`grammar.lists.${l}`),
        clear: () => patch({ lists: filters.lists.filter((x) => x !== l) }),
      });
    }
    for (const b of filters.familiarity) {
      chips.push({
        key: `fam-${b}`,
        label: t(`grammar.familiarity.${FAMILIARITY_KEYS[b]}`),
        clear: () => patch({ familiarity: filters.familiarity.filter((x) => x !== b) }),
      });
    }
    if (filters.studyReadyOnly) {
      chips.push({
        key: 'ready',
        label: t('grammar.filter.studyReady'),
        clear: () => patch({ studyReadyOnly: false }),
      });
    }
    if (filters.requireExamples) {
      chips.push({
        key: 'ex',
        label: t('grammar.filter.hasExamples'),
        clear: () => patch({ requireExamples: false }),
      });
    }
    if (filters.query.trim()) {
      chips.push({
        key: 'q',
        label: `"${filters.query.trim()}"`,
        clear: () => patch({ query: '' }),
      });
    }
    return chips;
  }, [filters, t, uiLang]);

  return (
    <aside className="gx-filters" aria-label={t('grammar.practice.filters')}>
      {/* The combination rule is stated rather than left to be inferred from
          surprising result counts. */}
      <p className="gx-filters-semantics muted">{t('grammar.filter.semantics')}</p>

      {activeChips.length > 0 && (
        <div className="gx-filters-active">
          <div className="gx-filters-active-head">
            <span>{t('grammar.filter.active', { count: activeChips.length })}</span>
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => onChange({ ...DEFAULT_PRACTICE_FILTERS })}
            >
              {t('grammar.filter.clearAll')}
            </button>
          </div>
          <div className="gx-filters-chips">
            {activeChips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className="gx-filter-chip"
                onClick={chip.clear}
                aria-label={t('grammar.filter.removeFilter', { name: chip.label })}
              >
                {chip.label}
                <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <label className="gx-filters-section">
        <span className="gx-filters-label">{t('grammar.practice.lang')}</span>
        <select
          value={filters.lang}
          onChange={(e) =>
            patch({
              lang: e.target.value as PracticeFilters['lang'],
              // Levels belong to one framework; carrying JLPT levels into a
              // Chinese query would silently return nothing.
              levels: [],
              categories: [],
            })
          }
        >
          <option value="all">{t('grammar.filter.all')}</option>
          <option value="ja">{t('grammar.practice.lang.ja')}</option>
          <option value="zh">{t('grammar.practice.lang.zh')}</option>
          <option value="ru">{t('grammar.practice.lang.ru')}</option>
        </select>
      </label>

      {/*
       * Levels are grouped by framework rather than listed flat. JLPT and HSK
       * are separate scales that happen to share a filter — a single row of
       * N5…N1 HSK1…HSK10 reads as one fifteen-step ladder, which is exactly
       * what it is not. With a language selected only that framework's band
       * shows, so the grouping cost is zero in the common case.
       */}
      <fieldset className="gx-filters-section">
        <legend className="gx-filters-label">
          {filters.lang === 'zh'
            ? t('grammar.filter.levels.hsk')
            : filters.lang === 'ja'
              ? t('grammar.filter.levels.jlpt')
              : filters.lang === 'ru'
                ? t('grammar.filter.levels.cefr')
                : t('grammar.practice.levels')}
        </legend>
        {levelBands.map((band) => (
          <div key={band.labelKey} className="gx-filters-levelband">
            {levelBands.length > 1 && (
              <span className="gx-filters-sublabel">{t(band.labelKey)}</span>
            )}
            <div className="gx-filters-chiprow">
              {band.levels.map((lv) => (
                <label
                  key={lv}
                  className={`gx-chip${filters.levels.includes(lv) ? ' is-on' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={filters.levels.includes(lv)}
                    onChange={() => patch({ levels: toggleIn(filters.levels, lv) })}
                  />
                  {lv}
                  {isUnofficialLevel(lv) && (
                    <abbr className="gx-chip-note" title={t('grammar.filter.unofficialLevel')}>
                      *
                    </abbr>
                  )}
                </label>
              ))}
            </div>
          </div>
        ))}
        {filters.lang !== 'ja' && levelOptions.some(isUnofficialLevel) && (
          <p className="muted gx-filters-hint">{t('grammar.filter.unofficialLevel')}</p>
        )}
      </fieldset>

      <fieldset className="gx-filters-section">
        <legend className="gx-filters-label">{t('grammar.practice.register')}</legend>
        <div className="gx-filters-chiprow">
          {REGISTERS.map((r) => (
            <label
              key={r}
              className={`gx-chip${filters.registers.includes(r) ? ' is-on' : ''}`}
            >
              <input
                type="checkbox"
                checked={filters.registers.includes(r)}
                onChange={() => patch({ registers: toggleIn(filters.registers, r) })}
              />
              {t(`grammar.register.${r}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="gx-filters-section">
        <legend className="gx-filters-label">{t('grammar.lists.legend')}</legend>
        <div className="gx-filters-chiprow">
          {GRAMMAR_LIST_IDS.map((l) => {
            const n = listCounts[l] || 0;
            const checked = filters.lists.includes(l);
            return (
              <label
                key={l}
                className={`gx-chip${checked ? ' is-on' : ''}${n === 0 && !checked ? ' is-empty' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={n === 0 && !checked}
                  onChange={() => patch({ lists: toggleIn(filters.lists, l) })}
                />
                {t(`grammar.lists.${l}`)}
                <span className="muted gx-filters-cat-count">{n}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="gx-filters-section">
        <legend className="gx-filters-label">{t('grammar.familiarity.legend')}</legend>
        <div className="gx-filters-chiprow">
          {FAMILIARITY_BANDS.map((b) => {
            const n = famCounts[b] || 0;
            const checked = filters.familiarity.includes(b);
            return (
              <label
                key={b}
                className={`gx-chip gx-fam-chip gx-fam-${b}${checked ? ' is-on' : ''}${n === 0 && !checked ? ' is-empty' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={n === 0 && !checked}
                  onChange={() => patch({ familiarity: toggleIn(filters.familiarity, b) })}
                />
                {t(`grammar.familiarity.${FAMILIARITY_KEYS[b]}`)}
                <span className="muted gx-filters-cat-count">{n}</span>
              </label>
            );
          })}
        </div>
        <p className="muted gx-filters-hint">{t('grammar.familiarity.hint')}</p>
      </fieldset>

      <fieldset className="gx-filters-section">
        <legend className="gx-filters-label">{t('grammar.filter.quality')}</legend>
        <div className="gx-filters-checks">
          <label className="gx-filters-check">
            <input
              type="checkbox"
              checked={filters.verifiedTagsOnly}
              onChange={(e) => patch({ verifiedTagsOnly: e.target.checked })}
            />
            <span>{t('grammar.filter.verifiedOnly')}</span>
          </label>
          <p className="muted gx-filters-hint">{t('grammar.filter.verifiedOnly.desc')}</p>
          <label className="gx-filters-check">
            <input
              type="checkbox"
              checked={filters.studyReadyOnly}
              onChange={(e) => patch({ studyReadyOnly: e.target.checked })}
            />
            <span>{t('grammar.filter.studyReady')}</span>
          </label>
          <label className="gx-filters-check">
            <input
              type="checkbox"
              checked={filters.requireExamples}
              onChange={(e) => patch({ requireExamples: e.target.checked })}
            />
            <span>{t('grammar.filter.hasExamples')}</span>
          </label>
        </div>
      </fieldset>

      <label className="gx-filters-section">
        <span className="gx-filters-label">{t('grammar.practice.search')}</span>
        <input
          type="search"
          value={filters.query}
          onChange={(e) => patch({ query: e.target.value })}
          placeholder={t('grammar.practice.searchPlaceholder')}
        />
      </label>

      <div className="gx-filters-section gx-filters-categories">
        <div className="gx-filters-cat-head">
          <span className="gx-filters-label">{t('grammar.filter.categories')}</span>
          {filters.categories.length > 0 && (
            <button
              type="button"
              className="btn ghost sm"
              onClick={() => patch({ categories: [] })}
            >
              {t('grammar.filter.reset')}
            </button>
          )}
        </div>
        <input
          type="search"
          value={catSearch}
          onChange={(e) => setCatSearch(e.target.value)}
          placeholder={t('grammar.filter.categorySearch')}
        />
        <label className="gx-filters-check">
          <input
            type="checkbox"
            checked={selectedOnly}
            onChange={(e) => setSelectedOnly(e.target.checked)}
          />
          <span>{t('grammar.filter.selectedOnly')}</span>
        </label>

        <div className="gx-filters-groups">
          {groups.length === 0 && (
            <p className="muted gx-filters-hint">{t('grammar.filter.noCategories')}</p>
          )}
          {groups.map(({ group, categories }) => {
            const open = openGroups.has(group) || !!catSearch.trim() || selectedOnly;
            const groupTotal = categories.reduce((n, c) => n + (counts[c.id] || 0), 0);
            const activeInGroup = categories.filter((c) =>
              filters.categories.includes(c.id),
            ).length;
            return (
              <div key={group} className={`gx-filters-group${open ? ' is-open' : ''}`}>
                <button
                  type="button"
                  className="gx-filters-group-head"
                  aria-expanded={open}
                  onClick={() =>
                    setOpenGroups((prev) => {
                      const next = new Set(prev);
                      if (next.has(group)) next.delete(group);
                      else next.add(group);
                      return next;
                    })
                  }
                >
                  <span className="gx-filters-chevron" aria-hidden="true" />
                  <span className="gx-filters-group-name">{t(`grammar.catgroup.${group}`)}</span>
                  {activeInGroup > 0 && <span className="gx-filters-badge">{activeInGroup}</span>}
                  <span className="muted gx-filters-group-count">{groupTotal}</span>
                </button>
                {open && (
                  <div className="gx-filters-group-body">
                    {categories.map((c) => {
                      const n = counts[c.id] || 0;
                      const checked = filters.categories.includes(c.id);
                      const fns = (FUNCTIONS_BY_CATEGORY.get(c.id) ?? []).filter(
                        (f) => (fnCounts[f] || 0) > 0 || filters.functions.includes(f),
                      );
                      const subOpen = openCats.has(c.id);
                      return (
                        <div key={c.id} className="gx-filters-cat">
                          <label
                            className={`gx-filters-check${n === 0 && !checked ? ' is-empty' : ''}`}
                            title={t(c.descKey)}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={n === 0 && !checked}
                              onChange={() =>
                                patch({ categories: toggleIn(filters.categories, c.id) })
                              }
                            />
                            <span className="gx-filters-cat-label">{t(c.labelKey)}</span>
                            {fns.length > 1 && (
                              <button
                                type="button"
                                className={`gx-filters-sub-toggle${subOpen ? ' is-open' : ''}`}
                                aria-expanded={subOpen}
                                aria-label={t('grammar.filter.refine')}
                                title={t('grammar.filter.refine')}
                                onClick={(e) => {
                                  // The row is a <label>; without this the click
                                  // would toggle the category checkbox instead.
                                  e.preventDefault();
                                  setOpenCats((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(c.id)) next.delete(c.id);
                                    else next.add(c.id);
                                    return next;
                                  });
                                }}
                              >
                                {fns.length}
                              </button>
                            )}
                            <span className="muted gx-filters-cat-count">{n}</span>
                          </label>
                          {subOpen && (
                            <div className="gx-filters-subs">
                              {fns.map((f) => {
                                const fn = fnCounts[f] || 0;
                                const on = filters.functions.includes(f);
                                return (
                                  <label key={f} className="gx-filters-check gx-filters-sub">
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={() =>
                                        patch({ functions: toggleIn(filters.functions, f) })
                                      }
                                    />
                                    <span className="gx-filters-cat-label">
                                      {GRAMMAR_FUNCTION_LABELS[f] ?? f}
                                    </span>
                                    <span className="muted gx-filters-cat-count">{fn}</span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
