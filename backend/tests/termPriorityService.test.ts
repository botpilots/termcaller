import { describe, expect, it, beforeEach } from 'vitest';
import {
  computeKeywordPriority,
  rankKeywords,
} from '../src/services/termPriorityService.js';
import { resetCorpusIndexCache } from '../src/services/corpusLookup.js';

describe('termPriorityService', () => {
  beforeEach(() => {
    resetCorpusIndexCache();
  });

  it('ranks OOV terms above in-corpus generics at equal project frequency', () => {
    const ranked = rankKeywords([
      { id: '1', sourceTerm: 'screw', figureCount: 4 },
      { id: '2', sourceTerm: 'zzznobodyhasthisword', figureCount: 4 },
    ]);

    const screw = ranked.find((k) => k.sourceTerm === 'screw')!;
    const oov = ranked.find((k) => k.sourceTerm === 'zzznobodyhasthisword')!;

    expect(oov.priority.inCorpus).toBe(false);
    expect(screw.priority.inCorpus).toBe(true);
    expect(oov.priority.corpusRarity).toBe(1);
    expect(screw.priority.corpusRarity).toBeLessThan(0.05);
    expect(oov.priority.rank).toBeLessThan(screw.priority.rank);
  });

  it('ranks higher project frequency above equal corpus rarity', () => {
    const ranked = rankKeywords([
      { id: '1', sourceTerm: 'screw', figureCount: 4 },
      { id: '2', sourceTerm: 'screw', figureCount: 20 },
    ]);

    expect(ranked[0].figureCount).toBe(20);
    expect(ranked[0].priority.score).toBeGreaterThan(ranked[1].priority.score);
  });

  it('ranks slave cylinder above master cylinder at equal project frequency', () => {
    const ranked = rankKeywords([
      { id: '1', sourceTerm: 'master cylinder', figureCount: 4 },
      { id: '2', sourceTerm: 'slave cylinder', figureCount: 4 },
    ]);

    const master = ranked.find((k) => k.sourceTerm === 'master cylinder')!;
    const slave = ranked.find((k) => k.sourceTerm === 'slave cylinder')!;

    expect(slave.priority.corpusRarity).toBeGreaterThan(master.priority.corpusRarity);
    expect(slave.priority.rank).toBeLessThan(master.priority.rank);
  });

  it('deprioritizes head-of-distribution generics like position and terminal', () => {
    const position = computeKeywordPriority('position', 10);
    const terminal = computeKeywordPriority('terminal', 10);
    const biodrill = computeKeywordPriority('biodrill', 10);

    expect(position.score).toBeLessThan(biodrill.score);
    expect(terminal.score).toBeLessThan(biodrill.score);
    expect(position.score).toBeLessThan(terminal.score);
  });

  it('returns zero score for zero figures', () => {
    const priority = computeKeywordPriority('bolt', 0);
    expect(priority.score).toBe(0);
  });

  it('weights figure count more strongly than log1p would at equal rarity', () => {
    const low = computeKeywordPriority('screw', 2);
    const high = computeKeywordPriority('screw', 12);
    const logLow = Math.log1p(2) * low.corpusRarity;
    const logHigh = Math.log1p(12) * high.corpusRarity;

    const newRatio = high.score / low.score;
    const oldRatio = logHigh / logLow;
    expect(newRatio).toBeGreaterThan(oldRatio);
  });
});
