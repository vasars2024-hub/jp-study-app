/**
 * The Library's filter controls. The five most used live as chips on the bar
 * (Genre, Year, My rating, Language, Source) beside the "On this PC" switch;
 * everything else sits in one "More filters" Liquid sheet so the default bar stays
 * calm. Every control writes one `GumFilters`, so any combination works and each
 * active constraint shows up as a removable chip under the bar.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { useT } from '../../../i18n';
import GumPopover from './GumPopover';
import GumIcon from './GumIcons';
import {
  GUM_DATE_PRESETS,
  GUM_EPISODE_BUCKETS,
  GUM_LANGUAGES,
  GUM_RUNTIME_BUCKETS,
  GUM_WATCH_STATES,
  compactFilters,
  toggleFilterValue,
  type GumFacets,
  type GumFilters,
  type GumSource,
} from './gumModel';

type Setter = (next: GumFilters) => void;

function Choice({ pressed, onClick, children, count }: { pressed: boolean; onClick: () => void; children: ReactNode; count?: number }) {
  return (
    <button type="button" className="gum-choice" aria-pressed={pressed} onClick={onClick}>
      {pressed && <GumIcon name="check" size={12} />}
      <span>{children}</span>
      {count !== undefined && <em>{count}</em>}
    </button>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="gum-fgroup">
      <legend>{label}</legend>
      <div className="gum-fgroup__choices">{children}</div>
    </fieldset>
  );
}

/** Any / yes / no for a boolean filter. */
function TriState({ label, value, onChange, yes, no }: { label: string; value: boolean | undefined; onChange: (next: boolean | undefined) => void; yes: string; no: string }) {
  const { t } = useT();
  return (
    <Group label={label}>
      <Choice pressed={value === undefined} onClick={() => onChange(undefined)}>{t('gum.filter.any')}</Choice>
      <Choice pressed={value === true} onClick={() => onChange(true)}>{yes}</Choice>
      <Choice pressed={value === false} onClick={() => onChange(false)}>{no}</Choice>
    </Group>
  );
}

function GenrePicker({ filters, facets, onChange }: { filters: GumFilters; facets: GumFacets; onChange: Setter }) {
  const { t } = useT();
  const [query, setQuery] = useState('');
  const selected = new Set((filters.genres ?? []).map((genre) => genre.toLowerCase()));
  const shown = facets.genres.filter((genre) => !query || genre.name.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="gum-fpanel">
      {facets.genres.length > 12 && (
        <input
          className="gum-input"
          type="search"
          value={query}
          placeholder={t('gum.filter.genreSearch')}
          aria-label={t('gum.filter.genreSearch')}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      <div className="gum-fgroup__choices gum-fgroup__choices--scroll">
        {shown.length === 0 && <span className="gum-muted">{t('gum.filter.noGenres')}</span>}
        {shown.map((genre) => (
          <Choice
            key={genre.name}
            pressed={selected.has(genre.name.toLowerCase())}
            count={genre.count}
            onClick={() => onChange(toggleFilterValue(filters, 'genres', genre.name))}
          >
            {genre.name}
          </Choice>
        ))}
      </div>
    </div>
  );
}

function YearPicker({ filters, facets, onChange }: { filters: GumFilters; facets: GumFacets; onChange: Setter }) {
  const { t } = useT();
  const current = new Date().getFullYear();
  const decades = useMemo(() => {
    const min = facets.years?.min ?? current - 40;
    const out: number[] = [];
    for (let decade = Math.floor(current / 10) * 10; decade >= Math.floor(min / 10) * 10 && out.length < 6; decade -= 10) out.push(decade);
    return out;
  }, [facets.years?.min, current]);
  const setRange = (min?: number, max?: number): void => onChange(compactFilters({ ...filters, yearMin: min, yearMax: max }));
  const number = (value: string): number | undefined => {
    const n = Number.parseInt(value, 10);
    return Number.isFinite(n) && n > 1800 && n < 2200 ? n : undefined;
  };
  return (
    <div className="gum-fpanel">
      <div className="gum-fgroup__choices">
        <Choice pressed={filters.yearMin === undefined && filters.yearMax === undefined} onClick={() => setRange(undefined, undefined)}>{t('gum.filter.any')}</Choice>
        {decades.map((decade) => (
          <Choice
            key={decade}
            pressed={filters.yearMin === decade && filters.yearMax === decade + 9}
            onClick={() => setRange(decade, decade + 9)}
          >
            {t('gum.filter.decade', { decade })}
          </Choice>
        ))}
      </div>
      <div className="gum-range">
        <label>
          <span>{t('gum.filter.from')}</span>
          <input
            className="gum-input"
            type="number"
            inputMode="numeric"
            min={1900}
            max={current + 2}
            defaultValue={filters.yearMin ?? ''}
            key={`min-${filters.yearMin ?? ''}`}
            onBlur={(event) => setRange(number(event.target.value), filters.yearMax)}
          />
        </label>
        <label>
          <span>{t('gum.filter.to')}</span>
          <input
            className="gum-input"
            type="number"
            inputMode="numeric"
            min={1900}
            max={current + 2}
            defaultValue={filters.yearMax ?? ''}
            key={`max-${filters.yearMax ?? ''}`}
            onBlur={(event) => setRange(filters.yearMin, number(event.target.value))}
          />
        </label>
      </div>
    </div>
  );
}

const SCORE_FLOORS = [9, 8, 7, 6, 5];

function ScorePicker({ filters, onChange }: { filters: GumFilters; onChange: Setter }) {
  const { t } = useT();
  const set = (patch: Partial<GumFilters>): void => onChange(compactFilters({ ...filters, scoreMin: undefined, scoreMax: undefined, unrated: undefined, ...patch }));
  const none = !filters.unrated && filters.scoreMin === undefined && filters.scoreMax === undefined;
  return (
    <div className="gum-fpanel">
      <div className="gum-fgroup__choices">
        <Choice pressed={none} onClick={() => set({})}>{t('gum.filter.any')}</Choice>
        {SCORE_FLOORS.map((floor) => (
          <Choice key={floor} pressed={!filters.unrated && filters.scoreMin === floor && filters.scoreMax === undefined} onClick={() => set({ scoreMin: floor })}>
            {t('gum.filter.scoreAtLeast', { n: floor })}
          </Choice>
        ))}
        <Choice pressed={filters.scoreMax === 4 && filters.scoreMin === undefined} onClick={() => set({ scoreMax: 4 })}>{t('gum.filter.scoreBelow', { n: 5 })}</Choice>
        <Choice pressed={filters.unrated === true} onClick={() => set({ unrated: true })}>{t('gum.filter.unrated')}</Choice>
      </div>
    </div>
  );
}

function MultiPicker<T extends string>({ values, selected, labelKey, onToggle, counts }: {
  values: readonly T[];
  selected: readonly T[] | undefined;
  labelKey: (value: T) => string;
  onToggle: (value: T) => void;
  counts?: Partial<Record<T, number>>;
}) {
  const { t } = useT();
  return (
    <div className="gum-fgroup__choices">
      {values.map((value) => (
        <Choice key={value} pressed={(selected ?? []).includes(value)} onClick={() => onToggle(value)} count={counts?.[value]}>
          {t(labelKey(value))}
        </Choice>
      ))}
    </div>
  );
}

export interface GumFilterBarProps {
  filters: GumFilters;
  facets: GumFacets;
  sources: readonly GumSource[];
  sourceCounts: Partial<Record<GumSource, number>>;
  onChange: Setter;
}

/** How many "More filters" constraints are active — shown on its trigger. */
export function moreFilterCount(filters: GumFilters): number {
  const keys: Array<keyof GumFilters> = ['runtime', 'episodes', 'watch', 'subsJa', 'subsEn', 'liked', 'favorite', 'lists', 'added', 'watched', 'providerMin'];
  let count = 0;
  for (const key of keys) {
    const value = filters[key];
    if (Array.isArray(value)) count += value.length;
    else if (value !== undefined) count += 1;
  }
  if (filters.onDisk === false) count += 1;
  return count;
}

export default function GumFilterBar({ filters, facets, sources, sourceCounts, onChange }: GumFilterBarProps) {
  const { t } = useT();
  const count = (n: number | undefined): string => (n ? ` · ${n}` : '');
  const genreCount = filters.genres?.length ?? 0;
  const langCount = filters.language?.length ?? 0;
  const sourceCount = filters.sources?.length ?? 0;
  const yearActive = filters.yearMin !== undefined || filters.yearMax !== undefined;
  const scoreActive = filters.unrated === true || filters.scoreMin !== undefined || filters.scoreMax !== undefined;
  const more = moreFilterCount(filters);
  return (
    <div className="gum-filterbar" role="group" aria-label={t('gum.filter.label')}>
      <GumPopover label={<span>{t('gum.filter.genre')}{count(genreCount)}</span>} active={genreCount > 0} wide>
        {() => <GenrePicker filters={filters} facets={facets} onChange={onChange} />}
      </GumPopover>
      <GumPopover label={<span>{t('gum.filter.year')}</span>} active={yearActive}>
        {() => <YearPicker filters={filters} facets={facets} onChange={onChange} />}
      </GumPopover>
      <GumPopover label={<span>{t('gum.filter.myRating')}</span>} active={scoreActive}>
        {() => <ScorePicker filters={filters} onChange={onChange} />}
      </GumPopover>
      <GumPopover label={<span>{t('gum.filter.language')}{count(langCount)}</span>} active={langCount > 0}>
        {() => (
          <div className="gum-fpanel">
            <MultiPicker
              values={GUM_LANGUAGES}
              selected={filters.language}
              labelKey={(value) => `gum.filter.language.${value}`}
              onToggle={(value) => onChange(toggleFilterValue(filters, 'language', value))}
            />
          </div>
        )}
      </GumPopover>
      <GumPopover label={<span>{t('gum.filter.source')}{count(sourceCount)}</span>} active={sourceCount > 0}>
        {() => (
          <div className="gum-fpanel">
            <MultiPicker
              values={sources}
              selected={filters.sources}
              counts={sourceCounts}
              labelKey={(value) => `gum.filter.source.${value}`}
              onToggle={(value) => onChange(toggleFilterValue(filters, 'sources', value))}
            />
          </div>
        )}
      </GumPopover>
      <label className="gum-switch-chip" data-active={filters.onDisk === true ? 'true' : undefined}>
        <input
          type="checkbox"
          checked={filters.onDisk === true}
          onChange={(event) => onChange(compactFilters({ ...filters, onDisk: event.target.checked ? true : undefined }))}
        />
        <span>{t('gum.filter.onDisk')}</span>
      </label>
      <GumPopover
        className="gum-pop--more"
        label={<span><GumIcon name="sliders" size={13} /> {t('gum.filter.more')}{count(more)}</span>}
        active={more > 0}
        wide
      >
        {() => (
          <div className="gum-fpanel gum-fpanel--sheet">
            <Group label={t('gum.filter.watchState')}>
              <MultiPicker
                values={GUM_WATCH_STATES}
                selected={filters.watch}
                labelKey={(value) => `gum.filter.watch.${value}`}
                onToggle={(value) => onChange(toggleFilterValue(filters, 'watch', value))}
              />
            </Group>
            <TriState
              label={t('gum.filter.downloads')}
              value={filters.onDisk}
              yes={t('gum.filter.onDisk')}
              no={t('gum.filter.notDownloaded')}
              onChange={(value) => onChange(compactFilters({ ...filters, onDisk: value }))}
            />
            <TriState
              label={t('gum.filter.subsJaLabel')}
              value={filters.subsJa}
              yes={t('gum.filter.has')}
              no={t('gum.filter.missing')}
              onChange={(value) => onChange(compactFilters({ ...filters, subsJa: value }))}
            />
            <TriState
              label={t('gum.filter.subsEnLabel')}
              value={filters.subsEn}
              yes={t('gum.filter.has')}
              no={t('gum.filter.missing')}
              onChange={(value) => onChange(compactFilters({ ...filters, subsEn: value }))}
            />
            <Group label={t('gum.filter.runtime')}>
              <MultiPicker
                values={GUM_RUNTIME_BUCKETS}
                selected={filters.runtime}
                labelKey={(value) => `gum.filter.runtime.${value}`}
                onToggle={(value) => onChange(toggleFilterValue(filters, 'runtime', value))}
              />
            </Group>
            <Group label={t('gum.filter.episodes')}>
              <MultiPicker
                values={GUM_EPISODE_BUCKETS}
                selected={filters.episodes}
                labelKey={(value) => `gum.filter.episodes.${value}`}
                onToggle={(value) => onChange(toggleFilterValue(filters, 'episodes', value))}
              />
            </Group>
            <Group label={t('gum.filter.providerRating')}>
              <Choice pressed={filters.providerMin === undefined} onClick={() => onChange(compactFilters({ ...filters, providerMin: undefined }))}>{t('gum.filter.any')}</Choice>
              {[9, 8, 7, 6].map((floor) => (
                <Choice key={floor} pressed={filters.providerMin === floor} onClick={() => onChange(compactFilters({ ...filters, providerMin: floor }))}>
                  {t('gum.filter.scoreAtLeast', { n: floor })}
                </Choice>
              ))}
            </Group>
            <Group label={t('gum.filter.marks')}>
              <Choice pressed={filters.favorite === true} onClick={() => onChange(compactFilters({ ...filters, favorite: filters.favorite ? undefined : true }))}>{t('gum.filter.favorite')}</Choice>
              <Choice pressed={filters.liked === true} onClick={() => onChange(compactFilters({ ...filters, liked: filters.liked ? undefined : true }))}>{t('gum.filter.liked')}</Choice>
            </Group>
            {facets.lists.length > 0 && (
              <Group label={t('gum.filter.lists')}>
                {facets.lists.slice(0, 40).map((list) => (
                  <Choice
                    key={list.name}
                    count={list.count}
                    pressed={(filters.lists ?? []).some((name) => name.toLowerCase() === list.name.toLowerCase())}
                    onClick={() => onChange(toggleFilterValue(filters, 'lists', list.name))}
                  >
                    {list.name}
                  </Choice>
                ))}
              </Group>
            )}
            <Group label={t('gum.filter.added')}>
              <Choice pressed={!filters.added} onClick={() => onChange(compactFilters({ ...filters, added: undefined }))}>{t('gum.filter.any')}</Choice>
              {GUM_DATE_PRESETS.map((preset) => (
                <Choice key={preset} pressed={filters.added === preset} onClick={() => onChange(compactFilters({ ...filters, added: preset }))}>
                  {t(`gum.filter.period.${preset}`)}
                </Choice>
              ))}
            </Group>
            <Group label={t('gum.filter.watched')}>
              <Choice pressed={!filters.watched} onClick={() => onChange(compactFilters({ ...filters, watched: undefined }))}>{t('gum.filter.any')}</Choice>
              {GUM_DATE_PRESETS.map((preset) => (
                <Choice key={preset} pressed={filters.watched === preset} onClick={() => onChange(compactFilters({ ...filters, watched: preset }))}>
                  {t(`gum.filter.period.${preset}`)}
                </Choice>
              ))}
            </Group>
          </div>
        )}
      </GumPopover>
    </div>
  );
}
