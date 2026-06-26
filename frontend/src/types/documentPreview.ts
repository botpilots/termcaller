/** Normalized bounding box (fractions of rendered page image dimensions). */
export interface HighlightBox {
  x: number;
  y: number;
  width: number;
  height: number;
  matchType: 'term' | 'callout';
  pageNumber?: number;
}

export interface PageLocateResult {
  boxes: HighlightBox[];
  matchedPage?: number | null;
  imageWidth: number;
  imageHeight: number;
}

export function occurrenceRowKey(row: { pageNumber: number; figureNumber?: string; identifier: string }): string {
  return `${row.pageNumber}:${row.figureNumber ?? ''}:${row.identifier}`;
}

/** Expand a normalized text bbox with breathing room around the glyphs. */
export function expandHighlightBox(box: HighlightBox, padRatio = 0.4): HighlightBox {
  const padW = Math.max(box.width * padRatio, 0.008);
  const padH = Math.max(box.height * padRatio, 0.005);

  let x = box.x - padW / 2;
  let y = box.y - padH / 2;
  let width = box.width + padW;
  let height = box.height + padH;

  if (x < 0) {
    width += x;
    x = 0;
  }
  if (y < 0) {
    height += y;
    y = 0;
  }

  return {
    ...box,
    x,
    y,
    width: Math.min(width, 1 - x),
    height: Math.min(height, 1 - y),
  };
}

export type HighlightPulseMode = 'none' | 'loop' | 'once';

export interface HighlightPulseState {
  pageNumber: number;
  mode: HighlightPulseMode;
  /** Bump to re-run a one-shot pulse animation. */
  generation: number;
}
