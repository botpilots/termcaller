import { describe, it, expect } from 'vitest';
import {
  computeSemanticOverlap,
  SEMANTIC_MATCH_THRESHOLD,
} from '../src/utils/semanticKeywordOverlap.js';

describe('computeSemanticOverlap', () => {
  it('treats synonymous labels as covered', () => {
    const terms = ['roller', 'roller type a', 'electric screw', 'electrical screw', 'arrow'];
    const vectors = new Map<string, number[]>([
      ['roller', [1, 0, 0]],
      ['roller type a', [0.99, 0.01, 0]],
      ['electric screw', [0, 1, 0]],
      ['electrical screw', [0, 0.99, 0.01]],
      ['arrow', [0, 0, 1]],
    ]);

    const result = computeSemanticOverlap(
      ['roller', 'electric screw', 'arrow'],
      ['roller type a', 'electrical screw', 'arrow'],
      vectors,
      0.9
    );

    expect(result.coveredBaseline.sort()).toEqual(['arrow', 'electric screw', 'roller']);
    expect(result.gapBaseline).toEqual([]);
    expect(result.semanticCoverage).toBe(1);
  });
});

describe('semanticKeywordOverlap thresholds', () => {
  it('exports the same threshold used in similarityService', () => {
    expect(SEMANTIC_MATCH_THRESHOLD).toBe(0.85);
  });
});
