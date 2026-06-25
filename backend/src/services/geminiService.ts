import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

// Use the specific API key provided by the environment
const apiKey = process.env.QUARKUS_LANGCHAIN4J_AI_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

export interface ExtractedCallout {
  calloutIdentifier: string;
  sourceTerm: string;
  functionalDescription: string;
}

export interface AnalysisResult {
  extractedConcepts: ExtractedCallout[];
  unreferencedCallouts: string[];
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
          calloutIdentifier: { type: Type.STRING },
          sourceTerm: { type: Type.STRING },
          functionalDescription: { 
            type: Type.STRING,
            description: "A general, independent description of the part's typical function. Avoid overly specific context-bound actions."
          }
        },
        required: ["calloutIdentifier", "sourceTerm", "functionalDescription"]
      }
    },
    unreferencedCallouts: {
      type: Type.ARRAY,
      description: "List of callout identifiers found in the image(s) that have NO explanation or reference in the provided text.",
      items: { type: Type.STRING }
    }
  },
  required: ["extractedConcepts", "unreferencedCallouts"]
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
I am providing a high-resolution image of a manual page.

INSTRUCTIONS:
1. Identify all "callouts" (numbers or letters pointing to parts) in the illustrations.
2. For each callout, search the provided text in the image to find its name (sourceTerm).
3. Write a concise, GENERAL, and INDEPENDENT functional description for the sourceTerm. Describe what the part is or its general purpose, NOT the specific action being performed with it in this exact step (e.g., for a "Dial", write "A control knob used for manual adjustments" rather than "turned to open the hatch").
4. CRITICAL: If a callout exists in the image but is NOT explained in the text, DO NOT guess its physical nature. Add its identifier to the "unreferencedCallouts" array.
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