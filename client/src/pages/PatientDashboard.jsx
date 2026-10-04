import { useState, useEffect } from 'react';
import api from '../api/axiosClient';

export default function PatientDashboard() {
  const [appointments, setAppointments] = useState([]);
  const [serviceType, setServiceType] = useState('General Checkup');
  const [requestedDate, setRequestedDate] = useState('');
  const [requestedTime, setRequestedTime] = useState('');
  const [message, setMessage] = useState({ type: '', text: '' });

  const [actionId, setActionId] = useState(null);
  const [actionType, setActionType] = useState(''); 
  const [patientRemark, setPatientRemark] = useState('');

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

  const loadAppointments = async () => {
    try {
      const res = await api.get('/appointments');
      setAppointments(res.data);
    } catch (err) {
      console.error("Failed to load appointments", err);
    }
  };

  useEffect(() => { loadAppointments(); }, []);

  const handleBook = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });
    try {
      await api.post('/appointments', { serviceType, requestedDate, requestedTime });
      setMessage({ type: 'success', text: 'Appointment requested successfully! Waiting for admin approval.' });
      setRequestedDate('');
      setRequestedTime('');
      loadAppointments();
    } catch (err) {
      setMessage({ type: 'danger', text: err.response?.data?.message || 'Failed to book appointment.' });
    }
  };

  const handleAcceptOffer = async (id, appt) => {
    try {
      await api.put(`/appointments/${id}`, {
        status: 'Confirmed',
        requestedDate: appt.adminSuggestedDate,
        requestedTime: appt.adminSuggestedTime,
        patientRemarks: '' 
      });
      loadAppointments();
    } catch (err) { console.error("Failed to accept", err); }
  };

  const handleDirectCancel = async (id) => {
    try {
      await api.put(`/appointments/${id}`, { status: 'Cancelled', patientRemarks: 'Cancelled by patient.' });
      loadAppointments();
    } catch (err) { console.error("Failed to cancel", err); }
  };

  const submitPatientAction = async (e, id) => {
    e.preventDefault();
    try {
      const newStatus = actionType === 'cancel' ? 'Cancellation_Requested' : 'Patient_Counter_Offer';
      await api.put(`/appointments/${id}`, { status: newStatus, patientRemarks: patientRemark });
      setActionId(null);
      setPatientRemark('');
      loadAppointments();
    } catch (err) { console.error("Failed to submit action", err); }
  };

  const hasPending = appointments.some(appt => 
    ['Pending_Admin_Approval', 'Patient_Counter_Offer', 'Cancellation_Requested'].includes(appt.status)
  );

  return (
    <div className="row mt-4">
      <div className="col-md-5 mb-4">
        <div className="card shadow-sm p-4">
          <h3 className="mb-3">Request Appointment</h3>
          {message.text && <div className={`alert alert-${message.type}`}>{message.text}</div>}
          
          <form onSubmit={handleBook}>
            <div className="mb-3">
              <label className="form-label">Service Required</label>
              <select className="form-select" value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
                <option value="General Checkup">General Checkup</option>
                <option value="Teeth Cleaning">Teeth Cleaning</option>
                <option value="Tooth Extraction">Tooth Extraction</option>
                <option value="Consultation">Consultation</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="form-label">Preferred Date</label>
              {/* min={today} prevents selecting past dates */}
              <input type="date" className="form-control" min={today} value={requestedDate} onChange={(e) => setRequestedDate(e.target.value)} required disabled={hasPending} />
            </div>
            <div className="mb-3">
              <label className="form-label">Preferred Time (8 AM - 6 PM)</label>
              <select className="form-select" value={requestedTime} onChange={(e) => setRequestedTime(e.target.value)} required disabled={hasPending}>
                <option value="" disabled>Select a time</option>
                {timeSlots.map(slot => (
                  <option key={slot.value} value={slot.value}>{slot.label}</option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={hasPending}>
              {hasPending ? 'Action Pending Admin Review' : 'Submit Request'}
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
                  <h5 className="mb-0 text-primary">{appt.serviceType}</h5>
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
                    Date: {appt.adminSuggestedDate} | Time: {appt.adminSuggestedTime}<br />
                    <small className="mb-2 d-block">Remarks: {appt.adminRemarks}</small>
                    
                    {actionId !== appt._id && (
                      <div className="d-flex flex-wrap gap-2 mt-2">
                        <button onClick={() => handleAcceptOffer(appt._id, appt)} className="btn btn-sm btn-success">Accept Time</button>
                        <button onClick={() => { setActionId(appt._id); setActionType('counter'); }} className="btn btn-sm btn-outline-dark">Request Another Option</button>
                        <button onClick={() => { setActionId(appt._id); setActionType('cancel'); }} className="btn btn-sm btn-danger">Request Cancellation</button>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="mb-2 text-muted">
                    Requested for: <strong>{appt.requestedDate}</strong> at <strong>{appt.requestedTime}</strong>
                  </p>
                )}

                {/* Show Patient's Message */}
                {appt.patientRemarks && (
                  <div className="alert alert-info p-2 mt-2 mb-2"><small><strong>My Message:</strong> {appt.patientRemarks}</small></div>
                )}
                
                {/* Show Admin Rejection Reason */}
                {appt.status === 'Rejected' && appt.adminRemarks && (
                  <div className="alert alert-danger p-2 mt-2 mb-2"><small><strong>Rejection Reason:</strong> {appt.adminRemarks}</small></div>
                )}
                {/* Show Admin Counter Offer */}
                {appt.status === 'Admin_Counter_Offer' && (
                  <div className="alert alert-warning p-2 mt-2 mb-2">
                    <small>
                      <strong>Counter Offer:</strong> {appt.adminSuggestedDate} at {appt.adminSuggestedTime}
                    </small>
                  </div>
                )}

                {appt.status === 'Pending_Admin_Approval' && (
                  <button onClick={() => handleDirectCancel(appt._id)} className="btn btn-sm btn-outline-danger mt-2">Cancel Pending Request</button>
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
                    <div className="d-flex gap-2">
                      <button type="submit" className="btn btn-sm btn-primary">Send to Admin</button>
                      <button type="button" onClick={() => { setActionId(null); setPatientRemark(''); }} className="btn btn-sm btn-secondary">Go Back</button>
                    </div>
                  </form>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}