import { normalizeSourceTerm } from './normalizeSourceTerm.js';

const MAX_CORPUS_TOKEN_LENGTH = 30;

/** Three or more of the same character in a row (e.g. eee). */
const REPEATED_CHAR_RUN = /(.)\1{2,}/;

/** PDF TOC/layout glue: "removeremoveremove" → "remove" (unit ≥3 chars, repeated ≥3×). */
const GLUED_TOKEN = /^(.{3,}?)\1{2,}$/;

const VOWEL = /[aeiou]/;
/** Five or more consecutive consonants — rare in English, common in OCR mashups. */
const LONG_CONSONANT_RUN = /[bcdfghjklmnpqrstvwxyz]{5,}/;
/** Four or more consecutive vowels — OCR noise. */
const LONG_VOWEL_RUN = /[aeiou]{4,}/;

/**
 * Collapse tokens formed when separate PDF text runs are concatenated without spaces.
 * Requires at least three repetitions of a unit to avoid splitting real words like "bonbon".
 */
export function collapseGluedToken(token: string): string {
  const match = token.match(GLUED_TOKEN);
  return match ? match[1] : token;
}

/** Reject OCR gibberish that survives splitting (e.g. dootaicssisiioinosienainasiaa). */
export function isPlausibleWord(token: string): boolean {
  if (LONG_CONSONANT_RUN.test(token) || LONG_VOWEL_RUN.test(token)) return false;

  if (token.length >= 10) {
    const vowelCount = [...token].filter((ch) => VOWEL.test(ch)).length;
    const ratio = vowelCount / token.length;
    if (ratio < 0.18 || ratio > 0.58) return false;
  }

  if (token.length >= 15) {
    const uniqueChars = new Set(token).size;
    if (uniqueChars / token.length < 0.4) return false;
  }

  return true;
}

/** Drop OCR noise, part numbers, glued tokens, and other non-lemma junk. */
export function isCorpusToken(token: string): boolean {
  if (token.length <= 1 || token.length > MAX_CORPUS_TOKEN_LENGTH) return false;
  if (/\d/.test(token)) return false;
  if (REPEATED_CHAR_RUN.test(token)) return false;
  if (!isPlausibleWord(token)) return false;
  return true;
}

/** Split manual text into normalized lemma tokens for corpus frequency. */
export function tokenizeCorpusText(text: string): string[] {
  const raw = text.toLowerCase().split(/[^a-z0-9]+/);
  const tokens: string[] = [];

  for (const piece of raw) {
    if (!piece) continue;
    const normalized = collapseGluedToken(normalizeSourceTerm(piece));
    if (normalized && isCorpusToken(normalized)) tokens.push(normalized);
  }

  return tokens;
}
