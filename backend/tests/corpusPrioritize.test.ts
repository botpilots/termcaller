import { describe, expect, it, beforeEach } from 'vitest';
import { prioritizeCorpusTerms } from '../src/services/corpusPrioritize.js';
import { resetCorpusIndexCache } from '../src/services/corpusLookup.js';

describe('prioritizeCorpusTerms', () => {
  beforeEach(() => {
    resetCorpusIndexCache();
  });

  it('returns rarity per id for batch terms', () => {
    const results = prioritizeCorpusTerms([
      { id: 'a', term: 'm30 nut' },
      { id: 'b', term: 'shackle' },
    ]);

    expect(results).toHaveLength(2);
    const byId = Object.fromEntries(results.map((r) => [r.id, r]));
    expect(byId.a.corpusRarity).toBe(1);
    expect(byId.b.corpusRarity).toBeLessThan(1);
  });

  it('never produces corpus rarity above 1', () => {
    const results = prioritizeCorpusTerms([
      { id: '1', term: 'screw' },
      { id: '2', term: 'zzznobodyhasthisword' },
    ]);

    for (const result of results) {
      expect(result.corpusRarity).toBeLessThanOrEqual(1);
    }
  });
});
