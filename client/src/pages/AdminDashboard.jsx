import { useState, useEffect } from 'react';
import api from '../api/axiosClient';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('appointments'); 
  
  // --- APPOINTMENT STATES ---
  const [appointments, setAppointments] = useState([]);
  const [counterId, setCounterId] = useState(null);
  const [counterForm, setCounterForm] = useState({ date: '', time: '', remarks: '' });
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const appointmentsPerPage = 4;

  // --- USER MANAGEMENT STATES ---
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ name: '', email: '', password: '', role: 'patient' });
  const [userError, setUserError] = useState('');
  const [userSuccess, setUserSuccess] = useState('');

  // --- NEW: MODAL STATES ---
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState({ type: '', id: '', role: '' });

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

  const generateTimeSlots = () => {
    const slots = [];
    for (let i = 8; i <= 18; i++) {
      const hour24 = i.toString().padStart(2, '0');
      const hour12 = i > 12 ? i - 12 : (i === 0 ? 12 : i);
      const ampm = i >= 12 ? 'PM' : 'AM';
      slots.push({ value: `${hour24}:00`, label: `${hour12}:00 ${ampm}` });
      if (i !== 18) slots.push({ value: `${hour24}:30`, label: `${hour12}:30 ${ampm}` });
    }
    return slots;
  };
  const timeSlots = generateTimeSlots();

  const loadAppointments = async () => {
    try {
      const res = await api.get('/appointments');
      setAppointments(res.data);
    } catch (err) { console.error("Failed to load appointments", err); }
  };

  const loadUsers = async () => {
    try {
      const res = await api.get('/users');
      setUsers(res.data);
    } catch (err) { console.error("Failed to load users", err); }
  };

  useEffect(() => { 
    if (activeTab === 'appointments') loadAppointments();
    if (activeTab === 'users') loadUsers();
  }, [activeTab]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);

  const handleAction = async (id, status) => {
    try {
      await api.put(`/appointments/${id}`, { status });
      loadAppointments();
    } catch (err) { console.error("Failed to update status", err); }
  };

  const submitReject = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/appointments/${rejectId}`, { status: 'Rejected', adminRemarks: rejectReason });
      setRejectId(null);
      setRejectReason('');
      loadAppointments();
    } catch (err) { console.error("Failed to reject", err); }
  };

  const submitCounter = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/appointments/${counterId}`, {
        status: 'Admin_Counter_Offer',
        adminSuggestedDate: counterForm.date,
        adminSuggestedTime: counterForm.time,
        adminRemarks: counterForm.remarks
      });
      setCounterId(null);
      setCounterForm({ date: '', time: '', remarks: '' });
      loadAppointments();
    } catch (err) { console.error("Failed to submit counter offer", err); }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserError('');
    setUserSuccess('');
    try {
      await api.post('/users', newUser);
      setUserSuccess(`${newUser.role === 'admin' ? 'Admin' : 'Patient'} account created!`);
      setNewUser({ name: '', email: '', password: '', role: 'patient' });
      loadUsers();
    } catch (err) {
      setUserError(err.response?.data?.message || 'Failed to create account');
    }
  };

  // --- NEW: MODAL TRIGGER LOGIC ---
  const confirmDeleteAction = async () => {
    const { type, id } = itemToDelete;
    try {
      if (type === 'user') {
        await api.delete(`/users/${id}`);
        loadUsers();
      } else if (type === 'appointment') {
        await api.delete(`/appointments/${id}`);
        loadAppointments();
      }
    } catch (err) { console.error("Failed to delete", err); }
    setShowDeleteModal(false);
  };

  const filteredAppointments = appointments.filter(appt => {
    const search = searchTerm.toLowerCase();
    return (appt.patient?.name?.toLowerCase() || '').includes(search) || 
           (appt.patient?.email?.toLowerCase() || '').includes(search) || 
           (appt.serviceType?.toLowerCase() || '').includes(search);
  });

  const indexOfLastAppt = currentPage * appointmentsPerPage;
  const indexOfFirstAppt = indexOfLastAppt - appointmentsPerPage;
  const currentAppointments = filteredAppointments.slice(indexOfFirstAppt, indexOfLastAppt);
  const totalPages = Math.ceil(filteredAppointments.length / appointmentsPerPage);

  return (
    <div className="mt-4 position-relative">
      
      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button className={`nav-link fw-bold ${activeTab === 'appointments' ? 'active text-primary' : 'text-secondary'}`} 
                  onClick={() => setActiveTab('appointments')}>
            Appointment Requests
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link fw-bold ${activeTab === 'users' ? 'active text-primary' : 'text-secondary'}`} 
                  onClick={() => setActiveTab('users')}>
            User Management
          </button>
        </li>
      </ul>

      {/* --- APPOINTMENTS TAB --- */}
      {activeTab === 'appointments' && (
        <div>
          <div className="mb-4">
            <input type="text" className="form-control shadow-sm" placeholder="Search by patient name, email, or service..." 
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          
          {filteredAppointments.length === 0 ? (
            <p className="text-muted">No appointments found.</p>
          ) : (
            <div className="row">
              {currentAppointments.map((appt) => (
                <div key={appt._id} className="col-md-6 mb-3">
                  <div className="card shadow-sm h-100 border-0 border-start border-4 border-primary">
                    <div className="card-body">
                      <div className="d-flex justify-content-between mb-2">
                        <h5 className="card-title text-primary m-0">{appt.serviceType}</h5>
                        <div className="d-flex align-items-center gap-2">
                          <span className={`badge ${
                            appt.status === 'Confirmed' ? 'bg-success' : 
                            appt.status.includes('Counter') ? 'bg-warning text-dark' : 
                            ['Rejected', 'Cancelled'].includes(appt.status) ? 'bg-danger' : 
                            appt.status === 'Cancellation_Requested' ? 'bg-danger' : 'bg-secondary'
                          }`}>
                            {appt.status.replace(/_/g, ' ')}
                          </span>
                          <button 
                            onClick={() => { setItemToDelete({ type: 'appointment', id: appt._id }); setShowDeleteModal(true); }} 
                            className="btn btn-sm btn-outline-danger px-2 py-0" 
                            title="Delete Record">✕</button>
                        </div>
                      </div>
                      
                      <p className="mb-1"><strong>Patient:</strong> {appt.patient?.name} <span className="text-muted">({appt.patient?.email})</span></p>
                      <p className="mb-2"><strong>Requested Time:</strong> {appt.requestedDate} at {appt.requestedTime}</p>

                      {appt.patientRemarks && (
                         <div className="alert alert-info p-2 py-1 mb-3"><small><strong>Patient Message:</strong> {appt.patientRemarks}</small></div>
                      )}
                      {appt.status === 'Rejected' && appt.adminRemarks && (
                         <div className="alert alert-danger p-2 py-1 mb-3"><small><strong>Rejection Reason:</strong> {appt.adminRemarks}</small></div>
                      )}

                      {['Pending_Admin_Approval', 'Patient_Counter_Offer'].includes(appt.status) && counterId !== appt._id && rejectId !== appt._id && (
                        <div className="d-flex flex-wrap gap-2">
                          <button onClick={() => handleAction(appt._id, 'Confirmed')} className="btn btn-sm btn-success">Approve</button>
                          <button onClick={() => setCounterId(appt._id)} className="btn btn-sm btn-warning">Counter Offer</button>
                          <button onClick={() => setRejectId(appt._id)} className="btn btn-sm btn-danger">Reject</button>
                        </div>
                      )}

                      {appt.status === 'Cancellation_Requested' && (
                         <div className="d-flex gap-2 p-2 bg-light border rounded flex-wrap">
                           <span className="me-auto align-self-center small fw-bold text-danger">Approve Cancellation?</span>
                           <button onClick={() => handleAction(appt._id, 'Cancelled')} className="btn btn-sm btn-danger">Confirm Cancel</button>
                           <button 
                                onClick={() => {
                                    const isFromCounter = appt.adminSuggestedDate && (appt.requestedDate !== appt.adminSuggestedDate || appt.requestedTime !== appt.adminSuggestedTime);
                                    handleAction(appt._id, isFromCounter ? 'Admin_Counter_Offer' : 'Confirmed');
                                }} 
                                className="btn btn-sm btn-secondary"
                            >
                                Keep Appointment
                            </button>
                         </div>
                      )}

                      {rejectId === appt._id && (
                        <form onSubmit={submitReject} className="mt-3 p-3 border rounded bg-light">
                          <h6>Reason for Rejection</h6>
                          <div className="mb-2">
                            <input type="text" className="form-control form-control-sm" placeholder="e.g. Schedule is full for the week" required
                              value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} />
                          </div>
                          <div className="d-flex gap-2">
                            <button type="submit" className="btn btn-sm btn-danger">Confirm Rejection</button>
                            <button type="button" onClick={() => setRejectId(null)} className="btn btn-sm btn-secondary">Cancel</button>
                          </div>
                        </form>
                      )}

                      {counterId === appt._id && (
                        <form onSubmit={submitCounter} className="mt-3 p-3 border rounded bg-light">
                          <h6>Suggest New Time</h6>
                          <div className="mb-2">
                            <input type="date" className="form-control form-control-sm" min={today} required
                              value={counterForm.date} onChange={(e) => setCounterForm({...counterForm, date: e.target.value})} />
                          </div>
                          <div className="mb-2">
                            <select className="form-select form-select-sm" required value={counterForm.time} onChange={(e) => setCounterForm({...counterForm, time: e.target.value})}>
                              <option value="" disabled>Select a time</option>
                              {timeSlots.map(slot => <option key={slot.value} value={slot.value}>{slot.label}</option>)}
                            </select>
                          </div>
                          <div className="mb-2">
                            <input type="text" className="form-control form-control-sm" placeholder="Reason (e.g. Doctor in surgery)" required
                              value={counterForm.remarks} onChange={(e) => setCounterForm({...counterForm, remarks: e.target.value})} />
                          </div>
                          <div className="d-flex gap-2">
                            <button type="submit" className="btn btn-sm btn-primary">Send Offer</button>
                            <button type="button" onClick={() => setCounterId(null)} className="btn btn-sm btn-secondary">Cancel</button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav className="mt-4">
              <ul className="pagination justify-content-center">
                <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                  <button onClick={() => setCurrentPage(currentPage - 1)} className="page-link">Previous</button>
                </li>
                {[...Array(totalPages)].map((_, i) => (
                  <li key={i + 1} className={`page-item ${currentPage === i + 1 ? 'active' : ''}`}>
                    <button onClick={() => setCurrentPage(i + 1)} className="page-link">{i + 1}</button>
                  </li>
                ))}
                <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                  <button onClick={() => setCurrentPage(currentPage + 1)} className="page-link">Next</button>
                </li>
              </ul>
            </nav>
          )}
        </div>
      )}

      {/* --- USER MANAGEMENT TAB --- */}
      {activeTab === 'users' && (
        <div className="row">
          
          <div className="col-md-4 mb-4">
            <div className="card shadow-sm p-4 h-100">
              <h5 className="mb-3 border-bottom pb-2">Create New Account</h5>
              {userError && <div className="alert alert-danger py-2">{userError}</div>}
              {userSuccess && <div className="alert alert-success py-2">{userSuccess}</div>}
              
              <form onSubmit={handleCreateUser}>
                <div className="mb-3">
                  <label className="form-label small">Account Role</label>
                  <select className="form-select" value={newUser.role} onChange={(e) => setNewUser({...newUser, role: e.target.value})}>
                    <option value="patient">Patient / Customer</option>
                    <option value="admin">Administrator / Staff</option>
                  </select>
                </div>
                <div className="mb-3">
                  <label className="form-label small">Full Name</label>
                  <input type="text" className="form-control" required 
                    value={newUser.name} onChange={(e) => setNewUser({...newUser, name: e.target.value})} />
                </div>
                <div className="mb-3">
                  <label className="form-label small">Email Address</label>
                  <input type="email" className="form-control" required 
                    value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})} />
                </div>
                <div className="mb-4">
                  <label className="form-label small">Temporary Password</label>
                  <input type="password" className="form-control" required 
                    value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} />
                </div>
                <button type="submit" className="btn btn-primary w-100">Create Account</button>
              </form>
            </div>
          </div>

          <div className="col-md-8">
            <div className="card shadow-sm">
              <div className="card-header bg-white border-bottom">
                <h5 className="mb-0 pt-1">Registered Users</h5>
              </div>
              <div className="list-group list-group-flush">
                {users.map(user => (
                  <div key={user._id} className="list-group-item d-flex justify-content-between align-items-center p-3">
                    <div>
                      <h6 className="mb-0 fw-bold">{user.name} <span className={`badge ms-2 ${user.role === 'admin' ? 'bg-dark' : 'bg-info'}`}>{user.role}</span></h6>
                      <small className="text-muted">{user.email}</small>
                    </div>
                    {user.email !== 'marionbusinezz@gmail.com' && (
                      <button 
                        onClick={() => { setItemToDelete({ type: 'user', id: user._id, role: user.role }); setShowDeleteModal(true); }} 
                        className="btn btn-sm btn-outline-danger">
                        Delete
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- NEW: BOOTSTRAP DELETE CONFIRMATION MODAL --- */}
      {showDeleteModal && (
        <>
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }}></div>
          <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1050 }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content shadow">
                <div className="modal-header bg-danger text-white">
                  <h5 className="modal-title">Confirm Deletion</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setShowDeleteModal(false)}></button>
                </div>
                <div className="modal-body">
                  <p className="mb-0">
                    {itemToDelete.type === 'user' && itemToDelete.role === 'admin' 
                      ? "WARNING: You are about to delete an Administrator account. This action cannot be undone. Are you sure you wish to proceed?"
                      : "Are you sure you want to permanently delete this record? This action cannot be undone."}
                  </p>
                </div>
                <div className="modal-footer bg-light">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowDeleteModal(false)}>Cancel</button>
                  <button type="button" className="btn btn-danger px-4" onClick={confirmDeleteAction}>Yes, Delete</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}