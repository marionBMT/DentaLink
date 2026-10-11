const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true,
    minlength: 8,
    maxlength: 13
  },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'patient'], default: 'patient' },
  contactNumber: { type: String, default: '' },
  address: { type: String, default: '' },
  otp: { type: String, default: null },
  otpExpires: { type: Date, default: null },
  isArchived: { type: Boolean, default: false } // NEW: Archive flag
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);