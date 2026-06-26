import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { DocumentPreview, type DocumentPreviewHandle } from './DocumentPreview';
import { DocumentPreviewSidebar } from './DocumentPreviewSidebar';
import {
  ValidationAnomalies,
  type FigureValidationResult,
  type ValidationWarningItem,
} from './ValidationAnomalies';
import type { HighlightBox, PageLocateResult } from '../types/documentPreview';

interface FigureDocumentViewProps {
  projectId: string;
  pageCount: number | null | undefined;
  pageNumber: number;
  figureNumber: string;
  calloutCount: number;
  validation: FigureValidationResult | null;
  validationError: string | null;
  isValidatingAll: boolean;
  pendingMessage?: string;
}

export function FigureDocumentView({
  projectId,
  pageCount,
  pageNumber,
  figureNumber,
  calloutCount,
  validation,
  validationError,
  isValidatingAll,
  pendingMessage,
}: FigureDocumentViewProps) {
  const [focusedPage, setFocusedPage] = useState<number | null>(pageNumber);
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

  const triggerAutoPulse = useCallback((targetPage: number) => {
    pulseGenerationRef.current += 1;
    setAutoPulsePage(targetPage);
    setAutoPulseGeneration(pulseGenerationRef.current);
  }, []);

  const maybeStartAutoPulse = useCallback(
    (targetPage: number, boxes?: HighlightBox[]) => {
      if (autoPulseConsumedRef.current) return;
      if (locateReadyPageRef.current !== targetPage) return;

      const pageBoxes = boxes ?? highlightsByPageRef.current[targetPage];
      if (!pageBoxes?.length) return;

      const viewportPage = previewRef.current?.getViewportCenterPage();
      const scrollReady =
        scrollSettledPageRef.current === targetPage || viewportPage === targetPage;
      if (!scrollReady) return;

      autoPulseConsumedRef.current = true;
      triggerAutoPulse(targetPage);
    },
    [triggerAutoPulse]
  );

  const handleScrollSettled = useCallback(
    (targetPage: number) => {
      scrollSettledPageRef.current = targetPage;
      maybeStartAutoPulse(targetPage);
    },
    [maybeStartAutoPulse]
  );

  useEffect(() => {
    setFocusedPage(pageNumber);
    setHighlightsByPage({});
    setLocateStatus('idle');
    setLocateHint(null);
    scrollSettledPageRef.current = null;
    locateReadyPageRef.current = null;
    autoPulseConsumedRef.current = false;
    setAutoPulsePage(null);
  }, [pageNumber, figureNumber]);

  const locateAnomaly = useCallback(
    async (warning: ValidationWarningItem) => {
      const referencePage =
        previewRef.current?.getViewportCenterPage() ?? focusedPage ?? warning.pageNumber;

      scrollSettledPageRef.current = null;
      locateReadyPageRef.current = null;
      autoPulseConsumedRef.current = false;
      setAutoPulsePage(null);
      setLocateHint(null);
      setFocusedPage(warning.pageNumber);
      setLocateStatus('loading');

      try {
        const response = await axios.get<PageLocateResult>(
          `/api/projects/${projectId}/pages/${warning.pageNumber}/locate`,
          {
            params: {
              term: warning.sourceTerm ?? '',
              referencePage,
            },
          }
        );

        const boxes = response.data.boxes ?? [];
        const matchedPage = response.data.matchedPage ?? warning.pageNumber;

        if (boxes.length > 0) {
          setHighlightsByPage({ [matchedPage]: boxes });
          setLocateStatus('hit');
          locateReadyPageRef.current = matchedPage;
          if (matchedPage !== warning.pageNumber) {
            setLocateHint(`Matched on page ${matchedPage}`);
            setFocusedPage(matchedPage);
          }
          maybeStartAutoPulse(matchedPage, boxes);
          return;
        }

        setHighlightsByPage({});
        setLocateStatus('miss');
      } catch {
        setLocateStatus('miss');
      }
    },
    [projectId, focusedPage, maybeStartAutoPulse]
  );

  const handleWarningClick = useCallback(
    (warning: ValidationWarningItem) => {
      void locateAnomaly(warning);
    },
    [locateAnomaly]
  );

  useEffect(() => {
    const page = locateReadyPageRef.current;
    if (page == null) return;
    maybeStartAutoPulse(page);
  }, [highlightsByPage, maybeStartAutoPulse]);

  const occurrencePages = useMemo(() => [pageNumber], [pageNumber]);
  const previewEnabled = pageCount != null && pageCount > 0;
  const pad = previewEnabled ? 'p-4' : 'p-8';

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
          <h3 className="text-lg font-semibold text-gray-900">Figure {figureNumber}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            Page {pageNumber} · {calloutCount} callout{calloutCount !== 1 ? 's' : ''}
          </p>
        </div>

        <div className={`flex-1 min-h-0 overflow-y-auto ${pad}`}>
          <ValidationAnomalies
            validation={validation}
            pageNumber={pageNumber}
            figureNumber={figureNumber}
            isLoading={isValidatingAll}
            error={validationError}
            pendingMessage={pendingMessage}
            onWarningClick={previewEnabled ? handleWarningClick : undefined}
          />
        </div>
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
          onFocusedPageChange={setFocusedPage}
        />
      </DocumentPreviewSidebar>
    </div>
  );
}
