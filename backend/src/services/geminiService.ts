import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Use the specific API key provided by the environment
const apiKey = process.env.QUARKUS_LANGCHAIN4J_AI_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export interface ExtractedCallout {
  calloutIdentifier: string;
  actualIdentifier?: string;
  figureNumber: string;
  sourceTerm: string;
  functionalDescription: string;
}

export interface AnalysisResult {
  extractedConcepts: ExtractedCallout[];
  unreferencedCallouts: string[];
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
          calloutIdentifier: { 
            type: Type.STRING,
            description: "The identifier as stated in the text."
          },
          actualIdentifier: { 
            type: Type.STRING,
            description: "The identifier as it actually appears in the image. Useful for catching mismatches/wrongly put callouts. Omit this field completely if it matches the calloutIdentifier."
          },
          figureNumber: {
            type: Type.STRING,
            description: "The figure number this callout belongs to, if explicitly stated (e.g., 'Figure 4.1'). If not found, return an empty string."
          },
          sourceTerm: { type: Type.STRING },
          functionalDescription: { 
            type: Type.STRING,
            description: "A general, independent description of the part's typical function. Avoid overly specific context-bound actions."
          }
        },
        required: ["calloutIdentifier", "figureNumber", "sourceTerm", "functionalDescription"]
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
2. For each callout found anywhere on the page, search the provided text in the image to find its name (sourceTerm).
3. Write a concise, GENERAL, and INDEPENDENT functional description for the sourceTerm. Describe what the part is or its general purpose, NOT the specific action being performed with it in this exact step (e.g., for a "Dial", write "A control knob used for manual adjustments" rather than "turned to open the hatch").
4. CRITICAL: If a callout exists in ANY image on the page but is NOT explained in the text, DO NOT guess its physical nature. Add its identifier to the "unreferencedCallouts" array.
5. Identify "uncalledReferences": terms that are explicitly assigned a callout identifier in the text (e.g., "Dial (C)"), but that specific callout identifier is MISSING from the illustrations.
6. Validation: For extracted concepts, record the identifier as stated in the text in "calloutIdentifier". If the actual identifier shown in the image differs (a wrongly put callout), record the image's version in "actualIdentifier". If they match, OMIT the "actualIdentifier" field completely.
7. Extract the figure number (e.g., "Figure 4.1") if explicitly stated. If not found, return an empty string for "figureNumber".
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