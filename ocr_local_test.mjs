import fs from 'node:fs/promises';
import sharp from 'sharp';
import path from 'node:path';
import { createWorker } from 'tesseract.js';

const svg = "<svg width='700' height='220' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' fill='white'/><text x='20' y='120' font-size='60' fill='black'>LOCAL OCR 456</text></svg>";
const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
await fs.writeFile('ocr_local_test.png', pngBuffer);

const langPath = process.cwd().replace(/\\/g, '/');
const worker = await createWorker('eng', 1, {
  langPath,
  gzip: false,
});
const result = await worker.recognize(pngBuffer);
console.log('OCR_TEXT', String(result.data?.text || '').slice(0, 120));
await worker.terminate();
