const mongoose = require('mongoose');

// Schema for the dentists embedded inside a service
const dentistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  contact: { type: String, required: true } // Will hold either an email or phone number
});

// Schema for the services
const serviceSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true }, // unique prevents duplicate services
  dentists: [dentistSchema] // Array of dentists assigned to this specific service
}, { timestamps: true });

module.exports = mongoose.model('Service', serviceSchema);