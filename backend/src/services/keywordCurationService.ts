import type { PrismaClient } from '@prisma/client';
import {
  pickCanonicalConcept,
  type ConceptEmbeddingInput,
} from './conceptMergeService.js';
import { refreshKeywordConceptEmbeddings } from './conceptEmbeddingService.js';
import { cosineSimilarity, computeCentroid, parseEmbedding } from '../utils/vectorMath.js';
import { canonicalSourceTerm, sourceTermsMatch } from '../utils/normalizeSourceTerm.js';

export const COHESION_CLOSE_MIN = 0.9;
const COHESION_FAIR_MIN = 0.85;

export type CohesionRating = 'CLOSE' | 'FAIR' | 'POOR';

export interface FigureProvenance {
  pageNumber: number;
  figureNumber: string;
  identifiers: string;
}

export interface CurationConceptInput {
  id: string;
  definitionText: string;
  vector: number[];
  figures: FigureProvenance[];
}

export interface ConceptState {
  id: string;
  definitionText: string;
  cohesionRating: CohesionRating;
  figures: FigureProvenance[];
}

export interface DefinitionWarningState {
  conceptId: string;
  definitionText: string;
  cohesionRating: CohesionRating;
  pageNumber: number;
  figureNumber: string;
  identifiers: string;
}

export interface KeywordCurationState {
  keywordId: string;
  sourceTerm: string;
  concept: ConceptState | null;
  definitionWarnings: DefinitionWarningState[];
  hasDefinitionWarnings: boolean;
}

export function ratingFromSimilarity(similarity: number): CohesionRating {
  if (similarity >= COHESION_CLOSE_MIN) return 'CLOSE';
  if (similarity >= COHESION_FAIR_MIN) return 'FAIR';
  return 'POOR';
}

export function pickCanonicalConceptForKeyword(
  concepts: ConceptEmbeddingInput[]
): ConceptEmbeddingInput | null {
  if (concepts.length === 0) return null;
  return pickCanonicalConcept(concepts);
}

function groupCalloutsToFigures(
  callouts: Array<{
    identifier: string;
    illustration: { pageNumber: number; figureNumber: string };
  }>
): FigureProvenance[] {
  const byFigure = new Map<string, FigureProvenance & { ids: string[] }>();

  for (const callout of callouts) {
    const pageNumber = callout.illustration.pageNumber;
    const figureNumber = callout.illustration.figureNumber || '1';
    const key = `${pageNumber}:${figureNumber}`;
    const existing = byFigure.get(key);

    if (existing) {
      existing.ids.push(callout.identifier);
    } else {
      byFigure.set(key, {
        pageNumber,
        figureNumber,
        identifiers: callout.identifier,
        ids: [callout.identifier],
      });
    }
  }

  return [...byFigure.values()].map(({ ids, ...figure }) => ({
    ...figure,
    identifiers: ids.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).join(', '),
  }));
}

function sortFigures(figures: FigureProvenance[]): FigureProvenance[] {
  return [...figures].sort(
    (a, b) =>
      a.pageNumber - b.pageNumber ||
      a.figureNumber.localeCompare(b.figureNumber, undefined, { numeric: true })
  );
}

export function splitCurationState(concepts: CurationConceptInput[]): {
  concept: ConceptState | null;
  definitionWarnings: DefinitionWarningState[];
  hasDefinitionWarnings: boolean;
} {
  if (concepts.length === 0) {
    return { concept: null, definitionWarnings: [], hasDefinitionWarnings: false };
  }

  const embedded = concepts.map(concept => ({
    id: concept.id,
    definitionText: concept.definitionText,
    vector: concept.vector,
  }));

  const canonical = pickCanonicalConceptForKeyword(embedded)!;
  const centroid = computeCentroid(embedded.map(entry => entry.vector));

  const cohesionById = new Map<string, { similarity: number; rating: CohesionRating }>();
  for (const entry of embedded) {
    const similarity = cosineSimilarity(entry.vector, centroid);
    cohesionById.set(entry.id, { similarity, rating: ratingFromSimilarity(similarity) });
  }

  const canonicalInput = concepts.find(concept => concept.id === canonical.id)!;
  const canonicalCohesion = cohesionById.get(canonical.id)!;
  const provenanceFigures = [...canonicalInput.figures];
  const definitionWarnings: DefinitionWarningState[] = [];

  for (const concept of concepts) {
    if (concept.id === canonical.id) continue;

    const cohesion = cohesionById.get(concept.id)!;
    if (cohesion.rating === 'CLOSE') {
      provenanceFigures.push(...concept.figures);
      continue;
    }

    for (const figure of concept.figures) {
      definitionWarnings.push({
        conceptId: concept.id,
        definitionText: concept.definitionText,
        cohesionRating: cohesion.rating,
        pageNumber: figure.pageNumber,
        figureNumber: figure.figureNumber,
        identifiers: figure.identifiers,
      });
    }
  }

  definitionWarnings.sort(
    (a, b) =>
      a.pageNumber - b.pageNumber ||
      a.figureNumber.localeCompare(b.figureNumber, undefined, { numeric: true })
  );

  const concept: ConceptState = {
    id: canonicalInput.id,
    definitionText: canonicalInput.definitionText,
    cohesionRating: canonicalCohesion.rating,
    figures: sortFigures(provenanceFigures),
  };

  return {
    concept,
    definitionWarnings,
    hasDefinitionWarnings: definitionWarnings.length > 0,
  };
}

async function loadCurationConcepts(
  prisma: PrismaClient,
  keywordId: string
): Promise<CurationConceptInput[]> {
  let keyword = await prisma.keyword.findUnique({
    where: { id: keywordId },
    include: {
      concepts: {
        include: {
          callouts: {
            include: { illustration: true },
          },
        },
      },
    },
  });

  if (!keyword?.concepts.length) return [];

  const needsRefresh = keyword.concepts.some(concept => !parseEmbedding(concept.vectorEmbedding));
  if (needsRefresh) {
    await refreshKeywordConceptEmbeddings(prisma, keywordId);
    keyword = await prisma.keyword.findUnique({
      where: { id: keywordId },
      include: {
        concepts: {
          include: {
            callouts: {
              include: { illustration: true },
            },
          },
        },
      },
    });
  }

  if (!keyword?.concepts.length) return [];

  const inputs: CurationConceptInput[] = [];

  for (const concept of keyword.concepts) {
    const vector = parseEmbedding(concept.vectorEmbedding);
    if (!vector) continue;

    inputs.push({
      id: concept.id,
      definitionText: concept.definitionText,
      vector,
      figures: groupCalloutsToFigures(concept.callouts),
    });
  }

  return inputs;
}

export async function getKeywordCurationState(
  prisma: PrismaClient,
  keywordId: string,
  userId: string
): Promise<KeywordCurationState | null> {
  const keyword = await prisma.keyword.findFirst({
    where: { id: keywordId, project: { userId } },
    select: { id: true, sourceTerm: true },
  });

  if (!keyword) return null;

  const concepts = await loadCurationConcepts(prisma, keywordId);
  const split = splitCurationState(concepts);

  return {
    keywordId: keyword.id,
    sourceTerm: keyword.sourceTerm,
    ...split,
  };
}

export async function getProjectCurationSummary(
  prisma: PrismaClient,
  projectId: string,
  userId: string
): Promise<Record<string, boolean> | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: { keywords: { select: { id: true } } },
  });

  if (!project) return null;

  const summary: Record<string, boolean> = {};
  for (const keyword of project.keywords) {
    const state = await getKeywordCurationState(prisma, keyword.id, userId);
    summary[keyword.id] = state?.hasDefinitionWarnings ?? false;
  }

  return summary;
}

export interface BranchConceptInput {
  keywordId: string;
  conceptId: string;
  newSourceTerm: string;
}

export interface BranchConceptResult {
  sourceKeywordId: string;
  targetKeywordId: string;
  conceptId: string;
}

export async function branchConcept(
  prisma: PrismaClient,
  userId: string,
  input: BranchConceptInput
): Promise<BranchConceptResult | null> {
  const keyword = await prisma.keyword.findFirst({
    where: { id: input.keywordId, project: { userId } },
    include: { concepts: { select: { id: true } } },
  });

  if (!keyword) return null;

  if (!keyword.concepts.some(concept => concept.id === input.conceptId)) {
    throw new Error('Concept does not belong to this keyword');
  }

  const canonicalTerm = canonicalSourceTerm(input.newSourceTerm);
  if (!canonicalTerm) {
    throw new Error('Term is required');
  }

  if (sourceTermsMatch(canonicalTerm, keyword.sourceTerm)) {
    throw new Error('New term must differ from the current keyword');
  }

  const projectKeywords = await prisma.keyword.findMany({
    where: { projectId: keyword.projectId },
  });
  let targetKeyword = projectKeywords.find((k) => sourceTermsMatch(k.sourceTerm, canonicalTerm));

  if (!targetKeyword) {
    targetKeyword = await prisma.keyword.create({
      data: { projectId: keyword.projectId, sourceTerm: canonicalTerm },
    });
  }

  await prisma.concept.update({
    where: { id: input.conceptId },
    data: {
      excludedFromExport: false,
      candidateConceptName: canonicalTerm,
      keywords: {
        disconnect: { id: keyword.id },
        connect: { id: targetKeyword.id },
      },
    },
  });

  await refreshKeywordConceptEmbeddings(prisma, keyword.id);
  await refreshKeywordConceptEmbeddings(prisma, targetKeyword.id);

  return {
    sourceKeywordId: keyword.id,
    targetKeywordId: targetKeyword.id,
    conceptId: input.conceptId,
  };
}

export interface IgnoreConceptInput {
  keywordId: string;
  conceptId: string;
}

export interface IgnoreConceptResult {
  keywordId: string;
  conceptId: string;
}

export async function ignoreConcept(
  prisma: PrismaClient,
  userId: string,
  input: IgnoreConceptInput
): Promise<IgnoreConceptResult | null> {
  const keyword = await prisma.keyword.findFirst({
    where: { id: input.keywordId, project: { userId } },
    include: { concepts: { select: { id: true } } },
  });

  if (!keyword) return null;

  if (!keyword.concepts.some(concept => concept.id === input.conceptId)) {
    throw new Error('Concept does not belong to this keyword');
  }

  await prisma.concept.update({
    where: { id: input.conceptId },
    data: { excludedFromExport: true },
  });

  return {
    keywordId: keyword.id,
    conceptId: input.conceptId,
  };
}
