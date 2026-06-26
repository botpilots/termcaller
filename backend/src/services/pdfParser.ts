import fs from 'fs';
import path from 'path';
import gm from 'gm';
import { PDF_RENDER_DENSITY, PDF_RENDER_FORMAT, PDF_IMAGE_MIME_TYPE } from '../constants/pdfProcessing.js';
import { loadPdfDocument, type PdfDocument } from '../utils/pdfjsLoad.js';
import { joinPdfTextItems } from '../utils/joinPdfTextItems.js';
import { AsyncMutex } from '../utils/asyncMutex.js';

export interface ParsedPage {
  pageNumber: number;
  text: string;
  imageBase64: string;
  imageMimeType: string;
}

type PdfLoadingTask = ReturnType<typeof loadPdfDocument>;

/** Cached PDF handle — parse once, extract many pages. */
export class PdfSession {
  readonly pdfPath: string;
  readonly totalPages: number;
  private readonly pdfDocument: PdfDocument;
  private readonly loadingTask: PdfLoadingTask;
  /** pdf.js worker transport is not safe for concurrent page reads on one document. */
  private readonly pdfjsMutex = new AsyncMutex();

  private constructor(pdfPath: string, pdfDocument: PdfDocument, loadingTask: PdfLoadingTask) {
    this.pdfPath = pdfPath;
    this.pdfDocument = pdfDocument;
    this.loadingTask = loadingTask;
    this.totalPages = pdfDocument.numPages;
  }

  static async open(pdfPath: string): Promise<PdfSession> {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = loadPdfDocument(data);
    const pdfDocument = await loadingTask.promise;
    return new PdfSession(pdfPath, pdfDocument, loadingTask);
  }

  async close(): Promise<void> {
    await this.loadingTask.destroy();
  }

  async extractPageData(pageNumber: number, outputDir?: string): Promise<ParsedPage> {
    if (pageNumber < 1 || pageNumber > this.totalPages) {
      throw new Error(`Invalid page number ${pageNumber}. Document has ${this.totalPages} pages.`);
    }

    const text = await this.pdfjsMutex.run(async () => {
      const page = await this.pdfDocument.getPage(pageNumber);
      const textContent = await page.getTextContent();
      return joinPdfTextItems(textContent.items);
    });

    const imageExt = PDF_RENDER_FORMAT.toLowerCase();
    
    // If outputDir is provided and the image already exists, use it!
    if (outputDir) {
      const imagePath = path.join(outputDir, `page_${pageNumber}.${imageExt}`);
      if (fs.existsSync(imagePath)) {
        const buffer = fs.readFileSync(imagePath);
        return {
          pageNumber,
          text,
          imageBase64: buffer.toString('base64'),
          imageMimeType: PDF_IMAGE_MIME_TYPE,
        };
      }
    }

    const imageMagick = gm.subClass({ imageMagick: true });

    return new Promise((resolve, reject) => {
      let pipeline = imageMagick(`${this.pdfPath}[${pageNumber - 1}]`)
        .density(PDF_RENDER_DENSITY, PDF_RENDER_DENSITY)
        .background('white')
        .flatten();

      if (PDF_RENDER_FORMAT === 'WEBP') {
        pipeline = pipeline.define('webp:lossless=true');
      }

      pipeline.toBuffer(PDF_RENDER_FORMAT, (err: Error | null, buffer: Buffer) => {
          if (err) {
            return reject(err);
          }

          if (outputDir) {
            if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir, { recursive: true });
            }
            const imagePath = path.join(outputDir, `page_${pageNumber}.${imageExt}`);
            fs.writeFileSync(imagePath, buffer);
            const textPath = path.join(outputDir, `page_${pageNumber}.txt`);
            fs.writeFileSync(textPath, text);
          }

          resolve({
            pageNumber,
            text,
            imageBase64: buffer.toString('base64'),
            imageMimeType: PDF_IMAGE_MIME_TYPE,
          });
        });
    });
  }
}

/** Convenience: open session, extract one page, close. Prefer PdfSession for multi-page work. */
export async function extractPageData(
  pdfPath: string,
  pageNumber: number,
  outputDir?: string
): Promise<ParsedPage> {
  const session = await PdfSession.open(pdfPath);
  try {
    return await session.extractPageData(pageNumber, outputDir);
  } finally {
    await session.close();
  }
}
