import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { Folder, Loader2 } from 'lucide-react';
import axios from 'axios';
import { DashboardHeader } from '../components/DashboardHeader';
import { SimilarityCluster, type SimilarityResult } from '../components/SimilarityCluster';
import { BrowsePanel, ProgressBanner, type BrowseTab } from '../components/BrowsePanel';
import { OccurrencesTable, type CalloutRow } from '../components/OccurrencesTable';
import {
  ValidationAnomalies,
  buildAnomalyMap,
  type FigureValidationResult,
} from '../components/ValidationAnomalies';

interface Concept {
  id: string;
  candidateConceptName: string;
  definitionText: string;
}

interface Callout {
  id?: string;
  identifier: string;
  sourceTerm?: string;
  figureNumber?: string;
  pageNumber?: number;
  concept?: Concept;
}

interface Illustration {
  id: string;
  pageNumber: number;
  figureNumber?: string | null;
  callouts: Callout[];
}

interface Keyword {
  id: string;
  sourceTerm: string;
  concepts: Concept[];
  callouts?: Callout[];
}

interface Project {
  id: string;
  name: string;
  keywords?: Keyword[];
  illustrations?: Illustration[];
}

interface Progress {
  current: number;
  total: number;
  error?: boolean;
  skipped?: boolean;
}

type MainTab = 'callouts' | 'similarity';

function mapCalloutsToKeywords(data: Project): Project {
  if (!data.keywords || !data.illustrations) return data;

  data.keywords.forEach(kw => {
    kw.callouts = [];
    data.illustrations!.forEach(ill => {
      ill.callouts.forEach(callout => {
        if (callout.concept && kw.concepts.some(c => c.id === callout.concept!.id)) {
          kw.callouts!.push({
            ...callout,
            pageNumber: ill.pageNumber,
            figureNumber: ill.figureNumber ?? undefined,
          });
        }
      });
    });
  });

  return data;
}

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectDetails, setSelectedProjectDetails] = useState<Project | null>(null);
  const [browseTab, setBrowseTab] = useState<BrowseTab>('keywords');
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [selectedFigurePage, setSelectedFigurePage] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>('callouts');
  const [similarityResult, setSimilarityResult] = useState<SimilarityResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [similarityError, setSimilarityError] = useState<string | null>(null);
  const [figureValidation, setFigureValidation] = useState<FigureValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const selectedKeyword = selectedProjectDetails?.keywords?.find(k => k.id === selectedKeywordId) ?? null;

  const identifiedFigures = useMemo(
    () =>
      (selectedProjectDetails?.illustrations ?? [])
        .filter(ill => ill.figureNumber)
        .sort((a, b) => a.pageNumber - b.pageNumber),
    [selectedProjectDetails?.illustrations]
  );

  const selectedFigure =
    identifiedFigures.find(f => f.pageNumber === selectedFigurePage) ?? null;

  const fetchProjectDetails = useCallback(async (projectId: string) => {
    const response = await axios.get(`/api/projects/${projectId}`);
    setSelectedProjectDetails(mapCalloutsToKeywords(response.data));
  }, []);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await axios.get('/api/projects');
        setProjects(response.data);
        if (response.data.length > 0) {
          setSelectedProjectId(response.data[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch projects', error);
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    setBrowseTab('keywords');
    setSelectedKeywordId(null);
    setSelectedFigurePage(null);
    setActiveTab('callouts');
    setSimilarityResult(null);
    setSimilarityError(null);
    setFigureValidation(null);
    setValidationError(null);
  }, [selectedProjectId]);

  useEffect(() => {
    setActiveTab('callouts');
    setSimilarityResult(null);
    setSimilarityError(null);
  }, [selectedKeywordId]);

  useEffect(() => {
    setFigureValidation(null);
    setValidationError(null);
  }, [selectedFigurePage]);

  useEffect(() => {
    const keywords = selectedProjectDetails?.keywords;
    if (browseTab !== 'keywords') return;
    if (!keywords?.length) {
      setSelectedKeywordId(null);
      return;
    }
    if (!selectedKeywordId || !keywords.some(k => k.id === selectedKeywordId)) {
      setSelectedKeywordId(keywords[0].id);
    }
  }, [selectedProjectDetails?.keywords, selectedKeywordId, browseTab]);

  useEffect(() => {
    if (browseTab !== 'figures') return;
    if (!identifiedFigures.length) {
      setSelectedFigurePage(null);
      return;
    }
    if (selectedFigurePage === null || !identifiedFigures.some(f => f.pageNumber === selectedFigurePage)) {
      setSelectedFigurePage(identifiedFigures[0].pageNumber);
    }
  }, [identifiedFigures, selectedFigurePage, browseTab]);

  useEffect(() => {
    if (browseTab !== 'figures' || !selectedProjectId || selectedFigurePage === null) return;

    let cancelled = false;

    const runValidation = async () => {
      setIsValidating(true);
      setValidationError(null);
      try {
        const response = await axios.post(
          `/api/projects/${selectedProjectId}/figures/${selectedFigurePage}/validate`
        );
        if (!cancelled) {
          setFigureValidation(response.data.validation);
        }
      } catch (error) {
        console.error('Figure validation failed', error);
        if (!cancelled) {
          setValidationError('Validation failed. Re-upload the PDF if this project predates PDF storage.');
          setFigureValidation(null);
        }
      } finally {
        if (!cancelled) setIsValidating(false);
      }
    };

    runValidation();
    return () => {
      cancelled = true;
    };
  }, [browseTab, selectedProjectId, selectedFigurePage]);

  useEffect(() => {
    if (!selectedProjectId) return;

    const setup = async () => {
      try {
        await fetchProjectDetails(selectedProjectId);
      } catch (error) {
        console.error('Failed to fetch project details', error);
      }

      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const token = localStorage.getItem('token');
      const eventSource = new EventSource(`/api/projects/${selectedProjectId}/stream?token=${token}`);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('progress', e => {
        const data = JSON.parse(e.data);
        setProgress(data);
        setIsProcessing(data.current < data.total);
      });

      eventSource.addEventListener('keyword_extracted', e => {
        const data = JSON.parse(e.data);
        setSelectedProjectDetails(prev => {
          if (!prev) return prev;

          const newKeywords = [...(prev.keywords || [])];
          const existingKeywordIndex = newKeywords.findIndex(k => k.id === data.keyword.id);

          if (existingKeywordIndex >= 0) {
            const existingKeyword = newKeywords[existingKeywordIndex];
            if (!existingKeyword.concepts.some(c => c.id === data.concept.id)) {
              existingKeyword.concepts.push(data.concept);
            }
            if (!existingKeyword.callouts) existingKeyword.callouts = [];
            existingKeyword.callouts.push({ ...data.callout, concept: data.concept });
          } else {
            newKeywords.push({
              ...data.keyword,
              concepts: [data.concept],
              callouts: [{ ...data.callout, concept: data.concept }],
            });
          }

          newKeywords.sort((a, b) => a.sourceTerm.localeCompare(b.sourceTerm));
          return { ...prev, keywords: newKeywords };
        });
      });

      eventSource.addEventListener('complete', async () => {
        setIsProcessing(false);
        setProgress(null);
        try {
          await fetchProjectDetails(selectedProjectId);
        } catch (error) {
          console.error('Failed to refresh project after processing', error);
        }
      });

      eventSource.addEventListener('error', e => {
        console.error('SSE Error:', e);
      });
    };

    setup();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [selectedProjectId, fetchProjectDetails]);

  const handleBrowseTabChange = (tab: BrowseTab) => {
    setBrowseTab(tab);
    if (tab === 'keywords') {
      setSelectedFigurePage(null);
      setFigureValidation(null);
    } else {
      setSelectedKeywordId(null);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const response = await axios.post('/api/projects', { name: file.name });
      setProjects([response.data, ...projects]);
      setSelectedProjectId(response.data.id);

      const formData = new FormData();
      formData.append('file', file);

      setIsProcessing(true);
      setProgress({ current: 0, total: 1 });

      await new Promise(resolve => setTimeout(resolve, 500));

      await axios.post(`/api/projects/${response.data.id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    } catch (error) {
      console.error('Failed to create project from file', error);
      setIsProcessing(false);
      setProgress(null);
    }
  };

  const handleAnalyzeSimilarity = async () => {
    if (!selectedKeyword) return;

    setIsAnalyzing(true);
    setSimilarityError(null);

    try {
      const response = await axios.post(`/api/keywords/${selectedKeyword.id}/analyze-similarity`);
      setSimilarityResult(response.data);
    } catch (error) {
      console.error('Failed to analyse similarity', error);
      setSimilarityError('Failed to analyse similarities. Ensure concepts exist and try again.');
      setSimilarityResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const keywordRows: CalloutRow[] = (selectedKeyword?.callouts ?? []).map(callout => {
    const concept = callout.concept ?? selectedKeyword?.concepts[0];
    return {
      identifier: callout.identifier,
      pageNumber: callout.pageNumber ?? 0,
      figureNumber: callout.figureNumber,
      definitionText: concept?.definitionText,
    };
  });

  const figureRows: CalloutRow[] = useMemo(() => {
    if (!selectedFigure) return [];

    const anomalyMap = buildAnomalyMap(figureValidation);
    const rows: CalloutRow[] = selectedFigure.callouts.map(callout => ({
      identifier: callout.identifier,
      pageNumber: selectedFigure.pageNumber,
      sourceTerm: callout.concept?.candidateConceptName ?? callout.sourceTerm,
      definitionText: callout.concept?.definitionText,
      anomaly: anomalyMap.get(callout.identifier),
    }));

    if (figureValidation) {
      for (const id of figureValidation.unreferencedCallouts) {
        if (!rows.some(r => r.identifier === id)) {
          rows.push({
            identifier: id,
            pageNumber: selectedFigure.pageNumber,
            sourceTerm: undefined,
            definitionText: undefined,
            anomaly: 'Unreferenced',
          });
        }
      }
      for (const id of figureValidation.uncalledReferences) {
        if (!rows.some(r => r.identifier === id)) {
          rows.push({
            identifier: id,
            pageNumber: selectedFigure.pageNumber,
            sourceTerm: undefined,
            definitionText: undefined,
            anomaly: 'Uncalled ref.',
          });
        }
      }
    }

    return rows;
  }, [selectedFigure, figureValidation]);

  const listContent =
    browseTab === 'keywords' ? (
      <>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Keywords</h2>
        {selectedProjectDetails?.keywords?.length === 0 && !isProcessing ? (
          <div className="text-sm text-gray-500 text-center py-8">
            No keywords extracted yet. Upload a PDF to begin.
          </div>
        ) : (
          <ul className="space-y-1">
            {selectedProjectDetails?.keywords?.map(keyword => (
              <li key={keyword.id}>
                <button
                  type="button"
                  onClick={() => setSelectedKeywordId(keyword.id)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedKeywordId === keyword.id
                      ? 'bg-blue-100 text-blue-900 font-medium border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-100 border border-transparent'
                  }`}
                >
                  {keyword.sourceTerm}{' '}
                  <span className="text-gray-400 font-normal">({keyword.callouts?.length || 0})</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    ) : (
      <>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Figures</h2>
        {identifiedFigures.length === 0 && !isProcessing ? (
          <div className="text-sm text-gray-500 text-center py-8">
            No identified figures yet. Figures need an explicit figure number from extraction.
          </div>
        ) : (
          <ul className="space-y-1">
            {identifiedFigures.map(figure => (
              <li key={figure.id}>
                <button
                  type="button"
                  onClick={() => setSelectedFigurePage(figure.pageNumber)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                    selectedFigurePage === figure.pageNumber
                      ? 'bg-blue-100 text-blue-900 font-medium border border-blue-200'
                      : 'text-gray-700 hover:bg-gray-100 border border-transparent'
                  }`}
                >
                  <span className="font-medium">Fig. {figure.figureNumber}</span>
                  <span className="text-gray-400 font-normal block text-xs mt-0.5">
                    Page {figure.pageNumber} · {figure.callouts.length} callout
                    {figure.callouts.length !== 1 ? 's' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </>
    );

  return (
    <div className="flex h-screen flex-col bg-white">
      <DashboardHeader
        projects={projects}
        selectedProjectId={selectedProjectId}
        onProjectChange={setSelectedProjectId}
        onFileUpload={handleFileUpload}
        isProcessing={isProcessing}
      />

      <div className="flex flex-1 overflow-hidden">
        <BrowsePanel
          activeTab={browseTab}
          onTabChange={handleBrowseTabChange}
          progressSlot={
            isProcessing && progress ? (
              <ProgressBanner current={progress.current} total={progress.total} compact />
            ) : null
          }
          listContent={listContent}
          username={user?.username ?? ''}
          onLogout={logout}
        />

        <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
          {selectedProjectId ? (
            <div className="flex-1 p-8 flex flex-col max-w-5xl mx-auto w-full overflow-y-auto">
              <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
                {isProcessing && progress && !selectedProjectDetails?.keywords?.length && (
                  <div className="mb-8">
                    <ProgressBanner current={progress.current} total={progress.total} />
                  </div>
                )}

                {browseTab === 'keywords' && selectedKeyword ? (
                  <div>
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">{selectedKeyword.sourceTerm}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {selectedKeyword.concepts.length} concept
                        {selectedKeyword.concepts.length !== 1 ? 's' : ''} ·{' '}
                        {selectedKeyword.callouts?.length || 0} occurrence
                        {(selectedKeyword.callouts?.length || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <div className="flex items-center justify-between border-b border-gray-200 mb-4">
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setActiveTab('callouts')}
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
                          onClick={() => setActiveTab('similarity')}
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
                          onClick={handleAnalyzeSimilarity}
                          disabled={isAnalyzing || selectedKeyword.concepts.length === 0}
                          className="mb-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        >
                          {isAnalyzing && <Loader2 className="animate-spin mr-2" size={16} />}
                          Analyse Similarities
                        </button>
                      )}
                    </div>

                    {activeTab === 'callouts' ? (
                      <OccurrencesTable
                        rows={keywordRows}
                        mode="keyword"
                        emptyMessage="No callouts extracted for this keyword yet."
                      />
                    ) : (
                      <div>
                        {similarityError && (
                          <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                            {similarityError}
                          </div>
                        )}
                        {!similarityResult && !isAnalyzing && (
                          <div className="text-sm text-gray-500 text-center py-12 border border-dashed border-gray-200 rounded-lg">
                            Click &quot;Analyse Similarities&quot; to map how closely each definition aligns with the
                            centroid.
                          </div>
                        )}
                        {isAnalyzing && (
                          <div className="flex items-center justify-center py-12 text-indigo-700">
                            <Loader2 className="animate-spin mr-2" size={20} />
                            Computing embeddings and similarity scores...
                          </div>
                        )}
                        {similarityResult && !isAnalyzing && <SimilarityCluster result={similarityResult} />}
                      </div>
                    )}
                  </div>
                ) : browseTab === 'figures' && selectedFigure ? (
                  <div>
                    <div className="mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Figure {selectedFigure.figureNumber}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        Page {selectedFigure.pageNumber} · {selectedFigure.callouts.length} callout
                        {selectedFigure.callouts.length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    <ValidationAnomalies
                      validation={figureValidation}
                      isLoading={isValidating}
                      error={validationError}
                    />

                    <h4 className="text-sm font-medium text-gray-700 mb-3">Occurrences</h4>
                    <OccurrencesTable
                      rows={figureRows}
                      mode="figure"
                      emptyMessage="No callouts on this figure."
                    />
                  </div>
                ) : browseTab === 'keywords' && selectedProjectDetails?.keywords?.length ? (
                  <div className="text-sm text-gray-500 text-center py-12">
                    Select a keyword from the list to view its occurrences.
                  </div>
                ) : browseTab === 'figures' && identifiedFigures.length ? (
                  <div className="text-sm text-gray-500 text-center py-12">
                    Select a figure from the list to view occurrences and validation.
                  </div>
                ) : !isProcessing ? (
                  <div className="text-sm text-gray-500 text-center py-12">
                    Upload a PDF to extract keywords and terminology.
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <Folder className="mx-auto h-12 w-12 text-gray-300 mb-3" />
                <p>Select a project or upload a new PDF using the header to get started.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
