/** Portrait page height ÷ width (A4). */
export const PAGE_ASPECT_HEIGHT_OVER_WIDTH = 297 / 210;

const DOCUMENT_PREVIEW_HEADER_PX = 40;
const SCROLL_VERTICAL_PADDING_PX = 24;
const MINIMAP_COLUMN_PX = 48;
const SIDEBAR_HORIZONTAL_PADDING_PX = 20;

/** Max sidebar width so one page at full height fits the preview scroll viewport. */
export function maxDocumentPreviewSidebarWidth(contentHeight: number): number {
  const scrollViewportHeight =
    contentHeight - DOCUMENT_PREVIEW_HEADER_PX - SCROLL_VERTICAL_PADDING_PX;

  if (scrollViewportHeight <= 0) {
    return 280;
  }

  const maxPageWidth = scrollViewportHeight / PAGE_ASPECT_HEIGHT_OVER_WIDTH;
  return Math.ceil(maxPageWidth + MINIMAP_COLUMN_PX + SIDEBAR_HORIZONTAL_PADDING_PX);
}
