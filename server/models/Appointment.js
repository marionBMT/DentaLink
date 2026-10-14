const mongoose = require("mongoose");
const { STATUS, DATE_REGEX, TIME_SLOTS } = require("../utils/constants");

const appointmentSchema = new mongoose.Schema(
  {
    patient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    serviceType: { type: String, required: true, trim: true, maxlength: 100 },
    // Not required at schema level: appointments created before dentists were
    // introduced have none and must stay editable. New bookings always supply
    // one (see validators/appointmentValidators.js and the service lookup).
    dentistName: { type: String, default: "", trim: true, maxlength: 100 },
    requestedDate: { type: String, required: true, match: DATE_REGEX },
    requestedTime: { type: String, required: true, enum: TIME_SLOTS },
    status: {
      type: String,
      enum: Object.values(STATUS),
      default: STATUS.PENDING,
    },
    adminSuggestedDate: { type: String, default: null, match: DATE_REGEX },
    adminSuggestedTime: {
      type: String,
      default: null,
      enum: [...TIME_SLOTS, null],
    },
    adminRemarks: { type: String, default: "", trim: true, maxlength: 500 },
    patientRemarks: { type: String, default: "", trim: true, maxlength: 500 },
    cancellationProofUrl: { type: String, default: "" },
    // Needed to delete the file from Cloudinary when the appointment is removed
    cancellationProofPublicId: { type: String, default: "" },
    cancellationProofFormat: { type: String, default: "" },
    cancellationProofDeliveryType: { type: String, default: "" },
    cancellationProofResourceType: {
      type: String,
      enum: ["", "image", "raw"],
      default: "",
    },
    isArchived: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// Patient dashboard + the "does this patient already have a pending request" check
appointmentSchema.index({ patient: 1, isArchived: 1, createdAt: -1 });

// Admin list
appointmentSchema.index({ createdAt: -1 });

// Service integrity checks (live appointments per service / dentist)
appointmentSchema.index({ serviceType: 1, dentistName: 1, status: 1 });

// DOUBLE-BOOKING GUARD, enforced by the database itself.
// The route handlers check first (for a friendly message), but two requests
// racing each other can both pass that check. This partial unique index makes
// the second write fail atomically (E11000 -> HTTP 409).
appointmentSchema.index(
  { dentistName: 1, requestedDate: 1, requestedTime: 1 },
  {
    unique: true,
    name: "one_confirmed_per_dentist_slot",
    partialFilterExpression: { status: STATUS.CONFIRMED, isArchived: false },
  },
);

// DOUBLE-CLICK GUARD: the same patient cannot have two identical pending
// requests (a double-clicked or retried "Submit" racing past the route's
// "already has a pending request" check).
appointmentSchema.index(
  { patient: 1, dentistName: 1, requestedDate: 1, requestedTime: 1 },
  {
    unique: true,
    name: "no_duplicate_pending_request",
    partialFilterExpression: { status: STATUS.PENDING, isArchived: false },
  },
);

// Atomic business rule: one unresolved request waiting on an admin per patient.
appointmentSchema.index(
  { patient: 1 },
  {
    unique: true,
    name: "one_blocking_request_per_patient",
    partialFilterExpression: {
      status: {
        $in: [
          STATUS.PENDING,
          STATUS.PATIENT_COUNTER,
          STATUS.CANCELLATION_REQUESTED,
        ],
      },
      isArchived: false,
    },
  },
);

module.exports = mongoose.model("Appointment", appointmentSchema);
