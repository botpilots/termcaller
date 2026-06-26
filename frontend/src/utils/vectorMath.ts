export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function computeCentroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return [];
  const dims = vectors[0]!.length;
  const centroid = new Array<number>(dims).fill(0);

  for (const vector of vectors) {
    for (let i = 0; i < dims; i++) {
      centroid[i]! += vector[i]!;
    }
  }

  for (let i = 0; i < dims; i++) {
    centroid[i]! /= vectors.length;
  }

  return centroid;
}

export function parseEmbedding(stored: string | null | undefined): number[] | null {
  if (!stored) return null;
  try {
    const parsed = JSON.parse(stored) as unknown;
    return Array.isArray(parsed) ? (parsed as number[]) : null;
  } catch {
    return null;
  }
}
