import { describe, expect, it } from 'vitest';
import {
  isDiscoveryBlock,
  isDuplicateMetadataLine,
  isLikelyNavigationList,
  isRecommendationHeading,
  isTagChipContainer,
  normalizeTitleText,
  titlesMatch,
  type BlockProbe,
} from '../readabilityClean';

describe('normalizeTitleText', () => {
  it('strips site suffixes and normalizes case', () => {
    expect(normalizeTitleText('Breaking News | BBC')).toBe('breaking news');
    expect(normalizeTitleText('  Hello   World  ')).toBe('hello world');
  });
});

describe('titlesMatch', () => {
  it('detects duplicate headings', () => {
    expect(titlesMatch('Japan earthquake', 'Japan earthquake')).toBe(true);
    expect(titlesMatch('Japan earthquake: latest', 'Japan earthquake')).toBe(true);
    expect(titlesMatch('Unrelated headline', 'Japan earthquake')).toBe(false);
  });
});

describe('isRecommendationHeading', () => {
  it('flags NHK-style promo headings', () => {
    expect(isRecommendationHeading('注目ワード')).toBe(true);
    expect(isRecommendationHeading('注目ワード一覧')).toBe(true);
    expect(isRecommendationHeading('あわせて読みたい')).toBe(true);
    expect(isRecommendationHeading('深掘りコンテンツ')).toBe(true);
    expect(isRecommendationHeading('新着ニュース')).toBe(true);
    expect(isRecommendationHeading('最新・注目の動画')).toBe(true);
    expect(isRecommendationHeading('Related Articles')).toBe(true);
    expect(isRecommendationHeading('Trending now')).toBe(true);
  });
  it('keeps article subheadings', () => {
    expect(isRecommendationHeading('政府の対応')).toBe(false);
    expect(isRecommendationHeading('Economic outlook for the second quarter')).toBe(false);
  });
});

describe('isDiscoveryBlock', () => {
  it('flags keyword rails', () => {
    const probe: BlockProbe = {
      totalChars: 120,
      linkChars: 95,
      linkCount: 8,
      paragraphCount: 0,
      imageCount: 0,
    };
    expect(isDiscoveryBlock(probe)).toBe(true);
  });
  it('keeps prose-heavy sections', () => {
    const probe: BlockProbe = {
      totalChars: 900,
      linkChars: 80,
      linkCount: 2,
      paragraphCount: 4,
      imageCount: 1,
    };
    expect(isDiscoveryBlock(probe)).toBe(false);
  });
});

describe('isTagChipContainer', () => {
  it('detects short linked chips', () => {
    expect(
      isTagChipContainer({
        totalChars: 60,
        linkChars: 55,
        linkCount: 5,
        paragraphCount: 0,
        imageCount: 0,
      }),
    ).toBe(true);
  });
});

describe('isDuplicateMetadataLine', () => {
  it('removes repeated title and byline lines', () => {
    expect(isDuplicateMetadataLine('Japan earthquake', { title: 'Japan earthquake' })).toBe(true);
    expect(isDuplicateMetadataLine('By Jane Doe', { byline: 'Jane Doe' })).toBe(true);
    expect(isDuplicateMetadataLine('The cabinet announced new measures today.', {})).toBe(false);
  });
});

describe('isLikelyNavigationList', () => {
  it('flags category menus', () => {
    const menu = Array.from({ length: 8 }, (_, i) => ({
      text: `Category ${i}`,
      isLink: true,
    }));
    expect(isLikelyNavigationList(menu)).toBe(true);
  });
  it('keeps article bullet lists', () => {
    const bullets = [
      { text: 'The cabinet approved a stimulus package worth several trillion yen.', isLink: false },
      { text: 'Markets opened higher following the announcement from Tokyo.', isLink: false },
      { text: 'Analysts expect further rate decisions later this quarter.', isLink: false },
    ];
    expect(isLikelyNavigationList(bullets)).toBe(false);
  });
  it('keeps short linked lists with long labels', () => {
    const refs = [
      { text: 'United Nations climate report summary for policymakers', isLink: true },
      { text: 'Cabinet office releases annual economic outlook document', isLink: true },
      { text: 'Ministry of finance statement on monetary policy', isLink: true },
      { text: 'Parliamentary debate transcript from last week', isLink: true },
    ];
    expect(isLikelyNavigationList(refs)).toBe(false);
  });
});