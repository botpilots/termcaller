import { loadCorpusIndex, resolveCorpusStats } from './corpusLookup.js';

export interface CorpusPrioritizeItem {
  id: string;
  term: string;
}

export interface CorpusPrioritizeResult {
  id: string;
  corpusRarity: number;
  inCorpus: boolean;
}

export function prioritizeCorpusTerms(
  items: CorpusPrioritizeItem[]
): CorpusPrioritizeResult[] {
  const corpus = loadCorpusIndex();

  return items.map(({ id, term }) => {
    const stats = resolveCorpusStats(term, corpus);
    return {
      id,
      corpusRarity: stats.corpusRarity,
      inCorpus: stats.inCorpus,
    };
  });
}
