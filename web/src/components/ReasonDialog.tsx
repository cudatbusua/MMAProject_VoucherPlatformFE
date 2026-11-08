import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Field, Modal } from './ui';

/** Small modal asking for a 3–500 char reason/reference before running an action. */
export function ReasonDialog({
  title,
  label = 'Lý do',
  confirmText = 'Xác nhận',
  danger,
  onClose,
  onSubmit,
}: {
  title: string;
  label?: string;
  confirmText?: string;
  danger?: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(text.trim());
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={title} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <Field label={label} hint="Từ 3 đến 500 ký tự">
          <textarea value={text} onChange={(e) => setText(e.target.value)} minLength={3} maxLength={500} required autoFocus />
        </Field>
        <Alert>{error}</Alert>
        <div className="row gap" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>
            Hủy
          </button>
          <button className={'btn' + (danger ? ' btn-danger' : '')} disabled={busy || text.trim().length < 3}>
            {busy ? 'Đang xử lý…' : confirmText}
          </button>
        </div>
      </form>
    </Modal>
  );
}
