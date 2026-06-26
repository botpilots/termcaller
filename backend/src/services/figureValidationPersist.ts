import type { PrismaClient } from '@prisma/client';
import type { CalloutValidationResult } from './geminiValidationService.js';

const EMPTY_VALIDATION: CalloutValidationResult = {
  unreferencedCallouts: [],
  uncalledReferences: [],
  labelMismatches: [],
};

export function parseValidationResult(json: string | null | undefined): CalloutValidationResult | null {
  if (!json?.trim()) return null;

  try {
    const parsed = JSON.parse(json) as Partial<CalloutValidationResult>;
    return {
      unreferencedCallouts: Array.isArray(parsed.unreferencedCallouts)
        ? parsed.unreferencedCallouts.filter((value): value is string => typeof value === 'string')
        : [],
      uncalledReferences: Array.isArray(parsed.uncalledReferences)
        ? parsed.uncalledReferences.filter((value): value is string => typeof value === 'string')
        : [],
      labelMismatches: Array.isArray(parsed.labelMismatches)
        ? parsed.labelMismatches.filter(
            mismatch =>
              mismatch &&
              typeof mismatch === 'object' &&
              typeof mismatch.textIdentifier === 'string' &&
              typeof mismatch.imageIdentifier === 'string' &&
              typeof mismatch.sourceTerm === 'string'
          )
        : [],
    };
  } catch {
    return null;
  }
}

export function serializeValidationResult(validation: CalloutValidationResult): string {
  return JSON.stringify(validation);
}

export async function saveFigureValidation(
  prisma: PrismaClient,
  projectId: string,
  pageNumber: number,
  figureNumber: string,
  validation: CalloutValidationResult = EMPTY_VALIDATION
): Promise<void> {
  const trimmed = figureNumber.trim() || '1';

  await prisma.illustration.updateMany({
    where: { projectId, pageNumber, figureNumber: trimmed },
    data: {
      validationResult: serializeValidationResult(validation),
      validatedAt: new Date(),
    },
  });
}

export function withParsedValidation<T extends { validationResult?: string | null }>(
  illustration: T
): Omit<T, 'validationResult'> & { validation: CalloutValidationResult | null } {
  const { validationResult, ...rest } = illustration;
  return {
    ...rest,
    validation: parseValidationResult(validationResult),
  };
}
