import { normalizeSourceTerm } from './normalizeSourceTerm.js';

/** Split phrases on whitespace, slashes, and hyphens (e.g. "master/slave system"). */
export const PHRASE_TOKEN_SPLIT = /[\s/\-]+/;

export function tokenizePhraseForCorpus(sourceTerm: string): string[] {
  const normalized = normalizeSourceTerm(sourceTerm);
  return normalized.split(PHRASE_TOKEN_SPLIT).filter(Boolean);
}

export interface PhraseTokenStats {
  termFreq: number;
  docFreq: number;
  freqRank: number;
}

/**
 * 2-word phrases: min term/doc freq (rarest token wins).
 * 3+ words: max term/doc freq (most common token wins).
 */
export function combinePhraseTokenStats(perToken: PhraseTokenStats[]): PhraseTokenStats {
  if (perToken.length === 0) {
    return { termFreq: 0, docFreq: 0, freqRank: -1 };
  }

  const docFreqs = perToken.map((t) => t.docFreq);
  const termFreqs = perToken.map((t) => t.termFreq);
  const freqRanks = perToken.map((t) => t.freqRank);
  const pick = perToken.length === 2 ? Math.min : Math.max;
  const pickRank = perToken.length === 2 ? Math.max : Math.min;

  return {
    docFreq: pick(...docFreqs),
    termFreq: pick(...termFreqs),
    freqRank: pickRank(...freqRanks),
  };
}

/**
 * Rarity from corpus frequency rank (0 = most common token, 1 = rarest / OOV).
 * Linear in rank — steep head of the Zipf distribution maps to low rarity scores.
 */
export function corpusRarityFromRank(freqRank: number, vocabSize: number): number {
  if (freqRank < 0 || vocabSize <= 1) {
    return 1;
  }
  return Math.min(1, freqRank / (vocabSize - 1));
}

/**
 * 2-word phrases: max rarity (rarest token wins).
 * 3+ words: min rarity (most common token wins).
 */
export function combinePhraseRarity(perTokenRarities: number[], tokenCount: number): number {
  if (perTokenRarities.length === 0) {
    return 1;
  }
  const pick = tokenCount === 2 ? Math.max : Math.min;
  return pick(...perTokenRarities);
}
