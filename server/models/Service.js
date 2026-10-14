const mongoose = require("mongoose");

// Schema for the dentists embedded inside a service
const dentistSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  contact: { type: String, required: true, trim: true, maxlength: 254 }, // email or phone number
});

// Schema for the services
const serviceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 100,
    }, // unique prevents duplicate services
    dentists: [dentistSchema], // Dentists assigned to this specific service
  },
  { timestamps: true },
);

module.exports = mongoose.model("Service", serviceSchema);
