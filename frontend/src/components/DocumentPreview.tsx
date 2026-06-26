import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { HighlightBox, HighlightPulseMode } from '../types/documentPreview';
import { HighlightOverlay } from './HighlightOverlay';
import { usePageImage } from '../hooks/usePageImage';
import { PageMinimap } from './PageMinimap';
import { PAGE_ASPECT_HEIGHT_OVER_WIDTH } from '../utils/pageDimensions';

interface DocumentPreviewProps {
  projectId: string;
  pageCount: number;
  occurrencePages: number[];
  focusedPage: number | null;
  highlightsByPage: Record<number, HighlightBox[]>;
  locateStatus: 'idle' | 'loading' | 'hit' | 'miss';
  locateHint?: string | null;
  hoverPulsePage: number | null;
  autoPulsePage: number | null;
  autoPulseGeneration: number;
  onFocusedPageChange: (pageNumber: number) => void;
  onScrollSettled: (pageNumber: number) => void;
  onFindOnPage?: () => void;
}

export interface DocumentPreviewHandle {
  getViewportCenterPage(): number;
}

interface PageSlotProps {
  projectId: string;
  pageNumber: number;
  isFocused: boolean;
  isNearFocus: boolean;
  highlights: HighlightBox[];
  highlightPulseMode: HighlightPulseMode;
  highlightPulseGeneration: number;
  slotRef: (el: HTMLDivElement | null) => void;
}

function PageSlotInner({
  projectId,
  pageNumber,
  isFocused,
  isNearFocus,
  highlights,
  highlightPulseMode,
  highlightPulseGeneration,
  slotRef,
}: PageSlotProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(false);
  const shouldLoad = inView || isFocused || isNearFocus;

  const { imageUrl, loading, error } = usePageImage(projectId, pageNumber, shouldLoad);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true);
          }
        }
      },
      { rootMargin: '400px 0px', threshold: 0 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const setRefs = (el: HTMLDivElement | null) => {
    containerRef.current = el;
    slotRef(el);
  };

  const showLoader = shouldLoad && loading && !imageUrl;
  const showPlaceholder = !shouldLoad || showLoader;

  return (
    <div
      ref={setRefs}
      data-page={pageNumber}
      className={`relative rounded-lg border bg-white shadow-sm transition-shadow ${
        isFocused ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'
      }`}
    >
      <div className="absolute top-2 left-2 z-10 px-2 py-0.5 rounded bg-black/55 text-white text-xs font-medium tabular-nums">
        {pageNumber}
      </div>

      {showPlaceholder && !error && (
        <div
          className="flex items-center justify-center bg-gray-100 text-gray-400 text-sm"
          style={{ aspectRatio: `1 / ${PAGE_ASPECT_HEIGHT_OVER_WIDTH}` }}
        >
          {showLoader ? (
            <>
              <Loader2 className="animate-spin mr-2" size={16} />
              Rendering page…
            </>
          ) : (
            <span className="text-gray-300">Page {pageNumber}</span>
          )}
        </div>
      )}

      {error && (
        <div
          className="flex items-center justify-center bg-gray-100 text-gray-500 text-sm p-8"
          style={{ aspectRatio: `1 / ${PAGE_ASPECT_HEIGHT_OVER_WIDTH}` }}
        >
          Could not load page {pageNumber}
        </div>
      )}

      {imageUrl && (
        <div className="relative">
          <div className="overflow-hidden rounded-md">
            <img src={imageUrl} alt={`Page ${pageNumber}`} className="w-full h-auto block" />
          </div>
          <HighlightOverlay
            highlights={highlights}
            pulseMode={highlightPulseMode}
            pulseGeneration={highlightPulseGeneration}
          />
        </div>
      )}
    </div>
  );
}

const PageSlot = memo(PageSlotInner);

export const DocumentPreview = forwardRef<DocumentPreviewHandle, DocumentPreviewProps>(function DocumentPreview(
  {
    projectId,
    pageCount,
    occurrencePages,
    focusedPage,
    highlightsByPage,
    locateStatus,
    locateHint,
    hoverPulsePage,
    autoPulsePage,
    autoPulseGeneration,
    onFocusedPageChange,
    onScrollSettled,
    onFindOnPage,
  },
  ref
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [scrollRatio, setScrollRatio] = useState(0);
  const onScrollSettledRef = useRef(onScrollSettled);
  onScrollSettledRef.current = onScrollSettled;

  const getViewportCenterPage = useCallback((): number => {
    const scrollEl = scrollRef.current;
    if (!scrollEl || slotRefs.current.size === 0) {
      return focusedPage ?? 1;
    }

    const scrollRect = scrollEl.getBoundingClientRect();
    const centerY = scrollRect.top + scrollRect.height / 2;

    let bestPage = focusedPage ?? 1;
    let bestDist = Infinity;

    for (const [pageNumber, slot] of slotRefs.current) {
      const slotRect = slot.getBoundingClientRect();
      const slotCenter = slotRect.top + slotRect.height / 2;
      const dist = Math.abs(slotCenter - centerY);
      if (dist < bestDist) {
        bestDist = dist;
        bestPage = pageNumber;
      }
    }

    return bestPage;
  }, [focusedPage]);

  useImperativeHandle(ref, () => ({ getViewportCenterPage }), [getViewportCenterPage]);

  const updateScrollRatio = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.scrollHeight <= el.clientHeight) {
      setScrollRatio(0);
      return;
    }
    setScrollRatio(el.scrollTop / (el.scrollHeight - el.clientHeight));
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollRatio, { passive: true });
    updateScrollRatio();
    return () => el.removeEventListener('scroll', updateScrollRatio);
  }, [updateScrollRatio, pageCount]);

  useEffect(() => {
    if (!focusedPage) return;

    const el = scrollRef.current;
    const slot = slotRefs.current.get(focusedPage);
    slot?.scrollIntoView({ behavior: 'smooth', block: 'center' });

    let cancelled = false;
    let debounceTimer: ReturnType<typeof setTimeout>;

    const notifySettled = () => {
      if (cancelled) return;
      onScrollSettledRef.current(focusedPage);
    };

    const onScroll = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(notifySettled, 150);
    };

    el?.addEventListener('scroll', onScroll, { passive: true });
    debounceTimer = setTimeout(notifySettled, 150);

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
      el?.removeEventListener('scroll', onScroll);
    };
  }, [focusedPage]);

  const registerSlot = useCallback((pageNumber: number) => {
    return (el: HTMLDivElement | null) => {
      if (el) slotRefs.current.set(pageNumber, el);
      else slotRefs.current.delete(pageNumber);
    };
  }, []);

  if (pageCount < 1) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-gray-500 border border-dashed border-gray-200 rounded-xl bg-white">
        Page count unknown — re-upload the PDF to enable preview.
      </div>
    );
  }

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);

  return (
    <div className="flex h-full min-h-0 min-w-0 gap-1">
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-b border-gray-200 bg-white text-xs text-gray-500">
          <span>
            {occurrencePages.length} occurrence page{occurrencePages.length !== 1 ? 's' : ''}
            {focusedPage ? ` · viewing page ${focusedPage}` : ''}
          </span>
          <span className="flex items-center gap-2">
            {locateStatus === 'loading' && (
              <span className="inline-flex items-center text-blue-600">
                <Loader2 className="animate-spin mr-1" size={12} />
                Locating…
              </span>
            )}
            {locateStatus === 'miss' && (
              <>
                <span className="text-amber-600">No text-layer match</span>
                {onFindOnPage && (
                  <button
                    type="button"
                    onClick={onFindOnPage}
                    className="px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100"
                  >
                    Find on page
                  </button>
                )}
              </>
            )}
            {locateStatus === 'hit' && (
              <span className="text-green-600">
                Highlighted
                {locateHint ? ` · ${locateHint}` : ''}
              </span>
            )}
          </span>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hidden p-3 space-y-4">
          {pages.map(pageNumber => {
            const pulseMode: HighlightPulseMode =
              hoverPulsePage === pageNumber
                ? 'loop'
                : autoPulsePage === pageNumber
                  ? 'once'
                  : 'none';

            return (
            <PageSlot
              key={pageNumber}
              projectId={projectId}
              pageNumber={pageNumber}
              isFocused={pageNumber === focusedPage}
              isNearFocus={focusedPage != null && Math.abs(pageNumber - focusedPage) <= 2}
              highlights={highlightsByPage[pageNumber] ?? []}
              highlightPulseMode={pulseMode}
              highlightPulseGeneration={autoPulsePage === pageNumber ? autoPulseGeneration : 0}
              slotRef={registerSlot(pageNumber)}
            />
            );
          })}
        </div>
      </div>

      <PageMinimap
        pageCount={pageCount}
        occurrencePages={occurrencePages}
        focusedPage={focusedPage}
        scrollRatio={scrollRatio}
        onPageSelect={onFocusedPageChange}
      />
    </div>
  );
});
