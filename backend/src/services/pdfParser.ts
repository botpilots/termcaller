import fs from 'fs';
import path from 'path';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import gm from 'gm';

// Ensure the worker is configured (required for pdfjs-dist in Node)
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';

export interface ParsedPage {
  pageNumber: number;
  text: string;
  imageBase64: string;
  hasIllustrations: boolean;
}

export async function extractPageData(
  pdfPath: string,
  pageNumber: number,
  outputDir?: string
): Promise<ParsedPage> {
  const data = new Uint8Array(fs.readFileSync(pdfPath));
  
  // Load the PDF document
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdfDocument = await loadingTask.promise;
  
  if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
    throw new Error(`Invalid page number ${pageNumber}. Document has ${pdfDocument.numPages} pages.`);
  }

  const page = await pdfDocument.getPage(pageNumber);

  // 0. Detect if page has illustrations (raster images or complex vector graphics)
  const opList = await page.getOperatorList();
  const opCounts: Record<number, number> = {};
  for (const fn of opList.fnArray) {
    opCounts[fn] = (opCounts[fn] || 0) + 1;
  }
  
  const paintImage = opCounts[pdfjsLib.OPS.paintImageXObject] || 0;
  const paintJpeg = opCounts[pdfjsLib.OPS.paintJpegXObject] || 0;
  const constructPath = opCounts[pdfjsLib.OPS.constructPath] || 0;
  
  // Heuristic: if it has raster images, or more than 200 vector paths, it likely has illustrations
  const hasIllustrations = paintImage > 0 || paintJpeg > 0 || constructPath > 200;

  // 1. Extract Text using pdfjs-dist
  const textContent = await page.getTextContent();
  const textItems = textContent.items.map((item: any) => item.str);
  const text = textItems.join(' ');

  // 2. Extract Image using GraphicsMagick (via gm)
  // This uses the system's ImageMagick/GraphicsMagick to render the PDF page
  // It handles all the complex PDF vector/font rendering natively
  
  // Note: gm uses 0-based indexing for pages, so pageNumber - 1
  const imageMagick = gm.subClass({ imageMagick: true }); // Use ImageMagick
  
  return new Promise((resolve, reject) => {
    // Render at 300 DPI, flatten against white background
    imageMagick(`${pdfPath}[${pageNumber - 1}]`)
      .density(300, 300)
      .background('white')
      .flatten()
      .toBuffer('PNG', (err, buffer) => {
        if (err) {
          return reject(err);
        }
        
        const base64Data = buffer.toString('base64');
        
        if (outputDir) {
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          // Save image
          const imagePath = path.join(outputDir, `page_${pageNumber}.png`);
          fs.writeFileSync(imagePath, buffer);
          
          // Save text
          const textPath = path.join(outputDir, `page_${pageNumber}.txt`);
          fs.writeFileSync(textPath, text);
        }
        
        resolve({
          pageNumber,
          text,
          imageBase64: base64Data,
          hasIllustrations
        });
      });
  });
}
