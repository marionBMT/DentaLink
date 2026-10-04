import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import Login from './pages/Login';
import Register from './pages/Register';

import PatientDashboard from './pages/PatientDashboard';
import AdminDashboard from './pages/AdminDashboard';

import Profile from './pages/Profile';

function App() {
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
              <Link className="btn btn-outline-primary me-2" to="/login">Log In</Link>
              <Link className="btn btn-primary" to="/register">Sign Up</Link>
            </>
          ) : (
            <>
              <span className="me-3 fw-bold">Hello, {localStorage.getItem('name')}</span>
              <Link className="btn btn-outline-primary me-2" to="/profile">My Profile</Link>
              {role === 'admin' && <Link className="btn btn-outline-dark me-2" to="/admin">Admin Board</Link>}
              {role === 'patient' && <Link className="btn btn-outline-dark me-2" to="/dashboard">My Appointments</Link>}
              <button onClick={handleLogout} className="btn btn-danger">Log Out</button>
            </>
          )}
        </div>
      </nav>

      <div className="container mt-4">
        <Routes>
          <Route path="/" element={<h2 className="text-center mt-5">Welcome to DentaLink - Your Link to a Better Smile</h2>} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* 2. Update this route */}
          <Route path="/dashboard" element={<PatientDashboard />} /> 
          
          <Route path="/admin" element={<AdminDashboard />} />

          <Route path="/profile" element={<Profile />} />

        </Routes>
      </div>
    </Router>
  );
}

export default App;