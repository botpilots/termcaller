import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import type { CalloutRow } from './OccurrencesTable';
import { OccurrenceForm } from './OccurrenceForm';
import { OccurrenceRail } from './OccurrenceRail';
import { DocumentPreview, type DocumentPreviewHandle } from './DocumentPreview';
import { DocumentPreviewSidebar } from './DocumentPreviewSidebar';
import { SimilarityCluster, type SimilarityResult } from './SimilarityCluster';
import { countFiguresForKeyword } from '../utils/figureOccurrences';
import type { HighlightBox, PageLocateResult } from '../types/documentPreview';
import { figureOccurrenceKey } from '../utils/figureOccurrences';
import { useOccurrenceEditorState } from '../hooks/useOccurrenceEditorState';

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
  const [locateHint, setLocateHint] = useState<string | null>(null);
  const [hoverPulsePage, setHoverPulsePage] = useState<number | null>(null);
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
        (a, b) =>
          a.pageNumber - b.pageNumber ||
          (a.figureNumber ?? '').localeCompare(b.figureNumber ?? '', undefined, { numeric: true }) ||
          a.identifier.localeCompare(b.identifier)
      ),
    [keywordRows]
  );

  const occurrenceSignature = useMemo(
    () => `${sourceTerm}:${sortedRows.map(r => figureOccurrenceKey(r)).join('|')}`,
    [sourceTerm, sortedRows]
  );
  const lastInitializedSignatureRef = useRef<string | null>(null);

  const locateOnPage = useCallback(
    async (pageNumber: number, row: CalloutRow, referencePage: number) => {
      setLocateStatus('loading');
      setLocateHint(null);

      try {
        const response = await axios.get<PageLocateResult>(
          `/api/projects/${projectId}/pages/${pageNumber}/locate`,
          {
            params: {
              term: sourceTerm,
              callout: firstCalloutId(row.identifier),
              referencePage,
            },
          }
        );

        const boxes = response.data.boxes ?? [];
        const matchedPage = response.data.matchedPage ?? pageNumber;

        if (boxes.length > 0) {
          setHighlightsByPage({ [matchedPage]: boxes });
          setLocateStatus('hit');
          locateReadyPageRef.current = matchedPage;
          if (matchedPage !== pageNumber) {
            setLocateHint(`Matched on page ${matchedPage}`);
            setFocusedPage(matchedPage);
          }
          maybeStartAutoPulse(matchedPage);
        } else {
          setHighlightsByPage({});
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
      const key = figureOccurrenceKey(row);
      const referencePage =
        previewRef.current?.getViewportCenterPage() ?? focusedPage ?? row.pageNumber;
      scrollSettledPageRef.current = null;
      locateReadyPageRef.current = null;
      autoPulseConsumedRef.current = false;
      setAutoPulsePage(null);
      setLocateHint(null);
      setSelectedRowKey(key);
      setFocusedPage(row.pageNumber);
      void locateOnPage(row.pageNumber, row, referencePage);
    },
    [locateOnPage, focusedPage]
  );

  useEffect(() => {
    if (sortedRows.length === 0) {
      lastInitializedSignatureRef.current = null;
      setFocusedPage(null);
      setSelectedRowKey(null);
      setHighlightsByPage({});
      setLocateStatus('idle');
      return;
    }

    if (lastInitializedSignatureRef.current === occurrenceSignature) return;
    lastInitializedSignatureRef.current = occurrenceSignature;

    const row = sortedRows[0]!;
    const referencePage = previewRef.current?.getViewportCenterPage() ?? row.pageNumber;
    scrollSettledPageRef.current = null;
    locateReadyPageRef.current = null;
    autoPulseConsumedRef.current = false;
    setAutoPulsePage(null);
    setLocateHint(null);
    setSelectedRowKey(figureOccurrenceKey(row));
    setFocusedPage(row.pageNumber);
    void locateOnPage(row.pageNumber, row, referencePage);
  }, [occurrenceSignature, sortedRows, locateOnPage]);

  const previewEnabled = activeTab === 'callouts' && pageCount != null && pageCount > 0;

  const { activeKey, selectedRow, draft, updateDraft, selectRow } = useOccurrenceEditorState(
    keywordRows,
    'keyword',
    selectedRowKey
  );

  const handleOccurrenceSelect = useCallback(
    (row: CalloutRow) => {
      selectRow(row);
      if (activeTab !== 'callouts') {
        onTabChange('callouts');
      }
      focusRow(row);
    },
    [activeTab, focusRow, onTabChange, selectRow]
  );

  return (
    <div className={`flex flex-1 min-h-0 min-w-0 ${previewEnabled ? '' : 'max-w-5xl mx-auto w-full'}`}>
      <div
        className={`flex flex-col min-h-0 min-w-0 bg-white overflow-hidden ${
          previewEnabled
            ? 'flex-1 border-r border-gray-200'
            : 'flex-1 rounded-xl shadow-sm border border-gray-200'
        }`}
      >
        <div className={previewEnabled ? 'p-4 border-b border-gray-100 shrink-0' : 'p-8 pb-4 shrink-0'}>
          <h3 className="text-lg font-semibold text-gray-900">{sourceTerm}</h3>
          <p className="text-sm text-gray-500 mt-0.5">
            {conceptCount} concept{conceptCount !== 1 ? 's' : ''} ·{' '}
            {countFiguresForKeyword(keywordRows)} figure
            {countFiguresForKeyword(keywordRows) !== 1 ? 's' : ''}
          </p>
        </div>

        <div
          className={`flex items-center justify-between border-b border-gray-200 shrink-0 ${
            previewEnabled ? 'px-4' : 'px-8'
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

        <div className="flex flex-1 min-h-0">
          <OccurrenceRail
            rows={keywordRows}
            mode="keyword"
            activeKey={activeKey}
            onSelect={handleOccurrenceSelect}
            compact={previewEnabled}
            className={previewEnabled ? '' : 'rounded-bl-xl'}
          />

          <div className={`flex-1 min-h-0 min-w-0 overflow-y-auto ${previewEnabled ? '' : 'pb-8'}`}>
            {activeTab === 'callouts' ? (
              keywordRows.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-12 px-6">
                  No callouts extracted for this keyword yet.
                </div>
              ) : (
                <OccurrenceForm
                  selectedRow={selectedRow}
                  draft={draft}
                  mode="keyword"
                  onDraftChange={updateDraft}
                  onHighlightPulseHover={setHoverPulsePage}
                  compact={previewEnabled}
                />
              )
            ) : (
              <div className={previewEnabled ? 'p-3' : 'p-5'}>
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
          hoverPulsePage={hoverPulsePage}
          autoPulsePage={autoPulsePage}
          autoPulseGeneration={autoPulseGeneration}
          onScrollSettled={handleScrollSettled}
          onFocusedPageChange={pageNumber => {
            const referencePage =
              previewRef.current?.getViewportCenterPage() ?? focusedPage ?? pageNumber;
            setFocusedPage(pageNumber);

            const currentRow = selectedRowKey
              ? sortedRows.find(r => figureOccurrenceKey(r) === selectedRowKey)
              : undefined;
            if (currentRow?.pageNumber === pageNumber) {
              void locateOnPage(pageNumber, currentRow, referencePage);
              return;
            }

            const row = sortedRows.find(r => r.pageNumber === pageNumber);
            if (row) {
              setSelectedRowKey(figureOccurrenceKey(row));
              void locateOnPage(pageNumber, row, referencePage);
            }
          }}
        />
      </DocumentPreviewSidebar>
    </div>
  );
}
