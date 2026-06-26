import { PrismaClient } from '@prisma/client';
import { analyzePageWithGemini } from './geminiService.js';
import { embedConceptDefinition } from './conceptEmbeddingService.js';
import { normalizeSourceTerm } from '../utils/normalizeSourceTerm.js';
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

export async function processPdfBackground(projectId: string, pdfPath: string) {
  const startTime = Date.now();
  console.log(`[Processing] Started project ${projectId}, pdf: ${pdfPath}`);

  try {
    let processedPages = 0;
    let totalPages = 0;

    await scanPdfPages(pdfPath, {
      filter: 'all',
      onPage: async ({ pageNumber, pageData, totalPages: pages, fetchAdjacentImages }) => {
        totalPages = pages;
        if (processedPages === 0) {
          console.log(`[Processing] PDF has ${totalPages} pages`);
          sendSSEEvent(projectId, 'progress', { current: processedPages, total: totalPages });
        }

        const pageStart = Date.now();
        try {
          if (!pageData.hasIllustrations) {
            console.log(`[Processing] Page ${pageNumber}: skipped (no illustrations)`);
            sendSSEEvent(projectId, 'progress', {
              current: ++processedPages,
              total: totalPages,
              skipped: true,
              pageNumber,
            });
            return null;
          }

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

            const sourceTerm = normalizeSourceTerm(concept.sourceTerm);
            if (!sourceTerm) continue;

            let keyword = await prisma.keyword.findFirst({
              where: { projectId, sourceTerm },
            });

            if (!keyword) {
              keyword = await prisma.keyword.create({
                data: {
                  projectId,
                  sourceTerm,
                },
              });
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
              dbConcept = await prisma.concept.create({
                data: {
                  definitionHash,
                  candidateConceptName: sourceTerm,
                  definitionText: concept.functionalDescription,
                  vectorEmbedding,
                  projectId,
                  keywords: {
                    connect: { id: keyword.id },
                  },
                },
              });
            } else {
              await prisma.concept.update({
                where: { id: dbConcept.id },
                data: {
                  keywords: {
                    connect: { id: keyword.id },
                  },
                  ...(dbConcept.vectorEmbedding
                    ? {}
                    : { vectorEmbedding: await embedConceptDefinition(dbConcept.definitionText) }),
                },
              });
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
    sendSSEEvent(projectId, 'complete', { success: true, processedPages, totalPages });
  } catch (error) {
    console.error('[Processing] Fatal error:', error);
    sendSSEEvent(projectId, 'error', { message: 'Failed to process PDF' });
  } finally {
    console.log(`[Processing] Done (project ${projectId})`);
  }
}
