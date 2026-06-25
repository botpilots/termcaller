import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { withTimeout } from '../utils/withTimeout.js';

dotenv.config();

const apiKey = process.env.QUARKUS_LANGCHAIN4J_AI_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

/** Max wait per Gemini round-trip (initial + optional follow-up each get this budget). */
export const GEMINI_EXTRACTION_TIMEOUT_MS = 60_000;

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
      description: 'Terminology concepts extracted from callouts on this page.',
      items: {
        type: Type.OBJECT,
        properties: {
          calloutIdentifiers: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: 'All callout labels for this part. Group duplicates that share sourceTerm and functionalDescription.',
          },
          figureNumber: {
            type: Type.STRING,
            description: "Figure number if explicitly stated (e.g. 'Figure 4.1'), otherwise empty string.",
          },
          sourceTerm: {
            type: Type.STRING,
            description: "Singular lowercase part name from the text (e.g. 'screw'). Empty string if not found.",
          },
          functionalDescription: {
            type: Type.STRING,
            description: "General description of what the part is or does—not the specific step action on this page.",
          },
        },
        required: ['calloutIdentifiers', 'figureNumber', 'sourceTerm', 'functionalDescription'],
      },
    },
  },
  required: ['extractedConcepts'],
};

function getUnresolvedCalloutIds(result: ExtractionResult): string[] {
  const ids: string[] = [];
  for (const concept of result.extractedConcepts) {
    if (!concept.sourceTerm?.trim()) {
      ids.push(...(concept.calloutIdentifiers ?? []));
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
I am providing a high-resolution image of a single manual page with one or more illustrations.

INSTRUCTIONS:
1. Find every callout label (used to identify parts) on all illustrations on this page.
2. For each callout, locate its part name in the page text (sourceTerm). If you cannot find it, output empty string.
3. Use always singular nouns.
4. Write a concise, general functional description of the part—not its purpose in the illustration.
5. Set figureNumber if explicitly stated (e.g. "4.1"), otherwise empty string.
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

    let result = JSON.parse(response.text || '{}') as ExtractionResult;
    result = { extractedConcepts: result.extractedConcepts ?? [] };

    const unresolvedIds = getUnresolvedCalloutIds(result);
    if (unresolvedIds.length > 0 && fetchAdjacentImages) {
      console.log(
        `[Gemini] Empty sourceTerm for callout(s): ${unresolvedIds.join(', ')} — fetching adjacent pages`
      );

      const adjacentImages = await fetchAdjacentImages();
      const followUpContents: Array<string | { inlineData: { mimeType: string; data: string } }> = [
        `Callout(s) ${unresolvedIds.join(', ')} had empty sourceTerm on this page. Adjacent page images are provided — search them for part names and update extractedConcepts. Keep empty string if still not found.`,
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
        result = JSON.parse(response.text || '{}') as ExtractionResult;
        result = { extractedConcepts: result.extractedConcepts ?? [] };
      }
    }

    return result;
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}
