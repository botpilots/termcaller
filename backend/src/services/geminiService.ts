import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { GEMINI_EXTRACTION_TIMEOUT_MS, GEMINI_EXTRACTION_THINKING_LEVEL } from '../constants/gemini.js';
import { PDF_IMAGE_MIME_TYPE } from '../constants/pdfProcessing.js';
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

interface LlmExtractedPart {
  calloutIdentifiers?: string[];
  sourceTerm?: string;
  functionalDescription?: string;
}

interface LlmFigureExtraction {
  parts?: LlmExtractedPart[];
}

export interface LlmExtractionResponse {
  figures?: LlmFigureExtraction[];
}

const partSchema = {
  type: Type.OBJECT,
  properties: {
    calloutIdentifiers: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'All callout labels pointing at this part.',
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
  required: ['calloutIdentifiers', 'sourceTerm', 'functionalDescription'],
};

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    figures: {
      type: Type.ARRAY,
      description:
        'Empty array when the page has no illustrations. One entry per illustration in reading order (top-to-bottom, left-to-right). Do not include figures with no callout labels.',
      items: {
        type: Type.OBJECT,
        properties: {
          parts: {
            type: Type.ARRAY,
            description: 'One entry per distinct labeled part on this illustration.',
            items: partSchema,
          },
        },
        required: ['parts'],
      },
    },
  },
  required: ['figures'],
};

function normalizePart(part: LlmExtractedPart): ExtractedCallout | null {
  const calloutIdentifiers = (part.calloutIdentifiers ?? []).filter(Boolean);
  if (calloutIdentifiers.length === 0) {
    return null;
  }

  return {
    calloutIdentifiers,
    figureNumber: '',
    sourceTerm: part.sourceTerm ?? '',
    functionalDescription: part.functionalDescription ?? '',
  };
}

function figureHasParts(figure: LlmFigureExtraction): boolean {
  return (figure.parts ?? []).some((part) => (part.calloutIdentifiers ?? []).some(Boolean));
}

/** Flatten ordered figure array into extractedConcepts with auto-assigned figure numbers. */
export function normalizeExtractionResult(raw: LlmExtractionResponse): ExtractionResult {
  const nonEmptyFigures = (raw.figures ?? []).filter(figureHasParts);
  const extractedConcepts: ExtractedCallout[] = [];

  nonEmptyFigures.forEach((figure, figureIndex) => {
    const figureNumber = String(figureIndex + 1);

    for (const part of figure.parts ?? []) {
      const normalized = normalizePart(part);
      if (!normalized) continue;

      extractedConcepts.push({
        ...normalized,
        figureNumber,
      });
    }
  });

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
      thinkingConfig: {
        thinkingLevel: GEMINI_EXTRACTION_THINKING_LEVEL,
      },
    },
  });

  const initialPrompt = `
You are a technical manual callout extractor. Scan the page image and list labeled parts — no analysis beyond what is visible.

INSTRUCTIONS:
1. If the page has no illustrations or technical diagrams with callout labels, return {"figures": []}. Do not invent figures or callouts.
2. Return one entry in figures per illustration, ordered top-to-bottom then left-to-right. Do not include figures that have no callout labels.
3. For each illustration, list every callout label (arrow/leader identifiers) in parts grouped by the part they point at.
4. Group callouts that point at the same part — list all labels in calloutIdentifiers.
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
          { inlineData: { mimeType: PDF_IMAGE_MIME_TYPE, data: imageBase64 } },
        ],
      }),
      GEMINI_EXTRACTION_TIMEOUT_MS,
      'Gemini extraction'
    );

    let result = normalizeExtractionResult(JSON.parse(response.text || '{}') as LlmExtractionResponse);

    const unresolvedIds = getUnresolvedCalloutIds(result);
    if (unresolvedIds.length > 0 && fetchAdjacentImages) {
      console.log(
        `[Gemini] Empty sourceTerm for callout(s): ${unresolvedIds.join(', ')} — fetching adjacent pages`
      );

      const adjacentImages = await fetchAdjacentImages();
      const followUpContents: Array<string | { inlineData: { mimeType: string; data: string } }> = [
        `Callout(s) ${unresolvedIds.join(', ')} still have empty sourceTerm. Search adjacent pages for a name. One lookup per grouped callout set is enough. Keep the figures array order unchanged. Keep empty string if still not found.`,
      ];

      if (adjacentImages.prevImageBase64) {
        followUpContents.push('--- PREVIOUS PAGE IMAGE ---');
        followUpContents.push({ inlineData: { mimeType: PDF_IMAGE_MIME_TYPE, data: adjacentImages.prevImageBase64 } });
      }
      if (adjacentImages.nextImageBase64) {
        followUpContents.push('--- NEXT PAGE IMAGE ---');
        followUpContents.push({ inlineData: { mimeType: PDF_IMAGE_MIME_TYPE, data: adjacentImages.nextImageBase64 } });
      }

      if (followUpContents.length > 1) {
        response = await withTimeout(
          chat.sendMessage({ message: followUpContents }),
          GEMINI_EXTRACTION_TIMEOUT_MS,
          'Gemini extraction follow-up'
        );
        result = normalizeExtractionResult(JSON.parse(response.text || '{}') as LlmExtractionResponse);
      }
    }

    return result;
  } catch (error) {
    console.error('Gemini API Error:', error);
    throw error;
  }
}
