import { useState, useEffect } from 'react';
import api from '../api/axiosClient';

export default function Profile() {
  const name = localStorage.getItem('name');
  const role = localStorage.getItem('role');
  const [stats, setStats] = useState({ total: 0, confirmed: 0, pending: 0, cancelled: 0 });

  useEffect(() => {
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
    
    if (role === 'patient') {
      fetchStats();
    }
  }, [role]);

  return (
    <div className="row justify-content-center mt-5">
      <div className="col-md-6 col-lg-5">
        <div className="card shadow-sm border-0">
          <div className="card-header bg-primary text-white p-3">
            <h4 className="mb-0">User Profile</h4>
          </div>
          <div className="card-body p-4 bg-light">
            <div className="mb-4">
              <h5 className="text-secondary border-bottom pb-2">Account Details</h5>
              <p className="mb-1 mt-3"><strong>Full Name:</strong> {name}</p>
              <p className="mb-1"><strong>Account Type:</strong> <span className="badge bg-dark">{role === 'admin' ? 'Administrator' : 'Patient'}</span></p>
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