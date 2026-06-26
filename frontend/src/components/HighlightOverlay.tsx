import { memo } from 'react';
import { expandHighlightBox, type HighlightBox, type HighlightPulseMode } from '../types/documentPreview';
import { useDeferredPulse } from '../hooks/useDeferredPulse';

interface HighlightOverlayProps {
  highlights: HighlightBox[];
  pulseMode: HighlightPulseMode;
  pulseGeneration: number;
}

function fillFor(box: HighlightBox): string {
  return box.matchType === 'term' ? 'rgba(59, 130, 246, 0.22)' : 'rgba(245, 158, 11, 0.28)';
}

function HighlightOverlayInner({ highlights, pulseMode, pulseGeneration }: HighlightOverlayProps) {
  const pulseActive = useDeferredPulse(pulseMode, pulseGeneration);

  if (highlights.length === 0) return null;

  const pulseClass =
    pulseActive && pulseMode === 'loop'
      ? 'highlight-pulse-loop'
      : pulseActive && pulseMode === 'once'
        ? 'highlight-pulse-once'
        : '';

  return (
    <div className="absolute inset-0 pointer-events-none overflow-visible">
      {highlights.map((box, index) => {
        const padded = expandHighlightBox(box);
        return (
        <div
          key={index}
          className={`absolute origin-center rounded-sm ${pulseClass}`}
          style={{
            left: `${padded.x * 100}%`,
            top: `${padded.y * 100}%`,
            width: `${padded.width * 100}%`,
            height: `${padded.height * 100}%`,
            backgroundColor: fillFor(box),
          }}
        />
        );
      })}
    </div>
  );
}

function overlayPropsEqual(prev: HighlightOverlayProps, next: HighlightOverlayProps): boolean {
  if (prev.highlights !== next.highlights) return false;
  if (prev.pulseMode !== next.pulseMode) return false;
  if (next.pulseMode === 'once' && prev.pulseGeneration !== next.pulseGeneration) return false;
  return true;
}

export const HighlightOverlay = memo(HighlightOverlayInner, overlayPropsEqual);
