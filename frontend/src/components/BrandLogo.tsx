import React from 'react';
import { BrandMark } from './BrandMark';

type BrandLogoSize = 'sm' | 'md' | 'lg' | 'xl';
type BrandLogoVariant = 'light' | 'dark';

interface BrandLogoProps {
  size?: BrandLogoSize;
  variant?: BrandLogoVariant;
  showTagline?: boolean;
  className?: string;
}

const sizeConfig: Record<
  BrandLogoSize,
  { mark: number; wordmark: string; tagline: string; gap: string; wordmarkClass: string }
> = {
  sm: { mark: 24, wordmark: 'text-[1.3125rem]', tagline: 'text-xs', gap: 'gap-1', wordmarkClass: '-ml-0.5' },
  md: { mark: 36, wordmark: 'text-[1.575rem]', tagline: 'text-sm', gap: 'gap-2', wordmarkClass: '-ml-1' },
  lg: { mark: 52, wordmark: 'text-[2.3625rem]', tagline: 'text-base', gap: 'gap-3', wordmarkClass: '' },
  xl: { mark: 72, wordmark: 'text-[3.15rem] sm:text-[3.9375rem]', tagline: 'text-sm sm:text-base', gap: 'gap-4', wordmarkClass: '' },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  size = 'md',
  variant = 'dark',
  showTagline = false,
  className = '',
}) => {
  const config = sizeConfig[size];
  const isLight = variant === 'light';

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div className={`flex items-center ${config.gap}`}>
        <BrandMark
          size={config.mark}
          className={isLight ? 'text-indigo-300' : 'text-indigo-600'}
        />
        <span
          className={`${config.wordmark} ${config.wordmarkClass} font-bold tracking-tight leading-none`}
          aria-label="TermCaller"
        >
          <span className={isLight ? 'text-white' : 'text-slate-900'}>Term</span>
          <span
            className={
              isLight
                ? 'bg-gradient-to-r from-indigo-300 to-violet-300 bg-clip-text text-transparent'
                : 'bg-gradient-to-r from-indigo-600 to-violet-500 bg-clip-text text-transparent'
            }
          >
            Caller
          </span>
        </span>
      </div>
      {showTagline && (
        <p
          className={`${config.tagline} mt-4 max-w-sm text-center font-normal tracking-[0.06em] ${
            isLight ? 'text-slate-300' : 'text-slate-500'
          }`}
        >
          Terminology extracted from reality.
        </p>
      )}
    </div>
  );
};
