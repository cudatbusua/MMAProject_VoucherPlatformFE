// Writes two placeholder license PDFs that can be uploaded during the brand-license demo.
// Usage (in backend/): npx tsx scripts/demo-files.ts [outputDir]   (default: demo-files next to the repo, never inside it)
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { samplePdf } from '../src/database/sample-pdf';

const out = resolve(process.argv[2] ?? join(__dirname, '../../../demo-files'));
mkdirSync(out, { recursive: true });
const y = new Date().getFullYear();
const files: [string, string[]][] = [
  [
    'giay-phep-kinh-doanh-tra-sua-may.pdf',
    [
      'GIAY CHUNG NHAN DANG KY KINH DOANH (MAU)',
      'Ten co so: Tra Sua May',
      'So: 0319876543',
      'Co quan cap: So KH&DT TP.HCM',
      'Ngay cap: ' + (y - 1) + '-03-15',
      'Du lieu mau de demo, khong co gia tri phap ly.',
    ],
  ],
  [
    'chung-nhan-attp-tra-sua-may.pdf',
    [
      'GIAY CHUNG NHAN AN TOAN THUC PHAM (MAU)',
      'Ten co so: Tra Sua May',
      'So: ATTP-' + y + '-0420',
      'Co quan cap: Ban Quan ly ATTP TP.HCM',
      'Ngay cap: ' + (y - 1) + '-06-01  -  Het han: ' + (y + 2) + '-06-01',
      'Du lieu mau de demo, khong co gia tri phap ly.',
    ],
  ],
];
for (const [name, lines] of files) writeFileSync(join(out, name), samplePdf(lines));
console.log('Demo license files written to ' + out);
