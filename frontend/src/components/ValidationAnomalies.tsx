import { Loader2 } from 'lucide-react';

export interface LabelMismatch {
  textIdentifier: string;
  imageIdentifier: string;
  sourceTerm: string;
}

export interface FigureValidationResult {
  unreferencedCallouts: string[];
  uncalledReferences: string[];
  labelMismatches: LabelMismatch[];
}

export type ValidationWarningKind = 'unreferenced' | 'uncalled' | 'labelMismatch';

export interface ValidationWarningItem {
  kind: ValidationWarningKind;
  calloutId: string;
  pageNumber: number;
  figureNumber: string;
  sourceTerm?: string;
  imageIdentifier?: string;
  title: string;
  description: string;
}

const WARNING_KIND_LABELS: Record<ValidationWarningKind, string> = {
  unreferenced: 'Unreferenced callout',
  uncalled: 'Uncalled reference',
  labelMismatch: 'Label mismatch',
};

const WARNING_KIND_DESCRIPTIONS: Record<ValidationWarningKind, string> = {
  unreferenced: 'Visible in the illustration but not explained in the page text.',
  uncalled: 'Assigned in the text but missing from the illustration.',
  labelMismatch: 'Text and image use different labels for the same part.',
};

export function buildValidationWarnings(
  validation: FigureValidationResult,
  pageNumber: number,
  figureNumber: string
): ValidationWarningItem[] {
  const warnings: ValidationWarningItem[] = [];

  for (const calloutId of validation.unreferencedCallouts) {
    warnings.push({
      kind: 'unreferenced',
      calloutId,
      pageNumber,
      figureNumber,
      title: `Callout ${calloutId}`,
      description: WARNING_KIND_DESCRIPTIONS.unreferenced,
    });
  }

  for (const calloutId of validation.uncalledReferences) {
    warnings.push({
      kind: 'uncalled',
      calloutId,
      pageNumber,
      figureNumber,
      title: `Callout ${calloutId}`,
      description: WARNING_KIND_DESCRIPTIONS.uncalled,
    });
  }

  for (const mismatch of validation.labelMismatches) {
    warnings.push({
      kind: 'labelMismatch',
      calloutId: mismatch.textIdentifier,
      pageNumber,
      figureNumber,
      sourceTerm: mismatch.sourceTerm || undefined,
      imageIdentifier: mismatch.imageIdentifier,
      title: `Text ${mismatch.textIdentifier} → image ${mismatch.imageIdentifier}${
        mismatch.sourceTerm ? ` (${mismatch.sourceTerm})` : ''
      }`,
      description: WARNING_KIND_DESCRIPTIONS.labelMismatch,
    });
  }

  return warnings;
}

interface ValidationAnomaliesProps {
  validation: FigureValidationResult | null;
  pageNumber: number;
  figureNumber: string;
  isLoading: boolean;
  error: string | null;
  pendingMessage?: string;
  onWarningClick?: (warning: ValidationWarningItem) => void;
}

export function ValidationAnomalies({
  validation,
  pageNumber,
  figureNumber,
  isLoading,
  error,
  pendingMessage,
  onWarningClick,
}: ValidationAnomaliesProps) {
  if (isLoading) {
    return (
      <div className="mb-6 text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center">
        <Loader2 className="animate-spin mr-2 shrink-0" size={16} />
        Validating referential integrity for all figures…
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-4">
        {error}
      </div>
    );
  }

  if (!validation) {
    if (pendingMessage) {
      return (
        <div className="mb-6 text-sm text-gray-500 bg-gray-50 border border-dashed border-gray-200 rounded-lg p-4">
          {pendingMessage}
        </div>
      );
    }
    return null;
  }

  const warnings = buildValidationWarnings(validation, pageNumber, figureNumber);

  if (warnings.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 space-y-3">
      {warnings.map(warning => {
        const card = (
          <>
            <span className="block text-xs font-semibold text-amber-800 uppercase tracking-wider">
              Referential integrity warning
            </span>
            <p className="text-sm font-medium text-gray-900">
              {warning.title} · {WARNING_KIND_LABELS[warning.kind]}
            </p>
            <p className="text-sm text-amber-900/80 leading-relaxed">{warning.description}</p>
          </>
        );

        if (!onWarningClick) {
          return (
            <div
              key={`${warning.kind}:${warning.calloutId}`}
              className="rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-2"
            >
              {card}
            </div>
          );
        }

        return (
          <button
            key={`${warning.kind}:${warning.calloutId}`}
            type="button"
            onClick={() => onWarningClick(warning)}
            className="w-full text-left rounded-lg border border-amber-200 bg-amber-50/40 p-4 space-y-2 hover:border-amber-300 transition-colors"
          >
            {card}
          </button>
        );
      })}
    </div>
  );
}

export function figureHasAnomalies(validation: FigureValidationResult): boolean {
  return (
    validation.unreferencedCallouts.length > 0 ||
    validation.uncalledReferences.length > 0 ||
    validation.labelMismatches.length > 0
  );
}
