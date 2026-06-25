import React from 'react';

export interface SimilarityConcept {
  id: string;
  definitionText: string;
  similarity: number;
  isOutlier: boolean;
}

export interface SimilarityResult {
  keywordId: string;
  sourceTerm: string;
  threshold: number;
  conceptCount: number;
  concepts: SimilarityConcept[];
}

const SIZE = 420;
const CENTER = SIZE / 2;
const MAX_RADIUS = 150;
const MIN_RADIUS = 42;
const CENTROID_RADIUS = 34;
const NODE_RADIUS = 22;

function similarityColor(similarity: number, isOutlier: boolean): string {
  if (isOutlier) return '#ef4444';
  if (similarity >= 0.9) return '#22c55e';
  if (similarity >= 0.8) return '#eab308';
  return '#f97316';
}

function layoutNodes(concepts: SimilarityConcept[]) {
  if (concepts.length === 0) return [];

  return concepts.map((concept, index) => {
    const angle = (2 * Math.PI * index) / concepts.length - Math.PI / 2;
    const radius =
      concepts.length === 1
        ? MIN_RADIUS
        : MIN_RADIUS + (1 - concept.similarity) * (MAX_RADIUS - MIN_RADIUS);

    return {
      ...concept,
      x: CENTER + radius * Math.cos(angle),
      y: CENTER + radius * Math.sin(angle),
      color: similarityColor(concept.similarity, concept.isOutlier),
    };
  });
}

export const SimilarityCluster: React.FC<{ result: SimilarityResult }> = ({ result }) => {
  const nodes = layoutNodes(result.concepts);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-green-500" /> Core (&ge;90%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-yellow-500" /> Close (80–90%)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500" /> Outlier (&lt;{Math.round(result.threshold * 100)}%)
        </span>
      </div>

      <div className="border border-gray-200 rounded-lg bg-gray-50 overflow-hidden">
        <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="w-full max-w-xl mx-auto block">
          {nodes.map((node) => (
            <line
              key={`line-${node.id}`}
              x1={CENTER}
              y1={CENTER}
              x2={node.x}
              y2={node.y}
              stroke="#cbd5e1"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ))}

          <circle
            cx={CENTER}
            cy={CENTER}
            r={CENTROID_RADIUS}
            fill="#4f46e5"
            stroke="#312e81"
            strokeWidth={2}
          />
          <text
            x={CENTER}
            y={CENTER - 4}
            textAnchor="middle"
            className="fill-white text-[11px] font-semibold"
          >
            Centroid
          </text>
          <text
            x={CENTER}
            y={CENTER + 12}
            textAnchor="middle"
            className="fill-indigo-100 text-[10px]"
          >
            {result.sourceTerm}
          </text>

          {nodes.map((node, index) => (
            <g key={node.id}>
              <circle
                cx={node.x}
                cy={node.y}
                r={NODE_RADIUS}
                fill={node.color}
                fillOpacity={0.9}
                stroke="#ffffff"
                strokeWidth={2}
              />
              <text
                x={node.x}
                y={node.y + 4}
                textAnchor="middle"
                className="fill-white text-[10px] font-semibold"
              >
                {index + 1}
              </text>
              <title>
                {Math.round(node.similarity * 100)}% similar — {node.definitionText}
              </title>
            </g>
          ))}
        </svg>
      </div>

      <div className="space-y-2">
        {nodes.map((node, index) => (
          <div
            key={node.id}
            className={`flex items-start gap-3 p-3 rounded-lg border text-sm ${
              node.isOutlier ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'
            }`}
          >
            <span className="shrink-0 w-6 h-6 rounded-full text-white text-xs font-semibold flex items-center justify-center"
              style={{ backgroundColor: node.color }}
            >
              {index + 1}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="font-medium text-gray-900">
                  {Math.round(node.similarity * 100)}% similar to centroid
                </span>
                {node.isOutlier && (
                  <span className="text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded">
                    Outlier
                  </span>
                )}
              </div>
              <p className="text-gray-600">{node.definitionText}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
