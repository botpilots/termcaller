import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { GEMINI_VALIDATION_THINKING_LEVEL } from '../constants/gemini.js';
import { PDF_IMAGE_MIME_TYPE } from '../constants/pdfProcessing.js';
import type { ExtractedCallout } from './geminiService.js';

dotenv.config();

const apiKey = process.env.QUARKUS_LANGCHAIN4J_AI_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

/** @deprecated Batch validation always uses page-level figures[] now. */
export type PageValidateMode = 'pageValidate';

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

export interface DiscoveredFigureValidation extends CalloutValidationResult {
  figureNumber: string;
}

export interface PageValidationOutput {
  discoveredFigures: DiscoveredFigureValidation[];
}

export interface FigureValidationInput {
  figureNumber: string;
  extractedConcepts: ExtractedCallout[];
}

interface LlmFigureValidation {
  unreferencedCallouts?: string[];
  uncalledReferences?: string[];
  labelMismatches?: LabelMismatch[];
}

interface LlmDiscoverAndValidateResponse {
  figures?: LlmFigureValidation[];
}

const CALLOUT_RULES = `
CALLOUT IDENTIFIER RULES (apply to every figure):
- Validate ONLY illustration callout leader labels: small numbers or letters on arrows/leaders/pointers pointing at parts (e.g. 1, 2, A, B, (3)).
- A callout label is NEVER the same as body text, dimensions, units, torque values, or standards printed on or near the drawing.
- IGNORE and NEVER report as unreferencedCallouts or uncalledReferences:
  - Dimensions and measurements (10 mm, 0.5", ø12, φ4, 25.4)
  - Units and unit annotations (mm, cm, m, m2, m², in, Nm, °)
  - Fastener/thread sizing (M2, M4, M4x8, M30)
  - Standards references (DIN 912, ISO 4762)
  - Serial numbers, model numbers, registration numbers, quantities, dates, barcodes, scale markers, view labels (SECTION A-A), or decorative text
- If text is printed along a dimension line, inside a measurement box, or next to a unit symbol, it is NOT a callout — skip it entirely.
- Each figures[] entry covers ONE illustration only — do not report labels from other figures on this page.
- Scope instructional text to each illustration using its "Figure X.X" caption on the page.
- List identifiers only (no part names in unreferencedCallouts / uncalledReferences).
`;

const LABEL_MISMATCH_RULES = `
LABEL MISMATCH RULES:
- Report only when the TEXT explicitly assigns a callout label to a named part AND that label differs from the illustration arrow for the same part.
- textIdentifier = the label written in parentheses next to the part name in the text (what the text says).
- imageIdentifier = the label shown on the illustration arrow pointing at that same part (what the image shows).
- NEVER swap textIdentifier and imageIdentifier.
- NEVER use a textIdentifier that does not appear in parentheses next to that part name in the text.
- Example: text says "cotter pin (B)" but the illustration arrow for the cotter pin shows A → { textIdentifier: "B", imageIdentifier: "A", sourceTerm: "cotter pin" }.
- Do NOT report { textIdentifier: "A", imageIdentifier: "B", sourceTerm: "cotter pin" } unless the text literally says "cotter pin (A)".
- If a part IS named in the text but with the wrong label, use labelMismatches — do NOT list the illustration's correct label as unreferenced.
`;

const figureValidationItemSchema = {
  type: Type.OBJECT,
  properties: {
    unreferencedCallouts: {
      type: Type.ARRAY,
      description:
        'Callout leader labels (arrow/pointer numbers or letters only) visible on THIS illustration but not explained in the page text. Exclude dimensions, units, and all non-callout annotation text. Identifiers only.',
      items: { type: Type.STRING },
    },
    uncalledReferences: {
      type: Type.ARRAY,
      description:
        'Callout leader labels (arrow/pointer numbers or letters only) assigned in the text to THIS illustration but missing from its image. Exclude dimensions, units, and all non-callout annotation text. Identifiers only.',
      items: { type: Type.STRING },
    },
    labelMismatches: {
      type: Type.ARRAY,
      description: 'Pairs where text and image disagree on the leader label for the same part on THIS illustration.',
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

const pageValidateSchema = {
  type: Type.OBJECT,
  properties: {
    figures: {
      type: Type.ARRAY,
      description:
        'One entry per illustration in reading order (top-to-bottom, left-to-right). Do not include figures with no callout labels.',
      items: figureValidationItemSchema,
    },
  },
  required: ['figures'],
};

/** Reject dimension, unit, and standard annotations that are not callout leader labels. */
export function looksLikeDimensionOrUnitAnnotation(id: string): boolean {
  const label = id.trim();
  if (!label) return false;

  const normalized = label.replace(/²/g, '2').toLowerCase();

  if (/^(mm|cm|km|m\d*|in|ft|nm|psi|bar|kg|g|lb|oz|deg|°)$/.test(normalized)) return true;
  if (/^m\d+(\s*x\s*\d+)?$/i.test(label)) return true;
  if (/^[øØφ]\s*\d/i.test(label)) return true;
  if (/^\d+(\.\d+)?\s*(mm|cm|m|in|ft|nm|°|deg)$/i.test(label)) return true;
  if (/\b(DIN|ISO)\s*\d+/i.test(label)) return true;

  return false;
}

/** Reject long numeric strings and other values that are not plausible callout leader labels. */
export function isPlausibleCalloutLabel(id: string): boolean {
  const label = id.trim();
  if (!label || label.length > 6) return false;
  if (looksLikeDimensionOrUnitAnnotation(label)) return false;
  if (/^\d{4,}$/.test(label)) return false;
  if (/^[A-Z0-9]{5,}$/i.test(label) && !/^[A-Z]\d?$/i.test(label)) return false;
  return true;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True when page text explicitly assigns calloutId in parentheses next to sourceTerm. */
export function textAssignsCalloutToPart(
  pageText: string,
  sourceTerm: string,
  textIdentifier: string
): boolean {
  const term = sourceTerm.trim();
  const id = textIdentifier.trim().replace(/^\(|\)$/g, '');
  if (!term || !id) return false;

  const patterns = [
    new RegExp(`${escapeRegExp(term)}\\s*\\(${escapeRegExp(id)}\\)`, 'i'),
    new RegExp(`${escapeRegExp(term)}[^.\\n]{0,80}\\(${escapeRegExp(id)}\\)`, 'i'),
  ];
  return patterns.some(pattern => pattern.test(pageText));
}

export function filterLabelMismatchesAgainstPageText(
  pageText: string,
  mismatches: LabelMismatch[]
): LabelMismatch[] {
  if (!pageText.trim()) return mismatches;

  return mismatches.filter(mismatch =>
    textAssignsCalloutToPart(pageText, mismatch.sourceTerm, mismatch.textIdentifier)
  );
}

export function sanitizeValidationResult(
  raw: CalloutValidationResult,
  pageText?: string
): CalloutValidationResult {
  const labelMismatches = pageText
    ? filterLabelMismatchesAgainstPageText(pageText, raw.labelMismatches)
    : raw.labelMismatches;

  return {
    unreferencedCallouts: uniqueStrings(raw.unreferencedCallouts).filter(isPlausibleCalloutLabel),
    uncalledReferences: uniqueStrings(raw.uncalledReferences).filter(isPlausibleCalloutLabel),
    labelMismatches: labelMismatches.filter(
      mismatch =>
        isPlausibleCalloutLabel(mismatch.textIdentifier) &&
        isPlausibleCalloutLabel(mismatch.imageIdentifier) &&
        mismatch.textIdentifier !== mismatch.imageIdentifier
    ),
  };
}

function normalizeValidationResult(
  raw: Record<string, unknown>,
  pageText?: string
): CalloutValidationResult {
  return sanitizeValidationResult(
    {
      unreferencedCallouts: (raw.unreferencedCallouts as string[]) ?? [],
      uncalledReferences: (raw.uncalledReferences as string[]) ?? [],
      labelMismatches: (raw.labelMismatches as LabelMismatch[]) ?? [],
    },
    pageText
  );
}

/** Flatten ordered figure validation array with auto-assigned figure numbers. */
export function normalizeDiscoveredFigures(
  raw: LlmDiscoverAndValidateResponse,
  pageText?: string
): DiscoveredFigureValidation[] {
  return (raw.figures ?? []).map((figure, figureIndex) => ({
    figureNumber: String(figureIndex + 1),
    ...normalizeValidationResult(figure as Record<string, unknown>, pageText),
  }));
}

function buildPageValidatePrompt(knownFigures: FigureValidationInput[]): string {
  if (knownFigures.length === 0) {
    return `
You are a technical documentation QA analyst discovering and validating figures on a manual page.

I am providing a manual page image. Read the page text and illustrations directly.
Do NOT invent part names.
Validate ONLY callout leader labels (arrow/pointer numbers and letters). Ignore dimensions, units, measurements, and all other printed annotation text on diagrams.

INSTRUCTIONS:
1. Return one entry in figures per illustration with callout leader labels, ordered top-to-bottom then left-to-right. Do not include figures with no callout labels.
2. For each figure: unreferencedCallouts — leader labels visible on that illustration but not explained in the page text.
3. For each figure: uncalledReferences — leader labels assigned in the text to that illustration but missing from its image.
4. For each figure: labelMismatches — text assigns label X but that illustration shows label Y for the same part. Use empty string for sourceTerm when unknown.
${CALLOUT_RULES}
${LABEL_MISMATCH_RULES}
`;
  }

  const figureBlocks = knownFigures
    .map(
      (figure, index) => `
FIGURE ${index + 1} (figureNumber ${figure.figureNumber}):
EXTRACTED CONCEPTS:
${JSON.stringify(figure.extractedConcepts, null, 2)}`
    )
    .join('\n');

  return `
You are a technical documentation QA analyst validating callout referential integrity on a manual page.

I am providing a manual page image. There are ${knownFigures.length} illustration(s) on this page in reading order (top-to-bottom, left-to-right).
Return exactly ${knownFigures.length} entries in figures[], one per illustration, in that order.
Do NOT invent part names.
Validate ONLY callout leader labels (arrow/pointer numbers and letters). Ignore dimensions, units, measurements, and all other printed annotation text on diagrams.

${figureBlocks}

INSTRUCTIONS (apply per figure entry, scoped to that illustration only):
1. unreferencedCallouts — leader labels visible on that illustration but not explained in the page text.
2. uncalledReferences — leader labels assigned in the text to that illustration but missing from its image.
3. labelMismatches — text assigns label X but that illustration shows label Y for the same part. Include sourceTerm when known, otherwise empty string.
${CALLOUT_RULES}
${LABEL_MISMATCH_RULES}
`;
}

async function runAdjacentFollowUp(
  chat: ReturnType<typeof ai.chats.create>,
  result: PageValidationOutput,
  fetchAdjacentImages: () => Promise<{ prevImageBase64?: string; nextImageBase64?: string }>,
  pageText?: string
): Promise<PageValidationOutput> {
  const unreferenced = result.discoveredFigures.flatMap(figure => figure.unreferencedCallouts);

  if (!unreferenced.length) {
    return result;
  }

  console.log(
    `[Gemini Validation] Checking adjacent pages for unreferenced callouts: ${unreferenced.join(', ')}`
  );

  const adjacentImages = await fetchAdjacentImages();
  const followUpContents: Array<string | { inlineData: { mimeType: string; data: string } }> = [
    `Adjacent page images are provided. Re-check unreferenced callouts: ${unreferenced.join(', ')}. Update the figures array and all validation fields. Keep figures array order unchanged. Remember: only arrow/pointer callout labels count — ignore dimensions, units (e.g. m2, mm), and other annotation text.`,
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
  const parsed = JSON.parse(response.text || '{}') as LlmDiscoverAndValidateResponse;

  return {
    discoveredFigures: normalizeDiscoveredFigures(parsed, pageText),
  };
}

/** @deprecated Batch validation uses validatePageFiguresWithGemini. */
export function pickValidateMode(
  illustration: { figureNumber: string | null; callouts: unknown[] } | null
): PageValidateMode {
  void illustration;
  return 'pageValidate';
}

export async function validatePageFiguresWithGemini(
  imageBase64: string,
  knownFigures: FigureValidationInput[],
  fetchAdjacentImages?: () => Promise<{ prevImageBase64?: string; nextImageBase64?: string }>,
  pageText?: string
): Promise<PageValidationOutput> {
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      responseMimeType: 'application/json',
      responseSchema: pageValidateSchema,
      temperature: 0.1,
      thinkingConfig: {
        thinkingLevel: GEMINI_VALIDATION_THINKING_LEVEL,
      },
    },
  });

  try {
    let response = await chat.sendMessage({
      message: [
        { text: buildPageValidatePrompt(knownFigures) },
        { inlineData: { mimeType: PDF_IMAGE_MIME_TYPE, data: imageBase64 } },
      ],
    });

    let parsed = JSON.parse(response.text || '{}') as LlmDiscoverAndValidateResponse;
    let result: PageValidationOutput = {
      discoveredFigures: normalizeDiscoveredFigures(parsed, pageText),
    };

    if (fetchAdjacentImages) {
      result = await runAdjacentFollowUp(chat, result, fetchAdjacentImages, pageText);
    }

    return result;
  } catch (error) {
    console.error('Gemini Validation API Error:', error);
    throw error;
  }
}

/** @deprecated Use validatePageFiguresWithGemini */
export async function validatePageWithGemini(
  imageBase64: string,
  _mode: PageValidateMode | 'withConcepts' | 'standalone' | 'discoverAndValidate',
  extractedConcepts: ExtractedCallout[] = [],
  fetchAdjacentImages?: () => Promise<{ prevImageBase64?: string; nextImageBase64?: string }>
): Promise<PageValidationOutput & CalloutValidationResult> {
  const knownFigures =
    extractedConcepts.length > 0
      ? [{ figureNumber: '1', extractedConcepts }]
      : [];

  const result = await validatePageFiguresWithGemini(imageBase64, knownFigures, fetchAdjacentImages);
  const first = result.discoveredFigures[0];

  return {
    ...result,
    unreferencedCallouts: first?.unreferencedCallouts ?? [],
    uncalledReferences: first?.uncalledReferences ?? [],
    labelMismatches: first?.labelMismatches ?? [],
  };
}

/** @deprecated Use validatePageFiguresWithGemini */
export async function validatePageCalloutsWithGemini(
  imageBase64: string,
  extractedConcepts: ExtractedCallout[],
  fetchAdjacentImages?: () => Promise<{ prevImageBase64?: string; nextImageBase64?: string }>
): Promise<CalloutValidationResult> {
  const result = await validatePageFiguresWithGemini(
    imageBase64,
    [{ figureNumber: '1', extractedConcepts }],
    fetchAdjacentImages
  );

  const first = result.discoveredFigures[0];
  return (
    first ?? {
      unreferencedCallouts: [],
      uncalledReferences: [],
      labelMismatches: [],
    }
  );
}
