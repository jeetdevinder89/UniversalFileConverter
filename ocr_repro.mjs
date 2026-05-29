import fs from 'node:fs/promises';
import sharp from 'sharp';
import { PDFDocument } from 'pdf-lib';
import { FormData, File, fetch } from 'undici';

const svg = "<svg width='900' height='260' xmlns='http://www.w3.org/2000/svg'><rect width='100%' height='100%' fill='white'/><text x='30' y='160' font-size='86' fill='black'>SCANNED OCR TEST 789</text></svg>";
const png = await sharp(Buffer.from(svg)).png().toBuffer();

const pdf = await PDFDocument.create();
const img = await pdf.embedPng(png);
const page = pdf.addPage([img.width, img.height]);
page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
const bytes = await pdf.save();
await fs.writeFile('scanned_sample.pdf', bytes);

const form = new FormData();
form.append('file', new File([bytes], 'scanned_sample.pdf', { type: 'application/pdf' }));
form.append('maxPages', '2');
const res = await fetch('http://localhost:8787/api/converter/ocr', { method: 'POST', body: form });
const txt = await res.text();
console.log('STATUS', res.status);
console.log(txt.slice(0, 1200));
