import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { PDF_IMAGE_MIME_TYPE } from '../constants/pdfProcessing.js';
import type { ExtractedCallout } from './geminiService.js';

dotenv.config();

const apiKey = process.env.QUARKUS_LANGCHAIN4J_AI_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export type PageValidateMode = 'withConcepts' | 'standalone' | 'discoverAndValidate';

export interface LabelMismatch {
  textIdentifier: string;
  imageIdentifier: string;
  sourceTerm: string;
}

export interface CalloutValidationResult {
  unreferencedCallouts: string[];
  uncalledReferences: string[];
  labelMismatches: LabelMismatch[];
}

export interface PageValidationOutput extends CalloutValidationResult {
  /** Set when mode is discoverAndValidate; otherwise omitted. */
  figureNumber?: string;
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

const discoverAndValidateSchema = {
  type: Type.OBJECT,
  properties: {
    figureNumber: {
      type: Type.STRING,
      description: 'Page-local figure index: "1" for the first illustration in reading order on this page, then "2", "3", etc. Ignore document-printed figure numbers.',
    },
    unreferencedCallouts: validationSchema.properties.unreferencedCallouts,
    uncalledReferences: validationSchema.properties.uncalledReferences,
    labelMismatches: validationSchema.properties.labelMismatches,
  },
  required: ['figureNumber', 'unreferencedCallouts', 'uncalledReferences', 'labelMismatches'],
};

function normalizeValidationResult(raw: Record<string, unknown>): CalloutValidationResult {
  return {
    unreferencedCallouts: (raw.unreferencedCallouts as string[]) ?? [],
    uncalledReferences: (raw.uncalledReferences as string[]) ?? [],
    labelMismatches: (raw.labelMismatches as LabelMismatch[]) ?? [],
  };
}

function buildPrompt(mode: PageValidateMode, extractedConcepts: ExtractedCallout[]): string {
  if (mode === 'withConcepts') {
    return `
You are a technical documentation QA analyst validating callout extraction.

I am providing a manual page image and extracted concepts from a prior extraction pass.
Verify callout coverage and label consistency. Do NOT invent part names.

EXTRACTED CONCEPTS:
${JSON.stringify(extractedConcepts, null, 2)}

INSTRUCTIONS:
1. unreferencedCallouts: labels visible in the image but not explained in the page text. List identifiers only.
2. uncalledReferences: the text assigns a callout label but that label is missing from the illustrations.
3. labelMismatches: text assigns label X but the image shows label Y for the same part. Include sourceTerm when known, otherwise empty string.
`;
  }

  if (mode === 'standalone') {
    return `
You are a technical documentation QA analyst validating callout referential integrity.

I am providing a manual page image. Read the page text and illustration directly.
Do NOT invent part names.

INSTRUCTIONS:
1. unreferencedCallouts: labels visible in the image but not explained in the page text. List identifiers only.
2. uncalledReferences: the text assigns a callout label but that label is missing from the illustrations.
3. labelMismatches: text assigns label X but the image shows label Y for the same part. Use empty string for sourceTerm when unknown.
`;
  }

  return `
You are a technical documentation QA analyst discovering and validating figures on a manual page.

I am providing a manual page image. Read the page text and illustration directly.
Do NOT invent part names.

INSTRUCTIONS:
1. figureNumber: page-local index starting at "1" in reading order. Ignore document-printed numbers. Use "1" when only one illustration.
2. unreferencedCallouts: labels visible in the image but not explained in the page text. List identifiers only.
3. uncalledReferences: the text assigns a callout label but that label is missing from the illustrations.
4. labelMismatches: text assigns label X but the image shows label Y for the same part. Use empty string for sourceTerm when unknown.
`;
}

async function runAdjacentFollowUp(
  chat: ReturnType<typeof ai.chats.create>,
  result: CalloutValidationResult,
  fetchAdjacentImages: () => Promise<{ prevImageBase64?: string; nextImageBase64?: string }>,
  mode: PageValidateMode
): Promise<CalloutValidationResult & { figureNumber?: string }> {
  if (!result.unreferencedCallouts?.length) {
    return result;
  }

  console.log(
    `[Gemini Validation] Checking adjacent pages for unreferenced callouts: ${result.unreferencedCallouts.join(', ')}`
  );

  const adjacentImages = await fetchAdjacentImages();
  const followUpContents: Array<string | { inlineData: { mimeType: string; data: string } }> = [
    mode === 'discoverAndValidate'
      ? `Adjacent page images are provided. Re-check unreferenced callouts: ${result.unreferencedCallouts.join(', ')}. Update figureNumber and all validation arrays.`
      : `Adjacent page images are provided. Re-check unreferenced callouts: ${result.unreferencedCallouts.join(', ')}. Update the validation arrays.`,
  ];

  if (adjacentImages.prevImageBase64) {
    followUpContents.push('--- PREVIOUS PAGE IMAGE ---');
    followUpContents.push({ inlineData: { mimeType: PDF_IMAGE_MIME_TYPE, data: adjacentImages.prevImageBase64 } });
  }
  if (adjacentImages.nextImageBase64) {
    followUpContents.push('--- NEXT PAGE IMAGE ---');
    followUpContents.push({ inlineData: { mimeType: PDF_IMAGE_MIME_TYPE, data: adjacentImages.nextImageBase64 } });
  }

  if (followUpContents.length <= 1) {
    return result;
  }

  const response = await chat.sendMessage({ message: followUpContents });
  const parsed = JSON.parse(response.text || '{}') as Record<string, unknown>;
  const validation = normalizeValidationResult(parsed);

  if (mode === 'discoverAndValidate') {
    return {
      ...validation,
      figureNumber: typeof parsed.figureNumber === 'string' ? parsed.figureNumber : '',
    };
  }

  return validation;
}

export function pickValidateMode(
  illustration: { figureNumber: string | null; callouts: unknown[] } | null
): PageValidateMode {
  if (illustration?.callouts && illustration.callouts.length > 0) {
    return 'withConcepts';
  }
  if (illustration) {
    return 'standalone';
  }
  return 'discoverAndValidate';
}

export async function validatePageWithGemini(
  imageBase64: string,
  mode: PageValidateMode,
  extractedConcepts: ExtractedCallout[] = [],
  fetchAdjacentImages?: () => Promise<{ prevImageBase64?: string; nextImageBase64?: string }>
): Promise<PageValidationOutput> {
  const schema = mode === 'discoverAndValidate' ? discoverAndValidateSchema : validationSchema;

  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      responseMimeType: 'application/json',
      responseSchema: schema,
      temperature: 0.1,
    },
  });

  try {
    let response = await chat.sendMessage({
      message: [
        { text: buildPrompt(mode, extractedConcepts) },
        { inlineData: { mimeType: PDF_IMAGE_MIME_TYPE, data: imageBase64 } },
      ],
    });

    let parsed = JSON.parse(response.text || '{}') as Record<string, unknown>;
    let validation = normalizeValidationResult(parsed);
    let figureNumber = mode === 'discoverAndValidate' && typeof parsed.figureNumber === 'string'
      ? parsed.figureNumber
      : undefined;

    if (fetchAdjacentImages) {
      const updated = await runAdjacentFollowUp(chat, validation, fetchAdjacentImages, mode);
      validation = {
        unreferencedCallouts: updated.unreferencedCallouts,
        uncalledReferences: updated.uncalledReferences,
        labelMismatches: updated.labelMismatches,
      };
      if (mode === 'discoverAndValidate' && updated.figureNumber !== undefined) {
        figureNumber = updated.figureNumber;
      }
    }

    return {
      ...validation,
      ...(figureNumber !== undefined ? { figureNumber } : {}),
    };
  } catch (error) {
    console.error('Gemini Validation API Error:', error);
    throw error;
  }
}

/** @deprecated Use validatePageWithGemini with mode 'withConcepts' */
export async function validatePageCalloutsWithGemini(
  imageBase64: string,
  extractedConcepts: ExtractedCallout[],
  fetchAdjacentImages?: () => Promise<{ prevImageBase64?: string; nextImageBase64?: string }>
): Promise<CalloutValidationResult> {
  const result = await validatePageWithGemini(
    imageBase64,
    'withConcepts',
    extractedConcepts,
    fetchAdjacentImages
  );
  return {
    unreferencedCallouts: result.unreferencedCallouts,
    uncalledReferences: result.uncalledReferences,
    labelMismatches: result.labelMismatches,
  };
}
