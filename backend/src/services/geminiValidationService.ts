import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import type { ExtractedCallout } from './geminiService.js';

dotenv.config();

const apiKey = process.env.QUARKUS_LANGCHAIN4J_AI_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export interface LabelMismatch {
  textIdentifier: string;
  imageIdentifier: string;
  sourceTerm: string;
}

export interface CalloutValidationResult {
  /** Image shows this label, but the text never explains it. */
  unreferencedCallouts: string[];
  /** Text assigns this label, but it is missing from the image. */
  uncalledReferences: string[];
  /** Text says textIdentifier but the image shows imageIdentifier for the same part. */
  labelMismatches: LabelMismatch[];
}

const validationSchema = {
  type: Type.OBJECT,
  properties: {
    unreferencedCallouts: {
      type: Type.ARRAY,
      description: 'Callout labels visible in the image with no explanation in the text.',
      items: { type: Type.STRING },
    },
    uncalledReferences: {
      type: Type.ARRAY,
      description: 'Labels assigned in the text (e.g. "Dial (C)") that are missing from the image.',
      items: { type: Type.STRING },
    },
    labelMismatches: {
      type: Type.ARRAY,
      description: 'Pairs where text and image disagree on the label for the same part.',
      items: {
        type: Type.OBJECT,
        properties: {
          textIdentifier: { type: Type.STRING },
          imageIdentifier: { type: Type.STRING },
          sourceTerm: { type: Type.STRING },
        },
        required: ['textIdentifier', 'imageIdentifier', 'sourceTerm'],
      },
    },
  },
  required: ['unreferencedCallouts', 'uncalledReferences', 'labelMismatches'],
};

export async function validatePageCalloutsWithGemini(
  imageBase64: string,
  extractedConcepts: ExtractedCallout[],
  fetchAdjacentImages?: () => Promise<{ prevImageBase64?: string; nextImageBase64?: string }>
): Promise<CalloutValidationResult> {
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      responseMimeType: 'application/json',
      responseSchema: validationSchema,
      temperature: 0.1,
    },
  });

  const conceptsSummary = JSON.stringify(extractedConcepts, null, 2);

  const prompt = `
You are a technical documentation QA analyst validating callout extraction.

I am providing a manual page image and the extracted concepts from a prior extraction pass.
Verify callout coverage and label consistency. Do NOT invent part names.

EXTRACTED CONCEPTS:
${conceptsSummary}

INSTRUCTIONS:
1. unreferencedCallouts: labels visible in the image but not explained in the page text. List identifiers only—do not guess part names.
2. uncalledReferences: the text assigns a callout label (e.g. "Dial (C)") but that label is missing from the illustrations.
3. labelMismatches: the text assigns label X but the image shows label Y for the same part. Include sourceTerm from the extraction when known, otherwise empty string.
`;

  try {
    let response = await chat.sendMessage({
      message: [
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: imageBase64 } },
      ],
    });

    let result = JSON.parse(response.text || '{}') as CalloutValidationResult;

    if (result.unreferencedCallouts?.length > 0 && fetchAdjacentImages) {
      console.log(
        `[Gemini Validation] Checking adjacent pages for unreferenced callouts: ${result.unreferencedCallouts.join(', ')}`
      );

      const adjacentImages = await fetchAdjacentImages();
      const followUpContents: Array<string | { inlineData: { mimeType: string; data: string } }> = [
        `Adjacent page images are provided. Re-check whether these unreferenced callouts are explained on adjacent pages: ${result.unreferencedCallouts.join(', ')}. Update the three validation arrays.`,
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
        response = await chat.sendMessage({ message: followUpContents });
        result = JSON.parse(response.text || '{}') as CalloutValidationResult;
      }
    }

    return {
      unreferencedCallouts: result.unreferencedCallouts ?? [],
      uncalledReferences: result.uncalledReferences ?? [],
      labelMismatches: result.labelMismatches ?? [],
    };
  } catch (error) {
    console.error('Gemini Validation API Error:', error);
    throw error;
  }
}
