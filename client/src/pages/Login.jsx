import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axiosClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  
  // OTP States
  const [showOtp, setShowOtp] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpMessage, setOtpMessage] = useState('');
  
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/auth/login', { email, password });
      if (res.data.requireOtp) {
        setShowOtp(true);
        setOtpMessage('A 6-digit code has been sent to your email.');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid email or password');
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const res = await api.post('/auth/verify-otp', { email, otp: otpCode });
      
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('role', res.data.role);
      localStorage.setItem('name', res.data.name);

      if (res.data.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/dashboard');
      }
      window.location.reload(); 
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP');
    }
  };

  return (
    <div className="row justify-content-center mt-5">
      <div className="col-md-6 col-lg-4">
        <h2 className="text-center mb-4">Log In</h2>
        {error && <div className="alert alert-danger">{error}</div>}
        {otpMessage && <div className="alert alert-success">{otpMessage}</div>}
        
        {!showOtp ? (
          <form onSubmit={handleLogin} className="card p-4 shadow-sm">
            <div className="mb-3">
              <label className="form-label">Email</label>
              <input type="email" className="form-control" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="mb-3">
              <label className="form-label">Password</label>
              <input type="password" className="form-control" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primary w-100">Log In</button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="card p-4 shadow-sm border-primary">
            <h5 className="text-center mb-3">Two-Step Verification</h5>
            <div className="mb-3">
              <label className="form-label text-center d-block">Enter 6-Digit Code</label>
              <input 
                type="text" 
                className="form-control form-control-lg text-center fw-bold letter-spacing-2" 
                maxLength="6"
                value={otpCode} 
                onChange={(e) => setOtpCode(e.target.value)} 
                required 
              />
            </div>
            <button type="submit" className="btn btn-primary w-100">Verify & Continue</button>
            <button type="button" onClick={() => setShowOtp(false)} className="btn btn-link w-100 mt-2 text-decoration-none">Back to Login</button>
          </form>
        )}
      </div>
    </div>
  );
}