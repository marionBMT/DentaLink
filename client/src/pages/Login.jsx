import { useState } from "react";
import { Link } from "react-router-dom";
import api, { errorMessage } from "../api/axiosClient";
import { saveSession } from "../utils/session";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpMessage, setOtpMessage] = useState("");

  // Step 1: password check. The server then emails a 6-digit code.
  const requestCode = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await api.post("/auth/login", { identifier, password });
      if (res.data.requireOtp) {
        setShowOtp(true);
        if (res.data.developmentOtp) {
          setOtpCode(res.data.developmentOtp);
          setOtpMessage(`Local development code: ${res.data.developmentOtp}`);
        } else {
          setOtpMessage("A 6-digit code has been sent to your email.");
        }
      }
    } catch (err) {
      // 429 + requireOtp: a code was sent seconds ago and is still valid
      if (err.response?.status === 429 && err.response.data?.requireOtp) {
        setShowOtp(true);
        setOtpMessage(errorMessage(err));
      } else {
        setError(errorMessage(err, "Invalid credentials"));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    requestCode();
  };

  // Step 2: code check. On success the server sets the httpOnly session cookie
  // and returns only non-secret UI metadata plus the CSRF token.
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const res = await api.post("/auth/verify-otp", {
        identifier,
        otp: otpCode.trim(),
      });
      saveSession(res.data);
      // Full load of the target page so the navbar and guards see the session
      window.location.assign(
        res.data.role === "admin" ? "/admin" : "/dashboard",
      );
    } catch (err) {
      setError(errorMessage(err, "Invalid OTP"));
      setBusy(false);
    }
  };

  const backToLogin = () => {
    setShowOtp(false);
    setOtpCode("");
    setOtpMessage("");
    setError("");
  };

  return (
    <div className="row justify-content-center mt-5">
      <div className="col-md-6 col-lg-4">
        <h2 className="text-center mb-4">Log In</h2>
        {error && <div className="alert alert-danger">{error}</div>}
        {otpMessage && showOtp && (
          <div className="alert alert-success">{otpMessage}</div>
        )}

        {!showOtp ? (
          <form onSubmit={handleLogin} className="card p-4 shadow-sm">
            <div className="mb-3">
              <label className="form-label">Username or Email</label>
              <input
                type="text"
                className="form-control"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
            <div className="mb-3">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-control"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>
            <div className="mb-3 text-end">
              <Link
                to="/forgot-password"
                className="text-decoration-none small"
              >
                Forgot Password?
              </Link>
            </div>
            <button
              type="submit"
              className="btn btn-primary w-100"
              disabled={busy}
            >
              {busy ? "Checking..." : "Log In"}
            </button>
          </form>
        ) : (
          <form
            onSubmit={handleVerifyOtp}
            className="card p-4 shadow-sm border-primary"
          >
            <h5 className="text-center mb-3">Two-Step Verification</h5>
            <div className="mb-3">
              <label className="form-label text-center d-block">
                Enter 6-Digit Code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="\d{6}"
                className="form-control form-control-lg text-center fw-bold"
                maxLength="6"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                autoComplete="one-time-code"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary w-100"
              disabled={busy || otpCode.length !== 6}
            >
              {busy ? "Verifying..." : "Verify & Continue"}
            </button>
            <button
              type="button"
              onClick={requestCode}
              disabled={busy}
              className="btn btn-outline-secondary w-100 mt-2"
            >
              Resend code
            </button>
            <button
              type="button"
              onClick={backToLogin}
              disabled={busy}
              className="btn btn-link w-100 mt-2 text-decoration-none"
            >
              Back to Login
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
