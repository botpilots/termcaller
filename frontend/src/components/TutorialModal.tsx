import React from 'react';
import { X, ChevronRight, Check } from 'lucide-react';

interface TutorialModalProps {
  step: 'extraction' | 'validation';
  setStep: (step: 'extraction' | 'validation') => void;
  onClose: () => void;
}

export function TutorialModal({ step, setStep, onClose }: TutorialModalProps) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal Content */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden z-[101] flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">
            {step === 'extraction' ? 'Extraction & Keywords' : 'Validation & Integrity'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-md hover:bg-gray-100"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {step === 'extraction' ? (
            <div className="space-y-4 text-gray-700 text-sm leading-relaxed">
              <p className="font-medium text-gray-900 text-base">
                Terminology is inherently poor in meaning on its own. A quality translation process needs to acquire metadata in the form of definitions for all its terminology.
              </p>
              <p>
                It's not so easy, however, to sift out the right type of terminology. Often you end up with more terms than was wished, making it hard to know if the terminology actually works in practice. TermCaller's extraction solves this in several layers:
              </p>
              <ol className="list-decimal list-inside space-y-3 pl-2">
                <li>
                  <strong className="text-gray-900 font-semibold">Visual Context & Callouts:</strong> It focuses on visual context and callouts and their references in the text. These are goldmines for relevant termbases as they often are about interaction or service with the product.
                </li>
                <li>
                  <strong className="text-gray-900 font-semibold">LLM Understanding:</strong> Via the visual context, the AI gets a good understanding of what a certain term is about. It is asked to denote this in a definition.
                </li>
                <li>
                  <strong className="text-gray-900 font-semibold">Semantic Similarity:</strong> If a term occurs in multiple places, multiple definitions may arise. TermCaller checks semantic similarity between these to ensure that the keywords refer to the same concept. Outliers are detected and flagged to be reviewed, to potentially use another keyword.
                </li>
                <li>
                  <strong className="text-gray-900 font-semibold">Domain Corpus Scoring:</strong> The keyword list uses a TF-IDF approach to prioritize relevant terms from a 500k word ranking, created directly from different types of technical documentation. This makes the software especially good for term generation in this domain.
                </li>
                <li>
                  <strong className="text-gray-900 font-semibold">Curation:</strong> Any term can be excluded from the export or its definition modified.
                </li>
                <li>
                  <strong className="text-gray-900 font-semibold">Export:</strong> The result can be exported into a compliant TBX-Basic file, ready to enrich any TMS termbase with new concepts and definitions.
                </li>
              </ol>
            </div>
          ) : (
            <div className="space-y-4 text-gray-700 text-sm leading-relaxed">
              <p className="font-medium text-gray-900 text-base">
                Often there's a mismatch between callouts and what the text refers to.
              </p>
              <p>
                TermCaller detects three types of anomalies:
              </p>
              <ul className="list-disc list-inside space-y-2 pl-2 mb-4">
                <li><strong className="text-gray-900 font-semibold">Misplaced Callouts:</strong> A callout number appears in the text but is missing from the illustration.</li>
                <li><strong className="text-gray-900 font-semibold">Missing Callouts:</strong> A callout exists in the illustration but is never referenced in the text.</li>
                <li><strong className="text-gray-900 font-semibold">Semantic Outliers:</strong> The visual object doesn't match the expected meaning of the term used in the text.</li>
              </ul>
              <p>
                As TermCaller connects text and illustration natively, it also features a callout integrity tool for figures in any technical document. This makes it possible to effectively validate that figures and callout references in the text are aligned in the document.
              </p>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
                <p className="text-amber-800 font-medium">
                  To start, click <strong>Validate</strong> in the validation tab. You will soon get a summary of all the errors.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between items-center">
          <div className="flex gap-2">
            <div className={`w-2 h-2 rounded-full ${step === 'extraction' ? 'bg-blue-600' : 'bg-gray-300'}`} />
            <div className={`w-2 h-2 rounded-full ${step === 'validation' ? 'bg-blue-600' : 'bg-gray-300'}`} />
          </div>
          
          {step === 'extraction' ? (
            <button
              onClick={() => setStep('validation')}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Next: Validation
              <ChevronRight size={16} />
            </button>
          ) : (
            <button
              onClick={onClose}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              Got it
              <Check size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
