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
  if (clients) {
    clients.forEach(client => {
      client.write(`event: ${event}\n`);
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    });
  }
}

export async function processPdfBackground(projectId: string, pdfPath: string) {
  try {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const pdfDocument = await pdfjsLib.getDocument({ data }).promise;
    const totalPages = pdfDocument.numPages;

    let processedPages = 0;
    sendSSEEvent(projectId, 'progress', { current: processedPages, total: totalPages });

    const chunkSize = 6;
    for (let i = 1; i <= totalPages; i += chunkSize) {
      const chunk = [];
      for (let j = 0; j < chunkSize && i + j <= totalPages; j++) {
        chunk.push(i + j);
      }

      await Promise.all(chunk.map(async (pageNumber) => {
        try {
          const pageData = await extractPageData(pdfPath, pageNumber);
          
          if (!pageData.hasIllustrations) {
            processedPages++;
            sendSSEEvent(projectId, 'progress', { current: processedPages, total: totalPages, skipped: true });
            return;
          }

          const result = await analyzePageWithGemini(pageData.imageBase64);

          // Save to database
          for (const concept of result.extractedConcepts) {
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

            // Create Callout
            await prisma.callout.create({
              data: {
                illustrationId: illustration.id,
                identifier: concept.calloutIdentifier,
                actualIdentifier: concept.actualIdentifier || null,
                sourceTerm: concept.sourceTerm,
                conceptId: dbConcept.id
              }
            });

            // Send SSE event for new keyword/concept
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
                identifier: concept.calloutIdentifier,
                figureNumber: concept.figureNumber,
                pageNumber
              }
            });
          }

          processedPages++;
          sendSSEEvent(projectId, 'progress', { current: processedPages, total: totalPages });
        } catch (error) {
          console.error(`Error processing page ${pageNumber}:`, error);
          processedPages++;
          sendSSEEvent(projectId, 'progress', { current: processedPages, total: totalPages, error: true });
        }
      }));
    }

    sendSSEEvent(projectId, 'complete', { success: true });
  } catch (error) {
    console.error('Error in background processing:', error);
    sendSSEEvent(projectId, 'error', { message: 'Failed to process PDF' });
  } finally {
    // Optionally clean up the uploaded file
    // fs.unlinkSync(pdfPath);
  }
}
