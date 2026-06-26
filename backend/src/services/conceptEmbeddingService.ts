import type { PrismaClient } from '@prisma/client';
import { embedText, embedTexts } from './embeddingService.js';

  export interface KeywordConceptEmbedding {
    id: string;
    definitionText: string;
    vectorEmbedding: number[];
  }

export async function embedConceptDefinition(definitionText: string): Promise<number[]> {
  return await embedText(definitionText);
}

/** Re-embed every concept in a keyword group (batch API). */
export async function refreshKeywordConceptEmbeddings(
  prisma: PrismaClient,
  keywordId: string
): Promise<KeywordConceptEmbedding[]> {
  const concepts = await prisma.$queryRaw<Array<{ id: string, definitionText: string }>>`
    SELECT id, "definitionText"
    FROM "Concept"
    WHERE id IN (
      SELECT "B" FROM "_KeywordConcepts" WHERE "A" = ${keywordId}
    )
  `;

  if (!concepts.length) return [];

  const vectors = await embedTexts(concepts.map(concept => concept.definitionText));
  const results: KeywordConceptEmbedding[] = [];

  for (let index = 0; index < concepts.length; index++) {
    const concept = concepts[index]!;
    const vectorEmbedding = vectors[index] ?? [];
    
    await prisma.$executeRaw`
      UPDATE "Concept"
      SET "vectorEmbedding" = ${vectorEmbedding}::vector
      WHERE id = ${concept.id}
    `;

    results.push({
      id: concept.id,
      definitionText: concept.definitionText,
      vectorEmbedding,
    });
  }

  return results;
}
