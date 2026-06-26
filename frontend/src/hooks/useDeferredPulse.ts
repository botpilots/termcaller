import { useEffect, useState } from 'react';
import type { HighlightPulseMode } from '../types/documentPreview';

/** Wait two animation frames after pulse is requested so layout/scroll can settle first. */
export function useDeferredPulse(pulseMode: HighlightPulseMode, pulseGeneration: number): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (pulseMode === 'none') {
      setActive(false);
      return;
    }

    setActive(false);
    let cancelled = false;
    let frame1 = 0;
    let frame2 = 0;

    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(() => {
        if (!cancelled) setActive(true);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
    };
  }, [pulseMode, pulseGeneration]);

  return active;
}
