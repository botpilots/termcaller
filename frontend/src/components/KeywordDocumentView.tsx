import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import type { CalloutRow } from './OccurrencesTable';
import { OccurrencesTable } from './OccurrencesTable';
import { DocumentPreview } from './DocumentPreview';
import { DocumentPreviewSidebar } from './DocumentPreviewSidebar';
import { SimilarityCluster, type SimilarityResult } from './SimilarityCluster';
import { countFiguresForKeyword } from '../utils/figureOccurrences';
import type { HighlightBox, PageLocateResult } from '../types/documentPreview';
import { occurrenceRowKey } from '../types/documentPreview';

type MainTab = 'callouts' | 'similarity';

interface KeywordDocumentViewProps {
  projectId: string;
  pageCount: number | null | undefined;
  sourceTerm: string;
  conceptCount: number;
  keywordRows: CalloutRow[];
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
  similarityResult: SimilarityResult | null;
  similarityError: string | null;
  isAnalyzing: boolean;
  onAnalyzeSimilarity: () => void;
}

function firstCalloutId(identifier: string): string {
  return identifier.split(',')[0]?.trim() ?? identifier;
}

export function KeywordDocumentView({
  projectId,
  pageCount,
  sourceTerm,
  conceptCount,
  keywordRows,
  activeTab,
  onTabChange,
  similarityResult,
  similarityError,
  isAnalyzing,
  onAnalyzeSimilarity,
}: KeywordDocumentViewProps) {
  const [focusedPage, setFocusedPage] = useState<number | null>(null);
  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);
  const [highlightsByPage, setHighlightsByPage] = useState<Record<number, HighlightBox[]>>({});
  const [locateStatus, setLocateStatus] = useState<'idle' | 'loading' | 'hit' | 'miss'>('idle');
  const [hoverPulsePage, setHoverPulsePage] = useState<number | null>(null);
  const [autoPulsePage, setAutoPulsePage] = useState<number | null>(null);
  const [autoPulseGeneration, setAutoPulseGeneration] = useState(0);
  const scrollSettledPageRef = useRef<number | null>(null);
  const locateReadyPageRef = useRef<number | null>(null);
  const pulseGenerationRef = useRef(0);
  const highlightsByPageRef = useRef(highlightsByPage);
  highlightsByPageRef.current = highlightsByPage;

  const autoPulseConsumedRef = useRef(false);

  const triggerAutoPulse = useCallback((pageNumber: number) => {
    pulseGenerationRef.current += 1;
    setAutoPulsePage(pageNumber);
    setAutoPulseGeneration(pulseGenerationRef.current);
  }, []);

  const maybeStartAutoPulse = useCallback(
    (pageNumber: number) => {
      if (autoPulseConsumedRef.current) return;
      if (scrollSettledPageRef.current !== pageNumber) return;
      if (locateReadyPageRef.current !== pageNumber) return;
      if (!highlightsByPageRef.current[pageNumber]?.length) return;
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

  const occurrencePages = useMemo(
    () => [...new Set(keywordRows.map(row => row.pageNumber))].sort((a, b) => a - b),
    [keywordRows]
  );

  const sortedRows = useMemo(
    () =>
      [...keywordRows].sort(
        (a, b) => a.pageNumber - b.pageNumber || a.identifier.localeCompare(b.identifier)
      ),
    [keywordRows]
  );

  const locateOnPage = useCallback(
    async (pageNumber: number, row: CalloutRow) => {
      setLocateStatus('loading');

      try {
        const response = await axios.get<PageLocateResult>(
          `/api/projects/${projectId}/pages/${pageNumber}/locate`,
          {
            params: {
              term: sourceTerm,
              callout: firstCalloutId(row.identifier),
            },
          }
        );

        const boxes = response.data.boxes ?? [];
        if (boxes.length > 0) {
          setHighlightsByPage({ [pageNumber]: boxes });
          setLocateStatus('hit');
          locateReadyPageRef.current = pageNumber;
          maybeStartAutoPulse(pageNumber);
        } else {
          setHighlightsByPage(prev => {
            const next = { ...prev };
            delete next[pageNumber];
            return next;
          });
          setLocateStatus('miss');
        }
      } catch {
        setLocateStatus('miss');
      }
    },
    [projectId, sourceTerm, maybeStartAutoPulse]
  );

  const focusRow = useCallback(
    (row: CalloutRow) => {
      const key = occurrenceRowKey(row);
      scrollSettledPageRef.current = null;
      locateReadyPageRef.current = null;
      autoPulseConsumedRef.current = false;
      setAutoPulsePage(null);
      setSelectedRowKey(key);
      setFocusedPage(row.pageNumber);
      void locateOnPage(row.pageNumber, row);
    },
    [locateOnPage]
  );

  useEffect(() => {
    if (sortedRows.length === 0) {
      setFocusedPage(null);
      setSelectedRowKey(null);
      setHighlightsByPage({});
      setLocateStatus('idle');
      return;
    }

    const row = sortedRows[0]!;
    scrollSettledPageRef.current = null;
    locateReadyPageRef.current = null;
    autoPulseConsumedRef.current = false;
    setAutoPulsePage(null);
    setSelectedRowKey(occurrenceRowKey(row));
    setFocusedPage(row.pageNumber);
    void locateOnPage(row.pageNumber, row);
  }, [sourceTerm, sortedRows, locateOnPage]);

  const previewEnabled = activeTab === 'callouts' && pageCount != null && pageCount > 0;

  return (
    <div className={`flex flex-1 min-h-0 min-w-0 ${previewEnabled ? '' : 'max-w-5xl mx-auto w-full'}`}>
      <div
        className={`flex flex-col min-h-0 min-w-0 bg-white overflow-hidden ${
          previewEnabled
            ? 'flex-1 border-r border-gray-200'
            : 'flex-1 rounded-xl shadow-sm border border-gray-200 p-8'
        }`}
      >
        <div className={previewEnabled ? 'p-4 border-b border-gray-100 shrink-0' : 'mb-4'}>
          <h3 className="text-lg font-semibold text-gray-900">{sourceTerm}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {conceptCount} concept{conceptCount !== 1 ? 's' : ''} ·{' '}
            {countFiguresForKeyword(keywordRows)} figure
            {countFiguresForKeyword(keywordRows) !== 1 ? 's' : ''}
          </p>
        </div>

        <div
          className={`flex items-center justify-between border-b border-gray-200 shrink-0 ${
            previewEnabled ? 'px-4' : 'mb-4'
          }`}
        >
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onTabChange('callouts')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'callouts'
                  ? 'border-blue-600 text-blue-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Occurrences
            </button>
            <button
              type="button"
              onClick={() => onTabChange('similarity')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === 'similarity'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Similarity
            </button>
          </div>

          {activeTab === 'similarity' && (
            <button
              type="button"
              onClick={onAnalyzeSimilarity}
              disabled={isAnalyzing || conceptCount === 0}
              className="mb-2 px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {isAnalyzing && <Loader2 className="animate-spin mr-1.5" size={14} />}
              Analyse
            </button>
          )}
        </div>

        <div className={`flex-1 min-h-0 overflow-y-auto ${previewEnabled ? 'p-3' : ''}`}>
          {activeTab === 'callouts' ? (
            <OccurrencesTable
              rows={keywordRows}
              mode="keyword"
              emptyMessage="No callouts extracted for this keyword yet."
              selectedRowKey={selectedRowKey}
              onRowClick={focusRow}
              onHighlightPulseHover={setHoverPulsePage}
              compact={previewEnabled}
            />
          ) : (
            <div className={previewEnabled ? 'p-1' : 'mt-4'}>
              {similarityError && (
                <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                  {similarityError}
                </div>
              )}
              {!similarityResult && !isAnalyzing && (
                <div className="text-sm text-gray-500 text-center py-12 border border-dashed border-gray-200 rounded-lg">
                  Click &quot;Analyse&quot; to map definition similarity.
                </div>
              )}
              {isAnalyzing && (
                <div className="flex items-center justify-center py-12 text-indigo-700 text-sm">
                  <Loader2 className="animate-spin mr-2" size={18} />
                  Computing embeddings…
                </div>
              )}
              {similarityResult && !isAnalyzing && <SimilarityCluster result={similarityResult} />}
            </div>
          )}
        </div>
      </div>

      <DocumentPreviewSidebar enabled={previewEnabled}>
        <DocumentPreview
          projectId={projectId}
          pageCount={pageCount!}
          occurrencePages={occurrencePages}
          focusedPage={focusedPage}
          highlightsByPage={highlightsByPage}
          locateStatus={locateStatus}
          hoverPulsePage={hoverPulsePage}
          autoPulsePage={autoPulsePage}
          autoPulseGeneration={autoPulseGeneration}
          onScrollSettled={handleScrollSettled}
          onFocusedPageChange={pageNumber => {
            setFocusedPage(pageNumber);
            const row = sortedRows.find(r => r.pageNumber === pageNumber);
            if (row) {
              setSelectedRowKey(occurrenceRowKey(row));
              void locateOnPage(pageNumber, row);
            }
          }}
        />
      </DocumentPreviewSidebar>
    </div>
  );
}
