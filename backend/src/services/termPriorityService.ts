import { loadCorpusIndex, resolveCorpusStats } from './corpusLookup.js';

export interface KeywordPriorityInput {
  id: string;
  sourceTerm: string;
  figureCount: number;
}

export interface KeywordPriority {
  score: number;
  figureCount: number;
  corpusTermFreq: number;
  corpusRarity: number;
  inCorpus: boolean;
  rank: number;
}

export interface RankedKeyword<T extends KeywordPriorityInput> extends T {
  priority: KeywordPriority;
}

/**
 * priority = log(1 + projectFigures) × corpusRarity
 * corpusRarity = freqRank / (vocabSize - 1), 0 for head-of-distribution generics, 1 for OOV.
 */
export function computeKeywordPriority(
  sourceTerm: string,
  figureCount: number,
  corpus = loadCorpusIndex()
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

export function rankKeywords<T extends KeywordPriorityInput>(
  keywords: T[]
): RankedKeyword<T>[] {
  const corpus = loadCorpusIndex();

  const scored = keywords.map((keyword) => {
    const priority = computeKeywordPriority(
      keyword.sourceTerm,
      keyword.figureCount,
      corpus
    );
    return { ...keyword, priority: { ...priority, rank: 0 } };
  });

  scored.sort(
    (a, b) =>
      b.priority.score - a.priority.score ||
      a.sourceTerm.localeCompare(b.sourceTerm)
  );

  scored.forEach((entry, index) => {
    entry.priority.rank = index + 1;
  });

  return scored;
}
