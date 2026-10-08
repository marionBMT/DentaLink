import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';
import PatientDashboard from './pages/PatientDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Profile from './pages/Profile';
import ForgotPassword from './pages/ForgotPassword';

function App() {
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const token = localStorage.getItem('token');
  const role = localStorage.getItem('role');

  const handleLogout = () => {
    localStorage.clear();
    window.location.href = '/login';
  };

  return (
    <Router>
      <nav className="navbar navbar-expand-lg navbar-light bg-light px-4">
        <Link className="navbar-brand fw-bold text-primary" to="/">DentaLink</Link>
        <div className="ms-auto">
          {!token ? (
            <>
              <Link className="btn btn-outline-dark me-2" to="/">Home</Link>
              <Link className="btn btn-outline-primary me-2" to="/login">Log In</Link>
              <Link className="btn btn-primary" to="/register">Sign Up</Link>
            </>
          ) : (
            <>
              <span className="me-3 fw-bold">Hello, {localStorage.getItem('name')}</span>
              <Link className="btn btn-outline-primary me-2" to="/profile">My Profile</Link>
              {role === 'admin' && <Link className="btn btn-outline-dark me-2" to="/admin">Admin Board</Link>}
              {role === 'patient' && <Link className="btn btn-outline-dark me-2" to="/dashboard">My Appointments</Link>}
              {/* This button now opens the modal instead of logging out immediately */}
              <button onClick={() => setShowLogoutModal(true)} className="btn btn-danger">Log Out</button>
            </>
          )}
        </div>
      </nav>

      <div className="container mt-4">
        <Routes>
          <Route path="/" element={<h2 className="text-center mt-5">Welcome to DentaLink - Your Link to a Better Smile</h2>} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<PatientDashboard />} /> 
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
        </Routes>
      </div>

      {/* Logout Confirmation Modal */}
      {showLogoutModal && (
        <div className="modal d-block bg-dark bg-opacity-50" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-body text-center p-4">
                <h5 className="mb-4">Confirm Logout</h5>
                <p className="text-muted mb-4">Are you sure you want to logout?</p>
                <div className="d-flex justify-content-center gap-3">
                  <button className="btn btn-secondary px-4" onClick={() => setShowLogoutModal(false)}>Back</button>
                  <button className="btn btn-danger px-4" onClick={handleLogout}>Yes</button>
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