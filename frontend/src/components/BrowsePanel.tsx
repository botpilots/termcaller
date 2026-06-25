import { Loader2, LogOut, Tag, Image, Play, ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

export type BrowseTab = 'keywords' | 'figures';

interface BrowsePanelProps {
  activeTab: BrowseTab;
  onTabChange: (tab: BrowseTab) => void;
  progressSlot?: ReactNode;
  listContent: ReactNode;
  username: string;
  onLogout: () => void;
}

export function BrowseSectionHeader({
  title,
  actionLabel,
  actionTitle,
  onAction,
  isLoading,
  disabled,
  variant = 'blue',
  icon,
}: {
  title: string;
  actionLabel: string;
  actionTitle?: string;
  onAction: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: 'blue' | 'amber';
  icon?: 'extract' | 'validate';
}) {
  const colors =
    variant === 'amber'
      ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300'
      : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300';

  const Icon = icon === 'validate' ? ShieldCheck : Play;

  return (
    <div className="flex items-center justify-between gap-2 mb-3">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h2>
      <button
        type="button"
        onClick={onAction}
        disabled={disabled || isLoading}
        title={actionTitle ?? actionLabel}
        className={`flex items-center gap-1 px-2 py-1 text-white text-[11px] font-medium rounded-md shadow-sm transition-colors disabled:cursor-not-allowed shrink-0 ${colors}`}
      >
        {isLoading ? (
          <Loader2 className="animate-spin" size={12} />
        ) : (
          <Icon size={12} />
        )}
        {actionLabel}
      </button>
    </div>
  );
}

export function BrowsePanel({
  activeTab,
  onTabChange,
  progressSlot,
  listContent,
  username,
  onLogout,
}: BrowsePanelProps) {
  const tabs: { id: BrowseTab; label: string; icon: typeof Tag }[] = [
    { id: 'keywords', label: 'Keywords', icon: Tag },
    { id: 'figures', label: 'Figures', icon: Image },
  ];

  return (
    <div className="flex border-r border-gray-200 bg-gray-50 shrink-0">
      <div className="flex flex-col w-11 border-r border-gray-200 bg-white">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onTabChange(id)}
            title={label}
            className={`flex flex-col items-center justify-center gap-1 py-4 px-1 text-[10px] font-semibold uppercase tracking-wide transition-colors border-l-2 ${
              activeTab === id
                ? 'border-blue-600 bg-blue-50 text-blue-800'
                : 'border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700'
            }`}
          >
            <Icon size={16} />
            <span
              className="leading-tight"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              {label}
            </span>
          </button>
        ))}
      </div>

      <div className="w-72 flex flex-col">
        <div className="flex-1 overflow-y-auto p-4">
          {progressSlot}
          {listContent}
        </div>

        <div className="p-4 border-t border-gray-200 bg-white flex justify-between items-center">
          <div className="text-sm font-medium text-gray-700 truncate">{username}</div>
          <button onClick={onLogout} className="text-gray-500 hover:text-red-600 p-1 shrink-0">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function ProgressBanner({
  current,
  total,
  compact = false,
  label = 'Processing...',
}: {
  current: number;
  total: number;
  compact?: boolean;
  label?: string;
}) {
  return (
    <div className={`mb-4 bg-blue-50 rounded-lg border border-blue-100 ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex justify-between items-center mb-2">
        <div className={`flex items-center text-blue-800 font-medium ${compact ? 'text-xs' : 'text-sm'}`}>
          <Loader2 className={`animate-spin mr-1.5 ${compact ? '' : 'mr-2'}`} size={compact ? 14 : 18} />
          {label}
        </div>
        <div className={`text-blue-600 font-medium ${compact ? 'text-xs' : 'text-sm'}`}>
          {current} / {total}
        </div>
      </div>
      <div className={`w-full bg-blue-200 rounded-full ${compact ? 'h-2' : 'h-2.5'}`}>
        <div
          className={`bg-blue-600 rounded-full transition-all duration-500 ${compact ? 'h-2' : 'h-2.5'}`}
          style={{ width: `${Math.max(5, (current / total) * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function IndeterminateProgressBanner({
  compact = false,
  label,
  variant = 'blue',
}: {
  compact?: boolean;
  label: string;
  variant?: 'blue' | 'amber';
}) {
  const tone =
    variant === 'amber'
      ? 'bg-amber-50 border-amber-100 text-amber-800'
      : 'bg-blue-50 border-blue-100 text-blue-800';

  return (
    <div className={`mb-4 rounded-lg border ${tone} ${compact ? 'p-3' : 'p-4'}`}>
      <div className={`flex items-center font-medium ${compact ? 'text-xs' : 'text-sm'}`}>
        <Loader2 className={`animate-spin mr-1.5 ${compact ? '' : 'mr-2'}`} size={compact ? 14 : 18} />
        {label}
      </div>
    </div>
  );
}
