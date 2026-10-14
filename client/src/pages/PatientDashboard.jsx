import { useState, useEffect, useCallback } from 'react';
import api, { errorMessage } from '../api/axiosClient';
import { openCancellationProof } from '../utils/proofs';

export default function PatientDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [availableServices, setAvailableServices] = useState([]);
  const [serviceType, setServiceType] = useState('');
  const [dentistName, setDentistName] = useState('');
  const [requestedDate, setRequestedDate] = useState('');
  const [requestedTime, setRequestedTime] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  const [actionId, setActionId] = useState(null);
  const [actionType, setActionType] = useState(''); 
  const [patientRemark, setPatientRemark] = useState('');

  const [cancelFile, setCancelFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [bookingBusy, setBookingBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState({ id: null, type: '' });
  const [hasPending, setHasPending] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const appointmentsPerPage = 4;

  // Get current date in Manila time for the date picker minimum
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

  // Generate 8:00 AM to 6:00 PM time slots in 30-min intervals
  const generateTimeSlots = () => {
    const slots = [];
    for (let i = 8; i <= 18; i++) {
      const hour24 = i.toString().padStart(2, '0');
      const hour12 = i > 12 ? i - 12 : i;
      const ampm = i >= 12 ? 'PM' : 'AM';
      slots.push({ value: `${hour24}:00`, label: `${hour12}:00 ${ampm}` });
      if (i !== 18) slots.push({ value: `${hour24}:30`, label: `${hour12}:30 ${ampm}` });
    }
    return slots;
  };
  const timeSlots = generateTimeSlots();

  const formatTimeFriendly = (timeString) => {
    if (!timeString) return '';
    const [hour, minute] = timeString.split(':');
    let h = parseInt(hour, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12; 
    return `${timeString} (${h}:${minute} ${ampm})`;
  };

  const loadAppointments = useCallback(async (page = currentPage) => {
    try {
      const res = await api.get('/appointments', {
        params: { page, limit: appointmentsPerPage },
      });
      const pages = Number(res.headers['x-total-pages']) || 1;
      if (page > pages) {
        setCurrentPage(pages);
        return;
      }
      setAppointments(res.data);
      setTotalPages(pages);
      setHasPending(res.headers['x-has-pending'] === 'true');
    } catch (err) {
      setMessage({ type: 'danger', text: errorMessage(err, 'Failed to load appointments.') });
    }
  }, [currentPage]);

  const loadServices = useCallback(async () => {
    try {
      const res = await api.get('/services');
      setAvailableServices(res.data);
      const firstService = res.data[0];
      setServiceType(firstService?.name || '');
      setDentistName(firstService?.dentists?.[0]?.name || '');
    } catch (err) {
      setMessage({ type: 'danger', text: errorMessage(err, 'Failed to load services.') });
    }
  }, []);

  useEffect(() => { loadAppointments(); }, [loadAppointments]);
  useEffect(() => { loadServices(); }, [loadServices]);

  const selectedServiceObj = availableServices.find(s => s.name === serviceType);
  const availableDentists = selectedServiceObj ? selectedServiceObj.dentists : [];

  const handleServiceChange = (e) => {
    const nextServiceName = e.target.value;
    const nextService = availableServices.find((service) => service.name === nextServiceName);
    setServiceType(nextServiceName);
    setDentistName(nextService?.dentists?.[0]?.name || '');
  };

  const handleBook = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    if (!dentistName) {
      setMessage({ type: 'danger', text: 'No dentist available for this service.' });
      return;
    }

    setBookingBusy(true);
    try {
      await api.post('/appointments', { serviceType, dentistName, requestedDate, requestedTime });
      setMessage({ type: 'success', text: 'Appointment requested successfully! Waiting for admin approval.' });
      setRequestedDate('');
      setRequestedTime('');
      setCurrentPage(1);
      loadAppointments();
    } catch (err) {
      setMessage({ type: 'danger', text: errorMessage(err, 'Failed to book appointment.') });
    } finally {
      setBookingBusy(false);
    }
  };

  const handleAcceptOffer = async (id, appt) => {
    setMessage({ type: '', text: '' });
    setActionBusy({ id, type: 'accept' });
    try {
      await api.put(`/appointments/${id}`, {
        status: 'Confirmed',
        requestedDate: appt.adminSuggestedDate,
        requestedTime: appt.adminSuggestedTime,
        patientRemarks: '' 
      });
      loadAppointments();
    } catch (err) {
      setMessage({ type: 'danger', text: errorMessage(err, 'Failed to accept the offered time.') });
    } finally {
      setActionBusy({ id: null, type: '' });
    }
  };

  const handleDirectCancel = async (id) => {
    setMessage({ type: '', text: '' });
    setActionBusy({ id, type: 'cancel' });
    try {
      await api.put(`/appointments/${id}`, { status: 'Cancelled', patientRemarks: 'Cancelled by patient.' });
      loadAppointments();
    } catch (err) {
      setMessage({ type: 'danger', text: errorMessage(err, 'Failed to cancel the pending request.') });
    } finally {
      setActionBusy({ id: null, type: '' });
    }
  };

  const handleFileChange = (e) => {
    setFileError(''); // Clear previous errors
    const file = e.target.files[0];
    
    if (!file) {
      setCancelFile(null);
      return;
    }

    // Check if file is larger than 5MB (5 * 1024 * 1024 bytes)
    if (file.size > 5 * 1024 * 1024) {
      setFileError('File is too large! Maximum allowed size is 5MB.');
      setCancelFile(null);
      e.target.value = null; // Clear the file input
      return;
    }

    setCancelFile(file);
  };

  const submitPatientAction = async (e, id) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    setActionBusy({ id, type: 'submit' });
    try {
      const newStatus = actionType === 'cancel' ? 'Cancellation_Requested' : 'Patient_Counter_Offer';
      
      // If a file is attached, we must send it as FormData
      if (actionType === 'cancel' && cancelFile) {
        const formData = new FormData();
        formData.append('status', newStatus);
        formData.append('patientRemarks', patientRemark);
        formData.append('cancellationProof', cancelFile); // Matches our backend multer name

        await api.put(`/appointments/${id}`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      } else {
        // Standard text-only submission
        await api.put(`/appointments/${id}`, { status: newStatus, patientRemarks: patientRemark });
      }

      setActionId(null);
      setPatientRemark('');
      setCancelFile(null); // Clear the file state
      loadAppointments();
    } catch (err) {
      setMessage({ type: 'danger', text: errorMessage(err, 'Failed to send your request to the admin.') });
    } finally {
      setActionBusy({ id: null, type: '' });
    }
  };

  return (
    <div className="row mt-4">
      <div className="col-md-5 mb-4">
        <div className="card shadow-sm p-4">
          <h3 className="mb-3">Request Appointment</h3>
          {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}
          
          <form onSubmit={handleBook}>
            <div className="mb-3">
              <label className="form-label">Service Required</label>
              <select className="form-select" value={serviceType} onChange={handleServiceChange} disabled={hasPending || bookingBusy}>
                {availableServices.length === 0 && <option value="">Loading services...</option>}
                {availableServices.map(s => (
                  <option key={s._id} value={s.name}>{s.name}</option>
                ))}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Select Dentist</label>
              <select className="form-select" value={dentistName} onChange={(e) => setDentistName(e.target.value)} required disabled={hasPending || bookingBusy || availableDentists.length === 0}>
                {availableDentists.length === 0 ? (
                  <option value="" disabled>No dentists assigned</option>
                ) : (
                  availableDentists.map(d => (
                    <option key={d._id} value={d.name}>{d.name}</option>
                  ))
                )}
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Preferred Date</label>
              {/* min={today} prevents selecting past dates */}
              <input type="date" className="form-control" min={today} value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} required disabled={hasPending || bookingBusy} />
            </div>
            <div className="mb-3">
              <label className="form-label">Preferred Time (8 AM - 6 PM)</label>
              <select className="form-select" value={requestedTime} onChange={(e) => setRequestedTime(e.target.value)} required disabled={hasPending || bookingBusy}>
                <option value="" disabled>Select a time</option>
                {timeSlots.map(slot => (
                  <option key={slot.value} value={slot.value}>{slot.label}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={hasPending || bookingBusy || availableServices.length === 0}>
              {bookingBusy ? 'Submitting...' : hasPending ? 'Action Pending Admin Review' : 'Submit Request'}
            </button>
          </form>
        </div>
      </div>

      <div className="col-md-7">
        <h3 className="mb-3">My Appointments</h3>
        {appointments.length === 0 ? (
          <p className="text-muted">You have no appointments yet.</p>
        ) : (
          <div className="list-group shadow-sm">
            {appointments.map((appt) => (
              <div key={appt._id} className="list-group-item p-3 mb-2 border rounded">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h5 className="mb-0 text-primary">
                    {appt.serviceType} <span className="text-dark fw-normal small">- {appt.dentistName}</span>
                  </h5>
                  <span className={`badge ${
                    appt.status === 'Confirmed' ? 'bg-success' : 
                    appt.status.includes('Counter') ? 'bg-warning text-dark' : 
                    appt.status.includes('Cancel') || appt.status === 'Rejected' ? 'bg-danger' : 'bg-secondary'
                  }`}>
                    {appt.status.replace(/_/g, ' ')}
                  </span>
                </div>
                
                {appt.status === 'Admin_Counter_Offer' ? (
                  <div className="alert alert-warning p-2 mt-2 mb-0">
                    <strong>Admin suggested a new time:</strong><br />
                    Date: {appt.adminSuggestedDate} | Time: {formatTimeFriendly(appt.adminSuggestedTime)}<br />
                    <small className="mb-2 d-block">Remarks: {appt.adminRemarks}</small>
                    
                    {actionId !== appt._id && (
                      <div className="d-flex flex-wrap gap-2 mt-2">
                        <button onClick={() => handleAcceptOffer(appt._id, appt)} className="btn btn-sm btn-success" disabled={actionBusy.id === appt._id}>
                          {actionBusy.id === appt._id && actionBusy.type === 'accept' ? 'Accepting...' : 'Accept Time'}
                        </button>
                        <button onClick={() => { setActionId(appt._id); setActionType('counter'); }} className="btn btn-sm btn-outline-dark" disabled={actionBusy.id === appt._id}>Request Another Option</button>
                        <button onClick={() => { setActionId(appt._id); setActionType('cancel'); }} className="btn btn-sm btn-danger" disabled={actionBusy.id === appt._id}>Request Cancellation</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mb-2 text-muted">
                    Requested for: <strong>{appt.requestedDate}</strong> at <strong>{formatTimeFriendly(appt.requestedTime)}</strong>
                  </p>
                )}

                {/* Show Patient's Message */}
                {appt.patientRemarks && (
                  <div className="alert alert-info p-2 mt-2 mb-2"><small><strong>My Message:</strong> {appt.patientRemarks}</small></div>
                )}

                {/* NEW: Show Patient's Uploaded Proof */}
                {appt.hasCancellationProof && (
                  <div className="mb-2">
                    <button
                      type="button"
                      onClick={() => openCancellationProof(
                        appt._id,
                        (text) => setMessage({ type: 'danger', text }),
                      )}
                      className="btn btn-sm btn-outline-info fw-bold"
                    >
                      View Attached Proof
                    </button>
                  </div>
                )}
                
                {/* Show Admin Rejection Reason */}
                {appt.status === 'Rejected' && appt.adminRemarks && (
                  <div className="alert alert-danger p-2 mt-2 mb-2"><small><strong>Rejection Reason:</strong> {appt.adminRemarks}</small></div>
                )}

                {/* NEW: Show Admin Reason for Keeping Appointment */}
                {appt.status === 'Confirmed' && appt.adminRemarks && (
                  <div className="alert alert-warning p-2 mt-2 mb-2"><small><strong>Admin Note (Appointment Kept):</strong> {appt.adminRemarks}</small></div>
                )}

                {/* Show Admin Counter Offer */}
                {appt.status === 'Admin_Counter_Offer' && (
                  <div className="alert alert-warning p-2 mt-2 mb-2">
                    <small>
                      <strong>Counter Offer:</strong> {appt.adminSuggestedDate} at {formatTimeFriendly(appt.adminSuggestedTime)}
                    </small>
                  </div>
                )}

                {appt.status === 'Pending_Admin_Approval' && (
                  <button onClick={() => handleDirectCancel(appt._id)} className="btn btn-sm btn-outline-danger mt-2" disabled={actionBusy.id === appt._id}>
                    {actionBusy.id === appt._id && actionBusy.type === 'cancel' ? 'Cancelling...' : 'Cancel Pending Request'}
                  </button>
                )}

                {appt.status === 'Confirmed' && actionId !== appt._id && (
                  <button onClick={() => { setActionId(appt._id); setActionType('cancel'); }} className="btn btn-sm btn-outline-danger mt-2">Request Cancellation</button>
                )}

                {actionId === appt._id && (
                  <form onSubmit={(e) => submitPatientAction(e, appt._id)} className="mt-3 p-3 border rounded bg-light">
                    <h6>{actionType === 'cancel' ? 'Reason for Cancellation' : 'Suggest a New Time / Message'}</h6>
                    <div className="mb-2">
                      <input type="text" className="form-control form-control-sm" required
                        placeholder={actionType === 'cancel' ? 'Why do you need to cancel?' : 'E.g., Can we do Friday afternoon?'}
                        value={patientRemark} onChange={(e) => setPatientRemark(e.target.value)} />
                    </div>

                    {actionType === 'cancel' && (
                      <div className="mb-3">
                        <label className="form-label small fw-bold">Upload Proof (Optional, Max 5MB)</label>
                        
                        {/* Display the File Error if it exists */}
                        {fileError && <div className="alert alert-danger py-1 px-2 small mb-2">{fileError}</div>}
                        
                        <div className="d-flex align-items-center gap-2">
                          <input 
                            type="file" 
                            className="form-control form-control-sm" 
                            accept=".jpg,.jpeg,.png,.pdf" 
                            onChange={handleFileChange}
                            id="cancelFileInput"
                          />
                          {/* Display the Remove button if a valid file is selected */}
                          {cancelFile && (
                            <button 
                              type="button" 
                              className="btn btn-sm btn-outline-danger" 
                              onClick={() => {
                                setCancelFile(null);
                                setFileError('');
                                document.getElementById('cancelFileInput').value = null; // Clear input UI
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                        <small className="text-muted" style={{ fontSize: '0.75rem' }}>Images or PDFs accepted.</small>
                      </div>
                    )}

                    <div className="d-flex gap-2">
                      <button type="submit" className="btn btn-sm btn-primary" disabled={actionBusy.id === appt._id}>
                        {actionBusy.id === appt._id && actionBusy.type === 'submit' ? 'Sending...' : 'Send to Admin'}
                      </button>
                      <button type="button" onClick={() => { setActionId(null); setPatientRemark(''); setCancelFile(null); setFileError(''); }} className="btn btn-sm btn-secondary" disabled={actionBusy.id === appt._id}>Go Back</button>
                    </div>
                  </form>
                )}
              </div>
            ))}
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
      </div>
    </div>
  );
}