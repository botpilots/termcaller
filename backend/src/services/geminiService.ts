import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Use the specific API key provided by the environment
const apiKey = process.env.QUARKUS_LANGCHAIN4J_AI_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

/**
 * Gemini extraction result for one page.
 *
 * Three kinds of callout anomalies:
 *
 * 1. Label mismatch (per extracted concept, parallel arrays):
 *    calloutIdentifiers[i] = expected label from TEXT (e.g. "15")
 *    actualIdentifiers[i]  = label shown on IMAGE for the same part (e.g. "16")
 *    Read as pairs by index: text says 15, image shows 16 → documentation typo.
 *    The part's meaning comes from sourceTerm, not from decoding the image label.
 *    Omit actualIdentifiers entirely when all pairs match.
 *
 * 2. unreferencedCallouts: identifier appears in the image but has no text explanation.
 *
 * 3. uncalledReferences: text assigns an identifier (e.g. "Dial (C)") but it is missing from the image.
 */
export interface ExtractedCallout {
  /** Expected callout label(s) as stated in the document text. */
  calloutIdentifiers: string[];
  /**
   * Optional. Parallel to calloutIdentifiers — same length, same index.
   * actualIdentifiers[i] is what the IMAGE shows when it differs from calloutIdentifiers[i].
   * Example: calloutIdentifiers ["15"], actualIdentifiers ["16"] → text says 15, image shows 16.
   */
  actualIdentifiers?: string[];
  figureNumber: string;
  sourceTerm: string;
  functionalDescription: string;
}

export interface AnalysisResult {
  extractedConcepts: ExtractedCallout[];
  /** Image has this callout label, but the text never explains it. */
  unreferencedCallouts: string[];
  /** Text references this callout label, but it is missing from the image. */
  uncalledReferences: string[];
}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    extractedConcepts: {
      type: Type.ARRAY,
      description: "List of terminology concepts successfully extracted and referenced in the text.",
      items: {
        type: Type.OBJECT,
        properties: {
          calloutIdentifiers: { 
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Expected callout label(s) from the document text. When grouped, all labels that share this sourceTerm and functionalDescription."
          },
          actualIdentifiers: { 
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Optional. Parallel to calloutIdentifiers (same length, matched by index). actualIdentifiers[i] is the label shown on the IMAGE when it differs from calloutIdentifiers[i]. Example: text says 15, image shows 16. Omit entirely when all pairs match."
          },
          figureNumber: {
            type: Type.STRING,
            description: "The figure number this callout belongs to, if explicitly stated (e.g., 'Figure 4.1'). If not found, return an empty string."
          },
          sourceTerm: {
            type: Type.STRING,
            description: "The part name as a singular noun in lowercase (e.g. 'screw', 'bracket'). Always singularize plurals from the document ('Screws' → 'screw') and ignore original casing ('Dial' → 'dial')."
          },
          functionalDescription: { 
            type: Type.STRING,
            description: "A general, independent description of the part's typical function. Avoid overly specific context-bound actions."
          }
        },
        required: ["calloutIdentifiers", "figureNumber", "sourceTerm", "functionalDescription"]
      }
    },
    unreferencedCallouts: {
      type: Type.ARRAY,
      description: "List of callout identifiers found in the image(s) that have NO explanation or reference in the provided text.",
      items: { type: Type.STRING }
    },
    uncalledReferences: {
      type: Type.ARRAY,
      description: "List of terms that are explicitly assigned a callout identifier in the text (e.g., 'Dial (C)'), but that specific callout identifier is MISSING from the image.",
      items: { type: Type.STRING }
    }
  },
  required: ["extractedConcepts", "unreferencedCallouts", "uncalledReferences"]
};

export async function analyzePageWithGemini(
  imageBase64: string,
  // Optional callbacks to fetch more context if the LLM requests it
  fetchAdjacentImages?: () => Promise<{ prevImageBase64?: string, nextImageBase64?: string }>
): Promise<AnalysisResult> {
  
  // We use the Chat interface to maintain context if multiple turns are needed
  const chat = ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      responseMimeType: 'application/json',
      responseSchema: responseSchema,
      temperature: 0.1, // Keep it deterministic
    }
  });

  const initialPrompt = `
You are an expert technical documentation analyst. 
I am providing a high-resolution image of a single manual page. This page may contain MULTIPLE illustrations and text sections.

INSTRUCTIONS:
1. Identify all "callouts" (numbers or letters pointing to parts) across ALL illustrations on this page.
2. For each callout found anywhere on the page, search the provided text in the image to find its name (sourceTerm). If you cannot find it, output the empty string.
3. NORMALIZE sourceTerm: always output singular nouns in lowercase. If the document says "Screws", "BRACKET", or "Dials", output "screw", "bracket", or "dial". Never keep plural forms or original casing.
4. Write a concise, GENERAL, and INDEPENDENT functional description for the sourceTerm. Describe what the part is or its general purpose, NOT the specific action being performed with it in this exact step (e.g., for a "dial", write "A control knob used for manual adjustments" rather than "turned to open the hatch").
5. CRITICAL: If a callout exists in ANY image on the page but is NOT explained in the text, DO NOT guess its physical nature. Add its identifier to the "unreferencedCallouts" array.
6. Identify "uncalledReferences": terms that are explicitly assigned a callout identifier in the text (e.g., "Dial (C)"), but that specific callout identifier is MISSING from the illustrations.
7. GROUPING: When multiple callouts on this page refer to the same part with the same name and meaning, return ONE extractedConcepts entry with all their identifiers in "calloutIdentifiers" (e.g. ["12", "15", "18"]). Do NOT repeat sourceTerm or functionalDescription for each duplicate. Group plurals and different casings under the same normalized sourceTerm.
8. LABEL MISMATCH (parallel arrays): Record each identifier as stated in the text in "calloutIdentifiers". If the image shows a different label for the same part, record the image label at the same index in "actualIdentifiers" (e.g. calloutIdentifiers ["15"], actualIdentifiers ["16"] means text says 15 but image shows 16). If all labels match, OMIT "actualIdentifiers" completely.
9. Extract the figure number (e.g., "Figure 4.1") if explicitly stated. If not found, return an empty string for "figureNumber".
`;

  try {
    // TURN 1: Initial Analysis
    let response = await chat.sendMessage({
      message: [
        { text: initialPrompt },
        { inlineData: { mimeType: 'image/png', data: imageBase64 } }
      ]
    });

    let result = JSON.parse(response.text || '{}') as AnalysisResult;

    // TURN 2: If LLM needs more context and we have the callback to get it
    if (result.unreferencedCallouts && result.unreferencedCallouts.length > 0 && fetchAdjacentImages) {
      console.log(`[Gemini] Requested more context for unreferenced callouts: ${result.unreferencedCallouts.join(', ')}`);
      
      const adjacentImages = await fetchAdjacentImages();
      const followUpContents: any[] = [
        `Here are the images for the adjacent pages. Please check if these images help you resolve the following unreferenced callouts: ${result.unreferencedCallouts.join(', ')}. Return the updated lists.`
      ];

      if (adjacentImages.prevImageBase64) {
        followUpContents.push("--- PREVIOUS PAGE IMAGE ---");
        followUpContents.push({ inlineData: { mimeType: 'image/png', data: adjacentImages.prevImageBase64 } });
      }
      if (adjacentImages.nextImageBase64) {
        followUpContents.push("--- NEXT PAGE IMAGE ---");
        followUpContents.push({ inlineData: { mimeType: 'image/png', data: adjacentImages.nextImageBase64 } });
      }

      if (followUpContents.length > 1) {
        response = await chat.sendMessage({ message: followUpContents });
        result = JSON.parse(response.text || '{}') as AnalysisResult;
      }
    }

    return result;
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
}