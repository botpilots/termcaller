import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.QUARKUS_LANGCHAIN4J_AI_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const EMBEDDING_MODEL = 'gemini-embedding-001';

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const result = await ai.models.embedContent({
    model: EMBEDDING_MODEL,
    contents: texts,
    config: {
      taskType: 'SEMANTIC_SIMILARITY',
    },
  });

  return (result.embeddings ?? []).map((embedding) => embedding.values ?? []);
}

export async function embedText(text: string): Promise<number[]> {
  const [vector] = await embedTexts([text]);
  if (!vector?.length) {
    throw new Error('Embedding API returned an empty vector');
  }
  return vector;
}
