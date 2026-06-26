import {
  COHESION_DESCRIPTIONS,
  type CohesionRating,
  cohesionToneClass,
} from '../utils/conceptCohesion';

interface CohesionBadgeProps {
  rating: CohesionRating;
  compact?: boolean;
  className?: string;
}

export function CohesionBadge({ rating, compact = false, className = '' }: CohesionBadgeProps) {
  return (
    <span
      title={COHESION_DESCRIPTIONS[rating]}
      className={`font-medium uppercase tracking-wide ${cohesionToneClass(rating)} ${
        compact ? 'text-[9px] leading-none' : 'text-xs'
      } ${className}`}
    >
      {rating}
    </span>
  );
}
