import fs from 'node:fs/promises';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { FormData, File, fetch } from 'undici';
import sharp from 'sharp';

async function makePdf(path, text) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText(text, { x: 60, y: 760, size: 24, font, color: rgb(0, 0, 0) });
  const bytes = await pdf.save();
  await fs.writeFile(path, bytes);
}

await makePdf('mp1.pdf', 'PDF MERGE PAGE 1');
await makePdf('mp2.pdf', 'PDF MERGE PAGE 2');
const p1 = await fs.readFile('mp1.pdf');
const p2 = await fs.readFile('mp2.pdf');

const mergeForm = new FormData();
mergeForm.append('files', new File([p1], 'mp1.pdf', { type: 'application/pdf' }));
mergeForm.append('files', new File([p2], 'mp2.pdf', { type: 'application/pdf' }));
mergeForm.append('mergeMode', 'pdf');
const mergeRes = await fetch('http://localhost:8787/api/converter/merge', { method: 'POST', body: mergeForm });
const mergeText = await mergeRes.text();
console.log('MERGE_STATUS', mergeRes.status, mergeRes.headers.get('content-type'));
console.log('MERGE_BODY_SNIP', mergeText.slice(0, 220));

const svg = "<svg width='900' height='260' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' fill='white'/><text x='30' y='160' font-size='86' fill='black'>SCANNED OCR TEST 789</text></svg>";
const png = await sharp(Buffer.from(svg)).png().toBuffer();
const scanPdf = await PDFDocument.create();
const img = await scanPdf.embedPng(png);
const page = scanPdf.addPage([img.width, img.height]);
page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
const scanBytes = await scanPdf.save();

const ocrForm = new FormData();
ocrForm.append('file', new File([scanBytes], 'scan.pdf', { type: 'application/pdf' }));
ocrForm.append('maxPages', '2');
const ocrRes = await fetch('http://localhost:8787/api/converter/ocr', { method: 'POST', body: ocrForm });
const ocrBody = await ocrRes.text();
console.log('OCR_STATUS', ocrRes.status, ocrRes.headers.get('content-type'));
console.log('OCR_BODY_SNIP', ocrBody.slice(0, 320));
