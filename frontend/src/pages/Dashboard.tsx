import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Folder, LogOut, Loader2 } from 'lucide-react';
import axios from 'axios';
import { DashboardHeader } from '../components/DashboardHeader';
import { SimilarityCluster, type SimilarityResult } from '../components/SimilarityCluster';

interface Concept {
  id: string;
  candidateConceptName: string;
  definitionText: string;
}

interface Callout {
  identifier: string;
  figureNumber?: string;
  pageNumber: number;
  concept?: Concept;
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
  illustrations?: {
    pageNumber: number;
    figureNumber?: string;
    callouts: Callout[];
  }[];
}

interface Progress {
  current: number;
  total: number;
  error?: boolean;
  skipped?: boolean;
}

type MainTab = 'callouts' | 'similarity';

export const Dashboard = () => {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectDetails, setSelectedProjectDetails] = useState<Project | null>(null);
  const [selectedKeywordId, setSelectedKeywordId] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<MainTab>('callouts');
  const [similarityResult, setSimilarityResult] = useState<SimilarityResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [similarityError, setSimilarityError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const selectedKeyword = selectedProjectDetails?.keywords?.find(k => k.id === selectedKeywordId) ?? null;

  // Fetch Projects on load
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
    setSelectedKeywordId(null);
    setActiveTab('callouts');
    setSimilarityResult(null);
    setSimilarityError(null);
  }, [selectedProjectId]);

  useEffect(() => {
    setActiveTab('callouts');
    setSimilarityResult(null);
    setSimilarityError(null);
  }, [selectedKeywordId]);

  useEffect(() => {
    const keywords = selectedProjectDetails?.keywords;
    if (!keywords?.length) {
      setSelectedKeywordId(null);
      return;
    }
    if (!selectedKeywordId || !keywords.some(k => k.id === selectedKeywordId)) {
      setSelectedKeywordId(keywords[0].id);
    }
  }, [selectedProjectDetails?.keywords, selectedKeywordId]);

  // Fetch specific project details when selected
  useEffect(() => {
    if (selectedProjectId) {
      const fetchProjectDetails = async () => {
        try {
          const response = await axios.get(`/api/projects/${selectedProjectId}`);
          const data = response.data;
          
          // Map illustrations.callouts to keywords
          if (data.keywords && data.illustrations) {
            data.keywords.forEach((kw: any) => {
              kw.callouts = [];
              data.illustrations.forEach((ill: any) => {
                ill.callouts.forEach((callout: any) => {
                  if (callout.concept && kw.concepts.some((c: any) => c.id === callout.concept.id)) {
                    kw.callouts.push({
                      ...callout,
                      pageNumber: ill.pageNumber,
                      figureNumber: ill.figureNumber
                    });
                  }
                });
              });
            });
          }
          
          setSelectedProjectDetails(data);
        } catch (error) {
          console.error('Failed to fetch project details', error);
        }
      };
      fetchProjectDetails();

      // Setup SSE
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const token = localStorage.getItem('token');
      const eventSource = new EventSource(`/api/projects/${selectedProjectId}/stream?token=${token}`);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('progress', (e) => {
        const data = JSON.parse(e.data);
        console.log('[SSE] progress', data);
        setProgress(data);
        if (data.current >= data.total) {
          setIsProcessing(false);
        } else {
          setIsProcessing(true);
        }
      });

      eventSource.addEventListener('keyword_extracted', (e) => {
        const data = JSON.parse(e.data);
        setSelectedProjectDetails(prev => {
          if (!prev) return prev;
          
          const newKeywords = [...(prev.keywords || [])];
          const existingKeywordIndex = newKeywords.findIndex(k => k.id === data.keyword.id);
          
          if (existingKeywordIndex >= 0) {
            const existingKeyword = newKeywords[existingKeywordIndex];
            const conceptExists = existingKeyword.concepts.some(c => c.id === data.concept.id);
            if (!conceptExists) {
              existingKeyword.concepts.push(data.concept);
            }
            if (!existingKeyword.callouts) existingKeyword.callouts = [];
            existingKeyword.callouts.push({ ...data.callout, concept: data.concept });
          } else {
            newKeywords.push({
              ...data.keyword,
              concepts: [data.concept],
              callouts: [{ ...data.callout, concept: data.concept }]
            });
          }
          
          // Sort A-Z
          newKeywords.sort((a, b) => a.sourceTerm.localeCompare(b.sourceTerm));
          
          return { ...prev, keywords: newKeywords };
        });
      });

      eventSource.addEventListener('complete', (e) => {
        const data = e.data ? JSON.parse(e.data) : {};
        console.log('[SSE] complete', data);
        setIsProcessing(false);
        setProgress(null);
      });

      eventSource.addEventListener('error', (e) => {
        console.error('SSE Error:', e);
      });

    } else {
      setSelectedProjectDetails(null);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [selectedProjectId]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Create a project named after the uploaded file
      const response = await axios.post('/api/projects', { name: file.name });
      setProjects([response.data, ...projects]);
      setSelectedProjectId(response.data.id);
      
      const formData = new FormData();
      formData.append('file', file);
      
      setIsProcessing(true);
      setProgress({ current: 0, total: 1 }); // Temporary until real progress comes

      // Brief pause so the SSE connection from selectedProjectId change can establish
      await new Promise(resolve => setTimeout(resolve, 500));

      await axios.post(`/api/projects/${response.data.id}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
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
      {/* Sidebar */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
        {/* Sidebar Content: Keywords */}
        <div className="flex-1 overflow-y-auto p-4">
          {isProcessing && progress && (
            <div className="mb-4 bg-blue-50 p-3 rounded-lg border border-blue-100">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center text-blue-800 text-xs font-medium">
                  <Loader2 className="animate-spin mr-1.5" size={14} />
                  Processing...
                </div>
                <div className="text-xs text-blue-600 font-medium">
                  {progress.current} / {progress.total}
                </div>
              </div>
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                  style={{ width: `${Math.max(5, (progress.current / progress.total) * 100)}%` }}
                />
              </div>
            </div>
          )}

          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
            Extracted Keywords
          </h2>

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
        </div>

        {/* User Footer */}
        <div className="p-4 border-t border-gray-200 bg-white flex justify-between items-center">
          <div className="text-sm font-medium text-gray-700">{user?.username}</div>
          <button onClick={logout} className="text-gray-500 hover:text-red-600 p-1">
            <LogOut size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        {selectedProjectId ? (
          <div className="flex-1 p-8 flex flex-col max-w-5xl mx-auto w-full overflow-y-auto">
            <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-6">
              {isProcessing && progress && !selectedProjectDetails?.keywords?.length && (
                <div className="mb-8 bg-blue-50 p-4 rounded-lg border border-blue-100">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center text-blue-800 font-medium">
                      <Loader2 className="animate-spin mr-2" size={18} />
                      Processing Document...
                    </div>
                    <div className="text-sm text-blue-600 font-medium">
                      {progress.current} / {progress.total} pages
                    </div>
                  </div>
                  <div className="w-full bg-blue-200 rounded-full h-2.5">
                    <div
                      className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(5, (progress.current / progress.total) * 100)}%` }}
                    />
                  </div>
                </div>
              )}

              {selectedKeyword ? (
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{selectedKeyword.sourceTerm}</h3>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {selectedKeyword.concepts.length} concept{selectedKeyword.concepts.length !== 1 ? 's' : ''} ·{' '}
                        {selectedKeyword.callouts?.length || 0} occurrence{(selectedKeyword.callouts?.length || 0) !== 1 ? 's' : ''}
                      </p>
                    </div>
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
                        Callouts
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
                  (selectedKeyword.callouts?.length ?? 0) > 0 ? (
                    <div className="overflow-x-auto border border-gray-200 rounded-lg">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Page</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Figure</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Callout</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Definition</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {[...(selectedKeyword.callouts ?? [])]
                            .sort((a, b) => a.pageNumber - b.pageNumber)
                            .map((callout, idx) => {
                            const concept = callout.concept ?? selectedKeyword.concepts[0];
                            return (
                              <tr key={`${selectedKeyword.id}-${idx}`} className="hover:bg-gray-50">
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{callout.pageNumber}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{callout.figureNumber || '-'}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{callout.identifier}</td>
                                <td className="px-6 py-4 text-sm text-gray-700" title={concept?.definitionText}>
                                  {concept?.definitionText || '-'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 text-center py-12 border border-dashed border-gray-200 rounded-lg">
                      No callouts extracted for this keyword yet.
                    </div>
                  )
                  ) : (
                    <div>
                      {similarityError && (
                        <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                          {similarityError}
                        </div>
                      )}

                      {!similarityResult && !isAnalyzing && (
                        <div className="text-sm text-gray-500 text-center py-12 border border-dashed border-gray-200 rounded-lg">
                          Click &quot;Analyse Similarities&quot; to map how closely each definition aligns with the centroid.
                        </div>
                      )}

                      {isAnalyzing && (
                        <div className="flex items-center justify-center py-12 text-indigo-700">
                          <Loader2 className="animate-spin mr-2" size={20} />
                          Computing embeddings and similarity scores...
                        </div>
                      )}

                      {similarityResult && !isAnalyzing && (
                        <SimilarityCluster result={similarityResult} />
                      )}
                    </div>
                  )}
                </div>
              ) : selectedProjectDetails?.keywords?.length ? (
                <div className="text-sm text-gray-500 text-center py-12">
                  Select a keyword from the sidebar to view its callouts.
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
