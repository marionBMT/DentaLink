import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../api/axiosClient';

export default function ForgotPassword() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  
  const navigate = useNavigate();

  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');
    try {
      // Backend needs an endpoint to send password reset OTP
      await api.post('/auth/forgot-password', { email });
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.message || 'Email not found');
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api.post('/auth/verify-reset-otp', { email, otp });
      setStep(3);
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP');
    }
  };

  const initiatePasswordChange = (e) => {
    e.preventDefault();
    setError('');
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+])[A-Za-z\d!@#$%^&*()_+]{8,}$/;
    
    if (!passwordRegex.test(newPassword)) {
      setError("Password does not meet complexity requirements.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setShowConfirmModal(true);
  };

  const executePasswordChange = async () => {
    try {
      await api.post('/auth/reset-password', { email, newPassword });
      navigate('/login');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to change password');
      setShowConfirmModal(false);
    }
  };

  return (
    <div className="row justify-content-center mt-5 position-relative">
      <div className="col-md-6 col-lg-4">
        <h2 className="text-center mb-4">Password Recovery</h2>
        {error && <div className="alert alert-danger">{error}</div>}
        
        <div className="card p-4 shadow-sm">
          {step === 1 && (
            <form onSubmit={handleSendOtp}>
              <div className="mb-3">
                <label className="form-label">Enter your Email</label>
                <input type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary w-100 mb-3">Send OTP</button>
              <Link to="/login" className="btn btn-link w-100 text-decoration-none">Remember password?</Link>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleVerifyOtp}>
              <div className="mb-3">
                <label className="form-label text-center d-block">Enter OTP</label>
                <input type="text" className="form-control text-center letter-spacing-2" maxLength="6" value={otp} onChange={(e) => setOtp(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary w-100 mb-3">Verify OTP</button>
              <Link to="/login" className="btn btn-link w-100 text-decoration-none">Remember password?</Link>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={initiatePasswordChange}>
              <div className="mb-3">
                <label className="form-label">New Password</label>
                <input type="password" className="form-control" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
              </div>
              <div className="mb-3">
                <label className="form-label">Confirm New Password</label>
                <input type="password" className="form-control" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary w-100 mb-3">Change Password</button>
              <Link to="/login" className="btn btn-link w-100 text-decoration-none">Remember password?</Link>
            </form>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal d-block bg-dark bg-opacity-50" tabIndex="-1">
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-body text-center p-4">
                <h5 className="mb-4">Confirm Change Password?</h5>
                <p className="text-muted mb-4">Are you sure you want to update your password?</p>
                <div className="d-flex justify-content-center gap-3">
                  <button className="btn btn-secondary px-4" onClick={() => setShowConfirmModal(false)}>Back</button>
                  <button className="btn btn-primary px-4" onClick={executePasswordChange}>Confirm</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}