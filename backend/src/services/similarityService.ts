import { PrismaClient } from '@prisma/client';
import { embedText } from './embeddingService.js';
import { computeCentroid, cosineSimilarity, parseEmbedding } from '../utils/vectorMath.js';

const prisma = new PrismaClient();

export const SIMILARITY_OUTLIER_THRESHOLD = 0.85;

export interface ConceptSimilarityResult {
  id: string;
  definitionText: string;
  similarity: number;
  isOutlier: boolean;
}

export interface SimilarityAnalysisResult {
  keywordId: string;
  sourceTerm: string;
  threshold: number;
  conceptCount: number;
  concepts: ConceptSimilarityResult[];
}

export async function analyzeKeywordSimilarity(keywordId: string): Promise<SimilarityAnalysisResult> {
  const keyword = await prisma.keyword.findUnique({
    where: { id: keywordId },
    include: { concepts: true },
  });

  if (!keyword) {
    throw new Error('Keyword not found');
  }

  if (keyword.concepts.length === 0) {
    throw new Error('No concepts to analyse for this keyword');
  }

  const vectors: { conceptId: string; definitionText: string; vector: number[] }[] = [];

  for (const concept of keyword.concepts) {
    let vector = parseEmbedding(concept.vectorEmbedding);

    if (!vector) {
      vector = await embedText(concept.definitionText);
      await prisma.concept.update({
        where: { id: concept.id },
        data: { vectorEmbedding: JSON.stringify(vector) },
      });
    }

    vectors.push({
      conceptId: concept.id,
      definitionText: concept.definitionText,
      vector,
    });
  }

  const centroid = computeCentroid(vectors.map((entry) => entry.vector));

  const concepts: ConceptSimilarityResult[] = vectors.map((entry) => {
    const similarity = cosineSimilarity(entry.vector, centroid);
    return {
      id: entry.conceptId,
      definitionText: entry.definitionText,
      similarity,
      isOutlier: similarity < SIMILARITY_OUTLIER_THRESHOLD,
    };
  });

  concepts.sort((a, b) => b.similarity - a.similarity);

  return {
    keywordId: keyword.id,
    sourceTerm: keyword.sourceTerm,
    threshold: SIMILARITY_OUTLIER_THRESHOLD,
    conceptCount: concepts.length,
    concepts,
  };
}
