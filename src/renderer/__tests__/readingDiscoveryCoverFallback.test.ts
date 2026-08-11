import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(__dirname, '../components/reading/ReadingUnifiedDiscovery.tsx'),
  'utf8',
);

describe('Reading discovery cover fallback', () => {
  it('paints the title-derived fallback beneath optional provider art', () => {
    expect(source).toContain(
      "import { coverFallbackImage } from '../../utils/coverArt';",
    );
    expect(source).toMatch(
      /className="reading-unified-card-cover"[\s\S]{0,160}backgroundImage: coverFallbackImage\(result\.entry\.work\.title\)/,
    );
    expect(source).toContain('{coverUrl ? <img src={coverUrl} alt="" /> : null}');
    expect(source).not.toContain('<Icon name="novels"');
  });
});
