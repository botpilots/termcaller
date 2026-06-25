import React from 'react';

interface BrandMarkProps {
  size?: number;
  className?: string;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 32, className = '' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 32 32"
    fill="none"
    width={size}
    height={size}
    className={className}
    aria-hidden="true"
  >
    <circle cx="16" cy="16" r="11" stroke="currentColor" strokeWidth="2" />
    <circle cx="16" cy="16" r="6.5" stroke="currentColor" strokeWidth="1.25" opacity="0.55" />
    <path
      fill="currentColor"
      fillOpacity="0.22"
      d="M16 16V5a11 11 0 0 1 9.19 4.98L16 16Z"
    />
    <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M16 16 24.5 9" />
    <circle cx="20.5" cy="11.5" r="2" fill="currentColor" opacity="0.85" />
    <circle cx="16" cy="16" r="2.25" fill="currentColor" />
  </svg>
);
