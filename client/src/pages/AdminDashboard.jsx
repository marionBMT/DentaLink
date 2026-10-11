import { useState, useEffect } from 'react';
import api from '../api/axiosClient';
import ServicesTab from './Services';

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
  const [newUser, setNewUser] = useState({ username: '', name: '', email: '', password: '', confirmPassword: '', role: 'patient' });
  const [userError, setUserError] = useState('');
  const [userSuccess, setUserSuccess] = useState('');
  
  // USER SEARCH & PAGINATION STATES
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userCurrentPage, setUserCurrentPage] = useState(1);
  const usersPerPage = 7;

  // --- DYNAMIC MODAL STATES ---
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [itemToProcess, setItemToProcess] = useState({ type: '', id: '', role: '', action: '' });
  
  // ARCHIVE FORM STATES
  const [archiveForm, setArchiveForm] = useState({ reason: '', contact: '' });
  const [archiveError, setArchiveError] = useState('');

  // --- NEW: CONFLICT & TIME FORMATTING ---
  const [conflictError, setConflictError] = useState('');

  const formatTimeFriendly = (timeString) => {
    if (!timeString) return '';
    const [hour, minute] = timeString.split(':');
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12; 
    return `${timeString} (${h}:${minute} ${ampm})`;
  };

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
    loadAppointments();
    loadUsers();
  }, []);

  useEffect(() => { setCurrentPage(1); }, [searchTerm]);
  useEffect(() => { setUserCurrentPage(1); }, [userSearchTerm]);

  const handleAction = async (id, status) => {
    try {
      await api.put(`/appointments/${id}`, { status });
      loadAppointments();
    } catch (err) { console.error("Failed to update status", err); }
  };

  const handleApprove = (appt) => {
    // Check if the doctor already has a confirmed appointment at this exact date & time
    const hasConflict = appointments.some(existing => 
      existing._id !== appt._id &&
      existing.status === 'Confirmed' &&
      !existing.isArchived &&
      existing.dentistName === appt.dentistName &&
      existing.requestedDate === appt.requestedDate &&
      existing.requestedTime === appt.requestedTime
    );

    if (hasConflict) {
      setConflictError(`Schedule Conflict: ${appt.dentistName} is already booked on ${appt.requestedDate} at ${formatTimeFriendly(appt.requestedTime)}.`);
      return;
    }
    
    handleAction(appt._id, 'Confirmed');
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

  const validateForm = () => {
    if (newUser.username.length < 8 || newUser.username.length > 13) {
      return "Username must be between 8 and 13 characters.";
    }
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+])[A-Za-z\d!@#$\%^&*()_+]{8,}$/;
    if (!passwordRegex.test(newUser.password)) {
      return "Password must be at least 8 characters long, contain an uppercase letter, a lowercase letter, a number, and a special character.";
    }
    if (newUser.password !== newUser.confirmPassword) {
      return "Passwords do not match.";
    }
    return null;
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserError('');
    setUserSuccess('');

    const validationError = validateForm();
    if (validationError) {
      setUserError(validationError);
      return;
    }

    try {
      await api.post('/users', newUser);
      setUserSuccess(`${newUser.role === 'admin' ? 'Admin' : 'Patient'} account created!`);
      setNewUser({ username: '', name: '', email: '', password: '', confirmPassword: '', role: 'patient' });
      loadUsers();
    } catch (err) {
      setUserError(err.response?.data?.message || 'Failed to create account');
    }
  };

  const executeModalAction = async () => {
    const { type, id, action } = itemToProcess;
    
    if (action === 'archive') {
      if (!archiveForm.reason.trim()) {
        setArchiveError("Please provide a reason for archiving this record.");
        return;
      }
      const contactRegex = /^([a-zA-Z0-9_\.\-]+@[a-zA-Z0-9\-]+\.[a-zA-Z0-9\-\.]+|^[0-9\-\+]{9,15})$/;
      if (!contactRegex.test(archiveForm.contact.trim())) {
        setArchiveError("Please provide a valid email address or phone number.");
        return;
      }
    }

    try {
      if (action === 'delete') {
        await api.delete(`/${type}s/${id}`);
      } else if (action === 'archive' || action === 'restore') {
        const isArchived = action === 'archive';
        const payload = { isArchived };
        
        if (isArchived) {
          payload.reason = archiveForm.reason;
          payload.contact = archiveForm.contact;
        }
        
        await api.put(`/${type}s/${id}/archive`, payload);
      }
      
      if (type === 'user') loadUsers();
      if (type === 'appointment') loadAppointments();
      
    } catch (err) { console.error(`Failed to ${action}`, err); }
    setShowConfirmModal(false);
  };
  
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

  const activeAppointments = appointments.filter(appt => !appt.isArchived);
  const archivedAppointments = appointments.filter(appt => appt.isArchived);

  const filteredAppointments = activeAppointments.filter(appt => {
    const search = searchTerm.toLowerCase();
    return (appt.patient?.name?.toLowerCase() || '').includes(search) || 
           (appt.patient?.email?.toLowerCase() || '').includes(search) || 
           (appt.serviceType?.toLowerCase() || '').includes(search) ||
           (appt.dentistName?.toLowerCase() || '').includes(search); // NEW: Search Dentist
  });

  const indexOfLastAppt = currentPage * appointmentsPerPage;
  const indexOfFirstAppt = indexOfLastAppt - appointmentsPerPage;
  const currentAppointments = filteredAppointments.slice(indexOfFirstAppt, indexOfLastAppt);
  const totalPages = Math.ceil(filteredAppointments.length / appointmentsPerPage);

  const activeUsers = users.filter(user => !user.isArchived);
  const archivedUsers = users.filter(user => user.isArchived);

  const filteredUsers = activeUsers.filter(user => {
    const search = userSearchTerm.toLowerCase();
    return (user.name?.toLowerCase() || '').includes(search) || 
           (user.email?.toLowerCase() || '').includes(search) || 
           (user.role?.toLowerCase() || '').includes(search);
  });

  const indexOfLastUser = userCurrentPage * usersPerPage;
  const indexOfFirstUser = indexOfLastUser - usersPerPage;
  const currentUsers = filteredUsers.slice(indexOfFirstUser, indexOfLastUser);
  const totalUserPages = Math.ceil(filteredUsers.length / usersPerPage);

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
        <li className="nav-item">
          <button className={`nav-link fw-bold ${activeTab === 'archives' ? 'active text-danger' : 'text-secondary'}`} 
                  onClick={() => setActiveTab('archives')}>
            Archives
          </button>
        </li>
        <li className="nav-item">
          <button className={`nav-link fw-bold ${activeTab === 'services' ? 'active text-primary' : 'text-secondary'}`} 
                  onClick={() => setActiveTab('services')}>
            Services
          </button>
        </li>
      </ul>

      {/* --- APPOINTMENTS TAB --- */}
      {activeTab === 'appointments' && (
        <div>
          <div className="mb-4">
            <input type="text" className="form-control shadow-sm" placeholder="Search appointments or dentists..." 
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
                        <h5 className="card-title text-primary m-0">
                          {appt.serviceType} <span className="text-dark fw-normal small">- {appt.dentistName || 'No Dentist Assigned'}</span>
                        </h5>
                        <div className="d-flex align-items-center gap-2">
                          {/* Restored rich dynamic badge colors */}
                          <span className={`badge ${
                            appt.status === 'Confirmed' ? 'bg-success' : 
                            appt.status.includes('Counter') ? 'bg-warning text-dark' : 
                            ['Rejected', 'Cancelled'].includes(appt.status) ? 'bg-danger' : 
                            appt.status === 'Cancellation_Requested' ? 'bg-danger' : 'bg-secondary'
                          }`}>
                            {appt.status.replace(/_/g, ' ')}
                          </span>
                          <button 
                            onClick={() => { 
                              setItemToProcess({ type: 'appointment', id: appt._id, action: 'archive' }); 
                              setArchiveForm({ reason: '', contact: '' });
                              setArchiveError('');
                              setShowConfirmModal(true); 
                            }} 
                            className="btn btn-sm btn-outline-warning px-2 py-0" title="Archive Record">Archive</button>
                        </div>
                      </div>
                      
                      <p className="mb-1"><strong>Patient:</strong> {appt.patient?.name} <span className="text-muted">({appt.patient?.email})</span></p>
                      <p className="mb-2"><strong>Requested Time:</strong> {appt.requestedDate} at {formatTimeFriendly(appt.requestedTime)}</p>

                      {/* --- RESTORED CONTROLS AND ALERTS --- */}
                      {appt.patientRemarks && (
                         <div className="alert alert-info p-2 py-1 mb-3"><small><strong>Patient Message:</strong> {appt.patientRemarks}</small></div>
                      )}
                      {appt.status === 'Rejected' && appt.adminRemarks && (
                         <div className="alert alert-danger p-2 py-1 mb-3"><small><strong>Rejection Reason:</strong> {appt.adminRemarks}</small></div>
                      )}

                      {['Pending_Admin_Approval', 'Patient_Counter_Offer'].includes(appt.status) && counterId !== appt._id && rejectId !== appt._id && (
                        <div className="d-flex flex-wrap gap-2">
                          <button onClick={() => handleApprove(appt)} className="btn btn-sm btn-success">Approve</button>
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
                  <label className="form-label small">Username</label>
                  <input type="text" className="form-control" required value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} />
                </div>
                <div className="mb-3">
                  <label className="form-label small">Full Name</label>
                  <input type="text" className="form-control" required value={newUser.name} onChange={(e) => setNewUser({...newUser, name: e.target.value})} />
                </div>
                <div className="mb-3">
                  <label className="form-label small">Email Address</label>
                  <input type="email" className="form-control" required value={newUser.email} onChange={(e) => setNewUser({...newUser, email: e.target.value})} />
                </div>
                <div className="mb-3">
                  <label className="form-label small">Password</label>
                  <input type="password" className="form-control" required value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} />
                </div>
                <div className="mb-4">
                  <label className="form-label small">Confirm Password</label>
                  <input type="password" className="form-control" required value={newUser.confirmPassword} onChange={(e) => setNewUser({...newUser, confirmPassword: e.target.value})} />
                </div>
                <button type="submit" className="btn btn-primary w-100">Create Account</button>
              </form>
            </div>
          </div>

          <div className="col-md-8">
            <div className="card shadow-sm">
              <div className="card-header bg-white border-bottom pb-0">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="mb-0">Registered Users</h5>
                  <input type="text" className="form-control form-control-sm w-50" placeholder="Search name, email, or role..." 
                    value={userSearchTerm} onChange={(e) => setUserSearchTerm(e.target.value)} />
                </div>
              </div>
              <div className="list-group list-group-flush">
                {currentUsers.length === 0 ? (
                    <div className="p-4 text-center text-muted">No users found.</div>
                ) : (
                    currentUsers.map(user => (
                    <div key={user._id} className="list-group-item d-flex justify-content-between align-items-center p-3">
                        <div>
                        <h6 className="mb-0 fw-bold">{user.name} <span className={`badge ms-2 ${user.role === 'admin' ? 'bg-dark' : 'bg-info'}`}>{user.role}</span></h6>
                        <small className="text-muted">{user.email}</small>
                        </div>
                        {user.email !== 'marionbusinezz@gmail.com' && (
                        <button 
                            onClick={() => { 
                              setItemToProcess({ type: 'user', id: user._id, role: user.role, action: 'archive' }); 
                              setArchiveForm({ reason: '', contact: '' });
                              setArchiveError('');
                              setShowConfirmModal(true); 
                            }} 
                            className="btn btn-sm btn-outline-warning">
                            Archive
                        </button>
                        )}
                    </div>
                    ))
                )}
              </div>
            </div>

            {totalUserPages > 1 && (
              <nav className="mt-4">
                <ul className="pagination justify-content-center">
                  <li className={`page-item ${userCurrentPage === 1 ? 'disabled' : ''}`}>
                    <button onClick={() => setUserCurrentPage(userCurrentPage - 1)} className="page-link">Previous</button>
                  </li>
                  {[...Array(totalUserPages)].map((_, i) => (
                    <li key={i + 1} className={`page-item ${userCurrentPage === i + 1 ? 'active' : ''}`}>
                      <button onClick={() => setUserCurrentPage(i + 1)} className="page-link">{i + 1}</button>
                    </li>
                  ))}
                  <li className={`page-item ${userCurrentPage === totalUserPages ? 'disabled' : ''}`}>
                    <button onClick={() => setUserCurrentPage(userCurrentPage + 1)} className="page-link">Next</button>
                  </li>
                </ul>
              </nav>
            )}
          </div>
        </div>
      )}

      {/* --- ARCHIVES TAB --- */}
      {activeTab === 'archives' && (
        <div className="row">
          <div className="col-md-6 mb-4">
            <h5 className="text-danger border-bottom pb-2">Archived Users</h5>
            <div className="list-group shadow-sm">
              {archivedUsers.length === 0 ? <div className="p-3 text-muted">No archived users.</div> : 
                archivedUsers.map(user => (
                  <div key={user._id} className="list-group-item d-flex justify-content-between align-items-center p-3 bg-light">
                    <div>
                      <h6 className="mb-0 text-muted text-decoration-line-through">{user.name}</h6>
                      <small className="text-muted">{user.email}</small>
                    </div>
                    <div className="d-flex gap-2">
                        <button onClick={() => { setItemToProcess({ type: 'user', id: user._id, action: 'restore' }); setShowConfirmModal(true); }} className="btn btn-sm btn-success">Restore</button>
                        <button onClick={() => { setItemToProcess({ type: 'user', id: user._id, action: 'delete' }); setShowConfirmModal(true); }} className="btn btn-sm btn-danger">Delete</button>
                    </div>
                  </div>
              ))}
            </div>
          </div>

          <div className="col-md-6 mb-4">
            <h5 className="text-danger border-bottom pb-2">Archived Appointments</h5>
            <div className="list-group shadow-sm">
              {archivedAppointments.length === 0 ? <div className="p-3 text-muted">No archived appointments.</div> : 
                archivedAppointments.map(appt => (
                  <div key={appt._id} className="list-group-item d-flex justify-content-between align-items-center p-3 bg-light">
                    <div>
                      <h6 className="mb-0 text-muted text-decoration-line-through">{appt.serviceType} - {appt.dentistName}</h6>
                      <small className="text-muted">{appt.patient?.name} - {appt.requestedDate} at {formatTimeFriendly(appt.requestedTime)}</small>
                    </div>
                    <div className="d-flex gap-2">
                        <button onClick={() => { setItemToProcess({ type: 'appointment', id: appt._id, action: 'restore' }); setShowConfirmModal(true); }} className="btn btn-sm btn-success">Restore</button>
                        <button onClick={() => { setItemToProcess({ type: 'appointment', id: appt._id, action: 'delete' }); setShowConfirmModal(true); }} className="btn btn-sm btn-danger">Delete</button>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- SERVICES TAB --- */}
      {activeTab === 'services' && (
        <ServicesTab />
      )}

      {/* --- DYNAMIC ACTION MODAL --- */}
      {showConfirmModal && (
        <>
          <div className="modal-backdrop fade show" style={{ zIndex: 1040 }}></div>
          <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1050 }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content shadow">
                <div className={`modal-header text-white ${itemToProcess.action === 'delete' ? 'bg-danger' : itemToProcess.action === 'archive' ? 'bg-warning text-dark' : 'bg-success'}`}>
                  <h5 className="modal-title">
                    {itemToProcess.action === 'delete' ? 'Confirm Permanent Deletion' : itemToProcess.action === 'archive' ? 'Confirm Archive' : 'Confirm Restore'}
                  </h5>
                  <button type="button" className="btn-close" onClick={() => setShowConfirmModal(false)}></button>
                </div>
                <div className="modal-body">
                  <p className="mb-3">
                    {itemToProcess.action === 'delete' 
                      ? "WARNING: You are about to permanently delete this record from the database. This action cannot be undone. Are you sure?"
                      : itemToProcess.action === 'archive'
                      ? "Are you sure you want to move this record to the Archives? It will be hidden from the active lists."
                      : "Are you sure you want to restore this record back to the active list?"}
                  </p>
                  
                  {itemToProcess.action === 'archive' && (
                    <div className="bg-light p-3 border rounded">
                      {archiveError && <div className="alert alert-danger py-1 px-2 small">{archiveError}</div>}
                      <div className="mb-2">
                        <label className="form-label small fw-bold">Reason for Archiving <span className="text-danger">*</span></label>
                        <textarea 
                          className="form-control form-control-sm" 
                          rows="2" 
                          placeholder="Provide a clear reason..."
                          value={archiveForm.reason}
                          onChange={(e) => setArchiveForm({...archiveForm, reason: e.target.value})}
                        ></textarea>
                      </div>
                      <div>
                        <label className="form-label small fw-bold">Admin Contact (Email or Number) <span className="text-danger">*</span></label>
                        <input 
                          type="text" 
                          className="form-control form-control-sm" 
                          placeholder="e.g. admin@dentalink.com or 09123456789"
                          value={archiveForm.contact}
                          onChange={(e) => setArchiveForm({...archiveForm, contact: e.target.value})}
                        />
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="modal-footer bg-light">
                  <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmModal(false)}>Cancel</button>
                  <button type="button" className={`btn px-4 ${itemToProcess.action === 'delete' ? 'btn-danger' : itemToProcess.action === 'archive' ? 'btn-warning' : 'btn-success'}`} onClick={executeModalAction}>
                    {itemToProcess.action === 'delete' ? 'Yes, Delete' : itemToProcess.action === 'archive' ? 'Yes, Archive' : 'Yes, Restore'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* --- SCHEDULE CONFLICT MODAL --- */}
      {conflictError && (
        <>
          <div className="modal-backdrop fade show" style={{ zIndex: 1060 }}></div>
          <div className="modal fade show d-block" tabIndex="-1" style={{ zIndex: 1070 }}>
            <div className="modal-dialog modal-dialog-centered">
              <div className="modal-content shadow border-danger">
                <div className="modal-header bg-danger text-white">
                  <h5 className="modal-title">Schedule Conflict Detected</h5>
                  <button type="button" className="btn-close btn-close-white" onClick={() => setConflictError('')}></button>
                </div>
                <div className="modal-body text-center py-4">
                  <div className="mb-3 text-danger" style={{ fontSize: '3rem' }}>⚠️</div>
                  <p className="mb-0 fs-5">{conflictError}</p>
                </div>
                <div className="modal-footer bg-light justify-content-center">
                  <button type="button" className="btn btn-secondary px-4" onClick={() => setConflictError('')}>Understood</button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

    </div>
  );
}