import { useState, useEffect, useCallback } from 'react';
import api, { errorMessage } from '../api/axiosClient';
import ConfirmModal from '../components/ConfirmModal';
import { getCurrentUserId } from '../utils/session';
import {
  validateAccountFields,
  isEmailOrPhone,
  CONTACT_MESSAGE,
} from '../utils/validation';
import ServicesTab from './Services';
import { openCancellationProof } from '../utils/proofs';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('appointments');
  const currentUserId = getCurrentUserId();

  // --- APPOINTMENT STATES ---
  const [appointments, setAppointments] = useState([]);
  const [counterId, setCounterId] = useState(null);
  const [counterForm, setCounterForm] = useState({ date: '', time: '', remarks: '' });
  const [rejectId, setRejectId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [keepId, setKeepId] = useState(null);
  const [keepReason, setKeepReason] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const appointmentsPerPage = 4;

  // --- USER MANAGEMENT STATES ---
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({ username: '', name: '', email: '', password: '', confirmPassword: '', role: 'patient' });
  const [userError, setUserError] = useState('');
  const [userSuccess, setUserSuccess] = useState('');

  // USER SEARCH & PAGINATION STATES
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userCurrentPage, setUserCurrentPage] = useState(1);
  const [totalUserPages, setTotalUserPages] = useState(1);
  const usersPerPage = 7;

  // ARCHIVE LISTS USE THEIR OWN SERVER-SIDE PAGES
  const [archivedUsers, setArchivedUsers] = useState([]);
  const [archivedAppointments, setArchivedAppointments] = useState([]);
  const [archivedUserPage, setArchivedUserPage] = useState(1);
  const [archivedAppointmentPage, setArchivedAppointmentPage] = useState(1);
  const [archivedUserPages, setArchivedUserPages] = useState(1);
  const [archivedAppointmentPages, setArchivedAppointmentPages] = useState(1);
  const archivePageSize = 5;

  // --- DYNAMIC MODAL STATES ---
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [itemToProcess, setItemToProcess] = useState({ type: '', id: '', role: '', action: '' });

  // ARCHIVE FORM STATES
  const [archiveForm, setArchiveForm] = useState({ reason: '', contact: '' });
  const [modalError, setModalError] = useState('');
  const [modalBusy, setModalBusy] = useState(false);

  // --- ACTION ERROR BANNER (server errors for list updates, creates, etc.) ---
  const [actionError, setActionError] = useState('');

  // --- CONFLICT & TIME FORMATTING ---
  const [conflictError, setConflictError] = useState('');

  const formatTimeFriendly = (timeString) => {
    if (!timeString) return '';
    const [hour, minute] = timeString.split(':');
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12; 
    return `${timeString} (${h}:${minute} ${ampm})`;
  };

  const loadAppointments = useCallback(async (page = currentPage, search = searchTerm) => {
    try {
      const res = await api.get('/appointments', {
        params: { page, limit: appointmentsPerPage, archived: false, search: search.trim() || undefined },
      });
      const pages = Number(res.headers['x-total-pages']) || 1;
      if (page > pages) {
        setCurrentPage(pages);
        return;
      }
      setAppointments(res.data);
      setTotalPages(pages);
      setActionError('');
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to load appointments.'));
    }
  }, [currentPage, searchTerm]);

  const loadUsers = useCallback(async (page = userCurrentPage, search = userSearchTerm) => {
    try {
      const res = await api.get('/users', {
        params: { page, limit: usersPerPage, archived: false, search: search.trim() || undefined },
      });
      const pages = Number(res.headers['x-total-pages']) || 1;
      if (page > pages) {
        setUserCurrentPage(pages);
        return;
      }
      setUsers(res.data);
      setTotalUserPages(pages);
      setActionError('');
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to load users.'));
    }
  }, [userCurrentPage, userSearchTerm]);

  const loadArchivedUsers = useCallback(async (page = archivedUserPage) => {
    try {
      const res = await api.get('/users', {
        params: { page, limit: archivePageSize, archived: true },
      });
      const pages = Number(res.headers['x-total-pages']) || 1;
      if (page > pages) {
        setArchivedUserPage(pages);
        return;
      }
      setArchivedUsers(res.data);
      setArchivedUserPages(pages);
      setActionError('');
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to load archived users.'));
    }
  }, [archivedUserPage]);

  const loadArchivedAppointments = useCallback(async (page = archivedAppointmentPage) => {
    try {
      const res = await api.get('/appointments', {
        params: { page, limit: archivePageSize, archived: true },
      });
      const pages = Number(res.headers['x-total-pages']) || 1;
      if (page > pages) {
        setArchivedAppointmentPage(pages);
        return;
      }
      setArchivedAppointments(res.data);
      setArchivedAppointmentPages(pages);
      setActionError('');
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to load archived appointments.'));
    }
  }, [archivedAppointmentPage]);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);
  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { loadArchivedUsers(); }, [loadArchivedUsers]);
  useEffect(() => { loadArchivedAppointments(); }, [loadArchivedAppointments]);

  const handleAction = async (id, status) => {
    try {
      await api.put(`/appointments/${id}`, { status });
      loadAppointments();
      setActionError('');
    } catch (err) {
      if (err.response?.status === 409) {
        setConflictError(errorMessage(err));
      } else {
        setActionError(errorMessage(err, 'Failed to update appointment status.'));
      }
    }
  };

  const unlockLogin = async (user) => {
    setActionError('');
    try {
      await api.post(`/users/${user._id}/unlock-login`);
      setUserSuccess(`Login lock cleared for ${user.name}.`);
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to clear the login lock.'));
    }
  };

  const handleApprove = (appt) => {
    handleAction(appt._id, 'Confirmed');
  };

  const submitReject = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/appointments/${rejectId}`, { status: 'Rejected', adminRemarks: rejectReason });
      setRejectId(null);
      setRejectReason('');
      loadAppointments();
      setActionError('');
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to reject this request.'));
    }
  };

  const submitKeep = async (e, appt) => {
    e.preventDefault();
    try {
      const isFromCounter = appt.adminSuggestedDate && (appt.requestedDate !== appt.adminSuggestedDate || appt.requestedTime !== appt.adminSuggestedTime);
      const revertedStatus = isFromCounter ? 'Admin_Counter_Offer' : 'Confirmed';

      await api.put(`/appointments/${appt._id}`, {
        status: revertedStatus,
        adminRemarks: keepReason // Save the reason they were denied cancellation
      });
      setKeepId(null);
      setKeepReason('');
      loadAppointments();
      setActionError('');
    } catch (err) {
      if (err.response?.status === 409) {
        setConflictError(errorMessage(err));
      } else {
        setActionError(errorMessage(err, 'Failed to keep this appointment.'));
      }
    }
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
      setActionError('');
    } catch (err) {
      setActionError(errorMessage(err, 'Failed to submit counter offer.'));
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setUserError('');
    setUserSuccess('');
    const validationError = validateAccountFields(newUser);
    if (validationError) {
      setUserError(validationError);
      return;
    }

    try {
      await api.post('/users', {
        username: newUser.username.trim(),
        name: newUser.name.trim(),
        email: newUser.email.trim(),
        password: newUser.password,
        role: newUser.role,
      });
      setUserSuccess(`${newUser.role === 'admin' ? 'Admin' : 'Patient'} account created successfully!`);
      setNewUser({ username: '', name: '', email: '', password: '', confirmPassword: '', role: 'patient' });
      loadUsers();
    } catch (err) {
      setUserError(errorMessage(err, 'Failed to create account.'));
    }
  };

  const openConfirm = (item) => {
    setItemToProcess(item);
    setArchiveForm({ reason: '', contact: '' });
    setModalError('');
    setModalBusy(false);
    setShowConfirmModal(true);
  };

  const executeModalAction = async () => {
    const { type, id, action } = itemToProcess;

    if (action === 'archive') {
      if (!archiveForm.reason.trim()) {
        setModalError('Please provide a reason for archiving this record.');
        return;
      }
      if (!isEmailOrPhone(archiveForm.contact)) {
        setModalError(CONTACT_MESSAGE);
        return;
      }
    }

    setModalBusy(true);
    setModalError('');

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
      
      if (type === 'user') {
        loadUsers();
        loadArchivedUsers();
      } else {
        loadAppointments();
        loadArchivedAppointments();
      }

      setShowConfirmModal(false);
      setActionError('');
    } catch (err) {
      setModalError(errorMessage(err, `Failed to ${action} this record.`));
    } finally {
      setModalBusy(false);
    }
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

  return (
    <div className="mt-4 position-relative">
      {actionError && (
        <div className="alert alert-danger alert-dismissible" role="alert">
          {actionError}
          <button type="button" className="btn-close" aria-label="Close" onClick={() => setActionError('')}></button>
        </div>
      )}

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
              value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} />
          </div>
          
          {appointments.length === 0 ? (
            <p className="text-muted">No appointments found.</p>
          ) : (
            <div className="row">
              {appointments.map((appt) => (
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
                            onClick={() => openConfirm({ type: 'appointment', id: appt._id, action: 'archive' })}
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
                      {/* --- NEW: SHOW ADMIN'S COUNTER OFFER MESSAGE --- */}
                      {appt.status === 'Admin_Counter_Offer' && appt.adminRemarks && (
                         <div className="alert alert-warning p-2 py-1 mb-3 text-dark"><small><strong>Your Counter Message:</strong> {appt.adminRemarks}</small></div>
                      )}
                      
                      {/* --- OPTIONAL: SHOW ADMIN'S KEEP APPOINTMENT MESSAGE --- */}
                      {appt.status === 'Confirmed' && appt.adminRemarks && (
                         <div className="alert alert-success p-2 py-1 mb-3"><small><strong>Keep Appointment Note:</strong> {appt.adminRemarks}</small></div>
                      )}

                      {/* --- NEW: VIEW CANCELLATION PROOF --- */}
                      {appt.hasCancellationProof && (
                        <div className="mb-3">
                          <button
                            type="button"
                            onClick={() => openCancellationProof(appt._id, setActionError)}
                            className="btn btn-sm btn-outline-info fw-bold"
                          >
                            📄 View Attached Proof
                          </button>
                        </div>
                      )}

                      {['Pending_Admin_Approval', 'Patient_Counter_Offer'].includes(appt.status) && counterId !== appt._id && rejectId !== appt._id && (
                        <div className="d-flex flex-wrap gap-2">
                          <button onClick={() => handleApprove(appt)} className="btn btn-sm btn-success">Approve</button>
                          <button onClick={() => setCounterId(appt._id)} className="btn btn-sm btn-warning">Counter Offer</button>
                          <button onClick={() => setRejectId(appt._id)} className="btn btn-sm btn-danger">Reject</button>
                        </div>
                      )}

                      {appt.status === 'Cancellation_Requested' && keepId !== appt._id && (
                         <div className="d-flex gap-2 p-2 bg-light border rounded flex-wrap">
                           <span className="me-auto align-self-center small fw-bold text-danger">Approve Cancellation?</span>
                           <button onClick={() => handleAction(appt._id, 'Cancelled')} className="btn btn-sm btn-danger">Confirm Cancel</button>
                           <button onClick={() => setKeepId(appt._id)} className="btn btn-sm btn-secondary">Keep Appointment</button>
                         </div>
                      )}

                      {keepId === appt._id && (
                        <form onSubmit={(e) => submitKeep(e, appt)} className="mt-3 p-3 border rounded bg-light">
                          <h6>Reason for Keeping Appointment</h6>
                          <div className="mb-2">
                            <input type="text" className="form-control form-control-sm" placeholder="e.g. Too late to cancel, clinic policy" required
                              value={keepReason} onChange={(e) => setKeepReason(e.target.value)} />
                          </div>
                          <div className="d-flex gap-2">
                            <button type="submit" className="btn btn-sm btn-secondary">Confirm Keep</button>
                            <button type="button" onClick={() => setKeepId(null)} className="btn btn-sm btn-outline-dark">Cancel</button>
                          </div>
                        </form>
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
                  <input type="text" className="form-control form-control-sm w-50" placeholder="Search name, email, or username..."
                    value={userSearchTerm} onChange={(e) => { setUserSearchTerm(e.target.value); setUserCurrentPage(1); }} />
                </div>
              </div>
              <div className="list-group list-group-flush">
                {users.length === 0 ? (
                    <div className="p-4 text-center text-muted">No users found.</div>
                ) : (
                    users.map(user => (
                    <div key={user._id} className="list-group-item d-flex justify-content-between align-items-center p-3">
                        <div>
                        <h6 className="mb-0 fw-bold">{user.name} <span className={`badge ms-2 ${user.role === 'admin' ? 'bg-dark' : 'bg-info'}`}>{user.role}</span></h6>
                        <small className="text-muted">{user.email}</small>
                        </div>
                        <div className="d-flex gap-2">
                        <button
                            type="button"
                            onClick={() => unlockLogin(user)}
                            className="btn btn-sm btn-outline-secondary">
                            Unlock Login
                        </button>
                        {user._id !== currentUserId && (
                        <button
                            onClick={() => openConfirm({ type: 'user', id: user._id, role: user.role, action: 'archive' })}
                            className="btn btn-sm btn-outline-warning">
                            Archive
                        </button>
                        )}
                        </div>
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
                        <button onClick={() => openConfirm({ type: 'user', id: user._id, action: 'restore' })} className="btn btn-sm btn-success">Restore</button>
                        <button onClick={() => openConfirm({ type: 'user', id: user._id, action: 'delete' })} className="btn btn-sm btn-danger">Delete</button>
                    </div>
                  </div>
              ))}
            </div>
            {archivedUserPages > 1 && (
              <nav className="mt-3">
                <ul className="pagination pagination-sm justify-content-center">
                  <li className={`page-item ${archivedUserPage === 1 ? 'disabled' : ''}`}>
                    <button className="page-link" onClick={() => setArchivedUserPage(archivedUserPage - 1)}>Previous</button>
                  </li>
                  {[...Array(archivedUserPages)].map((_, i) => (
                    <li key={i + 1} className={`page-item ${archivedUserPage === i + 1 ? 'active' : ''}`}>
                      <button className="page-link" onClick={() => setArchivedUserPage(i + 1)}>{i + 1}</button>
                    </li>
                  ))}
                  <li className={`page-item ${archivedUserPage === archivedUserPages ? 'disabled' : ''}`}>
                    <button className="page-link" onClick={() => setArchivedUserPage(archivedUserPage + 1)}>Next</button>
                  </li>
                </ul>
              </nav>
            )}
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
                        <button onClick={() => openConfirm({ type: 'appointment', id: appt._id, action: 'restore' })} className="btn btn-sm btn-success">Restore</button>
                        <button onClick={() => openConfirm({ type: 'appointment', id: appt._id, action: 'delete' })} className="btn btn-sm btn-danger">Delete</button>
                    </div>
                  </div>
              ))}
            </div>
            {archivedAppointmentPages > 1 && (
              <nav className="mt-3">
                <ul className="pagination pagination-sm justify-content-center">
                  <li className={`page-item ${archivedAppointmentPage === 1 ? 'disabled' : ''}`}>
                    <button className="page-link" onClick={() => setArchivedAppointmentPage(archivedAppointmentPage - 1)}>Previous</button>
                  </li>
                  {[...Array(archivedAppointmentPages)].map((_, i) => (
                    <li key={i + 1} className={`page-item ${archivedAppointmentPage === i + 1 ? 'active' : ''}`}>
                      <button className="page-link" onClick={() => setArchivedAppointmentPage(i + 1)}>{i + 1}</button>
                    </li>
                  ))}
                  <li className={`page-item ${archivedAppointmentPage === archivedAppointmentPages ? 'disabled' : ''}`}>
                    <button className="page-link" onClick={() => setArchivedAppointmentPage(archivedAppointmentPage + 1)}>Next</button>
                  </li>
                </ul>
              </nav>
            )}
          </div>
        </div>
      )}

      {/* --- SERVICES TAB --- */}
      {activeTab === 'services' && (
        <ServicesTab />
      )}

      {/* --- DYNAMIC ACTION MODAL --- */}
      {showConfirmModal && (
        <ConfirmModal
          title={itemToProcess.action === 'delete' ? 'Confirm Permanent Deletion' : itemToProcess.action === 'archive' ? 'Confirm Archive' : 'Confirm Restore'}
          variant={itemToProcess.action === 'delete' ? 'danger' : itemToProcess.action === 'archive' ? 'warning' : 'success'}
          confirmLabel={itemToProcess.action === 'delete' ? 'Delete permanently' : itemToProcess.action === 'archive' ? 'Archive' : 'Restore'}
          requireText={itemToProcess.action === 'delete' ? 'DELETE' : undefined}
          busy={modalBusy}
          error={modalError}
          onConfirm={executeModalAction}
          onCancel={() => setShowConfirmModal(false)}
        >
          <p className="mb-3">
            {itemToProcess.action === 'delete'
              ? 'This permanently deletes the archived record and cannot be undone.'
              : itemToProcess.action === 'archive'
                ? 'This moves the record to the archives and hides it from active lists.'
                : 'This restores the record to the active list.'}
          </p>

          {itemToProcess.action === 'archive' && (
            <div className="bg-light p-3 border rounded">
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
        </ConfirmModal>
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