import express from 'express';
import multer from 'multer';
import sharp from 'sharp';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import JSZip from 'jszip';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { PDFDocument } from 'pdf-lib';
import path from 'node:path';
import fs from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024,
  },
});

app.use(express.json({ limit: '1mb' }));
app.use(cors());
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use(compression());
app.use(
  '/api',
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

function getExt(fileName) {
  return path.extname(fileName || '').replace('.', '').toLowerCase();
}

function buildDownloadName(original, targetFormat) {
  const base = path.basename(original, path.extname(original));
  return `${base}.${targetFormat}`;
}

function normalizeWebsiteUrl(input) {
  const trimmed = String(input || '').trim();
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function validWebsiteUrl(input) {
  try {
    const url = new URL(input);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

const conversionMap = {
  png: ['jpg', 'jpeg', 'webp', 'avif', 'tiff'],
  jpg: ['png', 'webp', 'avif', 'tiff'],
  jpeg: ['png', 'webp', 'avif', 'tiff'],
  webp: ['png', 'jpg', 'avif', 'tiff'],
  avif: ['png', 'jpg', 'webp', 'tiff'],
  tiff: ['png', 'jpg', 'webp', 'avif'],
  gif: ['png', 'jpg', 'webp'],
  csv: ['xlsx', 'json', 'txt'],
  xlsx: ['csv', 'json', 'txt'],
  txt: ['md', 'json'],
  md: ['txt', 'html'],
  html: ['txt'],
  docx: ['txt', 'html'],
  pdf: ['txt'],
  json: ['csv', 'txt'],
};

function supportedTargets(sourceExt) {
  return conversionMap[sourceExt] || [];
}

function isImageExt(ext) {
  return ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff', 'gif'].includes(ext);
}

function isTextLikeExt(ext) {
  return ['txt', 'md', 'csv', 'json', 'html'].includes(ext);
}

function isPdfExt(ext) {
  return ext === 'pdf';
}

function parseImageQuality(raw) {
  const quality = Number(raw);
  if (!Number.isFinite(quality)) {
    return 90;
  }
  return Math.min(100, Math.max(20, Math.round(quality)));
}

async function extractPdfPages(buffer, maxPages = 8) {
  const pages = [];
  const parsed = await pdfParse(buffer, {
    pagerender: async (pageData) => {
      const textContent = await pageData.getTextContent();
      const pageText = textContent.items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      pages.push(pageText);
      return pageText;
    },
  });

  return {
    totalPages: parsed.numpages || pages.length,
    pages: pages.slice(0, maxPages),
    fullText: parsed.text || '',
  };
}

async function renderPdfPagesToPngBuffers(buffer, maxPages = 6, scale = 2) {
  const [{ getDocument }, { createCanvas }] = await Promise.all([
    import('pdfjs-dist/legacy/build/pdf.mjs'),
    import('@napi-rs/canvas'),
  ]);

  const pdf = await getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: true,
  }).promise;

  const pagesToProcess = Math.min(pdf.numPages, Math.max(1, maxPages));
  const images = [];

  for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    const context = canvas.getContext('2d');

    await page.render({
      canvasContext: context,
      viewport,
    }).promise;

    images.push(Buffer.from(canvas.toBuffer('image/png')));
  }

  return {
    totalPages: pdf.numPages,
    renderedPages: pagesToProcess,
    images,
  };
}

async function runLocalOcrBatch(buffers) {
  const trainedDataPath = path.join(process.cwd(), 'eng.traineddata');
  if (!fs.existsSync(trainedDataPath)) {
    throw new Error('Local OCR model not found. Please ensure eng.traineddata exists at project root.');
  }

  const inputBuffers = Array.isArray(buffers) ? buffers : [buffers];
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'ocr-batch-'));
  try {
    const extracted = [];
    for (let index = 0; index < inputBuffers.length; index += 1) {
      const filePath = path.join(tempDir, `ocr-input-${index + 1}.png`);
      await writeFile(filePath, inputBuffers[index]);

      const { stdout, stderr } = await execFileAsync('node', [
        path.join(process.cwd(), 'server', 'ocr-runner.mjs'),
        filePath,
      ]);

      if (stderr && stderr.trim().length > 0) {
        throw new Error(stderr.trim());
      }

      const parsed = JSON.parse(String(stdout || '{}'));
      extracted.push(String(parsed.text || '').trim());
    }

    return extracted;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function convertBuffer(file, targetFormat, options = {}) {
  const sourceExt = getExt(file.originalname);
  const allowed = supportedTargets(sourceExt);
  const imageQuality = parseImageQuality(options.imageQuality);

  if (!allowed.includes(targetFormat)) {
    throw new Error(`Unsupported conversion: ${sourceExt} to ${targetFormat}`);
  }

  if (isImageExt(sourceExt)) {
    let pipeline = sharp(file.buffer);
    if (targetFormat === 'png') {
      pipeline = pipeline.png({ compressionLevel: 9 });
    }
    if (targetFormat === 'jpg' || targetFormat === 'jpeg') {
      pipeline = pipeline.jpeg({ quality: imageQuality });
    }
    if (targetFormat === 'webp') {
      pipeline = pipeline.webp({ quality: imageQuality });
    }
    if (targetFormat === 'avif') {
      pipeline = pipeline.avif({ quality: Math.min(80, Math.max(30, Math.round(imageQuality * 0.62))) });
    }
    if (targetFormat === 'tiff') {
      pipeline = pipeline.tiff({ quality: imageQuality });
    }

    return {
      buffer: await pipeline.toBuffer(),
      contentType:
        targetFormat === 'png'
          ? 'image/png'
          : targetFormat === 'webp'
            ? 'image/webp'
            : targetFormat === 'avif'
              ? 'image/avif'
              : targetFormat === 'tiff'
                ? 'image/tiff'
                : 'image/jpeg',
    };
  }

  if (sourceExt === 'csv' && targetFormat === 'xlsx') {
    const workbook = XLSX.read(file.buffer.toString('utf8'), { type: 'string' });
    return {
      buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  if (sourceExt === 'csv' && targetFormat === 'json') {
    const workbook = XLSX.read(file.buffer.toString('utf8'), { type: 'string' });
    const firstSheet = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' });
    return {
      buffer: Buffer.from(JSON.stringify(rows, null, 2), 'utf8'),
      contentType: 'application/json',
    };
  }

  if (sourceExt === 'csv' && targetFormat === 'txt') {
    return {
      buffer: file.buffer,
      contentType: 'text/plain; charset=utf-8',
    };
  }

  if (sourceExt === 'xlsx' && targetFormat === 'csv') {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet]);
    return {
      buffer: Buffer.from(csv, 'utf8'),
      contentType: 'text/csv; charset=utf-8',
    };
  }

  if (sourceExt === 'xlsx' && targetFormat === 'json') {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: '' });
    return {
      buffer: Buffer.from(JSON.stringify(rows, null, 2), 'utf8'),
      contentType: 'application/json',
    };
  }

  if (sourceExt === 'xlsx' && targetFormat === 'txt') {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[firstSheet]);
    return {
      buffer: Buffer.from(csv, 'utf8'),
      contentType: 'text/plain; charset=utf-8',
    };
  }

  if (sourceExt === 'txt' && targetFormat === 'md') {
    return {
      buffer: file.buffer,
      contentType: 'text/markdown; charset=utf-8',
    };
  }

  if (sourceExt === 'txt' && targetFormat === 'json') {
    const lines = file.buffer
      .toString('utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line, index) => ({ line: index + 1, text: line }));

    return {
      buffer: Buffer.from(JSON.stringify(lines, null, 2), 'utf8'),
      contentType: 'application/json',
    };
  }

  if (sourceExt === 'md' && targetFormat === 'txt') {
    return {
      buffer: file.buffer,
      contentType: 'text/plain; charset=utf-8',
    };
  }

  if (sourceExt === 'md' && targetFormat === 'html') {
    const escaped = file.buffer
      .toString('utf8')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const html = `<!doctype html><html><body><pre>${escaped}</pre></body></html>`;
    return {
      buffer: Buffer.from(html, 'utf8'),
      contentType: 'text/html; charset=utf-8',
    };
  }

  if (sourceExt === 'html' && targetFormat === 'txt') {
    const text = file.buffer
      .toString('utf8')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      buffer: Buffer.from(text, 'utf8'),
      contentType: 'text/plain; charset=utf-8',
    };
  }

  if (sourceExt === 'docx' && targetFormat === 'txt') {
    const extracted = await mammoth.extractRawText({ buffer: file.buffer });
    return {
      buffer: Buffer.from(extracted.value || '', 'utf8'),
      contentType: 'text/plain; charset=utf-8',
    };
  }

  if (sourceExt === 'docx' && targetFormat === 'html') {
    const converted = await mammoth.convertToHtml({ buffer: file.buffer });
    return {
      buffer: Buffer.from(converted.value || '', 'utf8'),
      contentType: 'text/html; charset=utf-8',
    };
  }

  if (sourceExt === 'pdf' && targetFormat === 'txt') {
    const parsed = await pdfParse(file.buffer);
    return {
      buffer: Buffer.from(parsed.text || '', 'utf8'),
      contentType: 'text/plain; charset=utf-8',
    };
  }

  if (sourceExt === 'json' && targetFormat === 'csv') {
    const jsonData = JSON.parse(file.buffer.toString('utf8'));
    const rows = Array.isArray(jsonData) ? jsonData : [jsonData];
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(worksheet);
    return {
      buffer: Buffer.from(csv, 'utf8'),
      contentType: 'text/csv; charset=utf-8',
    };
  }

  if (sourceExt === 'json' && targetFormat === 'txt') {
    try {
      const jsonData = JSON.parse(file.buffer.toString('utf8'));
      let textContent = '';

      if (Array.isArray(jsonData)) {
        // If array of objects with 'text' field, extract text values
        textContent = jsonData
          .map((item) => (typeof item === 'object' && item.text ? item.text : JSON.stringify(item)))
          .join('\n');
      } else if (typeof jsonData === 'object' && jsonData.text) {
        // If single object with 'text' field, extract text
        textContent = jsonData.text;
      } else {
        // Otherwise pretty-print the JSON
        textContent = JSON.stringify(jsonData, null, 2);
      }

      return {
        buffer: Buffer.from(textContent, 'utf8'),
        contentType: 'text/plain; charset=utf-8',
      };
    } catch (error) {
      // If parsing fails, return raw content
      const text = file.buffer.toString('utf8');
      return {
        buffer: Buffer.from(text, 'utf8'),
        contentType: 'text/plain; charset=utf-8',
      };
    }
  }

  throw new Error('Conversion path was not implemented.');
}

async function previewBuffer(file) {
  const ext = getExt(file.originalname);

  if (['txt', 'md', 'csv', 'json', 'html'].includes(ext)) {
    const text = file.buffer.toString('utf8').slice(0, 15000);
    return {
      kind: 'text',
      title: `${ext.toUpperCase()} preview`,
      content: text,
    };
  }

  if (ext === 'docx') {
    const extracted = await mammoth.extractRawText({ buffer: file.buffer });
    return {
      kind: 'text',
      title: 'DOCX text preview',
      content: (extracted.value || '').slice(0, 15000),
    };
  }

  if (ext === 'xlsx') {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' });
    const firstSheet = workbook.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
      header: 1,
      blankrows: false,
      raw: false,
    });

    return {
      kind: 'table',
      title: `XLSX preview (${firstSheet})`,
      content: rows.slice(0, 20),
    };
  }

  if (ext === 'zip') {
    const zip = await JSZip.loadAsync(file.buffer);
    const entries = Object.keys(zip.files).slice(0, 120);
    return {
      kind: 'list',
      title: 'ZIP contents',
      content: entries,
    };
  }

  if (ext === 'pdf') {
    const parsed = await extractPdfPages(file.buffer);
    return {
      kind: 'pages',
      title: `PDF page-by-page preview (${Math.min(parsed.totalPages, parsed.pages.length)}/${parsed.totalPages} pages shown)`,
      content: parsed.pages.map((text, index) => {
        const normalized = text || '[No extracted text on this page]';
        return `Page ${index + 1}\n${normalized.slice(0, 2500)}`;
      }),
    };
  }

  return {
    kind: 'info',
    title: 'Preview not available',
    content: `This format (${ext || 'unknown'}) can be converted if supported, but direct server preview is limited in Phase 1.`,
  };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'converter-api' });
});

app.get('/api/converter/support', (_req, res) => {
  res.json({ conversionMap });
});

app.post('/api/converter/preview', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Please upload a file.' });
  }

  try {
    const preview = await previewBuffer(file);
    return res.json({
      fileName: file.originalname,
      ext: getExt(file.originalname),
      preview,
      supportedTargets: supportedTargets(getExt(file.originalname)),
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to generate preview.',
      details: error instanceof Error ? error.message : 'Unknown preview error',
    });
  }
});

app.post('/api/converter/convert', upload.single('file'), async (req, res) => {
  const file = req.file;
  const targetFormat = String(req.body?.targetFormat || '').toLowerCase();

  if (!file) {
    return res.status(400).json({ error: 'Please upload a file.' });
  }

  if (!targetFormat) {
    return res.status(400).json({ error: 'Please choose a target format.' });
  }

  try {
    const converted = await convertBuffer(file, targetFormat, {
      imageQuality: req.body?.imageQuality,
    });
    const downloadName = buildDownloadName(file.originalname, targetFormat);

    res.setHeader('Content-Type', converted.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
    return res.send(converted.buffer);
  } catch (error) {
    return res.status(400).json({
      error: error instanceof Error ? error.message : 'Conversion failed unexpectedly.',
    });
  }
});

app.post('/api/converter/merge', upload.array('files', 20), async (req, res) => {
  const files = req.files;
  const mergeMode = String(req.body?.mergeMode || 'auto').toLowerCase();

  if (!files || !Array.isArray(files) || files.length < 2) {
    return res.status(400).json({ error: 'Please upload at least two files to merge.' });
  }

  try {
    const exts = files.map((file) => getExt(file.originalname));
    const allImages = exts.every((ext) => isImageExt(ext));
    const allTextLike = exts.every((ext) => isTextLikeExt(ext));
    const allPdf = exts.every((ext) => isPdfExt(ext));

    if (mergeMode === 'text' || (mergeMode === 'auto' && allTextLike)) {
      const mergedText = files
        .map(
          (file, index) =>
            `----- File ${index + 1}: ${file.originalname} -----\n${file.buffer.toString('utf8')}`
        )
        .join('\n\n');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="merged.txt"');
      return res.send(Buffer.from(mergedText, 'utf8'));
    }

    if (mergeMode === 'image' || (mergeMode === 'auto' && allImages)) {
      const prepared = await Promise.all(
        files.map(async (file) => {
          const image = sharp(file.buffer).ensureAlpha();
          const metadata = await image.metadata();
          const buffer = await image.toBuffer();
          return {
            buffer,
            width: metadata.width || 1,
            height: metadata.height || 1,
          };
        })
      );

      const canvasWidth = Math.max(...prepared.map((item) => item.width));
      const canvasHeight = prepared.reduce((sum, item) => sum + item.height, 0);

      let currentTop = 0;
      const composites = prepared.map((item) => {
        const composite = {
          input: item.buffer,
          top: currentTop,
          left: Math.floor((canvasWidth - item.width) / 2),
        };
        currentTop += item.height;
        return composite;
      });

      const mergedImage = await sharp({
        create: {
          width: canvasWidth,
          height: canvasHeight,
          channels: 4,
          background: { r: 18, g: 15, b: 41, alpha: 1 },
        },
      })
        .composite(composites)
        .png({ compressionLevel: 9 })
        .toBuffer();

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Disposition', 'attachment; filename="merged.png"');
      return res.send(mergedImage);
    }

    if (mergeMode === 'pdf' || (mergeMode === 'auto' && allPdf)) {
      const mergedPdf = await PDFDocument.create();

      for (const file of files) {
        const srcPdf = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
        const indices = srcPdf.getPageIndices();
        const copiedPages = await mergedPdf.copyPages(srcPdf, indices);
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const pdfBytes = await mergedPdf.save();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="merged.pdf"');
      return res.send(Buffer.from(pdfBytes));
    }

    const zip = new JSZip();
    files.forEach((file) => {
      zip.file(file.originalname, file.buffer);
    });
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="merged_bundle.zip"');
    return res.send(zipBuffer);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to merge files.',
      details: error instanceof Error ? error.message : 'Unknown merge error',
    });
  }
});

app.post('/api/converter/ocr', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: 'Please upload a file.' });
  }

  const ext = getExt(file.originalname);

  try {
    if (isImageExt(ext)) {
      const [extractedText] = await runLocalOcrBatch([file.buffer]);

      return res.json({
        fileName: file.originalname,
        ext,
        source: 'ocr-image',
        text: extractedText,
      });
    }

    if (ext === 'pdf') {
      const maxPages = Math.min(12, Math.max(1, Number(req.body?.maxPages || 6)));
      const parsed = await pdfParse(file.buffer);
      const extracted = (parsed.text || '').trim();

      if (extracted.length > 20) {
        return res.json({
          fileName: file.originalname,
          ext,
          source: 'pdf-text-extraction',
          text: extracted,
          note: 'Embedded PDF text extracted successfully. OCR fallback was not required.',
        });
      }

      const rendered = await renderPdfPagesToPngBuffers(file.buffer, maxPages, 2);
      const pageText = await runLocalOcrBatch(rendered.images);
      const pageTextChunks = pageText.map((text, index) => `Page ${index + 1}\n${text}`);

      const combinedText = pageTextChunks.join('\n\n');
      return res.json({
        fileName: file.originalname,
        ext,
        source: 'ocr-scanned-pdf',
        pagesProcessed: rendered.renderedPages,
        totalPages: rendered.totalPages,
        text: combinedText,
        note: `Scanned PDF OCR completed for ${rendered.renderedPages} page(s).`,
      });
    }

    return res.status(400).json({
      error: 'OCR currently supports images (PNG/JPG/WEBP/TIFF/GIF) and PDF text extraction fallback.',
    });
  } catch (error) {
    return res.status(500).json({
      error: 'OCR failed unexpectedly.',
      details: error instanceof Error ? error.message : 'Unknown OCR error',
    });
  }
});

app.post('/api/scan', async (req, res) => {
  const targetUrl = normalizeWebsiteUrl(req.body?.url);
  if (!validWebsiteUrl(targetUrl)) {
    return res.status(400).json({ error: 'Please provide a valid website URL.' });
  }

  return res.json({
    message: 'Legacy scanner endpoint is still available, but the product now focuses on file conversion in Phase 1.',
    url: targetUrl,
  });
});

// ===== PHASE 2 FEATURES =====

// PDF Tools: Split pages, extract, compress
app.post('/api/pdf/split', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file || getExt(file.originalname) !== 'pdf') {
    return res.status(400).json({ error: 'Please upload a PDF file.' });
  }

  try {
    const startPage = Math.max(1, Number(req.body?.startPage || 1));
    const endPage = Math.max(1, Number(req.body?.endPage || 1));

    const srcPdf = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    const totalPages = srcPdf.getPageCount();

    if (startPage > totalPages || endPage > totalPages || startPage > endPage) {
      return res.status(400).json({ error: `Invalid page range. PDF has ${totalPages} pages.` });
    }

    const newPdf = await PDFDocument.create();
    const pagesToCopy = [];
    for (let i = startPage - 1; i < endPage; i++) {
      pagesToCopy.push(i);
    }
    const copiedPages = await newPdf.copyPages(srcPdf, pagesToCopy);
    copiedPages.forEach((page) => newPdf.addPage(page));

    const pdfBytes = await newPdf.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="extracted_pages_${startPage}-${endPage}.pdf"`);
    return res.send(Buffer.from(pdfBytes));
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to split PDF.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// PDF Tools: Compress (reduce file size)
app.post('/api/pdf/compress', upload.single('file'), async (req, res) => {
  const file = req.file;
  if (!file || getExt(file.originalname) !== 'pdf') {
    return res.status(400).json({ error: 'Please upload a PDF file.' });
  }

  try {
    const pdf = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
    const bytes = await pdf.save();
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="compressed.pdf"');
    return res.send(Buffer.from(bytes));
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to compress PDF.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Archive: Create ZIP from multiple files
app.post('/api/archive/create-zip', upload.array('files', 50), async (req, res) => {
  const files = req.files;
  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'Please upload at least one file.' });
  }

  try {
    const zip = new JSZip();
    files.forEach((file) => {
      zip.file(file.originalname, file.buffer);
    });
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="archive_${Date.now()}.zip"`);
    return res.send(zipBuffer);
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to create ZIP archive.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Batch Processing: Convert multiple files
app.post('/api/batch/convert', upload.array('files', 20), async (req, res) => {
  const files = req.files;
  const targetFormat = String(req.body?.targetFormat || '').toLowerCase();

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'Please upload at least one file.' });
  }

  if (!targetFormat) {
    return res.status(400).json({ error: 'Please specify target format.' });
  }

  try {
    const results = [];
    const errors = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const converted = await convertBuffer(file, targetFormat, {
          imageQuality: req.body?.imageQuality,
        });
        results.push({
          originalName: file.originalname,
          status: 'success',
          size: converted.buffer.length,
        });
      } catch (error) {
        errors.push({
          originalName: file.originalname,
          status: 'failed',
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Create ZIP with all results
    const zip = new JSZip();
    let fileIndex = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (results[i]?.status === 'success') {
        try {
          const converted = await convertBuffer(file, targetFormat, {
            imageQuality: req.body?.imageQuality,
          });
          const downloadName = buildDownloadName(file.originalname, targetFormat);
          zip.file(downloadName, converted.buffer);
        } catch {
          // Skip on error
        }
      }
    }

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="batch_converted_${Date.now()}.zip"`);
    return res.send(zipBuffer);
  } catch (error) {
    return res.status(500).json({
      error: 'Batch conversion failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Utility: QR Code (info endpoint, actual generation done client-side)
app.get('/api/utils/qr-info', (_req, res) => {
  res.json({
    service: 'qr-generator',
    type: 'client-side',
    message: 'QR codes are generated client-side for privacy',
  });
});

// Utility: Base64 encoding
app.post('/api/utils/base64-encode', express.text({ limit: '10mb' }), async (req, res) => {
  try {
    const text = req.body;
    const encoded = Buffer.from(text, 'utf8').toString('base64');
    res.json({ encoded });
  } catch (error) {
    return res.status(400).json({
      error: 'Encoding failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Utility: Base64 decoding
app.post('/api/utils/base64-decode', express.text({ limit: '10mb' }), async (req, res) => {
  try {
    const encoded = req.body;
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    res.json({ decoded });
  } catch (error) {
    return res.status(400).json({
      error: 'Decoding failed.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Utility: Text Statistics
app.post('/api/utils/text-stats', express.text({ limit: '10mb' }), async (req, res) => {
  try {
    const text = req.body;
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
    const lines = text.split(/\n/);
    const chars = text.length;
    const charsNoSpaces = text.replace(/\s/g, '').length;

    res.json({
      characters: chars,
      charactersNoSpaces: charsNoSpaces,
      words: words.length,
      lines: lines.length,
      paragraphs: text.split(/\n\n+/).filter((p) => p.trim().length > 0).length,
      averageWordLength: words.length > 0 ? (charsNoSpaces / words.length).toFixed(2) : 0,
    });
  } catch (error) {
    return res.status(400).json({
      error: 'Failed to calculate statistics.',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

app.listen(PORT, () => {
  console.log(`Converter API listening on http://localhost:${PORT}`);
});
