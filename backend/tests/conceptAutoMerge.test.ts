import { describe, it, expect } from 'vitest';
import {
  AUTO_MERGE_THRESHOLD,
  clusterConceptsBySimilarity,
  pickCanonicalConcept,
} from '../src/services/conceptMergeService.js';
import { cosineSimilarity } from '../src/utils/vectorMath.js';

describe('concept auto-merge clustering', () => {
  it('clusters concepts with cosine similarity >= 0.95', () => {
    const concepts = [
      { id: 'a', definitionText: 'short', vector: [1, 0, 0] },
      { id: 'b', definitionText: 'medium length', vector: [0.99, 0.01, 0] },
      { id: 'c', definitionText: 'also close', vector: [0.98, 0.02, 0] },
      { id: 'd', definitionText: 'different', vector: [0, 1, 0] },
    ];

    expect(cosineSimilarity(concepts[0]!.vector, concepts[1]!.vector)).toBeGreaterThanOrEqual(
      AUTO_MERGE_THRESHOLD
    );
    expect(cosineSimilarity(concepts[0]!.vector, concepts[3]!.vector)).toBeLessThan(
      AUTO_MERGE_THRESHOLD
    );

    const clusters = clusterConceptsBySimilarity(concepts);
    expect(clusters).toHaveLength(2);

    const clusterIds = clusters.map(cluster => cluster.map(concept => concept.id).sort());
    expect(clusterIds).toContainEqual(['a', 'b', 'c']);
    expect(clusterIds).toContainEqual(['d']);
  });

  it('keeps dissimilar concepts in separate clusters', () => {
    const concepts = [
      { id: 'x', definitionText: 'one', vector: [1, 0] },
      { id: 'y', definitionText: 'two', vector: [0, 1] },
      { id: 'z', definitionText: 'three', vector: [-1, 0] },
    ];

    const clusters = clusterConceptsBySimilarity(concepts);
    expect(clusters).toHaveLength(3);
    expect(clusters.every(cluster => cluster.length === 1)).toBe(true);
  });

  it('forms transitive clusters via union-find', () => {
    const concepts = [
      { id: '1', definitionText: 'a', vector: [1, 0, 0] },
      { id: '2', definitionText: 'b', vector: [0.99, 0.01, 0] },
      { id: '3', definitionText: 'c', vector: [0.98, 0.02, 0] },
    ];

    expect(cosineSimilarity(concepts[0]!.vector, concepts[1]!.vector)).toBeGreaterThanOrEqual(
      AUTO_MERGE_THRESHOLD
    );
    expect(cosineSimilarity(concepts[1]!.vector, concepts[2]!.vector)).toBeGreaterThanOrEqual(
      AUTO_MERGE_THRESHOLD
    );

    const clusters = clusterConceptsBySimilarity(concepts);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toHaveLength(3);
  });
});

describe('pickCanonicalConcept', () => {
  it('chooses the concept closest to the cluster centroid', () => {
    const cluster = [
      { id: 'near', definitionText: 'near centroid', vector: [1, 0, 0] },
      { id: 'far', definitionText: 'far from centroid', vector: [0.95, 0.05, 0] },
    ];

    expect(pickCanonicalConcept(cluster).id).toBe('near');
  });

  it('breaks ties by longest definitionText', () => {
    const cluster = [
      { id: 'short', definitionText: 'short', vector: [1, 0] },
      { id: 'long', definitionText: 'much longer definition text', vector: [1, 0] },
    ];

    expect(pickCanonicalConcept(cluster).id).toBe('long');
  });
});
