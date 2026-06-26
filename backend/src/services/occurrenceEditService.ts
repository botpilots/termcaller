import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';
import {
  canonicalSourceTerm,
  sourceTermLookupKey,
  sourceTermsMatch,
} from '../utils/normalizeSourceTerm.js';
import {
  refreshKeywordConceptEmbeddings,
  type KeywordConceptEmbedding,
} from './conceptEmbeddingService.js';

export interface SaveOccurrenceInput {
  keywordId: string;
  pageNumber: number;
  figureNumber?: string;
  originalIdentifiers: string;
  identifier: string;
  sourceTerm: string;
  definitionText: string;
  originalSourceTerm: string;
}

export interface SaveOccurrenceResult {
  projectId: string;
  keywordId: string;
  termChanged: boolean;
  concepts: KeywordConceptEmbedding[];
}

export interface IgnoreOccurrenceInput {
  keywordId: string;
  pageNumber: number;
  figureNumber?: string;
  identifiers: string;
}

export interface IgnoreOccurrenceResult {
  projectId: string;
  keywordId: string;
  ignoredConceptIds: string[];
}

function definitionHash(definitionText: string, sourceTerm: string): string {
  return crypto
    .createHash('md5')
    .update(definitionText.trim() + sourceTermLookupKey(sourceTerm))
    .digest('hex');
}

function splitIdentifiers(value: string): string[] {
  return value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
}

export async function saveOccurrenceEdit(
  prisma: PrismaClient,
  userId: string,
  input: SaveOccurrenceInput
): Promise<SaveOccurrenceResult | null> {
  const keyword = await prisma.keyword.findFirst({
    where: { id: input.keywordId, project: { userId } },
  });
  if (!keyword) return null;

  const projectId = keyword.projectId;
  const figureNumber = input.figureNumber?.trim() || '1';
  const illustration = await prisma.illustration.findUnique({
    where: {
      projectId_pageNumber_figureNumber: { projectId, pageNumber: input.pageNumber, figureNumber },
    },
    include: {
      callouts: {
        include: { concept: { include: { keywords: true } } },
      },
    },
  });

  if (!illustration) {
    throw new Error('Figure not found');
  }

  const originalIds = splitIdentifiers(input.originalIdentifiers);
  const targetCallouts = illustration.callouts.filter(
    callout =>
      originalIds.includes(callout.identifier) &&
      callout.concept?.keywords.some(linked => linked.id === input.keywordId)
  );

  if (targetCallouts.length === 0) {
    throw new Error('Occurrence callouts not found');
  }

  const canonicalNewTerm = canonicalSourceTerm(input.sourceTerm);
  if (!canonicalNewTerm) {
    throw new Error('Term is required');
  }

  const termChanged = !sourceTermsMatch(canonicalNewTerm, input.originalSourceTerm);
  const newIds = splitIdentifiers(input.identifier);
  const hash = definitionHash(input.definitionText, canonicalNewTerm);

  let resultKeywordId = keyword.id;

  if (termChanged) {
    const projectKeywords = await prisma.keyword.findMany({ where: { projectId } });
    let newKeyword = projectKeywords.find((k) => sourceTermsMatch(k.sourceTerm, canonicalNewTerm));

    if (!newKeyword) {
      newKeyword = await prisma.keyword.create({
        data: { projectId, sourceTerm: canonicalNewTerm },
      });
    }

    resultKeywordId = newKeyword.id;

    let dbConcept = await prisma.concept.findUnique({ where: { definitionHash: hash } });

    if (!dbConcept) {
      dbConcept = await prisma.concept.create({
        data: {
          definitionHash: hash,
          candidateConceptName: canonicalNewTerm,
          definitionText: input.definitionText.trim(),
          projectId,
          keywords: { connect: { id: newKeyword.id } },
        },
      });
    } else {
      await prisma.concept.update({
        where: { id: dbConcept.id },
        data: {
          keywords: { connect: { id: newKeyword.id } },
          definitionText: input.definitionText.trim(),
          candidateConceptName: canonicalNewTerm,
        },
      });
    }

    for (let index = 0; index < targetCallouts.length; index++) {
      const callout = targetCallouts[index]!;
      await prisma.callout.update({
        where: { id: callout.id },
        data: {
          identifier: newIds[index] ?? newIds[0] ?? callout.identifier,
          sourceTerm: canonicalNewTerm,
          conceptId: dbConcept.id,
        },
      });
    }
  } else {
    const existingConceptId = targetCallouts[0]!.conceptId;
    if (!existingConceptId) {
      throw new Error('Callout has no concept');
    }

    const existingWithHash = await prisma.concept.findUnique({ where: { definitionHash: hash } });
    let conceptIdToUse = existingConceptId;

    if (existingWithHash && existingWithHash.id !== existingConceptId) {
      conceptIdToUse = existingWithHash.id;
      await prisma.concept.update({
        where: { id: existingWithHash.id },
        data: { keywords: { connect: { id: keyword.id } } },
      });
    } else {
      await prisma.concept.update({
        where: { id: existingConceptId },
        data: {
          definitionHash: hash,
          definitionText: input.definitionText.trim(),
          candidateConceptName: canonicalNewTerm,
        },
      });
    }

    for (let index = 0; index < targetCallouts.length; index++) {
      const callout = targetCallouts[index]!;
      await prisma.callout.update({
        where: { id: callout.id },
        data: {
          identifier: newIds[index] ?? newIds[0] ?? callout.identifier,
          sourceTerm: canonicalNewTerm,
          conceptId: conceptIdToUse,
        },
      });
    }
  }

  const concepts = await refreshKeywordConceptEmbeddings(prisma, resultKeywordId);

  return {
    projectId,
    keywordId: resultKeywordId,
    termChanged,
    concepts,
  };
}

async function findOccurrenceCallouts(
  prisma: PrismaClient,
  userId: string,
  input: { keywordId: string; pageNumber: number; figureNumber?: string; identifiers: string }
) {
  const keyword = await prisma.keyword.findFirst({
    where: { id: input.keywordId, project: { userId } },
  });
  if (!keyword) return null;

  const figureNumber = input.figureNumber?.trim() || '1';
  const illustration = await prisma.illustration.findUnique({
    where: {
      projectId_pageNumber_figureNumber: {
        projectId: keyword.projectId,
        pageNumber: input.pageNumber,
        figureNumber,
      },
    },
    include: {
      callouts: {
        include: { concept: { include: { keywords: true } } },
      },
    },
  });

  if (!illustration) {
    throw new Error('Figure not found');
  }

  const originalIds = splitIdentifiers(input.identifiers);
  const targetCallouts = illustration.callouts.filter(
    callout =>
      originalIds.includes(callout.identifier) &&
      callout.concept?.keywords.some(linked => linked.id === input.keywordId)
  );

  if (targetCallouts.length === 0) {
    throw new Error('Occurrence callouts not found');
  }

  return { keyword, targetCallouts };
}

export async function ignoreOccurrence(
  prisma: PrismaClient,
  userId: string,
  input: IgnoreOccurrenceInput
): Promise<IgnoreOccurrenceResult | null> {
  const match = await findOccurrenceCallouts(prisma, userId, input);
  if (!match) return null;

  const { keyword, targetCallouts } = match;
  const conceptIds = [...new Set(targetCallouts.map(callout => callout.conceptId).filter(Boolean))] as string[];

  if (conceptIds.length === 0) {
    throw new Error('Occurrence has no concept to ignore');
  }

  await prisma.concept.updateMany({
    where: { id: { in: conceptIds } },
    data: { excludedFromExport: true },
  });

  return {
    projectId: keyword.projectId,
    keywordId: keyword.id,
    ignoredConceptIds: conceptIds,
  };
}
