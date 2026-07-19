import { useMemo, useState } from 'react';
import {
  CATEGORY_BY_ID,
  HSK_LEVELS,
  JLPT_LEVELS,
  categoriesByGroup,
  isUnofficialLevel,
  type GrammarLevel,
  type GrammarRegister,
  type NormalizedGrammarPoint,
} from '../../data/grammar';
import {
  DEFAULT_PRACTICE_FILTERS,
  categoryCounts,
  type PracticeFilters,
} from '../../data/grammar/practiceFilters';
import { useT } from '../../i18n';

const REGISTERS: GrammarRegister[] = ['neutral', 'casual', 'business', 'literary'];

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
  corpus: readonly NormalizedGrammarPoint[];
  onChange: (next: PracticeFilters) => void;
}) {
  const { t, lang: uiLang } = useT();
  const [catSearch, setCatSearch] = useState('');
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [selectedOnly, setSelectedOnly] = useState(false);

  function patch(partial: Partial<PracticeFilters>) {
    onChange({ ...filters, ...partial });
  }

  function toggleIn<T>(list: T[], value: T): T[] {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }

  const levelOptions: GrammarLevel[] = useMemo(() => {
    if (filters.lang === 'zh') return [...HSK_LEVELS];
    if (filters.lang === 'ja') return [...JLPT_LEVELS];
    return [...JLPT_LEVELS, ...HSK_LEVELS];
  }, [filters.lang]);

  /* Counts exclude the category filter itself, so a chip's number is what
   * clicking it will actually yield rather than its global total. */
  const counts = useMemo(() => categoryCounts(corpus, filters), [corpus, filters]);

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

      <label className="gx-filters-field">
        <span>{t('grammar.practice.lang')}</span>
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
        </select>
      </label>

      <fieldset className="gx-filters-field">
        <legend>
          {filters.lang === 'zh'
            ? t('grammar.filter.levels.hsk')
            : filters.lang === 'ja'
              ? t('grammar.filter.levels.jlpt')
              : t('grammar.practice.levels')}
        </legend>
        <div className="gx-filters-chiprow">
          {levelOptions.map((lv) => (
            <label key={lv} className="gx-chip">
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
        {filters.lang !== 'ja' && levelOptions.some(isUnofficialLevel) && (
          <p className="muted gx-filters-hint">{t('grammar.filter.unofficialLevel')}</p>
        )}
      </fieldset>

      <fieldset className="gx-filters-field">
        <legend>{t('grammar.practice.register')}</legend>
        <div className="gx-filters-chiprow">
          {REGISTERS.map((r) => (
            <label key={r} className="gx-chip">
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

      <fieldset className="gx-filters-field">
        <legend>{t('grammar.filter.quality')}</legend>
        <label className="gx-chip gx-chip-block">
          <input
            type="checkbox"
            checked={filters.verifiedTagsOnly}
            onChange={(e) => patch({ verifiedTagsOnly: e.target.checked })}
          />
          {t('grammar.filter.verifiedOnly')}
        </label>
        <p className="muted gx-filters-hint">{t('grammar.filter.verifiedOnly.desc')}</p>
        <label className="gx-chip gx-chip-block">
          <input
            type="checkbox"
            checked={filters.studyReadyOnly}
            onChange={(e) => patch({ studyReadyOnly: e.target.checked })}
          />
          {t('grammar.filter.studyReady')}
        </label>
        <label className="gx-chip gx-chip-block">
          <input
            type="checkbox"
            checked={filters.requireExamples}
            onChange={(e) => patch({ requireExamples: e.target.checked })}
          />
          {t('grammar.filter.hasExamples')}
        </label>
      </fieldset>

      <label className="gx-filters-field">
        <span>{t('grammar.practice.search')}</span>
        <input
          type="search"
          value={filters.query}
          onChange={(e) => patch({ query: e.target.value })}
          placeholder={t('grammar.practice.searchPlaceholder')}
        />
      </label>

      <div className="gx-filters-field">
        <div className="gx-filters-cat-head">
          <span>{t('grammar.filter.categories')}</span>
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
        <label className="gx-chip gx-chip-block">
          <input
            type="checkbox"
            checked={selectedOnly}
            onChange={(e) => setSelectedOnly(e.target.checked)}
          />
          {t('grammar.filter.selectedOnly')}
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
              <div key={group} className="gx-filters-group">
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
                  <span aria-hidden="true">{open ? '▾' : '▸'}</span>
                  <span className="gx-filters-group-name">{t(`grammar.catgroup.${group}`)}</span>
                  {activeInGroup > 0 && <span className="gx-filters-badge">{activeInGroup}</span>}
                  <span className="muted gx-filters-group-count">{groupTotal}</span>
                </button>
                {open && (
                  <div className="gx-filters-group-body">
                    {categories.map((c) => {
                      const n = counts[c.id] || 0;
                      const checked = filters.categories.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className={`gx-chip gx-chip-block${n === 0 && !checked ? ' is-empty' : ''}`}
                          title={t(c.descKey)}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={n === 0 && !checked}
                            onChange={() => patch({ categories: toggleIn(filters.categories, c.id) })}
                          />
                          <span className="gx-filters-cat-label">{t(c.labelKey)}</span>
                          <span className="muted gx-filters-cat-count">{n}</span>
                        </label>
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
