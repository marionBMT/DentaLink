import { useEffect, useState } from "react";
import { Link, Route, BrowserRouter as Router, Routes } from "react-router-dom";
import api from "./api/axiosClient";
import FlashMessage from "./components/FlashMessage";
import ConfirmModal from "./components/ConfirmModal";
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
    try {
      await api.post("/auth/logout", null, { skipForceLogout: true });
    } catch {
      /* The local session is still cleared if the server is unavailable. */
    }
    endSession({ message: "You have been logged out.", type: "success" });
  };

  if (!sessionReady) {
    return (
      <div className="container py-5 text-center" role="status" aria-live="polite">
        <div className="spinner-border text-primary mb-3" aria-hidden="true"></div>
        <div>Loading DentaLink…</div>
      </div>
    );
  }

  return (
    <Router>
      <a className="visually-hidden-focusable position-absolute top-0 start-0 p-2 bg-white" href="#main-content">
        Skip to main content
      </a>

      <nav className="navbar navbar-expand-lg navbar-light bg-light border-bottom px-3" aria-label="Primary navigation">
        <div className="container-xl">
          <Link className="navbar-brand fw-bold text-primary" to="/">DentaLink</Link>
          <div className="ms-auto d-flex flex-wrap justify-content-end align-items-center gap-2 py-2">
            {!authenticated ? (
              <>
                <Link className="btn btn-outline-secondary" to="/">Home</Link>
                <Link className="btn btn-outline-primary" to="/login">Log In</Link>
                <Link className="btn btn-primary" to="/register">Sign Up</Link>
              </>
            ) : (
              <>
                <span className="me-2 fw-bold">Hello, {name}</span>
                <Link className="btn btn-outline-primary" to="/profile">My Profile</Link>
                {role === "admin" && <Link className="btn btn-outline-secondary" to="/admin">Admin Board</Link>}
                {role === "patient" && <Link className="btn btn-outline-secondary" to="/dashboard">My Appointments</Link>}
                <button type="button" onClick={() => setShowLogoutModal(true)} className="btn btn-danger">Log Out</button>
              </>
            )}
          </div>
        </div>
      </nav>

      <main id="main-content" className="app-main-container mt-4 px-3" tabIndex="-1">
        <FlashMessage />
        <Routes>
          <Route
            path="/"
            element={
              <section className="text-center py-5" aria-labelledby="home-title">
                <h1 id="home-title" className="display-5 fw-bold text-primary mb-3">Welcome to DentaLink</h1>
                <p className="lead mb-4">Your Link to a Better Smile</p>
                {!authenticated && (
                  <div className="d-flex flex-wrap justify-content-center gap-2">
                    <Link className="btn btn-primary" to="/register">Create an Account</Link>
                    <Link className="btn btn-outline-primary" to="/login">Log In</Link>
                  </div>
                )}
              </section>
            }
          />
          <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/register" element={<GuestRoute><Register /></GuestRoute>} />
          <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute role="patient"><PatientDashboard /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>

      {showLogoutModal && (
        <ConfirmModal
          title="Confirm Logout"
          variant="danger"
          confirmLabel="Log Out"
          cancelLabel="Back"
          busy={loggingOut}
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutModal(false)}
        >
          <p className="mb-0">Are you sure you want to log out of DentaLink?</p>
        </ConfirmModal>
      )}
    </Router>
  );
}

export default App;