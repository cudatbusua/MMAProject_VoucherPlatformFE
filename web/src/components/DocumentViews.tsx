import { useEffect, useState } from 'react';
import { api } from '../services/api';
import type { Brand, BrandDocument, LicenseType } from '../types';
import { date, fileSize, licenseLabel } from './format';
import { daysUntil } from './priceRules';
import { Alert, Badge, Modal, Spinner } from './ui';

/** Loads the private file with the auth header and previews it inline (PDF or image). */
export function DocumentPreview({
  brandId,
  doc,
  onClose,
}: {
  brandId: string;
  doc: BrandDocument;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let objectUrl: string | null = null;
    api
      .documentFile(brandId, doc.type)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e: Error) => setError(e.message));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [brandId, doc.type]);

  // Chrome's PDF viewer focuses itself right after loading, which swallows Escape. During the first
  // seconds hand focus back to the dialog's close button; afterwards the user may click into the PDF freely.
  useEffect(() => {
    if (!url || doc.mimeType !== 'application/pdf') return;
    const until = Date.now() + 2500;
    const t = setInterval(() => {
      if (document.activeElement?.tagName === 'IFRAME')
        document.querySelector<HTMLElement>('.modal-backdrop:last-child .modal-head button')?.focus();
      if (Date.now() > until) clearInterval(t);
    }, 100);
    return () => clearInterval(t);
  }, [url, doc.mimeType]);
  return (
    <Modal title={licenseLabel[doc.type]} onClose={onClose} wide>
      <div className="stack">
        <DocumentFacts doc={doc} />
        <Alert>{error}</Alert>
        {!url && !error ? <Spinner /> : null}
        {url ? (
          doc.mimeType === 'application/pdf' ? (
            <iframe className="doc-frame" src={url} title={doc.fileName} />
          ) : (
            <img className="doc-image" src={url} alt={doc.fileName} />
          )
        ) : null}
        {url ? (
          <a className="btn btn-outline btn-sm" href={url} download={doc.fileName} style={{ alignSelf: 'flex-start' }}>
            Tải file về
          </a>
        ) : null}
      </div>
    </Modal>
  );
}

export function ExpiryBadge({ doc }: { doc: BrandDocument }) {
  const left = daysUntil(doc.expiresAt);
  if (left === null) return <Badge tone="info">Không thời hạn</Badge>;
  if (left < 0) return <Badge tone="danger">Đã hết hạn</Badge>;
  if (left < 30) return <Badge tone="warning">Còn {left} ngày</Badge>;
  return <Badge tone="success">Còn hạn đến {date(doc.expiresAt)}</Badge>;
}

export function DocumentFacts({ doc }: { doc: BrandDocument }) {
  return (
    <div className="grid-2 small">
      <div><span className="muted">Số giấy:</span> <strong>{doc.number}</strong></div>
      <div><span className="muted">Cơ quan cấp:</span> {doc.issuer}</div>
      <div><span className="muted">Ngày cấp:</span> {date(doc.issuedAt)}</div>
      <div><span className="muted">Hết hạn:</span> {doc.expiresAt ? <>{date(doc.expiresAt)} <ExpiryBadge doc={doc} /></> : 'Không thời hạn'}</div>
      <div className="muted">File: {doc.fileName} · {fileSize(doc.size)}</div>
    </div>
  );
}

/** Compact status of both licenses for tables. */
export function DocumentsSummary({ brand }: { brand: Brand }) {
  const docs = brand.documents ?? [];
  const missing = (['BUSINESS_LICENSE', 'FOOD_SAFETY'] as LicenseType[]).filter((t) => !docs.some((d) => d.type === t));
  if (missing.length === 2) return <Badge>Chưa nộp</Badge>;
  if (missing.length) return <Badge tone="warning">Thiếu {missing.length === 1 && missing[0] === 'FOOD_SAFETY' ? 'ATTP' : 'GPKD'}</Badge>;
  const food = docs.find((d) => d.type === 'FOOD_SAFETY')!;
  const left = daysUntil(food.expiresAt);
  if (left !== null && left < 0) return <Badge tone="danger">ATTP hết hạn</Badge>;
  if (left !== null && left < 30) return <Badge tone="warning">ATTP còn {left} ngày</Badge>;
  return <Badge tone="success">Đủ 2 giấy tờ</Badge>;
}
