import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { errorMessage } from "../api/axiosClient";
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
        <h2 className="text-center mb-4">Sign Up</h2>
        {error && <div className="alert alert-danger">{error}</div>}
        <form onSubmit={handleRegister} className="card p-4 shadow-sm">
          <div className="mb-3">
            <label className="form-label">Username</label>
            <input
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
            <label className="form-label">Full Name</label>
            <input
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
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
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
              autoComplete="new-password"
            />
            <small className="text-muted">{PASSWORD_MESSAGE}</small>
          </div>
          <div className="mb-4">
            <label className="form-label">Confirm Password</label>
            <input
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
            {busy ? "Creating account..." : "Create Account"}
          </button>
        </form>
      </div>

      {/* Success Modal Overlay */}
      {showModal && (
        <div className="modal d-block bg-dark bg-opacity-50" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-body text-center p-5">
                <h4 className="text-success mb-3">
                  Account Created Successfully!
                </h4>
                <p>Your account is ready. Please log in to continue.</p>
                <button
                  className="btn btn-primary px-4 mt-3"
                  onClick={() => navigate("/login")}
                >
                  Go to Login
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
