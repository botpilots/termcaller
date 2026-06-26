/** Concurrent workers for full-document PDF page scans (Extract + Validate). */
export const PDF_PAGE_CONCURRENCY = 6;

/** DPI used when rendering PDF pages for Gemini vision input. */
export const PDF_RENDER_DENSITY = 300;

/** Lossless WebP — smaller payloads than PNG at the same DPI. */
export const PDF_RENDER_FORMAT = 'WEBP' as const;

export const PDF_IMAGE_MIME_TYPE = 'image/webp';
