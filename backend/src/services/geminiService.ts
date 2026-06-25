import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { GEMINI_EXTRACTION_TIMEOUT_MS } from '../constants/gemini.js';
import { withTimeout } from '../utils/withTimeout.js';

dotenv.config();

const apiKey = process.env.QUARKUS_LANGCHAIN4J_AI_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

/** @deprecated Import from constants/gemini.js */
export { GEMINI_EXTRACTION_TIMEOUT_MS };

/** Term extraction result for one page. Callout validation is handled separately. */
export interface ExtractedCallout {
  calloutIdentifiers: string[];
  figureNumber: string;
  sourceTerm: string;
  functionalDescription: string;
}

export interface ExtractionResult {
  extractedConcepts: ExtractedCallout[];
}

/** @deprecated Use ExtractionResult — kept for callers expecting AnalysisResult. */
export type AnalysisResult = ExtractionResult;

export type AdjacentImagesFetcher = () => Promise<{
  prevImageBase64?: string;
  nextImageBase64?: string;
}>;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    extractedConcepts: {
      type: Type.ARRAY,
      description: 'Empty array when the page has no illustrations. Otherwise one entry per distinct part.',
      items: {
        type: Type.OBJECT,
        properties: {
          calloutIdentifiers: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'All callout labels pointing at this part.',
          },
          figureNumber: {
            type: Type.STRING,
            description: 'Page-local figure index: "1" for the first illustration in reading order, then "2", "3", etc. Ignore document-printed figure numbers.',
          },
          sourceTerm: {
            type: Type.STRING,
            description: 'Singular lowercase part name from text. Empty if not found.',
          },
          functionalDescription: {
            type: Type.STRING,
            description: 'What the part is or does — not the step action on this page.',
          },
        },
        required: ['calloutIdentifiers', 'figureNumber', 'sourceTerm', 'functionalDescription'],
      },
    },
  },
  required: ['extractedConcepts'],
};

function normalizeExtractionResult(result: ExtractionResult): ExtractionResult {
  const extractedConcepts = (result.extractedConcepts ?? [])
    .map((concept) => ({
      ...concept,
      figureNumber: String(concept.figureNumber ?? '').trim(),
      calloutIdentifiers: (concept.calloutIdentifiers ?? []).filter(Boolean),
      sourceTerm: concept.sourceTerm ?? '',
      functionalDescription: concept.functionalDescription ?? '',
    }))
    .filter(
      (concept) => concept.calloutIdentifiers.length > 0 && concept.figureNumber.length > 0
    );

  return { extractedConcepts };
}

function getUnresolvedCalloutIds(result: ExtractionResult): string[] {
  const ids: string[] = [];
  for (const concept of result.extractedConcepts) {
    if (!concept.sourceTerm?.trim()) {
      ids.push(...concept.calloutIdentifiers);
    }
  }
  return ids;
}

export async function analyzePageWithGemini(
  imageBase64: string,
  fetchAdjacentImages?: AdjacentImagesFetcher
): Promise<ExtractionResult> {
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
      temperature: 0.1,
    },
  });

  const initialPrompt = `
You are an expert technical documentation analyst.
I am providing a high-resolution image of a single manual page.

INSTRUCTIONS:
1. If the page has no illustrations or technical diagrams with callout labels, return {"extractedConcepts": []}. Do not invent figures or callouts.
2. Number illustrations on this page only: "1" for the first in reading order (top-left to bottom-right), then "2", "3", etc. Ignore any figure numbers printed in the document.
3. Find every callout label (arrow/leader identifiers) on each illustration.
4. Group callouts that point at the same part — list all labels in calloutIdentifiers. Every entry must include figureNumber.
5. Name each part once (sourceTerm): one text lookup per group. Duplicate arrows to the same part do not need separate lookups.
6. If no direct label exists, an indirect reference is fine (e.g. "location of all hex screws").
7. Use singular lowercase nouns. Empty string if still unnamed.
8. Write a concise, general functional description — not the illustration's step action.
`;

  try {
    let response = await withTimeout(
      chat.sendMessage({
        message: [
          { text: initialPrompt },
          { inlineData: { mimeType: 'image/png', data: imageBase64 } },
        ],
      }),
      GEMINI_EXTRACTION_TIMEOUT_MS,
      'Gemini extraction'
    );

    let result = normalizeExtractionResult(JSON.parse(response.text || '{}') as ExtractionResult);

    const unresolvedIds = getUnresolvedCalloutIds(result);
    if (unresolvedIds.length > 0 && fetchAdjacentImages) {
      console.log(
        `[Gemini] Empty sourceTerm for callout(s): ${unresolvedIds.join(', ')} — fetching adjacent pages`
      );

      const adjacentImages = await fetchAdjacentImages();
      const followUpContents: Array<string | { inlineData: { mimeType: string; data: string } }> = [
        `Callout(s) ${unresolvedIds.join(', ')} still have empty sourceTerm. Search adjacent pages for a name. One lookup per grouped callout set is enough. Keep figureNumber unchanged. Keep empty string if still not found.`,
      ];

      if (adjacentImages.prevImageBase64) {
        followUpContents.push('--- PREVIOUS PAGE IMAGE ---');
        followUpContents.push({ inlineData: { mimeType: 'image/png', data: adjacentImages.prevImageBase64 } });
      }
      if (adjacentImages.nextImageBase64) {
        followUpContents.push('--- NEXT PAGE IMAGE ---');
        followUpContents.push({ inlineData: { mimeType: 'image/png', data: adjacentImages.nextImageBase64 } });
      }

      if (followUpContents.length > 1) {
        response = await withTimeout(
          chat.sendMessage({ message: followUpContents }),
          GEMINI_EXTRACTION_TIMEOUT_MS,
          'Gemini extraction follow-up'
        );
        result = normalizeExtractionResult(JSON.parse(response.text || '{}') as ExtractionResult);
      }
    }

    return result;
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}
