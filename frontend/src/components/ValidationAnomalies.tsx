import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

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

interface ValidationAnomaliesProps {
  validation: FigureValidationResult | null;
  isLoading: boolean;
  error: string | null;
  pendingMessage?: string;
}

export function ValidationAnomalies({ validation, isLoading, error, pendingMessage }: ValidationAnomaliesProps) {
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

  const hasAnomalies =
    validation.unreferencedCallouts.length > 0 ||
    validation.uncalledReferences.length > 0 ||
    validation.labelMismatches.length > 0;

  if (!hasAnomalies) {
    return (
      <div className="mb-6 flex items-start gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg p-4">
        <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">No anomalies detected</p>
          <p className="text-green-700 mt-0.5">Callout labels match between text and illustration.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 border border-amber-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 bg-amber-50 border-b border-amber-200 text-amber-900 text-sm font-medium">
        <AlertTriangle size={16} />
        Validation anomalies
      </div>
      <div className="divide-y divide-amber-100 bg-white">
        {validation.unreferencedCallouts.length > 0 && (
          <AnomalySection
            title="Unreferenced callouts"
            description="Visible in the illustration but not explained in the text."
            items={validation.unreferencedCallouts.map(id => `Callout ${id}`)}
          />
        )}
        {validation.uncalledReferences.length > 0 && (
          <AnomalySection
            title="Uncalled references"
            description="Assigned in the text but missing from the illustration."
            items={validation.uncalledReferences.map(id => `Callout ${id}`)}
          />
        )}
        {validation.labelMismatches.length > 0 && (
          <AnomalySection
            title="Label mismatches"
            description="Text and image use different labels for the same part."
            items={validation.labelMismatches.map(
              m =>
                `Text ${m.textIdentifier} → image ${m.imageIdentifier}${
                  m.sourceTerm ? ` (${m.sourceTerm})` : ''
                }`
            )}
          />
        )}
      </div>
    </div>
  );
}

function AnomalySection({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: string[];
}) {
  return (
    <div className="px-4 py-3">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="text-xs text-gray-500 mt-0.5 mb-2">{description}</p>
      <ul className="flex flex-wrap gap-2">
        {items.map(item => (
          <li
            key={item}
            className="text-xs font-medium px-2 py-1 rounded-md bg-amber-100 text-amber-900 border border-amber-200"
          >
            {item}
          </li>
        ))}
      </ul>
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

/** Map validation results to per-callout anomaly labels for table rows. */
export function buildAnomalyMap(validation: FigureValidationResult | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!validation) return map;

  for (const id of validation.unreferencedCallouts) {
    map.set(id, 'Unreferenced');
  }
  for (const id of validation.uncalledReferences) {
    map.set(id, map.has(id) ? `${map.get(id)}, Uncalled ref.` : 'Uncalled ref.');
  }
  for (const m of validation.labelMismatches) {
    const label = `Label mismatch (${m.imageIdentifier} on image)`;
    map.set(m.textIdentifier, map.has(m.textIdentifier) ? `${map.get(m.textIdentifier)}, ${label}` : label);
    if (m.imageIdentifier !== m.textIdentifier) {
      map.set(m.imageIdentifier, map.has(m.imageIdentifier) ? `${map.get(m.imageIdentifier)}, ${label}` : label);
    }
  }

  return map;
}
