import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PrismaClient } from '@prisma/client';
import { extractPageData } from './pdfParser.js';
import { analyzePageWithGemini } from './geminiService.js';
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
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const pdfDocument = await pdfjsLib.getDocument({ data }).promise;
    const totalPages = pdfDocument.numPages;

    console.log(`[Processing] PDF has ${totalPages} pages`);

    let processedPages = 0;
    sendSSEEvent(projectId, 'progress', { current: processedPages, total: totalPages });

    const chunkSize = 6;
    for (let i = 1; i <= totalPages; i += chunkSize) {
      const chunk: number[] = [];
      for (let j = 0; j < chunkSize && i + j <= totalPages; j++) {
        chunk.push(i + j);
      }

      console.log(`[Processing] Chunk pages ${chunk.join(', ')}`);

      await Promise.all(chunk.map(async (pageNumber) => {
        const pageStart = Date.now();
        try {
          console.log(`[Processing] Page ${pageNumber}: extracting...`);
          const pageData = await extractPageData(pdfPath, pageNumber);

          if (!pageData.hasIllustrations) {
            console.log(`[Processing] Page ${pageNumber}: skipped (no illustrations)`);
            sendSSEEvent(projectId, 'progress', { current: ++processedPages, total: totalPages, skipped: true, pageNumber });
            return;
          }

          console.log(`[Processing] Page ${pageNumber}: calling Gemini...`);
          const result = await analyzePageWithGemini(pageData.imageBase64);
          console.log(`[Processing] Page ${pageNumber}: Gemini returned ${result.extractedConcepts.length} concept(s)`);

          // Save to database
          for (const concept of result.extractedConcepts) {
            const identifiers = concept.calloutIdentifiers ?? [];
            if (identifiers.length === 0) continue;

            // Find or create Keyword
            let keyword = await prisma.keyword.findFirst({
              where: { projectId, sourceTerm: concept.sourceTerm }
            });

            if (!keyword) {
              keyword = await prisma.keyword.create({
                data: {
                  projectId,
                  sourceTerm: concept.sourceTerm
                }
              });
            }

            // Create Concept
            const definitionHash = crypto.createHash('md5').update(concept.functionalDescription + concept.sourceTerm).digest('hex');
            
            let dbConcept = await prisma.concept.findUnique({
              where: { definitionHash }
            });

            if (!dbConcept) {
              dbConcept = await prisma.concept.create({
                data: {
                  definitionHash,
                  candidateConceptName: concept.sourceTerm,
                  definitionText: concept.functionalDescription,
                  projectId,
                  keywords: {
                    connect: { id: keyword.id }
                  }
                }
              });
            } else {
              // Connect to keyword if not already
              await prisma.concept.update({
                where: { id: dbConcept.id },
                data: {
                  keywords: {
                    connect: { id: keyword.id }
                  }
                }
              });
            }

            // Create Illustration if not exists
            let illustration = await prisma.illustration.findFirst({
              where: { projectId, pageNumber }
            });

            if (!illustration) {
              illustration = await prisma.illustration.create({
                data: {
                  projectId,
                  pageNumber,
                  figureNumber: concept.figureNumber || null
                }
              });
            } else if (concept.figureNumber && !illustration.figureNumber) {
              illustration = await prisma.illustration.update({
                where: { id: illustration.id },
                data: { figureNumber: concept.figureNumber }
              });
            }

            for (let i = 0; i < identifiers.length; i++) {
              const identifier = identifiers[i];
              if (!identifier) continue;
              const actualFromImage = concept.actualIdentifiers?.[i];
              const actualIdentifier =
                actualFromImage && actualFromImage !== identifier ? actualFromImage : null;

              await prisma.callout.create({
                data: {
                  illustrationId: illustration.id,
                  identifier,
                  actualIdentifier,
                  sourceTerm: concept.sourceTerm,
                  conceptId: dbConcept.id
                }
              });

              sendSSEEvent(projectId, 'keyword_extracted', {
                keyword: {
                  id: keyword.id,
                  sourceTerm: keyword.sourceTerm
                },
                concept: {
                  id: dbConcept.id,
                  candidateConceptName: dbConcept.candidateConceptName,
                  definitionText: dbConcept.definitionText
                },
                callout: {
                  identifier,
                  figureNumber: concept.figureNumber,
                  pageNumber
                }
              });
            }
          }

          const elapsed = Date.now() - pageStart;
          console.log(`[Processing] Page ${pageNumber}: done in ${elapsed}ms`);
          sendSSEEvent(projectId, 'progress', { current: ++processedPages, total: totalPages, pageNumber });
        } catch (error) {
          console.error(`[Processing] Page ${pageNumber}: error`, error);
          sendSSEEvent(projectId, 'progress', { current: ++processedPages, total: totalPages, error: true, pageNumber });
        }
      }));
    }

    const totalElapsed = Date.now() - startTime;
    console.log(`[Processing] Finished project ${projectId} — ${processedPages}/${totalPages} pages in ${totalElapsed}ms`);
    sendSSEEvent(projectId, 'complete', { success: true, processedPages, totalPages });
  } catch (error) {
    console.error('[Processing] Fatal error:', error);
    sendSSEEvent(projectId, 'error', { message: 'Failed to process PDF' });
  } finally {
    console.log(`[Processing] Done (project ${projectId})`);
  }
}
