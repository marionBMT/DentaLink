// Single source of truth for rules shared by validators, routes and models.
// These mirror the rules already enforced in the React forms, so the API
// can no longer be bypassed by calling it directly (Postman, curl, etc.).

// 8-72 chars (72 = bcrypt's effective limit), 1 lowercase, 1 uppercase,
// 1 digit and 1 special character.
const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s]).{8,72}$/;
const PASSWORD_MESSAGE =
  "Password must be 8-72 characters and contain an uppercase letter, a lowercase letter, a number, and a special character.";

const USERNAME_REGEX = /^[A-Za-z0-9_.-]{8,13}$/;
const USERNAME_MESSAGE =
  "Username must be 8-13 characters (letters, numbers, underscore, dot or dash only).";

// 11-digit mobile starting with 09, OR a 7-digit landline
const PHONE_REGEX = /^(09\d{9}|\d{7})$/;
const PHONE_MESSAGE =
  "Contact number must be an 11-digit mobile (e.g., 09770493211) or a 7-digit telephone (e.g., 8709768).";

// Used for "admin contact" and dentist contact (email OR phone-like value)
const CONTACT_PHONE_REGEX = /^[0-9\-+]{7,15}$/;

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// 08:00 - 18:00 in 30-minute steps (same slots the dashboards render)
const TIME_SLOTS = (() => {
  const slots = [];
  for (let h = 8; h <= 18; h++) {
    const hh = String(h).padStart(2, "0");
    slots.push(`${hh}:00`);
    if (h !== 18) slots.push(`${hh}:30`);
  }
  return slots;
})();

const STATUS = Object.freeze({
  PENDING: "Pending_Admin_Approval",
  ADMIN_COUNTER: "Admin_Counter_Offer",
  PATIENT_COUNTER: "Patient_Counter_Offer",
  CONFIRMED: "Confirmed",
  CANCELLATION_REQUESTED: "Cancellation_Requested",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
});

// Statuses that mean "the patient is waiting on the admin" (blocks new requests)
const BLOCKING_STATUSES = [
  STATUS.PENDING,
  STATUS.PATIENT_COUNTER,
  STATUS.CANCELLATION_REQUESTED,
];

// Shared by every place that hashes a password (cost 12 ~ 250ms per hash)
const BCRYPT_ROUNDS = 12;

// Loose email check used where a value may be an email OR a phone number
const EMAIL_LIKE_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Case-insensitive comparison for usernames and service names
const COLLATION_CI = Object.freeze({ locale: "en", strength: 2 });

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 30 * 1000; // minimum gap between two codes for one account
const OTP_MAX_ATTEMPTS = 5;
const OTP_ISSUE_WINDOW_MS = 24 * 60 * 60 * 1000;
const OTP_MAX_ISSUES_PER_WINDOW = 10;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

module.exports = {
  PASSWORD_REGEX,
  PASSWORD_MESSAGE,
  USERNAME_REGEX,
  USERNAME_MESSAGE,
  PHONE_REGEX,
  PHONE_MESSAGE,
  CONTACT_PHONE_REGEX,
  EMAIL_LIKE_REGEX,
  COLLATION_CI,
  BCRYPT_ROUNDS,
  OTP_RESEND_MS,
  DATE_REGEX,
  TIME_SLOTS,
  STATUS,
  BLOCKING_STATUSES,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_ISSUE_WINDOW_MS,
  OTP_MAX_ISSUES_PER_WINDOW,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_LOCK_MS,
};