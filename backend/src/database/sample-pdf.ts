/** Builds a tiny valid one-page PDF (ASCII text) used as a placeholder license file in demo seed data. */
export function samplePdf(lines: string[]) {
  const esc = (t: string) => t.replace(/[\\()]/g, (m) => '\\' + m);
  const text = lines
    .map(
      (l, i) => 'BT /F1 ' + (i === 0 ? 20 : 12) + ' Tf 60 ' + (760 - i * 28) + ' Td (' + esc(l) + ') Tj ET',
    )
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    '<< /Length ' + Buffer.byteLength(text, 'latin1') + ' >>\nstream\n' + text + '\nendstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += i + 1 + ' 0 obj\n' + o + '\nendobj\n';
  });
  const xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (const off of offsets) out += String(off).padStart(10, '0') + ' 00000 n \n';
  out += 'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
