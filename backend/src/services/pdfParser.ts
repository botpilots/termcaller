import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
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
  hasIllustrations: boolean;
}

type PdfLoadingTask = ReturnType<typeof loadPdfDocument>;

function jpegPaintOpCount(opCounts: Record<number, number>): number {
  const jpegOp = (pdfjsLib.OPS as Record<string, number>)['paintJpegXObject'];
  return jpegOp !== undefined ? (opCounts[jpegOp] || 0) : 0;
}

function pageHasIllustrations(opCounts: Record<number, number>): boolean {
  const paintImage = opCounts[pdfjsLib.OPS.paintImageXObject] || 0;
  const paintJpeg = jpegPaintOpCount(opCounts);
  if (paintImage > 0 || paintJpeg > 0) {
    return true;
  }

  const constructPath = opCounts[pdfjsLib.OPS.constructPath] || 0;
  const setStrokeRGBColor = opCounts[pdfjsLib.OPS.setStrokeRGBColor] || 0;

  // Technical illustrations use many stroked vector paths with distinct stroke colors.
  // Section divider pages in this manual top out around ~115 paths / ~56 stroke colors.
  return constructPath >= 100 && setStrokeRGBColor >= 100;
}

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

    const { hasIllustrations, text } = await this.pdfjsMutex.run(async () => {
      const page = await this.pdfDocument.getPage(pageNumber);

      const opList = await page.getOperatorList();
      const opCounts: Record<number, number> = {};
      for (const fn of opList.fnArray) {
        opCounts[fn] = (opCounts[fn] || 0) + 1;
      }

      const textContent = await page.getTextContent();
      return {
        hasIllustrations: pageHasIllustrations(opCounts),
        text: joinPdfTextItems(textContent.items),
      };
    });

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

          const base64Data = buffer.toString('base64');
          const imageExt = PDF_RENDER_FORMAT.toLowerCase();

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
            imageBase64: base64Data,
            imageMimeType: PDF_IMAGE_MIME_TYPE,
            hasIllustrations,
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
