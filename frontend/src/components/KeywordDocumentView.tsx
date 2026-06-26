import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { DocumentPreview, type DocumentPreviewHandle } from './DocumentPreview';
import { DocumentPreviewSidebar } from './DocumentPreviewSidebar';
import {
  KeywordCurationPanel,
  type KeywordCurationState,
} from './KeywordCurationPanel';
import type { HighlightBox, PageLocateResult } from '../types/documentPreview';

interface KeywordDocumentViewProps {
  projectId: string;
  keywordId: string;
  pageCount: number | null | undefined;
  sourceTerm: string;
  figureCount: number;
}

function firstCalloutId(identifier: string): string {
  return identifier.split(',')[0]?.trim() ?? identifier;
}

export function KeywordDocumentView({
  projectId,
  keywordId,
  pageCount,
  sourceTerm,
  figureCount,
}: KeywordDocumentViewProps) {
  const [curationState, setCurationState] = useState<KeywordCurationState | null>(null);
  const [isLoadingCuration, setIsLoadingCuration] = useState(true);
  const [curationLoadError, setCurationLoadError] = useState<string | null>(null);

  const [focusedPage, setFocusedPage] = useState<number | null>(null);
  const [highlightsByPage, setHighlightsByPage] = useState<Record<number, HighlightBox[]>>({});
  const [locateStatus, setLocateStatus] = useState<'idle' | 'loading' | 'hit' | 'miss'>('idle');
  const [locateHint, setLocateHint] = useState<string | null>(null);
  const [autoPulsePage, setAutoPulsePage] = useState<number | null>(null);
  const [autoPulseGeneration, setAutoPulseGeneration] = useState(0);
  const scrollSettledPageRef = useRef<number | null>(null);
  const locateReadyPageRef = useRef<number | null>(null);
  const pulseGenerationRef = useRef(0);
  const highlightsByPageRef = useRef(highlightsByPage);
  highlightsByPageRef.current = highlightsByPage;

  const autoPulseConsumedRef = useRef(false);
  const previewRef = useRef<DocumentPreviewHandle>(null);

  const triggerAutoPulse = useCallback((pageNumber: number) => {
    pulseGenerationRef.current += 1;
    setAutoPulsePage(pageNumber);
    setAutoPulseGeneration(pulseGenerationRef.current);
  }, []);

  const maybeStartAutoPulse = useCallback(
    (pageNumber: number, boxes?: HighlightBox[]) => {
      if (autoPulseConsumedRef.current) return;
      if (locateReadyPageRef.current !== pageNumber) return;

      const pageBoxes = boxes ?? highlightsByPageRef.current[pageNumber];
      if (!pageBoxes?.length) return;

      const viewportPage = previewRef.current?.getViewportCenterPage();
      const scrollReady =
        scrollSettledPageRef.current === pageNumber || viewportPage === pageNumber;
      if (!scrollReady) return;

      autoPulseConsumedRef.current = true;
      triggerAutoPulse(pageNumber);
    },
    [triggerAutoPulse]
  );

  const handleScrollSettled = useCallback(
    (pageNumber: number) => {
      scrollSettledPageRef.current = pageNumber;
      maybeStartAutoPulse(pageNumber);
    },
    [maybeStartAutoPulse]
  );

  const fetchCurationState = useCallback(async () => {
    setIsLoadingCuration(true);
    setCurationLoadError(null);

    try {
      const response = await axios.get<KeywordCurationState>(
        `/api/keywords/${keywordId}/curation`
      );
      setCurationState(response.data);
      return response.data;
    } catch {
      setCurationLoadError('Failed to load keyword curation state.');
      setCurationState(null);
      return null;
    } finally {
      setIsLoadingCuration(false);
    }
  }, [keywordId]);

  useEffect(() => {
    void fetchCurationState();
  }, [fetchCurationState]);

  const locateFigure = useCallback(
    async (
      pageNumber: number,
      identifiers: string,
      referencePage: number,
      mergeIntoExisting = false
    ) => {
      setLocateStatus('loading');
      setLocateHint(null);

      try {
        const response = await axios.get<PageLocateResult>(
          `/api/projects/${projectId}/pages/${pageNumber}/locate`,
          {
            params: {
              term: sourceTerm,
              callout: firstCalloutId(identifiers),
              referencePage,
            },
          }
        );

        const boxes = response.data.boxes ?? [];
        const matchedPage = response.data.matchedPage ?? pageNumber;

        if (boxes.length > 0) {
          setHighlightsByPage(prev => {
            if (!mergeIntoExisting) {
              return { [matchedPage]: boxes };
            }
            return {
              ...prev,
              [matchedPage]: [...(prev[matchedPage] ?? []), ...boxes],
            };
          });
          setLocateStatus('hit');
          locateReadyPageRef.current = matchedPage;
          if (matchedPage !== pageNumber) {
            setLocateHint(`Matched on page ${matchedPage}`);
            setFocusedPage(matchedPage);
          }
          maybeStartAutoPulse(matchedPage, boxes);
          return matchedPage;
        }

        if (!mergeIntoExisting) {
          setHighlightsByPage({});
          setLocateStatus('miss');
        }
        return null;
      } catch {
        if (!mergeIntoExisting) {
          setLocateStatus('miss');
        }
        return null;
      }
    },
    [projectId, sourceTerm, maybeStartAutoPulse]
  );

  const locateAllConceptFigures = useCallback(
    async (state: KeywordCurationState) => {
      const figures = state.concept?.figures ?? [];
      if (figures.length === 0) {
        setHighlightsByPage({});
        setLocateStatus('idle');
        return;
      }

      setLocateStatus('loading');
      setLocateHint(null);
      scrollSettledPageRef.current = null;
      locateReadyPageRef.current = null;
      autoPulseConsumedRef.current = false;
      setAutoPulsePage(null);

      const referencePage =
        previewRef.current?.getViewportCenterPage() ?? figures[0]!.pageNumber;

      const results = await Promise.all(
        figures.map(figure =>
          axios
            .get<PageLocateResult>(`/api/projects/${projectId}/pages/${figure.pageNumber}/locate`, {
              params: {
                term: sourceTerm,
                callout: firstCalloutId(figure.identifiers),
                referencePage,
              },
            })
            .then(response => ({
              figure,
              boxes: response.data.boxes ?? [],
              matchedPage: response.data.matchedPage ?? figure.pageNumber,
            }))
            .catch(() => ({
              figure,
              boxes: [] as HighlightBox[],
              matchedPage: figure.pageNumber,
            }))
        )
      );

      const merged: Record<number, HighlightBox[]> = {};
      let firstHitPage: number | null = null;

      for (const result of results) {
        if (result.boxes.length > 0) {
          const page = result.matchedPage;
          merged[page] = [...(merged[page] ?? []), ...result.boxes];
          if (firstHitPage === null) {
            firstHitPage = page;
          }
        }
      }

      setHighlightsByPage(merged);
      if (firstHitPage !== null) {
        setLocateStatus('hit');
        locateReadyPageRef.current = firstHitPage;
        setFocusedPage(firstHitPage);
        maybeStartAutoPulse(firstHitPage, merged[firstHitPage]);
      } else {
        setLocateStatus('miss');
        setFocusedPage(figures[0]!.pageNumber);
      }
    },
    [projectId, sourceTerm, maybeStartAutoPulse]
  );

  useEffect(() => {
    if (!curationState?.concept) return;
    void locateAllConceptFigures(curationState);
  }, [curationState, locateAllConceptFigures]);

  useEffect(() => {
    const page = locateReadyPageRef.current;
    if (page == null) return;
    maybeStartAutoPulse(page);
  }, [highlightsByPage, maybeStartAutoPulse]);

  const occurrencePages = useMemo(() => {
    const pages = new Set<number>();
    for (const figure of curationState?.concept?.figures ?? []) {
      pages.add(figure.pageNumber);
    }
    for (const warning of curationState?.definitionWarnings ?? []) {
      pages.add(warning.pageNumber);
    }
    return [...pages].sort((a, b) => a - b);
  }, [curationState]);

  const handleWarningClick = useCallback(
    (warning: KeywordCurationState['definitionWarnings'][number]) => {
      const referencePage =
        previewRef.current?.getViewportCenterPage() ?? focusedPage ?? warning.pageNumber;
      scrollSettledPageRef.current = null;
      locateReadyPageRef.current = null;
      autoPulseConsumedRef.current = false;
      setAutoPulsePage(null);
      setLocateHint(null);
      setFocusedPage(warning.pageNumber);
      void locateFigure(warning.pageNumber, warning.identifiers, referencePage, false);
    },
    [focusedPage, locateFigure]
  );

  const previewEnabled = pageCount != null && pageCount > 0;

  return (
    <div className={`flex flex-1 min-h-0 min-w-0 ${previewEnabled ? '' : 'max-w-5xl mx-auto w-full'}`}>
      <div
        className={`flex flex-col min-h-0 min-w-0 bg-white overflow-hidden ${
          previewEnabled
            ? 'flex-1 border-r border-gray-200'
            : 'flex-1 rounded-xl shadow-sm border border-gray-200'
        }`}
      >
        <div className={`border-b border-gray-100 shrink-0 ${previewEnabled ? 'p-4' : 'p-8 pb-4'}`}>
          <h3 className="text-lg font-semibold text-gray-900">{sourceTerm}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {figureCount} figure{figureCount !== 1 ? 's' : ''}
          </p>
        </div>

        <KeywordCurationPanel
          sourceTerm={sourceTerm}
          state={curationState}
          isLoading={isLoadingCuration}
          loadError={curationLoadError}
          onWarningClick={handleWarningClick}
          compact={previewEnabled}
        />
      </div>

      <DocumentPreviewSidebar enabled={previewEnabled}>
        <DocumentPreview
          ref={previewRef}
          projectId={projectId}
          pageCount={pageCount!}
          occurrencePages={occurrencePages}
          focusedPage={focusedPage}
          highlightsByPage={highlightsByPage}
          locateStatus={locateStatus}
          locateHint={locateHint}
          hoverPulsePage={null}
          autoPulsePage={autoPulsePage}
          autoPulseGeneration={autoPulseGeneration}
          onScrollSettled={handleScrollSettled}
          onFocusedPageChange={pageNumber => {
            setFocusedPage(pageNumber);
          }}
        />
      </DocumentPreviewSidebar>
    </div>
  );
}
