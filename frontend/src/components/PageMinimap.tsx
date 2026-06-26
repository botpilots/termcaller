import { useCallback, useEffect, useRef } from 'react';

interface PageMinimapProps {
  pageCount: number;
  occurrencePages: number[];
  focusedPage: number | null;
  scrollRatio: number;
  onPageSelect: (pageNumber: number) => void;
}

export function PageMinimap({
  pageCount,
  occurrencePages,
  focusedPage,
  scrollRatio,
  onPageSelect,
}: PageMinimapProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const pageToPercent = useCallback(
    (pageNumber: number) => {
      if (pageCount <= 1) return 0;
      return ((pageNumber - 1) / (pageCount - 1)) * 100;
    },
    [pageCount]
  );

  const handleTrackClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const track = trackRef.current;
    if (!track || pageCount < 1) return;

    const rect = track.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const page = Math.min(pageCount, Math.max(1, Math.round(ratio * (pageCount - 1)) + 1));
    onPageSelect(page);
  };

  if (pageCount < 1) {
    return null;
  }

  const thumbTop = Math.min(100, Math.max(0, scrollRatio * 100));

  return (
    <div className="flex flex-col items-center shrink-0 w-10 py-2 pl-1">
      <div
        ref={trackRef}
        role="scrollbar"
        aria-orientation="vertical"
        aria-valuemin={1}
        aria-valuemax={pageCount}
        aria-valuenow={focusedPage ?? 1}
        className="relative flex-1 w-3 rounded-full bg-gray-200 cursor-pointer border border-gray-300"
        onClick={handleTrackClick}
      >
        {/* Viewport thumb */}
        <div
          className="absolute left-0 right-0 h-6 -mt-3 rounded-full bg-gray-400/50 border border-gray-500/40 pointer-events-none"
          style={{ top: `${thumbTop}%` }}
        />

        {/* Occurrence ticks */}
        {occurrencePages.map(pageNumber => {
          const isFocused = pageNumber === focusedPage;
          return (
            <button
              key={pageNumber}
              type="button"
              title={`Page ${pageNumber}`}
              onClick={event => {
                event.stopPropagation();
                onPageSelect(pageNumber);
              }}
              className={`absolute left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-sm border shadow-sm transition-colors ${
                isFocused
                  ? 'bg-blue-600 border-blue-700 z-10'
                  : 'bg-amber-400 border-amber-500 hover:bg-amber-300'
              }`}
              style={{ top: `${pageToPercent(pageNumber)}%`, marginTop: -5 }}
            />
          );
        })}
      </div>
      <span className="text-[10px] text-gray-400 mt-2 tabular-nums">{pageCount}p</span>
    </div>
  );
}
