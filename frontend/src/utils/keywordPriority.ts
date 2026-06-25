import {
  combinePhraseRarity,
  combinePhraseTokenStats,
  corpusRarityFromRank,
  tokenizePhraseForCorpus,
} from './phraseCorpusTokens';
import { countFiguresForKeyword } from './figureOccurrences';

export interface CorpusWordRank {
  docs: number;
  totalTokens: number;
  vocabSize: number;
  terms: Record<string, { f: number; d: number; r: number }>;
}

export interface ResolvedCorpusStats {
  termFreq: number;
  docFreq: number;
  freqRank: number;
  inCorpus: boolean;
  matchedAsPhrase: boolean;
  corpusRarity: number;
}

export type KeywordSortMode = 'frequency' | 'both' | 'rarity';

export interface KeywordPriority {
  score: number;
  figureCount: number;
  corpusTermFreq: number;
  corpusRarity: number;
  inCorpus: boolean;
  rank: number;
}

function compareBySortMode(
  a: { sourceTerm: string; priority: KeywordPriority },
  b: { sourceTerm: string; priority: KeywordPriority },
  sortMode: KeywordSortMode
): number {
  const tie = a.sourceTerm.localeCompare(b.sourceTerm);
  switch (sortMode) {
    case 'frequency':
      return b.priority.figureCount - a.priority.figureCount || tie;
    case 'rarity':
      return b.priority.corpusRarity - a.priority.corpusRarity || tie;
    case 'both':
    default:
      return b.priority.score - a.priority.score || tie;
  }
}

export function resolveCorpusStats(
  sourceTerm: string,
  corpus: CorpusWordRank
): ResolvedCorpusStats {
  const normalized = sourceTerm.trim().toLowerCase();
  const vocabSize = corpus.vocabSize;
  const rarityForRank = (freqRank: number) => corpusRarityFromRank(freqRank, vocabSize);

  const exact = corpus.terms[normalized];
  if (exact) {
    return {
      termFreq: exact.f,
      docFreq: exact.d,
      freqRank: exact.r,
      inCorpus: true,
      matchedAsPhrase: true,
      corpusRarity: rarityForRank(exact.r),
    };
  }

  const tokens = tokenizePhraseForCorpus(sourceTerm);
  if (tokens.length <= 1) {
    const single = tokens[0] ? corpus.terms[tokens[0]] : undefined;
    if (single) {
      return {
        termFreq: single.f,
        docFreq: single.d,
        freqRank: single.r,
        inCorpus: true,
        matchedAsPhrase: false,
        corpusRarity: rarityForRank(single.r),
      };
    }
    return {
      termFreq: 0,
      docFreq: 0,
      freqRank: -1,
      inCorpus: false,
      matchedAsPhrase: false,
      corpusRarity: 1,
    };
  }

  const perToken = tokens.map(
    (token) => corpus.terms[token] ?? { f: 0, d: 0, r: -1 }
  );
  const anyKnown = tokens.some((token) => corpus.terms[token] !== undefined);
  const combined = combinePhraseTokenStats(
    perToken.map((t) => ({ termFreq: t.f, docFreq: t.d, freqRank: t.r }))
  );
  const perTokenRarities = perToken.map((token) => rarityForRank(token.r));
  const corpusRarity = combinePhraseRarity(perTokenRarities, tokens.length);

  return {
    termFreq: combined.termFreq,
    docFreq: combined.docFreq,
    freqRank: combined.freqRank,
    inCorpus: anyKnown,
    matchedAsPhrase: false,
    corpusRarity,
  };
}

export function computeKeywordPriority(
  sourceTerm: string,
  figureCount: number,
  corpus: CorpusWordRank
): Omit<KeywordPriority, 'rank'> {
  const stats = resolveCorpusStats(sourceTerm, corpus);
  const projectTf = Math.log1p(figureCount);
  const score = projectTf * stats.corpusRarity;

  return {
    score,
    figureCount,
    corpusTermFreq: stats.termFreq,
    corpusRarity: stats.corpusRarity,
    inCorpus: stats.inCorpus,
  };
}

export function rankKeywords<T extends { id: string; sourceTerm: string; callouts?: unknown[] }>(
  keywords: T[],
  corpus: CorpusWordRank | null,
  sortMode: KeywordSortMode = 'both'
): (T & { priority: KeywordPriority })[] {
  const scored = keywords.map((keyword) => {
    const figureCount = countFiguresForKeyword(keyword.callouts as { pageNumber?: number }[] | undefined);
    const priority = corpus
      ? computeKeywordPriority(keyword.sourceTerm, figureCount, corpus)
      : {
          score: 0,
          figureCount,
          corpusTermFreq: 0,
          corpusRarity: 0,
          inCorpus: false,
        };
    return { ...keyword, priority: { ...priority, rank: 0 } };
  });

  scored.sort((a, b) => compareBySortMode(a, b, sortMode));

  scored.forEach((entry, index) => {
    entry.priority.rank = index + 1;
  });

  return scored;
}
