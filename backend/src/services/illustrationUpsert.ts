import type { Illustration, PrismaClient } from '@prisma/client';

/**
 * Upsert illustration metadata from validate/discovery.
 * Never overwrites an existing figureNumber or touches callouts.
 */
export async function upsertIllustration(
  prisma: PrismaClient,
  projectId: string,
  pageNumber: number,
  discoveredFigureNumber?: string | null
): Promise<Illustration> {
  const trimmed = discoveredFigureNumber?.trim() ?? '';

  const existing = await prisma.illustration.findUnique({
    where: { projectId_pageNumber: { projectId, pageNumber } },
  });

  if (existing) {
    if (!existing.figureNumber && trimmed) {
      return prisma.illustration.update({
        where: { id: existing.id },
        data: { figureNumber: trimmed },
      });
    }
    return existing;
  }

  return prisma.illustration.create({
    data: {
      projectId,
      pageNumber,
      figureNumber: trimmed || null,
    },
  });
}
