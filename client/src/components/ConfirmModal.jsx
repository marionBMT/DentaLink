import { useState } from 'react';

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

  return (
    <>
      <div className="modal-backdrop fade show" style={{ zIndex: 1040 }}></div>
      <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1050 }} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered">
          <form
            className="modal-content shadow"
            onSubmit={(e) => {
              e.preventDefault();
              if (textOk && !busy) onConfirm();
            }}
          >
            <div className={`modal-header text-white bg-${variant}`}>
              <h5 className="modal-title">{title}</h5>
              <button type="button" className="btn-close btn-close-white" onClick={onCancel} disabled={busy} aria-label="Close"></button>
            </div>
            <div className="modal-body">
              {children}
              {requireText && (
                <div className="mt-3">
                  <label className="form-label small fw-bold">
                    {requireTextLabel || 'Type'} <code>{requireText}</code> to confirm
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                    autoComplete="off"
                    autoFocus
                  />
                </div>
              )}
              {error && <div className="alert alert-danger py-2 mt-3 mb-0" role="alert">{error}</div>}
            </div>
            <div className="modal-footer bg-light">
              <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
                {cancelLabel}
              </button>
              <button type="submit" className={`btn btn-${variant} px-4`} disabled={!textOk || busy}>
                {busy ? 'Please wait...' : confirmLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
