import qrcode from 'qrcode-generator';
import { useMemo } from 'react';
import Svg, { Path, Rect } from 'react-native-svg';

// Renders the server-issued redeem payload as a QR image (the API returns only the string).
export function QrCode({ value, size = 220 }: { value: string; size?: number }) {
  const { path, count } = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(value);
    qr.make();
    const n = qr.getModuleCount();
    let d = '';
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    return { path: d, count: n };
  }, [value]);
  const quiet = 2;
  const total = count + quiet * 2;
  return (
    <Svg width={size} height={size} viewBox={-quiet + ' ' + -quiet + ' ' + total + ' ' + total}>
      <Rect x={-quiet} y={-quiet} width={total} height={total} fill="#fff" />
      <Path d={path} fill="#000" />
    </Svg>
  );
}
