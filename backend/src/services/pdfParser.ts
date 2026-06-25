import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import gm from 'gm';
import { PDF_RENDER_DENSITY } from '../constants/pdfProcessing.js';

// Ensure the worker is configured (required for pdfjs-dist in Node)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';

export interface ParsedPage {
  pageNumber: number;
  text: string;
  imageBase64: string;
  hasIllustrations: boolean;
}

type PdfDocument = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

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

  private constructor(pdfPath: string, pdfDocument: PdfDocument) {
    this.pdfPath = pdfPath;
    this.pdfDocument = pdfDocument;
    this.totalPages = pdfDocument.numPages;
  }

  static async open(pdfPath: string): Promise<PdfSession> {
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const pdfDocument = await pdfjsLib.getDocument({ data }).promise;
    return new PdfSession(pdfPath, pdfDocument);
  }

  async close(): Promise<void> {
    await this.pdfDocument.destroy();
  }

  async extractPageData(pageNumber: number, outputDir?: string): Promise<ParsedPage> {
    if (pageNumber < 1 || pageNumber > this.totalPages) {
      throw new Error(`Invalid page number ${pageNumber}. Document has ${this.totalPages} pages.`);
    }

    const page = await this.pdfDocument.getPage(pageNumber);

    const opList = await page.getOperatorList();
    const opCounts: Record<number, number> = {};
    for (const fn of opList.fnArray) {
      opCounts[fn] = (opCounts[fn] || 0) + 1;
    }

    const hasIllustrations = pageHasIllustrations(opCounts);

    const textContent = await page.getTextContent();
    const textItems = textContent.items.map((item: { str: string }) => item.str);
    const text = textItems.join(' ');

    const imageMagick = gm.subClass({ imageMagick: true });

    return new Promise((resolve, reject) => {
      imageMagick(`${this.pdfPath}[${pageNumber - 1}]`)
        .density(PDF_RENDER_DENSITY, PDF_RENDER_DENSITY)
        .background('white')
        .flatten()
        .toBuffer('PNG', (err: Error | null, buffer: Buffer) => {
          if (err) {
            return reject(err);
          }

          const base64Data = buffer.toString('base64');

          if (outputDir) {
            if (!fs.existsSync(outputDir)) {
              fs.mkdirSync(outputDir, { recursive: true });
            }

            const imagePath = path.join(outputDir, `page_${pageNumber}.png`);
            fs.writeFileSync(imagePath, buffer);

            const textPath = path.join(outputDir, `page_${pageNumber}.txt`);
            fs.writeFileSync(textPath, text);
          }

          resolve({
            pageNumber,
            text,
            imageBase64: base64Data,
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
