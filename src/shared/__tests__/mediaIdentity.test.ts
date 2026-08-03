import { describe, expect, it } from 'vitest';
import { normalizeMediaProvidersDocument, type MediaProvidersDocument } from '../mediaProviders';
import {
  mediaDescriptorTitleKeys,
  normalizeMediaTitleKey,
  resolveMediaIdentities,
} from '../mediaIdentity';

/** Build a normalized document from loose descriptors, auto-declaring the providers they name. */
const docOf = (descriptors: Array<Record<string, unknown>>): MediaProvidersDocument => {
  const providerIds = [...new Set(descriptors.map((descriptor) => String(descriptor.providerId ?? 'prov-a')))];
  return normalizeMediaProvidersDocument({
    providers: providerIds.map((id) => ({
      id, name: id, role: 'anime', contentTypes: ['anime', 'movie'], capabilities: { search: true },
    })),
    descriptors: descriptors.map((descriptor, index) => ({
      providerId: 'prov-a', providerItemId: `item-${index}`, title: 'Untitled', contentType: 'anime', ...descriptor,
    })),
  }).value;
};

describe('normalizeMediaTitleKey', () => {
  it('folds case, full-width, diacritics/macrons, and punctuation', () => {
    expect(normalizeMediaTitleKey('Attack on Titan!!')).toBe('attack on titan');
    expect(normalizeMediaTitleKey('  Ｓｈｉｎｇｅｋｉ　no  Kyojin ')).toBe('shingeki no kyojin');
    expect(normalizeMediaTitleKey('Tōkyō Magnitude 8.0')).toBe('tokyo magnitude 8 0');
    expect(normalizeMediaTitleKey('進撃の巨人。')).toBe('進撃の巨人');
  });

  it('returns empty for non-strings and content that reduces to nothing', () => {
    expect(normalizeMediaTitleKey(null)).toBe('');
    expect(normalizeMediaTitleKey(42)).toBe('');
    expect(normalizeMediaTitleKey('!!! --- ???')).toBe('');
  });

  it('collects every title-bearing field into distinct sorted keys', () => {
    const [descriptor] = docOf([{
      title: 'Attack on Titan', japaneseTitle: '進撃の巨人',
      romajiTitle: 'Shingeki no Kyojin', alternativeTitles: ['Attack on Titan', 'AoT'],
    }]).descriptors;
    expect(mediaDescriptorTitleKeys(descriptor)).toEqual(['aot', 'attack on titan', 'shingeki no kyojin', '進撃の巨人']);
  });
});

describe('media identity resolution', () => {
  it('assigns every descriptor to exactly one identity, singletons included', () => {
    const { identities, descriptorIdentityById } = resolveMediaIdentities(docOf([
      { id: 'a', providerId: 'prov-a', title: 'Frieren' },
      { id: 'b', providerId: 'prov-b', title: 'Bocchi the Rock' },
    ]));
    expect(identities).toHaveLength(2);
    expect(identities.every((identity) => identity.size === 1)).toBe(true);
    expect(Object.keys(descriptorIdentityById).sort()).toEqual(['a', 'b']);
  });

  it('groups differently-worded titles that share a normalized key', () => {
    const { identities } = resolveMediaIdentities(docOf([
      { id: 'en', providerId: 'prov-a', title: 'Attack on Titan', alternativeTitles: ['Shingeki no Kyojin'] },
      { id: 'jp', providerId: 'prov-b', title: '進撃の巨人', romajiTitle: 'Shingeki no Kyojin' },
    ]));
    expect(identities).toHaveLength(1);
    expect(identities[0].size).toBe(2);
    expect(identities[0].memberDescriptorIds).toEqual(['en', 'jp']);
    expect(identities[0].providerIds).toEqual(['prov-a', 'prov-b']);
    expect(identities[0].evidence.sharedTitleKeys).toEqual(['shingeki no kyojin']);
  });

  it('groups by a shared external identifier even when titles differ entirely', () => {
    const { identities } = resolveMediaIdentities(docOf([
      { id: 'a', providerId: 'prov-a', title: 'Frieren', identifiers: [{ namespace: 'mal', value: '52991' }] },
      { id: 'b', providerId: 'prov-b', title: 'Sousou no Frieren', identifiers: [{ namespace: 'mal', value: '52991' }] },
    ]));
    expect(identities).toHaveLength(1);
    expect(identities[0].evidence.sharedIdentifiers).toEqual([{ namespace: 'mal', value: '52991' }]);
  });

  it('matches identifiers case-insensitively on their value', () => {
    const { identities } = resolveMediaIdentities(docOf([
      { id: 'a', providerId: 'prov-a', title: 'Alpha', identifiers: [{ namespace: 'imdb', value: 'tt0903747' }] },
      { id: 'b', providerId: 'prov-b', title: 'Beta', identifiers: [{ namespace: 'imdb', value: 'TT0903747' }] },
    ]));
    expect(identities).toHaveLength(1);
  });

  it('links transitively: id-linked A-B plus title-linked B-C form one identity', () => {
    const { identities } = resolveMediaIdentities(docOf([
      { id: 'a', providerId: 'prov-a', title: 'Steins;Gate', identifiers: [{ namespace: 'anilist', value: '9253' }] },
      { id: 'b', providerId: 'prov-b', title: 'Steins Gate', identifiers: [{ namespace: 'anilist', value: '9253' }] },
      { id: 'c', providerId: 'prov-c', title: 'STEINS GATE' },
    ]));
    expect(identities).toHaveLength(1);
    expect(identities[0].memberDescriptorIds).toEqual(['a', 'b', 'c']);
  });

  it('refuses to fuse same-titled descriptors with conflicting years by title alone', () => {
    const { identities } = resolveMediaIdentities(docOf([
      { id: 'old', providerId: 'prov-a', title: 'Bleach', year: 2004 },
      { id: 'new', providerId: 'prov-b', title: 'Bleach', year: 2022 },
    ]));
    expect(identities).toHaveLength(2);
  });

  it('lets a shared identifier override the year guard', () => {
    const { identities } = resolveMediaIdentities(docOf([
      { id: 'old', providerId: 'prov-a', title: 'Bleach', year: 2004, identifiers: [{ namespace: 'mal', value: '269' }] },
      { id: 'new', providerId: 'prov-b', title: 'Bleach', year: 2022, identifiers: [{ namespace: 'mal', value: '269' }] },
    ]));
    expect(identities).toHaveLength(1);
    expect(identities[0].size).toBe(2);
  });

  it('does not let a year-less generic descriptor bridge two conflicting years', () => {
    const { identities } = resolveMediaIdentities(docOf([
      { id: 'yearless', providerId: 'prov-a', title: 'Reboot' },
      { id: 'y2004', providerId: 'prov-b', title: 'Reboot', year: 2004 },
      { id: 'y2022', providerId: 'prov-c', title: 'Reboot', year: 2022 },
    ]));
    const sizes = identities.map((identity) => identity.size).sort();
    expect(sizes).toEqual([1, 2]);
  });

  it('is partition-aware: identical titles of different content types stay separate', () => {
    const doc = docOf([
      { id: 'anime', providerId: 'prov-a', title: 'Your Name', contentType: 'anime' },
      { id: 'movie', providerId: 'prov-b', title: 'Your Name', contentType: 'movie' },
    ]);
    expect(resolveMediaIdentities(doc).identities).toHaveLength(2);
    expect(resolveMediaIdentities(doc, { partitionByContentType: false }).identities).toHaveLength(1);
  });

  it('picks the identifier-richest member as representative', () => {
    const { identities } = resolveMediaIdentities(docOf([
      { id: 'thin', providerId: 'prov-a', title: 'Chihayafuru' },
      { id: 'rich', providerId: 'prov-b', title: 'Chihayafuru', identifiers: [
        { namespace: 'mal', value: '10800' }, { namespace: 'anilist', value: '10800' },
      ] },
    ]));
    expect(identities[0].representativeDescriptorId).toBe('rich');
    expect(identities[0].identifiers).toEqual([
      { namespace: 'anilist', value: '10800' }, { namespace: 'mal', value: '10800' },
    ]);
  });

  it('produces the same identities and IDs regardless of descriptor order', () => {
    const forward = docOf([
      { id: 'a', providerId: 'prov-a', title: 'Frieren', identifiers: [{ namespace: 'mal', value: '52991' }] },
      { id: 'b', providerId: 'prov-b', title: 'Sousou no Frieren', identifiers: [{ namespace: 'mal', value: '52991' }] },
      { id: 'c', providerId: 'prov-c', title: 'Bocchi' },
    ]);
    const reversed: MediaProvidersDocument = { ...forward, descriptors: [...forward.descriptors].reverse() };
    const a = resolveMediaIdentities(forward);
    const b = resolveMediaIdentities(reversed);
    expect(b.identities).toEqual(a.identities);
    expect(b.descriptorIdentityById).toEqual(a.descriptorIdentityById);
  });
});
