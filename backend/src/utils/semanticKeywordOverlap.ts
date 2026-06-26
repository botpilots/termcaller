import { embedTexts } from '../services/embeddingService.js';
import { cosineSimilarity } from '../utils/vectorMath.js';

/** Same threshold as concept outlier detection in similarityService. */
export const SEMANTIC_MATCH_THRESHOLD = 0.85;

export interface SemanticTermMatch {
  baseline: string;
  current: string;
  similarity: number;
}

export interface SemanticOverlapResult {
  threshold: number;
  baselineCount: number;
  currentCount: number;
  /** Baseline terms with ≥1 current match at or above threshold. */
  coveredBaseline: string[];
  /** Baseline terms with no match at threshold. */
  gapBaseline: string[];
  /** Current terms with no baseline match at threshold. */
  extraCurrent: string[];
  /** Best match per baseline term (may share one current across baselines). */
  matches: SemanticTermMatch[];
  /** All pairs at or above threshold, sorted by similarity desc. */
  strongPairs: SemanticTermMatch[];
  semanticCoverage: number;
}

function indexVectors(terms: string[], vectors: number[][]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  for (let i = 0; i < terms.length; i++) {
    map.set(terms[i]!, vectors[i]!);
  }
  return map;
}

/** Greedy many-to-many: each baseline picks its best current; coverage counts any hit. */
export function computeSemanticOverlap(
  baselineTerms: string[],
  currentTerms: string[],
  vectorsByTerm: Map<string, number[]>,
  threshold = SEMANTIC_MATCH_THRESHOLD
): SemanticOverlapResult {
  const strongPairs: SemanticTermMatch[] = [];

  for (const baseline of baselineTerms) {
    const baseVec = vectorsByTerm.get(baseline);
    if (!baseVec) continue;

    for (const current of currentTerms) {
      const curVec = vectorsByTerm.get(current);
      if (!curVec) continue;

      const similarity = cosineSimilarity(baseVec, curVec);
      if (similarity >= threshold) {
        strongPairs.push({ baseline, current, similarity });
      }
    }
  }

  strongPairs.sort((a, b) => b.similarity - a.similarity);

  const bestByBaseline = new Map<string, SemanticTermMatch>();
  for (const pair of strongPairs) {
    if (!bestByBaseline.has(pair.baseline)) {
      bestByBaseline.set(pair.baseline, pair);
    }
  }

  const matchedCurrent = new Set(strongPairs.map(p => p.current));
  const coveredBaseline = baselineTerms.filter(b => bestByBaseline.has(b));
  const gapBaseline = baselineTerms.filter(b => !bestByBaseline.has(b));
  const extraCurrent = currentTerms.filter(c => !matchedCurrent.has(c));

  return {
    threshold,
    baselineCount: baselineTerms.length,
    currentCount: currentTerms.length,
    coveredBaseline,
    gapBaseline,
    extraCurrent,
    matches: [...bestByBaseline.values()].sort((a, b) => a.baseline.localeCompare(b.baseline)),
    strongPairs,
    semanticCoverage: coveredBaseline.length / Math.max(baselineTerms.length, 1),
  };
}

export async function computeSemanticOverlapEmbedded(
  baselineTerms: string[],
  currentTerms: string[],
  threshold = SEMANTIC_MATCH_THRESHOLD
): Promise<SemanticOverlapResult> {
  const unique = [...new Set([...baselineTerms, ...currentTerms])];
  const vectors = await embedTexts(unique);
  const vectorsByTerm = indexVectors(unique, vectors);
  return computeSemanticOverlap(baselineTerms, currentTerms, vectorsByTerm, threshold);
}

export function formatSemanticOverlapReport(
  result: SemanticOverlapResult,
  label = 'Semantic keyword overlap'
): string {
  const lines = [
    label,
    `Threshold: ${result.threshold}`,
    `Baseline: ${result.baselineCount} · Current: ${result.currentCount}`,
    `Semantic coverage: ${result.coveredBaseline.length}/${result.baselineCount} (${(result.semanticCoverage * 100).toFixed(0)}%)`,
    '',
    'Matches:',
    ...result.matches.map(m => `  ${m.baseline} ↔ ${m.current} (${m.similarity.toFixed(3)})`),
  ];

  if (result.gapBaseline.length > 0) {
    lines.push('', 'Gaps (no semantic match):', ...result.gapBaseline.map(t => `  - ${t}`));
  }

  if (result.extraCurrent.length > 0) {
    lines.push('', 'Extra current terms:', ...result.extraCurrent.map(t => `  + ${t}`));
  }

  const multi = result.strongPairs.filter(
    (p, i, arr) => arr.findIndex(x => x.baseline === p.baseline && x.current === p.current) === i
  );
  const grouped = new Map<string, SemanticTermMatch[]>();
  for (const pair of multi) {
    const list = grouped.get(pair.baseline) ?? [];
    list.push(pair);
    grouped.set(pair.baseline, list);
  }

  const splitBaselines = [...grouped.entries()].filter(([, pairs]) => pairs.length > 1);
  if (splitBaselines.length > 0) {
    lines.push('', 'One baseline → multiple current labels:');
    for (const [baseline, pairs] of splitBaselines) {
      lines.push(
        `  ${baseline}: ${pairs.map(p => `${p.current} (${p.similarity.toFixed(3)})`).join(', ')}`
      );
    }
  }

  return lines.join('\n');
}
