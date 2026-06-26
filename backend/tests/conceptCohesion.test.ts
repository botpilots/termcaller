import { describe, it, expect } from 'vitest';
import { computeCentroid, cosineSimilarity } from '../src/utils/vectorMath.js';

const COHESION_FAIR_MIN = 0.85;
const COHESION_CLOSE_MIN = 0.9;

function ratingFromSimilarity(similarity: number): 'CLOSE' | 'FAIR' | 'POOR' {
  if (similarity >= COHESION_CLOSE_MIN) return 'CLOSE';
  if (similarity >= COHESION_FAIR_MIN) return 'FAIR';
  return 'POOR';
}

function computeScores(concepts: Array<{ id: string; vectorEmbedding: string }>) {
  const embedded = concepts.map(c => ({
    id: c.id,
    vector: JSON.parse(c.vectorEmbedding) as number[],
  }));
  const centroid = computeCentroid(embedded.map(e => e.vector));
  return new Map(
    embedded.map(entry => {
      const similarity = cosineSimilarity(entry.vector, centroid);
      return [entry.id, { similarity, rating: ratingFromSimilarity(similarity) }] as const;
    })
  );
}

describe('concept cohesion scoring', () => {
  it('marks aligned definitions CLOSE and outliers POOR', () => {
    const scores = computeScores([
      { id: 'a', vectorEmbedding: JSON.stringify([1, 0, 0]) },
      { id: 'b', vectorEmbedding: JSON.stringify([0.99, 0.01, 0]) },
      { id: 'c', vectorEmbedding: JSON.stringify([0.98, 0.02, 0]) },
      { id: 'd', vectorEmbedding: JSON.stringify([0, 1, 0]) },
    ]);

    expect(scores.get('a')?.rating).toBe('CLOSE');
    expect(scores.get('b')?.rating).toBe('CLOSE');
    expect(scores.get('d')?.rating).toBe('POOR');
  });
});
