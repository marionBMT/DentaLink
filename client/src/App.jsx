import { useEffect, useState } from "react";
import { Link, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import api from "./api/axiosClient";
import FlashMessage from "./components/FlashMessage";
import NotFound from "./components/NotFound";
import { GuestRoute, ProtectedRoute } from "./components/RouteGuards";
import AdminDashboard from "./pages/AdminDashboard";
import ForgotPassword from "./pages/ForgotPassword";
import Login from "./pages/Login";
import PatientDashboard from "./pages/PatientDashboard";
import Profile from "./pages/Profile";
import Register from "./pages/Register";
import { clearSession, endSession, getSession, saveSession } from "./utils/session";

function App() {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  // Re-read the session whenever another part of the app changes it
  // (Profile dispatches a 'storage' event after the name is edited).
  const [session, setSession] = useState(getSession);

  useEffect(() => {
    const refresh = () => setSession(getSession());
    window.addEventListener("dentalink-session", refresh);
    return () => window.removeEventListener("dentalink-session", refresh);
  }, []);

  useEffect(() => {
    let active = true;
    api.get("/auth/session", { skipForceLogout: true })
      .then((res) => {
        if (active) saveSession(res.data);
      })
      .catch(() => {
        if (active) clearSession();
      })
      .finally(() => {
        if (active) setSessionReady(true);
      });
    return () => { active = false; };
  }, []);

  const { authenticated, role, name } = session;

  const handleLogout = async () => {
    setLoggingOut(true);
    // Revoke the token on the server. If that fails (offline, already expired)
    // the user is still logged out locally.
    try {
      await api.post("/auth/logout", null, { skipForceLogout: true });
    } catch {
      /* ignore */
    }
    endSession({ message: "You have been logged out.", type: "success" });
  };

  if (!sessionReady) {
    return <div className="container py-5 text-center">Loading DentaLink...</div>;
  }

  return (
    <Router>
      <nav className="navbar navbar-expand-lg navbar-light bg-light px-4">
        <Link className="navbar-brand fw-bold text-primary" to="/">
          DentaLink
        </Link>
        <div className="ms-auto d-flex flex-wrap align-items-center gap-2">
          {!authenticated ? (
            <>
              <Link className="btn btn-outline-dark" to="/">
                Home
              </Link>
              <Link className="btn btn-outline-primary" to="/login">
                Log In
              </Link>
              <Link className="btn btn-primary" to="/register">
                Sign Up
              </Link>
            </>
          ) : (
            <>
              <span className="me-2 fw-bold">Hello, {name}</span>
              <Link className="btn btn-outline-primary" to="/profile">
                My Profile
              </Link>
              {role === "admin" && (
                <Link className="btn btn-outline-dark" to="/admin">
                  Admin Board
                </Link>
              )}
              {role === "patient" && (
                <Link className="btn btn-outline-dark" to="/dashboard">
                  My Appointments
                </Link>
              )}
              {/* Opens a confirmation modal instead of logging out immediately */}
              <button
                onClick={() => setShowLogoutModal(true)}
                className="btn btn-danger"
              >
                Log Out
              </button>
            </>
          )}
        </div>
      </nav>

      <div className="container mt-4">
        <FlashMessage />
        <Routes>
          <Route
            path="/"
            element={
              <h2 className="text-center mt-5">
                Welcome to DentaLink - Your Link to a Better Smile
              </h2>
            }
          />

          <Route
            path="/login"
            element={
              <GuestRoute>
                <Login />
              </GuestRoute>
            }
          />
          <Route
            path="/register"
            element={
              <GuestRoute>
                <Register />
              </GuestRoute>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <GuestRoute>
                <ForgotPassword />
              </GuestRoute>
            }
          />

          <Route
            path="/dashboard"
            element={
              <ProtectedRoute role="patient">
                <PatientDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute role="admin">
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="modal d-block bg-dark bg-opacity-50" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-body text-center p-4">
                <h5 className="mb-4">Confirm Logout</h5>
                <p className="text-muted mb-4">
                  Are you sure you want to logout?
                </p>
                <div className="d-flex justify-content-center gap-3">
                  <button
                    className="btn btn-secondary px-4"
                    onClick={() => setShowLogoutModal(false)}
                    disabled={loggingOut}
                  >
                    Back
                  </button>
                  <button
                    className="btn btn-danger px-4"
                    onClick={handleLogout}
                    disabled={loggingOut}
                  >
                    {loggingOut ? "Logging out..." : "Yes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Router>
  );
}

export default App;
