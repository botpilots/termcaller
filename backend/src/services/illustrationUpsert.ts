import type { Illustration, PrismaClient } from '@prisma/client';

/**
 * Upsert illustration metadata from extraction or validate/discovery.
 * Never overwrites an existing figureNumber or touches callouts.
 */
export async function upsertIllustration(
  prisma: PrismaClient,
  projectId: string,
  pageNumber: number,
  figureNumber = '1'
): Promise<Illustration> {
  const trimmed = figureNumber.trim() || '1';

  const existing = await prisma.illustration.findUnique({
    where: {
      projectId_pageNumber_figureNumber: { projectId, pageNumber, figureNumber: trimmed },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.illustration.create({
    data: {
      projectId,
      pageNumber,
      figureNumber: trimmed,
    },
  });
}
