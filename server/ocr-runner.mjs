import fs from 'node:fs/promises';
import path from 'node:path';
import { createWorker } from 'tesseract.js';

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    process.stderr.write('Missing OCR input path.');
    process.exit(2);
  }

  const trainedDataPath = path.join(process.cwd(), 'eng.traineddata');
  const imageBuffer = await fs.readFile(inputPath);

  let worker;
  try {
    const langPath = process.cwd().replace(/\\/g, '/');
    worker = await createWorker('eng', 1, {
      langPath,
      gzip: false,
      cachePath: process.cwd(),
    });

    const result = await worker.recognize(imageBuffer);
    const text = String(result.data?.text || '').trim();
    process.stdout.write(JSON.stringify({ ok: true, text, trainedDataPath }));
  } catch (error) {
    process.stderr.write(error instanceof Error ? error.message : 'OCR child process failed.');
    process.exit(1);
  } finally {
    if (worker) {
      await worker.terminate();
    }
  }
}

void main();
