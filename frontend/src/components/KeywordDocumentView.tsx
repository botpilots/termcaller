import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import type { CalloutRow } from './OccurrencesTable';
import { OccurrenceForm } from './OccurrenceForm';
import { OccurrenceRail } from './OccurrenceRail';
import { DocumentPreview, type DocumentPreviewHandle } from './DocumentPreview';
import { DocumentPreviewSidebar } from './DocumentPreviewSidebar';
import { countFiguresForKeyword } from '../utils/figureOccurrences';
import type { HighlightBox, PageLocateResult } from '../types/documentPreview';
import { figureOccurrenceKey } from '../utils/figureOccurrences';
import { ConfirmPromptModal } from './ConfirmPromptModal';
import { useOccurrenceEditorState } from '../hooks/useOccurrenceEditorState';
import type { KeywordConceptEmbedding } from '../types/keywordConcept';

interface KeywordDocumentViewProps {
  projectId: string;
  keywordId: string;
  pageCount: number | null | undefined;
  sourceTerm: string;
  conceptCount: number;
  keywordRows: CalloutRow[];
  onOccurrenceSaved?: (result: { keywordId: string; concepts: KeywordConceptEmbedding[] }) => void;
  onOccurrenceDeleted?: (result: { keywordId: string | null; keywordDeleted: boolean }) => void;
}

function firstCalloutId(identifier: string): string {
  return identifier.split(',')[0]?.trim() ?? identifier;
}

export function KeywordDocumentView({
  projectId,
  keywordId,
  pageCount,
  sourceTerm,
  conceptCount,
  keywordRows,
  onOccurrenceSaved,
  onOccurrenceDeleted,
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

  const [isSavingOccurrence, setIsSavingOccurrence] = useState(false);
  const [isDeletingOccurrence, setIsDeletingOccurrence] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [occurrenceSaveError, setOccurrenceSaveError] = useState<string | null>(null);
  const [occurrenceDeleteError, setOccurrenceDeleteError] = useState<string | null>(null);

  const previewEnabled = pageCount != null && pageCount > 0;

  const {
    activeKey,
    selectedRow,
    draft,
    originalDraft,
    updateDraft,
    selectRow,
    isTermChanged,
    markDraftSaved,
  } = useOccurrenceEditorState(keywordRows, 'keyword', selectedRowKey, sourceTerm);

  const handleOccurrenceConfirm = useCallback(async () => {
    if (!activeKey || !draft || !selectedRow || !originalDraft) return;

    setIsSavingOccurrence(true);
    setOccurrenceSaveError(null);

    try {
      const response = await axios.patch<{
        keywordId: string;
        concepts: KeywordConceptEmbedding[];
      }>(`/api/keywords/${keywordId}/occurrences`, {
        pageNumber: selectedRow.pageNumber,
        figureNumber: selectedRow.figureNumber ?? '1',
        originalIdentifiers: originalDraft.identifier,
        identifier: draft.identifier,
        sourceTerm: draft.sourceTerm,
        definitionText: draft.definitionText ?? '',
        originalSourceTerm: originalDraft.sourceTerm,
      });

      markDraftSaved(activeKey);
      onOccurrenceSaved?.({
        keywordId: response.data.keywordId,
        concepts: response.data.concepts,
      });
    } catch {
      setOccurrenceSaveError('Failed to save occurrence. Please try again.');
    } finally {
      setIsSavingOccurrence(false);
    }
  }, [
    activeKey,
    draft,
    selectedRow,
    originalDraft,
    keywordId,
    markDraftSaved,
    onOccurrenceSaved,
  ]);

  const handleOccurrenceDeleteRequest = useCallback(() => {
    if (!selectedRow || !originalDraft) return;
    setDeleteConfirmOpen(true);
  }, [selectedRow, originalDraft]);

  const handleOccurrenceDeleteConfirm = useCallback(async () => {
    if (!selectedRow || !originalDraft) return;

    setDeleteConfirmOpen(false);
    setIsDeletingOccurrence(true);
    setOccurrenceDeleteError(null);

    try {
      const response = await axios.delete<{ keywordId: string | null; keywordDeleted: boolean }>(
        `/api/keywords/${keywordId}/occurrences`,
        {
          data: {
            pageNumber: selectedRow.pageNumber,
            figureNumber: selectedRow.figureNumber ?? '1',
            identifiers: originalDraft.identifier,
          },
        }
      );

      onOccurrenceDeleted?.(response.data);
    } catch {
      setOccurrenceDeleteError('Failed to delete concept. Please try again.');
    } finally {
      setIsDeletingOccurrence(false);
    }
  }, [selectedRow, originalDraft, keywordId, onOccurrenceDeleted]);

  const handleOccurrenceSelect = useCallback(
    (row: CalloutRow) => {
      selectRow(row);
      focusRow(row);
    },
    [focusRow, selectRow]
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
        <div className="flex flex-1 min-h-0">
          <OccurrenceRail
            rows={keywordRows}
            mode="keyword"
            activeKey={activeKey}
            onSelect={handleOccurrenceSelect}
            compact={previewEnabled}
            className={previewEnabled ? '' : 'rounded-bl-xl'}
          />

          <div className="flex flex-col flex-1 min-h-0 min-w-0">
            <div className={previewEnabled ? 'p-4 border-b border-gray-100 shrink-0' : 'p-8 pb-4 shrink-0'}>
              <h3 className="text-lg font-semibold text-gray-900">{sourceTerm}</h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {conceptCount} concept{conceptCount !== 1 ? 's' : ''} ·{' '}
                {countFiguresForKeyword(keywordRows)} figure
                {countFiguresForKeyword(keywordRows) !== 1 ? 's' : ''}
              </p>
            </div>

            <div className={`flex-1 min-h-0 min-w-0 overflow-y-auto ${previewEnabled ? '' : 'pb-8'}`}>
              {keywordRows.length === 0 ? (
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
                  onConfirm={() => void handleOccurrenceConfirm()}
                  onDelete={handleOccurrenceDeleteRequest}
                  showTermChangeHint={isTermChanged(activeKey ?? '')}
                  isSaving={isSavingOccurrence}
                  isDeleting={isDeletingOccurrence}
                  saveError={occurrenceSaveError}
                  deleteError={occurrenceDeleteError}
                  cohesionRating={selectedRow?.cohesionRating ?? null}
                  compact={previewEnabled}
                />
              )}
            </div>
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

      <ConfirmPromptModal
        open={deleteConfirmOpen}
        title="Delete concept?"
        message={
          selectedRow ? (
            <>
              Remove this concept from the keyword group? This deletes the callout and definition
              for page {selectedRow.pageNumber}, figure {selectedRow.figureNumber ?? '1'}.
            </>
          ) : (
            'Remove this concept from the keyword group?'
          )
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={() => void handleOccurrenceDeleteConfirm()}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </div>
  );
}
