import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeSourceTerm } from '../utils/normalizeSourceTerm.js';
import {
  combinePhraseRarity,
  combinePhraseTokenStats,
  corpusRarityFromRank,
  tokenizePhraseForCorpus,
} from '../utils/phraseCorpusTokens.js';

export interface CorpusTermStats {
  termFreq: number;
  docFreq: number;
  freqRank: number;
}

export interface ResolvedCorpusStats extends CorpusTermStats {
  inCorpus: boolean;
  matchedAsPhrase: boolean;
  corpusRarity: number;
}

export interface CorpusIndex {
  docs: number;
  totalTokens: number;
  vocabSize: number;
  lookup(term: string): CorpusTermStats | null;
  resolveStats(sourceTerm: string): ResolvedCorpusStats;
}

interface WordRankFile {
  v: string[];
  f: number[];
  d: number[];
  n: number;
  docs: number;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORD_RANK_PATH = path.resolve(
  __dirname,
  '../../data/service-manual-corpus/word-rank.json'
);

let cachedIndex: CorpusIndex | null = null;
let cachedMtimeMs = 0;

function readWordRankFile(): WordRankFile {
  const raw = fs.readFileSync(WORD_RANK_PATH, 'utf8');
  return JSON.parse(raw) as WordRankFile;
}

function buildIndex(data: WordRankFile): CorpusIndex {
  const byTerm = new Map<string, CorpusTermStats>();
  const vocabSize = data.v.length;

  for (let i = 0; i < data.v.length; i++) {
    byTerm.set(data.v[i], { termFreq: data.f[i], docFreq: data.d[i], freqRank: i });
  }

  function lookupToken(token: string): CorpusTermStats | null {
    return byTerm.get(normalizeSourceTerm(token)) ?? null;
  }

  function rarityForToken(freqRank: number): number {
    return corpusRarityFromRank(freqRank, vocabSize);
  }

  function resolveStats(sourceTerm: string): ResolvedCorpusStats {
    const normalized = normalizeSourceTerm(sourceTerm);
    const exact = byTerm.get(normalized);
    if (exact) {
      return {
        ...exact,
        inCorpus: true,
        matchedAsPhrase: true,
        corpusRarity: rarityForToken(exact.freqRank),
      };
    }

    const tokens = tokenizePhraseForCorpus(sourceTerm);
    if (tokens.length <= 1) {
      const single = lookupToken(tokens[0] ?? normalized);
      if (single) {
        return {
          ...single,
          inCorpus: true,
          matchedAsPhrase: false,
          corpusRarity: rarityForToken(single.freqRank),
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
      (token) => lookupToken(token) ?? { termFreq: 0, docFreq: 0, freqRank: -1 }
    );
    const anyKnown = tokens.some((token) => lookupToken(token) !== null);
    const combined = combinePhraseTokenStats(perToken);
    const perTokenRarities = perToken.map((token) => rarityForToken(token.freqRank));
    const corpusRarity = combinePhraseRarity(perTokenRarities, tokens.length);

    return {
      ...combined,
      inCorpus: anyKnown,
      matchedAsPhrase: false,
      corpusRarity,
    };
  }

  return {
    docs: data.docs,
    totalTokens: data.n,
    vocabSize,
    lookup(term: string): CorpusTermStats | null {
      const stats = resolveStats(term);
      if (!stats.inCorpus) return null;
      return {
        termFreq: stats.termFreq,
        docFreq: stats.docFreq,
        freqRank: stats.freqRank,
      };
    },
    resolveStats,
  };
}

export function resolveCorpusStats(
  sourceTerm: string,
  corpus: CorpusIndex = loadCorpusIndex()
): ResolvedCorpusStats {
  return corpus.resolveStats(sourceTerm);
}

export function loadCorpusIndex(): CorpusIndex {
  const stat = fs.statSync(WORD_RANK_PATH);
  if (cachedIndex && stat.mtimeMs === cachedMtimeMs) {
    return cachedIndex;
  }

  const data = readWordRankFile();
  cachedIndex = buildIndex(data);
  cachedMtimeMs = stat.mtimeMs;
  return cachedIndex;
}

/** @visibleForTesting */
export function resetCorpusIndexCache(): void {
  cachedIndex = null;
  cachedMtimeMs = 0;
}
