import { useState, useEffect } from 'react';
import api from '../api/axiosClient';

export default function Profile() {
  const role = localStorage.getItem('role');
  const [stats, setStats] = useState({ total: 0, confirmed: 0, pending: 0, cancelled: 0 });
  
  const [profile, setProfile] = useState({ username: '', name: '', contactNumber: '', address: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', contactNumber: '', address: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const res = await api.get('/users/profile');
        setProfile(res.data);
        setFormData({
          name: res.data.name || '',
          contactNumber: res.data.contactNumber || '',
          address: res.data.address || ''
        });
        // Ensure local storage name is synced just in case
        localStorage.setItem('name', res.data.name);
      } catch (err) {
        console.error("Failed to load profile", err);
      }
    };

    const fetchStats = async () => {
      try {
        const res = await api.get('/appointments');
        const appts = res.data;
        
        setStats({
          total: appts.length,
          confirmed: appts.filter(a => a.status === 'Confirmed').length,
          pending: appts.filter(a => ['Pending_Admin_Approval', 'Admin_Counter_Offer', 'Patient_Counter_Offer'].includes(a.status)).length,
          cancelled: appts.filter(a => ['Cancelled', 'Rejected', 'Cancellation_Requested'].includes(a.status)).length
        });
      } catch (err) {
        console.error("Failed to load stats", err);
      }
    };
    
    fetchProfileData();
    if (role === 'patient') {
      fetchStats();
    }
  }, [role]);

  const validateForm = () => {
    if (!formData.name.trim()) return "Full Name is required.";
    
    if (formData.contactNumber.trim()) {
      // Validates either an 11-digit mobile starting with 09 OR a 7-digit landline
      const phoneRegex = /^(09\d{9}|\d{7})$/;
      if (!phoneRegex.test(formData.contactNumber.trim())) {
        return "Contact number must be an 11-digit mobile (e.g., 09770493211) or a 7-digit telephone (e.g., 8709768).";
      }
    }
    return null;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      const res = await api.put('/users/profile', formData);
      setProfile(res.data);
      localStorage.setItem('name', res.data.name); // Update navbar globally
      setSuccess('Profile updated successfully!');
      setIsEditing(false);
      window.dispatchEvent(new Event('storage')); // Trigger navbar refresh if needed
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update profile');
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setError('');
    setSuccess('');
    setFormData({
      name: profile.name || '',
      contactNumber: profile.contactNumber || '',
      address: profile.address || ''
    });
  };

  return (
    <div className="row justify-content-center mt-5">
      <div className="col-md-6 col-lg-5">
        <div className="card shadow-sm border-0">
          <div className="card-header bg-primary text-white p-3">
            <h4 className="mb-0">User Profile</h4>
          </div>
          <div className="card-body p-4 bg-light">
            
            <div className="mb-4">
              <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                <h5 className="text-secondary mb-0">Account Details</h5>
                {!isEditing && (
                  <button onClick={() => setIsEditing(true)} className="btn btn-sm btn-outline-primary">
                    Edit Profile
                  </button>
                )}
              </div>

              {error && <div className="alert alert-danger py-2">{error}</div>}
              {success && <div className="alert alert-success py-2">{success}</div>}

              {!isEditing ? (
                <div>
                  <p className="mb-2"><strong>Username:</strong> {profile.username}</p>
                  <p className="mb-2"><strong>Full Name:</strong> {profile.name}</p>
                  <p className="mb-2"><strong>Contact Number:</strong> {profile.contactNumber || <span className="text-muted fst-italic">Not provided</span>}</p>
                  <p className="mb-2"><strong>Home Address:</strong> {profile.address || <span className="text-muted fst-italic">Not provided</span>}</p>
                  <p className="mb-1 mt-3"><strong>Account Type:</strong> <span className="badge bg-dark">{role === 'admin' ? 'Administrator' : 'Patient'}</span></p>
                </div>
              ) : (
                <form onSubmit={handleSave}>
                  <div className="mb-3">
                    <label className="form-label small fw-bold">Username <span className="text-muted fw-normal">(Cannot be changed)</span></label>
                    <input type="text" className="form-control bg-light" value={profile.username} disabled />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-bold">Full Name <span className="text-danger">*</span></label>
                    <input type="text" className="form-control" required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-bold">Contact Number <span className="text-muted fw-normal">(Optional)</span></label>
                    <input type="text" className="form-control" placeholder="e.g. 09770493211 or 8709768" value={formData.contactNumber} onChange={(e) => setFormData({...formData, contactNumber: e.target.value})} />
                  </div>
                  <div className="mb-3">
                    <label className="form-label small fw-bold">Home Address <span className="text-muted fw-normal">(Optional)</span></label>
                    <textarea className="form-control" rows="2" placeholder="Enter your full home address" value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})}></textarea>
                  </div>
                  <div className="d-flex gap-2 mt-4">
                    <button type="submit" className="btn btn-success w-50">Save Changes</button>
                    <button type="button" onClick={cancelEdit} className="btn btn-secondary w-50">Cancel</button>
                  </div>
                </form>
              )}
            </div>
            
            {role === 'patient' && (
              <div>
                <h5 className="text-secondary border-bottom pb-2 mb-3">My Appointment Stats</h5>
                <ul className="list-group shadow-sm">
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Total Requests Made
                    <span className="badge bg-primary rounded-pill">{stats.total}</span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Successfully Confirmed
                    <span className="badge bg-success rounded-pill">{stats.confirmed}</span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Pending or Negotiating
                    <span className="badge bg-warning text-dark rounded-pill">{stats.pending}</span>
                  </li>
                  <li className="list-group-item d-flex justify-content-between align-items-center">
                    Cancelled or Rejected
                    <span className="badge bg-danger rounded-pill">{stats.cancelled}</span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}