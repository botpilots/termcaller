/** Text item from pdfjs getTextContent(). */
export interface PdfTextItem {
  str?: string;
  hasEOL?: boolean;
}

/**
 * Join PDF text runs without inserting spaces mid-word.
 * pdfjs splits wrapped lines into separate items; only add a separator after hasEOL.
 */
export function joinPdfTextItems(items: PdfTextItem[], separator = ' '): string {
  let text = '';
  for (const item of items) {
    if (item.str) text += item.str;
    if (item.hasEOL) text += separator;
  }
  return text;
}
