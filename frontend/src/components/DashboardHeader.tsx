import React from 'react';
import { Plus, Download } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

interface Project {
  id: string;
  name: string;
}

interface DashboardHeaderProps {
  projects: Project[];
  selectedProjectId: string | null;
  onProjectChange: (projectId: string) => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onExportTbx: () => void;
  isProcessing: boolean;
  isExporting: boolean;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  projects,
  selectedProjectId,
  onProjectChange,
  onFileUpload,
  onExportTbx,
  isProcessing,
  isExporting,
}) => {
  return (
    <header className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <BrandLogo size="sm" variant="dark" className="shrink-0 items-start!" />

          <select
            className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-md focus:ring-blue-500 focus:border-blue-500 p-2 min-w-[12rem] max-w-xs"
            value={selectedProjectId || ''}
            onChange={(e) => onProjectChange(e.target.value)}
          >
            <option value="" disabled>
              Select a project
            </option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          {!isProcessing && (
            <label className="flex items-center px-4 py-2 bg-blue-50 text-blue-700 text-sm font-medium rounded-lg hover:bg-blue-100 transition-colors cursor-pointer border border-blue-200 shrink-0">
              <Plus className="mr-2" size={18} />
              Upload PDF
              <input type="file" accept=".pdf" className="hidden" onChange={onFileUpload} />
            </label>
          )}
        </div>

        <button
          type="button"
          disabled={!selectedProjectId || isExporting}
          title={
            !selectedProjectId
              ? 'Select a project to export'
              : isExporting
                ? 'Exporting TBX…'
                : 'Download glossary as TBX-Basic'
          }
          onClick={onExportTbx}
          className={`flex items-center px-4 py-2 text-sm font-medium rounded-lg shrink-0 border ${
            !selectedProjectId || isExporting
              ? 'bg-white text-gray-400 border-gray-200 cursor-not-allowed'
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
        >
          <Download className="mr-2" size={18} />
          {isExporting ? 'Exporting…' : 'Export TBX'}
        </button>
      </div>
    </header>
  );
};
