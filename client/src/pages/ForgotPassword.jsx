import { useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api/axiosClient";
import ConfirmModal from "../components/ConfirmModal";
import { setFlash } from "../utils/session";
import { PASSWORD_MESSAGE, PASSWORD_REGEX } from "../utils/validation";

export default function ForgotPassword() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [modalError, setModalError] = useState("");

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.post("/auth/forgot-password", {
        email: email.trim(),
      });
      // The server answers identically for registered and unknown emails
      setInfo(res.data.message);
      setStep(2);
    } catch (err) {
      setError(errorMessage(err, "Could not send the code"));
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/auth/verify-reset-otp", {
        email: email.trim(),
        otp: otp.trim(),
      });
      setInfo("");
      setStep(3);
    } catch (err) {
      setError(errorMessage(err, "Invalid OTP"));
    } finally {
      setBusy(false);
    }
  };

  const initiatePasswordChange = (e) => {
    e.preventDefault();
    setError("");

    if (!PASSWORD_REGEX.test(newPassword)) {
      setError(PASSWORD_MESSAGE);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setModalError("");
    setShowConfirmModal(true);
  };

  const executePasswordChange = async () => {
    setBusy(true);
    setModalError("");
    try {
      // The OTP is sent again: the server re-checks it before changing anything
      await api.post("/auth/reset-password", {
        email: email.trim(),
        otp: otp.trim(),
        newPassword,
      });
      setFlash(
        "success",
        "Password changed successfully. Please log in with your new password.",
      );
      window.location.assign("/login"); // full load so the flash banner is shown
    } catch (err) {
      setModalError(errorMessage(err, "Failed to change password"));
      setBusy(false);
    }
  };

  return (
    <div className="row justify-content-center mt-5 position-relative">
      <div className="col-md-6 col-lg-4">
        <h2 className="text-center mb-4">Password Recovery</h2>
        {error && <div className="alert alert-danger">{error}</div>}
        {info && <div className="alert alert-info">{info}</div>}

        <div className="card p-4 shadow-sm">
          {step === 1 && (
            <form onSubmit={handleSendOtp}>
              <div className="mb-3">
                <label className="form-label">Enter your Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary w-100 mb-3"
                disabled={busy}
              >
                {busy ? "Sending..." : "Send OTP"}
              </button>
              <Link
                to="/login"
                className="btn btn-link w-100 text-decoration-none"
              >
                Remember password?
              </Link>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleVerifyOtp}>
              <div className="mb-3">
                <label className="form-label text-center d-block">
                  Enter OTP
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-control text-center"
                  maxLength="6"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>
              <button
                type="submit"
                className="btn btn-primary w-100 mb-3"
                disabled={busy || otp.length !== 6}
              >
                {busy ? "Verifying..." : "Verify OTP"}
              </button>
              <Link
                to="/login"
                className="btn btn-link w-100 text-decoration-none"
              >
                Remember password?
              </Link>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={initiatePasswordChange}>
              <div className="mb-3">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
                <small className="text-muted">{PASSWORD_MESSAGE}</small>
              </div>
              <div className="mb-3">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  className="form-control"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" className="btn btn-primary w-100 mb-3">
                Change Password
              </button>
              <Link
                to="/login"
                className="btn btn-link w-100 text-decoration-none"
              >
                Remember password?
              </Link>
            </form>
          )}
        </div>
      </div>

      {showConfirmModal && (
        <ConfirmModal
          title="Confirm Change Password?"
          variant="primary"
          confirmLabel="Confirm"
          cancelLabel="Back"
          busy={busy}
          error={modalError}
          onConfirm={executePasswordChange}
          onCancel={() => setShowConfirmModal(false)}
        >
          <p className="mb-0 text-muted">
            Are you sure you want to update your password?
          </p>
        </ConfirmModal>
      )}
    </div>
  );
}
