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

export interface CanonicalOutlierSplit<T extends { id: string }> {
  canonicalId: string | null;
  outlierIds: string[];
}

/** Split concepts into canonical (closest to centroid) and outlier ids (< CLOSE cohesion). */
export function splitCanonicalAndOutliers<T extends { id: string; vectorEmbedding?: string | null }>(
  concepts: T[]
): CanonicalOutlierSplit<T> {
  const scores = computeConceptCohesionScores(concepts);
  if (concepts.length === 0) {
    return { canonicalId: null, outlierIds: [] };
  }

  let canonicalId = concepts[0]!.id;
  let bestSimilarity = scores.get(canonicalId)?.similarity ?? -1;

  for (const concept of concepts) {
    const similarity = scores.get(concept.id)?.similarity ?? -1;
    if (similarity > bestSimilarity) {
      canonicalId = concept.id;
      bestSimilarity = similarity;
    }
  }

  const outlierIds = concepts
    .filter(concept => concept.id !== canonicalId)
    .filter(concept => scores.get(concept.id)?.rating !== 'CLOSE')
    .map(concept => concept.id);

  return { canonicalId, outlierIds };
}
