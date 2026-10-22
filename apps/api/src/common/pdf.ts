import PDFDocument from 'pdfkit';

/** Renders a PDF into memory. `draw` receives a fresh A4 document. */
export function renderPdf(draw: (doc: PDFKit.PDFDocument) => void | Promise<void>, info: { title: string }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: info.title, Producer: 'MeasureMate' } });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    Promise.resolve(draw(doc)).then(() => doc.end()).catch(reject);
  });
}

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [15, 118, 110];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
