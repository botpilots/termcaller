import { normalizeSourceTerm } from './normalizeSourceTerm.js';

/** Split manual text into normalized lemma tokens for corpus frequency. */
export function tokenizeCorpusText(text: string): string[] {
  const raw = text.toLowerCase().split(/[^a-z0-9]+/);
  const tokens: string[] = [];

  for (const piece of raw) {
    if (!piece) continue;
    const normalized = normalizeSourceTerm(piece);
    if (normalized) tokens.push(normalized);
  }

  return tokens;
}
