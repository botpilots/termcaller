import type { PrismaClient } from '@prisma/client';
import {
  refreshKeywordConceptEmbeddings,
} from './conceptEmbeddingService.js';
import { cosineSimilarity, computeCentroid, parseEmbedding } from '../utils/vectorMath.js';

export const AUTO_MERGE_THRESHOLD = 0.95;

export interface ConceptEmbeddingInput {
  id: string;
  definitionText: string;
  vector: number[];
}

export interface AutoMergeKeywordResult {
  merged: number;
  canonicalConceptId?: string;
}

export interface AutoMergeProjectResult {
  keywordsProcessed: number;
  conceptsMerged: number;
  details: Array<{ keywordId: string; sourceTerm: string; mergedCount: number }>;
}

/** Union-find clustering: concepts in the same cluster if pairwise similarity >= threshold. */
export function clusterConceptsBySimilarity(
  concepts: ConceptEmbeddingInput[],
  threshold: number = AUTO_MERGE_THRESHOLD
): ConceptEmbeddingInput[][] {
  if (concepts.length === 0) return [];

  const parent = concepts.map((_, index) => index);

  function find(index: number): number {
    if (parent[index] !== index) {
      parent[index] = find(parent[index]!);
    }
    return parent[index]!;
  }

  function union(a: number, b: number) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent[rootA] = rootB;
    }
  }

  for (let i = 0; i < concepts.length; i++) {
    for (let j = i + 1; j < concepts.length; j++) {
      const similarity = cosineSimilarity(concepts[i]!.vector, concepts[j]!.vector);
      if (similarity >= threshold) {
        union(i, j);
      }
    }
  }

  const clusters = new Map<number, ConceptEmbeddingInput[]>();
  for (let i = 0; i < concepts.length; i++) {
    const root = find(i);
    const cluster = clusters.get(root) ?? [];
    cluster.push(concepts[i]!);
    clusters.set(root, cluster);
  }

  return [...clusters.values()];
}

/** Canonical concept: closest to cluster centroid; tie-break on longest definitionText. */
export function pickCanonicalConcept(cluster: ConceptEmbeddingInput[]): ConceptEmbeddingInput {
  const centroid = computeCentroid(cluster.map(concept => concept.vector));

  let canonical = cluster[0]!;
  let bestSimilarity = cosineSimilarity(canonical.vector, centroid);

  for (let index = 1; index < cluster.length; index++) {
    const candidate = cluster[index]!;
    const similarity = cosineSimilarity(candidate.vector, centroid);
    if (
      similarity > bestSimilarity ||
      (similarity === bestSimilarity && candidate.definitionText.length > canonical.definitionText.length)
    ) {
      canonical = candidate;
      bestSimilarity = similarity;
    }
  }

  return canonical;
}

async function loadKeywordConceptsWithEmbeddings(
  prisma: PrismaClient,
  keywordId: string
): Promise<ConceptEmbeddingInput[]> {
  const concepts = await prisma.$queryRaw<Array<{ id: string, definitionText: string, vectorEmbedding: string }>>`
    SELECT id, "definitionText", "vectorEmbedding"::text as "vectorEmbedding"
    FROM "Concept"
    WHERE id IN (
      SELECT "B" FROM "_KeywordConcepts" WHERE "A" = ${keywordId}
    )
  `;

  if (!concepts.length) return [];

  const needsRefresh = concepts.some(concept => !concept.vectorEmbedding);
  if (needsRefresh) {
    await refreshKeywordConceptEmbeddings(prisma, keywordId);
    return loadKeywordConceptsWithEmbeddings(prisma, keywordId); // Recursive call after refresh
  }

  const embedded: ConceptEmbeddingInput[] = [];
  for (const concept of concepts) {
    if (!concept.vectorEmbedding) continue;
    // pgvector string format is '[1.23, 4.56, ...]'
    let vector: number[];
    try {
      vector = JSON.parse(concept.vectorEmbedding);
    } catch {
      continue;
    }
    
    embedded.push({
      id: concept.id,
      definitionText: concept.definitionText,
      vector,
    });
  }

  return embedded;
}

async function mergeConceptCluster(
  prisma: PrismaClient,
  keywordId: string,
  cluster: ConceptEmbeddingInput[]
): Promise<{ merged: number; canonicalConceptId: string }> {
  const canonical = pickCanonicalConcept(cluster);
  const toMerge = cluster.filter(concept => concept.id !== canonical.id);
  if (toMerge.length === 0) {
    return { merged: 0, canonicalConceptId: canonical.id };
  }

  for (const mergedConcept of toMerge) {
    await prisma.callout.updateMany({
      where: { conceptId: mergedConcept.id },
      data: { conceptId: canonical.id },
    });

    await prisma.concept.update({
      where: { id: canonical.id },
      data: { keywords: { connect: { id: keywordId } } },
    });

    await prisma.concept.update({
      where: { id: mergedConcept.id },
      data: { keywords: { disconnect: { id: keywordId } } },
    });

    const remaining = await prisma.concept.findUnique({
      where: { id: mergedConcept.id },
      include: { _count: { select: { callouts: true, keywords: true } } },
    });

    if (remaining && remaining._count.callouts === 0 && remaining._count.keywords === 0) {
      await prisma.concept.delete({ where: { id: mergedConcept.id } });
    }
  }

  return { merged: toMerge.length, canonicalConceptId: canonical.id };
}

export async function autoMergeKeywordConcepts(
  prisma: PrismaClient,
  keywordId: string
): Promise<AutoMergeKeywordResult> {
  const concepts = await loadKeywordConceptsWithEmbeddings(prisma, keywordId);
  if (concepts.length < 2) {
    return { merged: 0 };
  }

  const clusters = clusterConceptsBySimilarity(concepts, AUTO_MERGE_THRESHOLD);
  let merged = 0;
  let canonicalConceptId: string | undefined;

  for (const cluster of clusters) {
    if (cluster.length <= 1) continue;
    const result = await mergeConceptCluster(prisma, keywordId, cluster);
    merged += result.merged;
    canonicalConceptId = result.canonicalConceptId;
  }

  return { merged, ...(canonicalConceptId ? { canonicalConceptId } : {}) };
}

export async function autoMergeProjectKeywords(
  prisma: PrismaClient,
  projectId: string,
  userId: string
): Promise<AutoMergeProjectResult | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    include: {
      keywords: {
        include: { concepts: true },
      },
    },
  });

  if (!project) return null;

  const details: AutoMergeProjectResult['details'] = [];
  let conceptsMerged = 0;
  let keywordsProcessed = 0;

  for (const keyword of project.keywords) {
    if (keyword.concepts.length < 2) continue;

    keywordsProcessed++;
    const result = await autoMergeKeywordConcepts(prisma, keyword.id);
    if (result.merged > 0) {
      await refreshKeywordConceptEmbeddings(prisma, keyword.id);
      conceptsMerged += result.merged;
      details.push({
        keywordId: keyword.id,
        sourceTerm: keyword.sourceTerm,
        mergedCount: result.merged,
      });
    }
  }

  return { keywordsProcessed, conceptsMerged, details };
}
