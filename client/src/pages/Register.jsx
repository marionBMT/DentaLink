import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { errorMessage } from "../api/axiosClient";
import ConfirmModal from "../components/ConfirmModal";
import {
  PASSWORD_MESSAGE,
  USERNAME_MESSAGE,
  validateAccountFields,
} from "../utils/validation";

export default function Register() {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();
    const validationError = validateAccountFields({
      username,
      password,
      confirmPassword,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    setBusy(true);
    try {
      await api.post("/auth/register", {
        username: username.trim(),
        name: name.trim(),
        email: email.trim(),
        password,
      });
      setShowModal(true); // Show success modal instead of immediate redirect
    } catch (err) {
      setError(errorMessage(err, "Registration failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="row justify-content-center mt-5 position-relative">
      <div className="col-md-6 col-lg-5">
        <h1 className="h2 text-center mb-4">Create your account</h1>
        {error && <div className="alert alert-danger" role="alert" aria-live="assertive">{error}</div>}
        <form onSubmit={handleRegister} className="card p-4 shadow-sm">
          <div className="mb-3">
            <label className="form-label" htmlFor="register-username">Username</label>
            <input
              id="register-username"
              name="username"
              type="text"
              className="form-control"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoComplete="username"
            />
            <small className="text-muted">{USERNAME_MESSAGE}</small>
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="register-name">Full name</label>
            <input
              id="register-name"
              name="name"
              type="text"
              className="form-control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={100}
              autoComplete="name"
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="register-email">Email</label>
            <input
              id="register-email"
              name="email"
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="mb-3">
            <label className="form-label" htmlFor="register-password">Password</label>
            <input
              id="register-password"
              name="password"
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
            <small className="text-muted">{PASSWORD_MESSAGE}</small>
          </div>
          <div className="mb-4">
            <label className="form-label" htmlFor="register-confirm-password">Confirm password</label>
            <input
              id="register-confirm-password"
              name="confirmPassword"
              type="password"
              className="form-control"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary w-100"
            disabled={busy}
          >
            {busy ? "Creating account…" : "Create Account"}
          </button>
        </form>
      </div>

      {/* Success Modal Overlay */}
      {showModal && (
        <ConfirmModal
          title="Account Created Successfully"
          variant="success"
          confirmLabel="Go to Login"
          hideCancel
          onConfirm={() => navigate("/login")}
          onCancel={() => navigate("/login")}
        >
          <p className="mb-0">Your account is ready. Log in to continue.</p>
        </ConfirmModal>
      )}
    </div>
  );
}
