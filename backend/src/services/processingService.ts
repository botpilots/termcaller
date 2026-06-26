import { PrismaClient } from '@prisma/client';
import { analyzePageWithGemini } from './geminiService.js';
import { embedConceptDefinition } from './conceptEmbeddingService.js';
import { autoMergeProjectKeywords } from './conceptMergeService.js';
import { canonicalSourceTerm, sourceTermLookupKey } from '../utils/normalizeSourceTerm.js';
import { TimeoutError } from '../utils/withTimeout.js';
import { scanPdfPages } from '../utils/pdfPageScan.js';
import crypto from 'crypto';

const prisma = new PrismaClient();

// In-memory store for SSE clients
export const sseClients = new Map<string, any[]>();

export function sendSSEEvent(projectId: string, event: string, data: any) {
  const clients = sseClients.get(projectId);
  if (!clients || clients.length === 0) {
    console.log(`[SSE] No clients connected for project ${projectId} — dropped ${event}:`, data);
    return;
  }
  console.log(`[SSE] ${event} → project ${projectId} (${clients.length} client(s)):`, data);
  clients.forEach(client => {
    client.write(`event: ${event}\n`);
    client.write(`data: ${JSON.stringify(data)}\n\n`);
  });
}

import { ensurePageCacheDir } from '../utils/pageImageCache.js';

export async function processPdfBackground(projectId: string, pdfPath: string) {
  const startTime = Date.now();
  console.log(`[Processing] Started project ${projectId}, pdf: ${pdfPath}`);
  const cacheDir = ensurePageCacheDir(projectId);

  try {
    let processedPages = 0;
    let totalPages = 0;

    const keywordByLookupKey = new Map(
      (await prisma.keyword.findMany({ where: { projectId } })).map((keyword) => [
        sourceTermLookupKey(keyword.sourceTerm),
        keyword,
      ])
    );

    await scanPdfPages(pdfPath, {
      outputDir: cacheDir,
      onPage: async ({ pageNumber, pageData, totalPages: pages, fetchAdjacentImages }) => {
        totalPages = pages;
        if (processedPages === 0) {
          console.log(`[Processing] PDF has ${totalPages} pages`);
          sendSSEEvent(projectId, 'progress', { current: processedPages, total: totalPages });
        }

        const pageStart = Date.now();
        try {
          console.log(`[Processing] Page ${pageNumber}: extracting...`);

          console.log(`[Processing] Page ${pageNumber}: calling Gemini...`);
          const result = await analyzePageWithGemini(pageData.imageBase64, fetchAdjacentImages);
          console.log(
            `[Processing] Page ${pageNumber}: Gemini returned ${result.extractedConcepts.length} concept(s)`
          );

          for (const concept of result.extractedConcepts) {
            const identifiers = concept.calloutIdentifiers ?? [];
            if (identifiers.length === 0) continue;
            if (!concept.sourceTerm?.trim()) continue;

            const sourceTerm = canonicalSourceTerm(concept.sourceTerm);
            if (!sourceTerm) continue;

            const lookupKey = sourceTermLookupKey(sourceTerm);
            let keyword = keywordByLookupKey.get(lookupKey);

            if (!keyword) {
              keyword = await prisma.keyword.create({
                data: {
                  projectId,
                  sourceTerm,
                },
              });
              keywordByLookupKey.set(lookupKey, keyword);
            }

            const definitionHash = crypto
              .createHash('md5')
              .update(concept.functionalDescription + sourceTerm)
              .digest('hex');

            let dbConcept = await prisma.concept.findUnique({
              where: { definitionHash },
            });

            if (!dbConcept) {
              const vectorEmbedding = await embedConceptDefinition(concept.functionalDescription);
              
              // We create the concept first without the vector, then update it using raw SQL
              dbConcept = await prisma.concept.create({
                data: {
                  definitionHash,
                  candidateConceptName: sourceTerm,
                  definitionText: concept.functionalDescription,
                  projectId,
                  keywords: {
                    connect: { id: keyword.id },
                  },
                },
              });
              
              const vectorStr = JSON.stringify(vectorEmbedding);
              await prisma.$executeRaw`
                UPDATE "Concept"
                SET "vectorEmbedding" = ${vectorStr}::vector
                WHERE id = ${dbConcept.id}
              `;
            } else {
              await prisma.concept.update({
                where: { id: dbConcept.id },
                data: {
                  keywords: {
                    connect: { id: keyword.id },
                  },
                },
              });
              
              // Only embed and update if it doesn't already have one
              const hasVector = await prisma.$queryRaw<Array<{ id: string }>>`
                SELECT id FROM "Concept" 
                WHERE id = ${dbConcept.id} AND "vectorEmbedding" IS NOT NULL
              `;
              
              if (hasVector.length === 0) {
                const vectorEmbedding = await embedConceptDefinition(dbConcept.definitionText);
                const vectorStr = JSON.stringify(vectorEmbedding);
                await prisma.$executeRaw`
                  UPDATE "Concept"
                  SET "vectorEmbedding" = ${vectorStr}::vector
                  WHERE id = ${dbConcept.id}
                `;
              }
            }

            const figureNumber = concept.figureNumber?.trim() || '1';

            let illustration = await prisma.illustration.findUnique({
              where: {
                projectId_pageNumber_figureNumber: { projectId, pageNumber, figureNumber },
              },
            });

            if (!illustration) {
              illustration = await prisma.illustration.create({
                data: {
                  projectId,
                  pageNumber,
                  figureNumber,
                },
              });
            }

            for (const identifier of identifiers) {
              if (!identifier) continue;

              await prisma.callout.create({
                data: {
                  illustrationId: illustration.id,
                  identifier,
                  sourceTerm,
                  conceptId: dbConcept.id,
                },
              });

              sendSSEEvent(projectId, 'keyword_extracted', {
                keyword: {
                  id: keyword.id,
                  sourceTerm: keyword.sourceTerm,
                },
                concept: {
                  id: dbConcept.id,
                  candidateConceptName: dbConcept.candidateConceptName,
                  definitionText: dbConcept.definitionText,
                },
                callout: {
                  identifier,
                  figureNumber: concept.figureNumber,
                  pageNumber,
                },
              });
            }
          }

          const elapsed = Date.now() - pageStart;
          console.log(`[Processing] Page ${pageNumber}: done in ${elapsed}ms`);
          sendSSEEvent(projectId, 'progress', { current: ++processedPages, total: totalPages, pageNumber });
        } catch (error) {
          if (error instanceof TimeoutError) {
            console.error(`[Processing] Page ${pageNumber}: Gemini timed out`);
          } else {
            console.error(`[Processing] Page ${pageNumber}: error`, error);
          }
          sendSSEEvent(projectId, 'progress', {
            current: ++processedPages,
            total: totalPages,
            error: true,
            pageNumber,
            timedOut: error instanceof TimeoutError,
          });
        }

        return null;
      },
    });

    const totalElapsed = Date.now() - startTime;
    console.log(
      `[Processing] Finished project ${projectId} — ${processedPages}/${totalPages} pages in ${totalElapsed}ms`
    );

    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { userId: true },
      });
      if (project) {
        const mergeSummary = await autoMergeProjectKeywords(prisma, projectId, project.userId);
        if (mergeSummary) {
          console.log(
            `[Auto-merge] Project ${projectId}: ${mergeSummary.conceptsMerged} concept(s) merged across ${mergeSummary.keywordsProcessed} keyword(s)`,
            mergeSummary.details
          );
        }
      }
    } catch (error) {
      console.error(`[Auto-merge] Failed for project ${projectId}:`, error);
    }

    sendSSEEvent(projectId, 'complete', { success: true, processedPages, totalPages });
  } catch (error) {
    console.error('[Processing] Fatal error:', error);
    sendSSEEvent(projectId, 'error', { message: 'Failed to process PDF' });
  } finally {
    console.log(`[Processing] Done (project ${projectId})`);
  }
}
