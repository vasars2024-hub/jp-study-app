// @vitest-environment node
//
// The pure half of MAL derivative discovery: what `related_anime` parses to,
// and which of its edges are worth another request.
//
// No network, no clock, no Electron — same contract as the module under test.
import { describe, expect, it } from 'vitest';
import {
  MAL_DERIVATIVE_RELATIONS,
  MAL_RELATION_TYPES,
  isMalRelationType,
  nextRelationFrontier,
  parseMalAnimeRelations,
} from '../malSync';

/** A trimmed `/anime/{id}?fields=id,title,main_picture,related_anime` body. */
function detail(over: Record<string, unknown> = {}): unknown {
  return {
    id: 1,
    title: 'Root Show',
    related_anime: [
      {
        node: { id: 2, title: 'Root Show 2', main_picture: { medium: 'm.jpg', large: 'l.jpg' } },
        relation_type: 'sequel',
        relation_type_formatted: 'Sequel',
      },
      {
        node: { id: 3, title: 'Root Show: Recap' },
        relation_type: 'summary',
        relation_type_formatted: 'Summary',
      },
      {
        node: { id: 4, title: 'Some Other Franchise' },
        relation_type: 'character',
        relation_type_formatted: 'Character',
      },
    ],
    ...over,
  };
}

describe('parseMalAnimeRelations', () => {
  it('keeps the relation type and MALs own label for every edge', () => {
    const parsed = parseMalAnimeRelations(detail());

    expect(parsed.animeId).toBe(1);
    expect(parsed.title).toBe('Root Show');
    expect(parsed.related.map((edge) => [edge.animeId, edge.relation, edge.relationLabel])).toEqual([
      [2, 'sequel', 'Sequel'],
      [3, 'summary', 'Summary'],
      [4, 'character', 'Character'],
    ]);
  });

  it('prefers the large poster and falls back to the medium one', () => {
    const parsed = parseMalAnimeRelations(detail());
    expect(parsed.related[0].posterUrl).toBe('l.jpg');
    expect(parsed.related[1].posterUrl).toBeUndefined();
  });

  it('falls back to the raw relation when MAL sends no formatted label', () => {
    const parsed = parseMalAnimeRelations({
      id: 1,
      related_anime: [{ node: { id: 2 }, relation_type: 'spin_off' }],
    });
    expect(parsed.related[0].relationLabel).toBe('spin_off');
  });

  it('drops an edge with no usable id rather than failing the whole read', () => {
    const parsed = parseMalAnimeRelations({
      id: 1,
      related_anime: [
        { node: { title: 'no id' }, relation_type: 'sequel' },
        { node: { id: 9 }, relation_type: 'sequel', relation_type_formatted: 'Sequel' },
      ],
    });
    expect(parsed.related.map((edge) => edge.animeId)).toEqual([9]);
  });

  it('drops an edge whose relation word MAL has not published, keeping the rest', () => {
    const parsed = parseMalAnimeRelations({
      id: 1,
      related_anime: [
        { node: { id: 8 }, relation_type: 'brand_new_relation_word' },
        { node: { id: 9 }, relation_type: 'prequel' },
      ],
    });
    expect(parsed.related.map((edge) => edge.animeId)).toEqual([9]);
  });

  it('survives a payload with no related_anime at all', () => {
    const parsed = parseMalAnimeRelations({ id: 5, title: 'Lonely' });
    expect(parsed).toEqual({ animeId: 5, title: 'Lonely', related: [] });
  });

  it('reports a payload with no id as NaN rather than inventing entry 0', () => {
    // Entry 0 does not exist on MAL, but 0 is falsy and a walk that treated it
    // as an id would happily request `/anime/0` on the user's quota.
    expect(parseMalAnimeRelations({ title: 'x' }).animeId).toBeNaN();
  });
});

describe('the derivative relation set', () => {
  it('excludes exactly the two loose relations, and nothing else', () => {
    expect(MAL_RELATION_TYPES.filter((r) => !MAL_DERIVATIVE_RELATIONS.includes(r))).toEqual([
      'character',
      'other',
    ]);
  });

  it('recognizes every published relation word and nothing else', () => {
    for (const relation of MAL_RELATION_TYPES) expect(isMalRelationType(relation)).toBe(true);
    expect(isMalRelationType('Sequel')).toBe(false);
    expect(isMalRelationType(undefined)).toBe(false);
  });
});

describe('nextRelationFrontier', () => {
  const node = parseMalAnimeRelations(detail());

  it('follows structural relations and refuses the loose ones', () => {
    const frontier = nextRelationFrontier(node, new Set());
    expect(frontier.map((edge) => edge.animeId)).toEqual([2, 3]);
  });

  it('never re-offers a title already seen — this is what ends the sequel/prequel cycle', () => {
    const frontier = nextRelationFrontier(node, new Set([2]));
    expect(frontier.map((edge) => edge.animeId)).toEqual([3]);
  });

  it('offers a duplicated edge once, even when MAL lists it twice', () => {
    const duplicated = parseMalAnimeRelations({
      id: 1,
      related_anime: [
        { node: { id: 2 }, relation_type: 'sequel' },
        { node: { id: 2 }, relation_type: 'side_story' },
      ],
    });
    expect(nextRelationFrontier(duplicated, new Set())).toHaveLength(1);
  });

  it('honours an explicit relation set narrower than the default', () => {
    const frontier = nextRelationFrontier(node, new Set(), { relations: ['sequel'] });
    expect(frontier.map((edge) => edge.animeId)).toEqual([2]);
  });

  it('follows a loose relation when the caller explicitly asks for it', () => {
    const frontier = nextRelationFrontier(node, new Set(), { relations: ['character'] });
    expect(frontier.map((edge) => edge.animeId)).toEqual([4]);
  });
});
