import type { PrismaClient } from '@prisma/client';
import { embedText, embedTexts } from './embeddingService.js';

export interface KeywordConceptEmbedding {
  id: string;
  definitionText: string;
  vectorEmbedding: string;
}

export async function embedConceptDefinition(definitionText: string): Promise<string> {
  const vector = await embedText(definitionText);
  return JSON.stringify(vector);
}

/** Re-embed every concept in a keyword group (batch API). */
export async function refreshKeywordConceptEmbeddings(
  prisma: PrismaClient,
  keywordId: string
): Promise<KeywordConceptEmbedding[]> {
  const keyword = await prisma.keyword.findUnique({
    where: { id: keywordId },
    include: { concepts: true },
  });

  if (!keyword?.concepts.length) return [];

  const vectors = await embedTexts(keyword.concepts.map(concept => concept.definitionText));
  const results: KeywordConceptEmbedding[] = [];

  for (let index = 0; index < keyword.concepts.length; index++) {
    const concept = keyword.concepts[index]!;
    const vectorEmbedding = JSON.stringify(vectors[index] ?? []);
    await prisma.concept.update({
      where: { id: concept.id },
      data: { vectorEmbedding },
    });
    results.push({
      id: concept.id,
      definitionText: concept.definitionText,
      vectorEmbedding,
    });
  }

  return results;
}
