import { describe, expect, it } from 'vitest';
import { parsePluginManifest } from '../components/scraper/data/pluginManifest';

describe('scraper plugin manifest parser', () => {
  it('normalizes a valid local adapter manifest', () => {
    const plugin = parsePluginManifest(JSON.stringify({
      id: 'local-anime-audit',
      name: ' Local Anime Audit Adapter ',
      version: ' 1.0.0 ',
      publisher: ' Local Tools ',
      permissions: ['network:local.example', 42, ' storage:cache '],
    }), 'adapter.json');

    expect(plugin).toMatchObject({
      id: 'local-anime-audit',
      name: 'Local Anime Audit Adapter',
      version: '1.0.0',
      publisher: 'Local Tools',
      enabled: true,
      compatible: true,
      permissions: ['network:local.example', 'storage:cache'],
    });
  });

  it('uses safe local defaults for optional fields', () => {
    expect(parsePluginManifest('{"id":"adapter-1","name":"Adapter","version":"1"}', 'adapter.json'))
      .toMatchObject({
        publisher: 'Local package',
        updateAvailable: '',
        permissions: [],
        description: 'Locally installed from adapter.json.',
      });
  });

  it('rejects malformed and incomplete manifests', () => {
    expect(() => parsePluginManifest('{"id":"bad id","name":"","version":""}', 'bad.json'))
      .toThrow('Manifest requires a valid id, name, and version.');
    expect(() => parsePluginManifest('{', 'bad.json')).toThrow();
  });
});
