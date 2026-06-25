import { describe, expect, it } from 'vitest';
import { computeCentroid, cosineSimilarity } from '../src/utils/vectorMath.js';

describe('vectorMath', () => {
  it('computes cosine similarity for identical vectors', () => {
    const vector = [1, 0, 0];
    expect(cosineSimilarity(vector, vector)).toBeCloseTo(1);
  });

  it('computes cosine similarity for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('computes centroid as average of vectors', () => {
    const centroid = computeCentroid([
      [0, 0],
      [2, 4],
    ]);
    expect(centroid).toEqual([1, 2]);
  });
});
