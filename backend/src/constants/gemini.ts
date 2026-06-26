import { ThinkingLevel } from '@google/genai';

/** Max wait per Gemini round-trip (initial + optional follow-up each get this budget). */
export const GEMINI_EXTRACTION_TIMEOUT_MS = 60_000;

/** Light reasoning for callout scanning — faster than default high, more stable than minimal. */
export const GEMINI_EXTRACTION_THINKING_LEVEL = ThinkingLevel.LOW;
