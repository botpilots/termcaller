import { ThinkingLevel } from '@google/genai';

/** Max wait per Gemini round-trip (initial + optional follow-up each get this budget). */
export const GEMINI_EXTRACTION_TIMEOUT_MS = 180_000;

/** Light reasoning for callout scanning — faster than default high, more stable than minimal. */
export const GEMINI_EXTRACTION_THINKING_LEVEL = ThinkingLevel.LOW;

/** Light reasoning for validation — MEDIUM was more accurate in manual QA but too costly per page; LOW matches extraction. */
export const GEMINI_VALIDATION_THINKING_LEVEL = ThinkingLevel.LOW;
