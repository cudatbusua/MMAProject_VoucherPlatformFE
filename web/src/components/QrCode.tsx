import qrcode from 'qrcode-generator';
import { useMemo } from 'react';

/** Renders the server-issued redeem payload as an SVG QR code. */
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return { path: d, count: n };
  }, [value]);
  const q = 2;
  const total = count + q * 2;
  return (
    <svg width={size} height={size} viewBox={-q + ' ' + -q + ' ' + total + ' ' + total} role="img" aria-label="Mã QR sử dụng voucher" shapeRendering="crispEdges">
      <rect x={-q} y={-q} width={total} height={total} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
