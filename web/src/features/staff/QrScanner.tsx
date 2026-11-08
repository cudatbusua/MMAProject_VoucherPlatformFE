import jsQR from 'jsqr';
import { useEffect, useRef, useState } from 'react';

/** Camera QR reader. Stops the stream as soon as one code is read (spec: no new key per frame). */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const done = useRef(false);
  const cb = useRef(onResult);
  cb.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const stop = () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };

    const tick = () => {
      if (stopped) return;
      const v = videoRef.current;
      if (v && ctx && v.readyState >= 2 && v.videoWidth) {
        canvas.width = v.videoWidth;
        canvas.height = v.videoHeight;
        ctx.drawImage(v, 0, 0);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code?.data && !done.current) {
          done.current = true;
          stop();
          cb.current(code.data.trim());
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Trình duyệt không hỗ trợ camera. Dán mã QR hoặc nhập OTP.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play();
        raf = requestAnimationFrame(tick);
      } catch {
        setError('Không mở được camera. Kiểm tra quyền camera hoặc dùng cách nhập tay.');
      }
    })();

    return stop;
  }, []);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="scanner">
        <video ref={videoRef} muted playsInline />
        <div className="frame" />
      </div>
      {error ? <div className="alert alert-warning">{error}</div> : <div className="muted small">Đưa mã QR trên điện thoại khách vào khung.</div>}
    </div>
  );
}
