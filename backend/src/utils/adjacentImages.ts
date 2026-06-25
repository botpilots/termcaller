import type { ParsedPage } from '../services/pdfParser.js';

/** Build optional adjacent page images without explicit undefined values (exactOptionalPropertyTypes). */
export function buildAdjacentImages(
  prevPage: ParsedPage | null,
  nextPage: ParsedPage | null
): { prevImageBase64?: string; nextImageBase64?: string } {
  const images: { prevImageBase64?: string; nextImageBase64?: string } = {};
  if (prevPage) images.prevImageBase64 = prevPage.imageBase64;
  if (nextPage) images.nextImageBase64 = nextPage.imageBase64;
  return images;
}
