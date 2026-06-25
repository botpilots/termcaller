import { describe, expect, it } from 'vitest';
import {
  combinePhraseRarity,
  combinePhraseTokenStats,
  corpusRarityFromRank,
  tokenizePhraseForCorpus,
} from '../src/utils/phraseCorpusTokens.js';

describe('tokenizePhraseForCorpus', () => {
  it('splits on slashes and hyphens', () => {
    expect(tokenizePhraseForCorpus('master/slave system')).toEqual([
      'master',
      'slave',
      'system',
    ]);
  });
});

describe('combinePhraseTokenStats', () => {
  it('uses min for two tokens and max for three or more', () => {
    const two = [
      { termFreq: 10, docFreq: 3, freqRank: 100 },
      { termFreq: 5, docFreq: 2, freqRank: 200 },
    ];
    const three = [
      { termFreq: 10, docFreq: 3, freqRank: 100 },
      { termFreq: 5, docFreq: 2, freqRank: 200 },
      { termFreq: 100, docFreq: 4, freqRank: 10 },
    ];

    expect(combinePhraseTokenStats(two)).toEqual({ termFreq: 5, docFreq: 2, freqRank: 200 });
    expect(combinePhraseTokenStats(three)).toEqual({ termFreq: 100, docFreq: 4, freqRank: 10 });
  });
});

describe('corpusRarityFromRank', () => {
  it('maps most common token to zero and OOV to one', () => {
    expect(corpusRarityFromRank(0, 100)).toBe(0);
    expect(corpusRarityFromRank(-1, 100)).toBe(1);
    expect(corpusRarityFromRank(50, 101)).toBe(0.5);
  });

  it('clamps rarity when rank exceeds stale vocab size', () => {
    expect(corpusRarityFromRank(12542, 10232)).toBe(1);
  });
});

describe('combinePhraseRarity', () => {
  it('uses max rarity for two tokens and min for three or more', () => {
    expect(combinePhraseRarity([0.1, 0.3], 2)).toBe(0.3);
    expect(combinePhraseRarity([0.1, 0.3, 0.8], 3)).toBe(0.1);
  });
});
