import crypto from 'crypto';
import type { PrismaClient } from '@prisma/client';
import { normalizeSourceTerm } from '../utils/normalizeSourceTerm.js';

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
}

function definitionHash(definitionText: string, sourceTerm: string): string {
  return crypto
    .createHash('md5')
    .update(definitionText.trim() + normalizeSourceTerm(sourceTerm))
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

  const normalizedNewTerm = normalizeSourceTerm(input.sourceTerm);
  if (!normalizedNewTerm) {
    throw new Error('Term is required');
  }

  const normalizedOriginalTerm = normalizeSourceTerm(input.originalSourceTerm);
  const termChanged = normalizedNewTerm !== normalizedOriginalTerm;
  const newIds = splitIdentifiers(input.identifier);
  const hash = definitionHash(input.definitionText, normalizedNewTerm);

  let resultKeywordId = keyword.id;

  if (termChanged) {
    let newKeyword = await prisma.keyword.findFirst({
      where: { projectId, sourceTerm: normalizedNewTerm },
    });

    if (!newKeyword) {
      newKeyword = await prisma.keyword.create({
        data: { projectId, sourceTerm: normalizedNewTerm },
      });
    }

    resultKeywordId = newKeyword.id;

    let dbConcept = await prisma.concept.findUnique({ where: { definitionHash: hash } });

    if (!dbConcept) {
      dbConcept = await prisma.concept.create({
        data: {
          definitionHash: hash,
          candidateConceptName: normalizedNewTerm,
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
          candidateConceptName: normalizedNewTerm,
        },
      });
    }

    for (let index = 0; index < targetCallouts.length; index++) {
      const callout = targetCallouts[index]!;
      await prisma.callout.update({
        where: { id: callout.id },
        data: {
          identifier: newIds[index] ?? newIds[0] ?? callout.identifier,
          sourceTerm: normalizedNewTerm,
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
          candidateConceptName: normalizedNewTerm,
        },
      });
    }

    for (let index = 0; index < targetCallouts.length; index++) {
      const callout = targetCallouts[index]!;
      await prisma.callout.update({
        where: { id: callout.id },
        data: {
          identifier: newIds[index] ?? newIds[0] ?? callout.identifier,
          sourceTerm: normalizedNewTerm,
          conceptId: conceptIdToUse,
        },
      });
    }
  }

  return {
    projectId,
    keywordId: resultKeywordId,
    termChanged,
  };
}
