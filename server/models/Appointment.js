const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  serviceType: { type: String, required: true },
  requestedDate: { type: String, required: true },
  requestedTime: { type: String, required: true },
  status: {
    type: String,
    enum: [
      'Pending_Admin_Approval', 
      'Admin_Counter_Offer', 
      'Patient_Counter_Offer', // NEW
      'Confirmed', 
      'Cancellation_Requested', // NEW
      'Rejected', 
      'Cancelled'
    ],
    default: 'Pending_Admin_Approval'
  },
  adminSuggestedDate: { type: String, default: null },
  adminSuggestedTime: { type: String, default: null },
  adminRemarks: { type: String, default: '' },
  patientRemarks: { type: String, default: '' } // NEW
}, { timestamps: true });

module.exports = mongoose.model('Appointment', appointmentSchema);