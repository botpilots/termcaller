import { describe, expect, it, beforeEach } from 'vitest';
import {
  getCorpusTermsMap,
  resolveCorpusStats,
  resetCorpusIndexCache,
} from '../src/services/corpusLookup.js';
import { corpusRarityFromRank } from '../src/utils/phraseCorpusTokens.js';

describe('getCorpusTermsMap', () => {
  beforeEach(() => {
    resetCorpusIndexCache();
  });

  it('keeps vocabSize aligned with highest term rank', () => {
    const map = getCorpusTermsMap();
    const maxRank = Math.max(...Object.values(map.terms).map((t) => t.r));

    expect(map.vocabSize).toBe(maxRank + 1);
    expect(map.vocabSize).toBe(Object.keys(map.terms).length);
  });

  it('never produces corpus rarity above 1 for indexed terms', () => {
    const map = getCorpusTermsMap();
    for (const [term, stats] of Object.entries(map.terms)) {
      const rarity = corpusRarityFromRank(stats.r, map.vocabSize);
      expect(rarity, term).toBeLessThanOrEqual(1);
    }
  });
});

describe('resolveCorpusStats rarity ordering', () => {
  beforeEach(() => {
    resetCorpusIndexCache();
  });

  it('ranks OOV phrase tokens above rare single-word corpus hits', () => {
    const m30Nut = resolveCorpusStats('m30 nut');
    const shackle = resolveCorpusStats('shackle');

    expect(m30Nut.corpusRarity).toBe(1);
    expect(shackle.corpusRarity).toBeLessThan(1);
    expect(m30Nut.corpusRarity).toBeGreaterThan(shackle.corpusRarity);
  });
});
