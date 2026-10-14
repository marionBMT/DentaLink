import { useEffect, useId, useRef, useState } from 'react';

// Generic confirmation dialog.
//   requireText  -> the confirm button stays disabled until the user types this
//                   exact text ("type DELETE to confirm" pattern)
//   error        -> server message shown inside the dialog, which stays open so
//                   the user can read it and retry
//   busy         -> disables both buttons while the request is in flight
//   children     -> extra form fields (e.g. a password input)
export default function ConfirmModal({
  title,
  variant = 'danger',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  hideCancel = false,
  requireText,
  requireTextLabel,
  busy = false,
  error = '',
  onConfirm,
  onCancel,
  children,
}) {
  const [typed, setTyped] = useState('');
  const textOk = !requireText || typed === requireText;
  const titleId = useId();
  const confirmationId = useId();
  const dialogRef = useRef(null);
  const previousFocusRef = useRef(null);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);

  useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  useEffect(() => {
    onCancelRef.current = onCancel;
  }, [onCancel]);

  useEffect(() => {
    const dialog = dialogRef.current;
    previousFocusRef.current = document.activeElement;

    const getFocusable = () => dialog?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ) || [];
    const initialFocus = dialog?.querySelector(
      '[data-dialog-autofocus], input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    ) || getFocusable()[0] || dialog;
    initialFocus.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) {
        event.preventDefault();
        onCancelRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = getFocusable();
      if (!focusable.length) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.body.classList.add('modal-open');
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.classList.remove('modal-open');
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, []);

  return (
    <>
      <div className="modal-backdrop fade show" style={{ zIndex: 1040 }}></div>
      <div ref={dialogRef} className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1050 }} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="modal-dialog modal-dialog-centered">
          <form
            className="modal-content shadow"
            onSubmit={(e) => {
              e.preventDefault();
              if (textOk && !busy) onConfirm();
            }}
          >
            <div className={`modal-header bg-${variant} ${variant === 'warning' ? 'text-dark' : 'text-white'}`}>
              <h2 id={titleId} className="modal-title fs-5">{title}</h2>
              {!hideCancel && (
                <button
                  type="button"
                  className={`btn-close ${variant === 'warning' ? '' : 'btn-close-white'}`}
                  onClick={onCancel}
                  disabled={busy}
                  aria-label="Close"
                ></button>
              )}
            </div>
            <div className="modal-body">
              {children}
              {requireText && (
                <div className="mt-3">
                  <label className="form-label small fw-bold" htmlFor={confirmationId}>
                    {requireTextLabel || 'Type'} <code>{requireText}</code> to confirm
                  </label>
                  <input
                    type="text"
                    id={confirmationId}
                    name="confirmationText"
                    className="form-control"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                  />
                </div>
              )}
              {error && <div className="alert alert-danger py-2 mt-3 mb-0" role="alert" aria-live="assertive">{error}</div>}
            </div>
            <div className="modal-footer bg-light">
              {!hideCancel && (
                <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
                  {cancelLabel}
                </button>
              )}
              <button type="submit" className={`btn btn-${variant} px-4`} disabled={!textOk || busy}>
                {busy ? 'Please wait…' : confirmLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
