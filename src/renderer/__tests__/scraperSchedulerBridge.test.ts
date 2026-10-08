import { describe, expect, it } from 'vitest';
import { createDefaultScraperSettingsDocument } from '../../shared/scraperSettings';
import { entryProfileSettings } from '../scraperSchedulerBridge';

describe('entryProfileSettings (P6 per-entry profile)', () => {
  it('resolves each named profile once, and skips names that are not profiles', () => {
    const document = createDefaultScraperSettingsDocument();
    const [first] = document.profiles;
    expect(first).toBeTruthy();
    const out = entryProfileSettings(document, [
      { profileId: first!.id },
      { profileId: first!.id },
      { profileId: 'no-such-profile' },
      { profileId: '' },
    ]);
    expect(Object.keys(out)).toEqual([first!.id]);
    expect(out[first!.id]?.network).toBeTruthy();
  });
});
