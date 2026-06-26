import { Loader2, LogOut, Tag, ShieldCheck, Play, Filter } from 'lucide-react';
import type { ReactNode } from 'react';

export type BrowseTab = 'keywords' | 'figures';

interface BrowsePanelProps {
  activeTab: BrowseTab;
  onTabChange: (tab: BrowseTab) => void;
  progressSlot?: ReactNode;
  listContent: ReactNode;
  username: string;
  onLogout: () => void;
  highlightTab?: BrowseTab | null;
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
  middle,
}: {
  title: string;
  actionLabel: string;
  actionTitle?: string;
  onAction: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  variant?: 'blue' | 'amber';
  icon?: 'extract' | 'validate';
  middle?: ReactNode;
}) {
  const colors =
    variant === 'amber'
      ? 'bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300'
      : 'bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300';

  const Icon = icon === 'validate' ? ShieldCheck : Play;

  return (
    <div className="flex items-center gap-1.5 mb-3 min-w-0">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider shrink-0">{title}</h2>
      {middle ? <div className="flex-1 flex justify-center min-w-0">{middle}</div> : <div className="flex-1" />}
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

const KEYWORD_SORT_MODES = ['frequency', 'both', 'rarity'] as const;
const KEYWORD_SORT_LABELS: Record<(typeof KEYWORD_SORT_MODES)[number], string> = {
  frequency: 'Count',
  both: 'Priority',
  rarity: 'Distinctive',
};
const KEYWORD_SORT_HINTS: Record<(typeof KEYWORD_SORT_MODES)[number], string> = {
  frequency: 'Most figures in this document',
  both: 'Frequent here, rare across manuals',
  rarity: 'Most distinctive vs. other manuals',
};

export function KeywordSortToggle({
  value,
  onChange,
}: {
  value: (typeof KEYWORD_SORT_MODES)[number];
  onChange: (mode: (typeof KEYWORD_SORT_MODES)[number]) => void;
}) {
  const cycle = () => {
    const index = KEYWORD_SORT_MODES.indexOf(value);
    onChange(KEYWORD_SORT_MODES[(index + 1) % KEYWORD_SORT_MODES.length]);
  };

  return (
    <button
      type="button"
      onClick={cycle}
      title={`${KEYWORD_SORT_HINTS[value]} — click to change`}
      className="inline-flex items-center gap-1.5 px-2 py-1 text-sm text-gray-600 border border-gray-200 bg-white rounded-md hover:bg-gray-50 transition-colors shrink-0"
    >
      <Filter size={14} className="text-gray-400" />
      {KEYWORD_SORT_LABELS[value]}
    </button>
  );
}

export function BrowsePanel({
  activeTab,
  onTabChange,
  progressSlot,
  listContent,
  username,
  onLogout,
  highlightTab,
}: BrowsePanelProps) {
  const tabs: { id: BrowseTab; label: string; icon: typeof Tag }[] = [
    { id: 'keywords', label: 'Keywords', icon: Tag },
    { id: 'figures', label: 'Validation', icon: ShieldCheck },
  ];

  return (
    <div className="flex flex-col h-full shrink-0 border-r border-gray-200 bg-gray-50">
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col w-14 shrink-0 border-r border-gray-200 bg-white relative">
          {tabs.map(({ id, label, icon: Icon }) => {
            const isHighlighted = highlightTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onTabChange(id)}
                title={label}
                className={`flex flex-col items-center justify-center gap-2 py-6 px-1 text-xs font-bold uppercase tracking-widest transition-colors border-l-4 ${
                  activeTab === id
                    ? 'border-blue-600 bg-blue-50 text-blue-800'
                    : `border-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-800 ${isHighlighted ? 'bg-white' : ''}`
                } ${
                  isHighlighted
                    ? 'relative z-[102] ring-2 ring-blue-400 ring-offset-2 animate-pulse shadow-lg'
                    : ''
                }`}
              >
                <Icon size={20} />
                <span
                  className="leading-tight"
                  style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="w-80 min-w-0 overflow-y-auto p-4">
          {progressSlot}
          {listContent}
        </div>
      </div>

      <div className="shrink-0 p-4 border-t border-gray-200 bg-white flex justify-between items-center gap-2">
        <div className="text-sm font-medium text-gray-700 truncate">{username}</div>
        <button onClick={onLogout} className="text-gray-500 hover:text-red-600 p-1 shrink-0">
          <LogOut size={18} />
        </button>
      </div>
    </div>
  );
}

export function ProgressBanner({
  current,
  total,
  compact = false,
  label = 'Processing...',
  variant = 'blue',
}: {
  current: number;
  total: number;
  compact?: boolean;
  label?: string;
  variant?: 'blue' | 'amber';
}) {
  const tone =
    variant === 'amber'
      ? {
          box: 'bg-amber-50 border-amber-100',
          text: 'text-amber-800',
          count: 'text-amber-600',
          track: 'bg-amber-200',
          bar: 'bg-amber-600',
        }
      : {
          box: 'bg-blue-50 border-blue-100',
          text: 'text-blue-800',
          count: 'text-blue-600',
          track: 'bg-blue-200',
          bar: 'bg-blue-600',
        };

  return (
    <div className={`mb-4 rounded-lg border ${tone.box} ${compact ? 'p-3' : 'p-4'}`}>
      <div className="flex justify-between items-center mb-2">
        <div className={`flex items-center font-medium ${tone.text} ${compact ? 'text-xs' : 'text-sm'}`}>
          <Loader2 className={`animate-spin mr-1.5 ${compact ? '' : 'mr-2'}`} size={compact ? 14 : 18} />
          {label}
        </div>
        <div className={`font-medium ${tone.count} ${compact ? 'text-xs' : 'text-sm'}`}>
          {current} / {total}
        </div>
      </div>
      <div className={`w-full rounded-full ${tone.track} ${compact ? 'h-2' : 'h-2.5'}`}>
        <div
          className={`rounded-full transition-all duration-500 ${tone.bar} ${compact ? 'h-2' : 'h-2.5'}`}
          style={{ width: `${total > 0 ? Math.max(5, (current / total) * 100) : 5}%` }}
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
