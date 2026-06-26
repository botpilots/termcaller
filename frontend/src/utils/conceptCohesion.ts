import { computeCentroid, cosineSimilarity, parseEmbedding } from './vectorMath';

/** Matches backend SIMILARITY_OUTLIER_THRESHOLD / semanticKeywordOverlap. */
export const COHESION_FAIR_MIN = 0.85;
export const COHESION_CLOSE_MIN = 0.9;

export type CohesionRating = 'CLOSE' | 'FAIR' | 'POOR';

export interface ConceptCohesionScore {
  similarity: number;
  rating: CohesionRating;
}

export const COHESION_DESCRIPTIONS: Record<CohesionRating, string> = {
  CLOSE: 'Closely matches the average definition in this keyword group',
  FAIR: 'Somewhat typical compared with other definitions in this group',
  POOR: 'Differs noticeably from other definitions in this group',
};

export function ratingFromSimilarity(similarity: number): CohesionRating {
  if (similarity >= COHESION_CLOSE_MIN) return 'CLOSE';
  if (similarity >= COHESION_FAIR_MIN) return 'FAIR';
  return 'POOR';
}

export function computeConceptCohesionScores(
  concepts: Array<{ id: string; vectorEmbedding?: string | null }>
): Map<string, ConceptCohesionScore> {
  const embedded = concepts
    .map(concept => ({
      id: concept.id,
      vector: parseEmbedding(concept.vectorEmbedding),
    }))
    .filter((entry): entry is { id: string; vector: number[] } => !!entry.vector?.length);

  if (embedded.length === 0) return new Map();

  if (embedded.length === 1) {
    return new Map([[embedded[0]!.id, { similarity: 1, rating: 'CLOSE' }]]);
  }

  const centroid = computeCentroid(embedded.map(entry => entry.vector));
  const scores = new Map<string, ConceptCohesionScore>();

  for (const entry of embedded) {
    const similarity = cosineSimilarity(entry.vector, centroid);
    scores.set(entry.id, {
      similarity,
      rating: ratingFromSimilarity(similarity),
    });
  }

  return scores;
}

export function cohesionToneClass(rating: CohesionRating): string {
  switch (rating) {
    case 'CLOSE':
      return 'text-emerald-700';
    case 'FAIR':
      return 'text-amber-700';
    case 'POOR':
      return 'text-red-700';
  }
}
