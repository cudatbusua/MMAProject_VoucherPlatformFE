import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Tone } from './format';

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={'badge badge-' + tone}>{children}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="row gap">{actions}</div> : null}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="card stat">
      <div className="muted small">{label}</div>
      <div className="stat-value">{value}</div>
      {hint ? <div className="muted small">{hint}</div> : null}
    </div>
  );
}

export function Alert({ tone = 'danger', children }: { tone?: Tone; children: ReactNode }) {
  if (!children) return null;
  return <div className={'alert alert-' + tone}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function Spinner() {
  return <div className="spinner" aria-label="Đang tải" />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="muted small">{hint}</span> : null}
    </label>
  );
}

const modalStack: symbol[] = [];

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const id = useRef(Symbol('modal'));
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    const me = id.current;
    modalStack.push(me);
    // Move focus into the dialog unless a field inside already took it (autoFocus).
    if (!dialogRef.current?.contains(document.activeElement)) dialogRef.current?.focus();
    // Only the top-most modal reacts to Escape, so nested dialogs close one at a time.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modalStack[modalStack.length - 1] === me) closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      modalStack.splice(modalStack.indexOf(me), 1);
    };
  }, []);
  // Portal to <body>: a dialog opened later is always painted above earlier ones, wherever it sits in JSX.
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={'modal' + (wide ? ' modal-wide' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ outline: 'none' }}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Đóng">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Loads data on mount / when deps change; returns reload for after mutations. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const reqId = useRef(0);
  const reload = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const d = await fnRef.current();
      if (id === reqId.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (id === reqId.current) setError((e as Error).message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error, loading, reload, setData };
}

/** Wraps a mutation with busy/error state. */
export function useAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }, []);
  return { busy, error, setError, run };
}

export function Loadable({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string | null;
  children: ReactNode;
}) {
  if (error) return <Alert>{error}</Alert>;
  if (loading) return <Spinner />;
  return <>{children}</>;
}
