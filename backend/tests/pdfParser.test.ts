import { describe, it, expect } from 'vitest';
import { extractPageData } from '../src/services/pdfParser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PDF Parser Service', () => {
  const fixturePath = path.resolve(__dirname, '../../test_data/Instructionbook_10081322_BioDrill500.pdf');
  const outputDir = path.resolve(__dirname, 'output');

  it('should extract high-res image and text from a specific page', async () => {
    const pageNumber = 14; 
    
    console.log(`Extracting page ${pageNumber} from ${fixturePath}...`);
    
    const result = await extractPageData(fixturePath, pageNumber, outputDir);
    
    expect(result).toHaveProperty('pageNumber', pageNumber);
    expect(result).toHaveProperty('text');
    expect(result).toHaveProperty('imageBase64');
    
    // Assert the text is not empty
    expect(result.text.length).toBeGreaterThan(0);
    
    // Assert the image is a valid base64 string
    expect(result.imageBase64.length).toBeGreaterThan(1000); 
    
    const imageExists = fs.existsSync(path.join(outputDir, `page_${pageNumber}.png`));
    const textExists = fs.existsSync(path.join(outputDir, `page_${pageNumber}.txt`));
    
    expect(imageExists).toBe(true);
    expect(textExists).toBe(true);

    const page15 = await extractPageData(fixturePath, 15, outputDir);
    expect(result.hasIllustrations).toBe(true);
    expect(page15.hasIllustrations).toBe(false);
  }, 30000);
});
