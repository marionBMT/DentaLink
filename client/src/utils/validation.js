// These rules mirror server/utils/constants.js. Keep the two in sync: the
// server is the real gatekeeper, the client only gives faster feedback.

// 8-72 chars, 1 lowercase, 1 uppercase, 1 digit, 1 special character
export const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s]).{8,72}$/;
export const PASSWORD_MESSAGE =
  'Password must be 8-72 characters and contain an uppercase letter, a lowercase letter, a number, and a special character.';

export const USERNAME_REGEX = /^[A-Za-z0-9_.-]{8,13}$/;
export const USERNAME_MESSAGE =
  'Username must be 8-13 characters (letters, numbers, underscore, dot or dash only).';

// 11-digit mobile starting with 09, OR a 7-digit landline
export const PHONE_REGEX = /^(09\d{9}|\d{7})$/;
export const PHONE_MESSAGE =
  'Contact number must be an 11-digit mobile (e.g., 09770493211) or a 7-digit telephone (e.g., 8709768).';

// Email OR phone-like value (dentist contact, admin contact on archive notices)
const EMAIL_LIKE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_LIKE = /^[0-9\-+]{7,15}$/;
export const isEmailOrPhone = (value) => {
  const v = String(value ?? '').trim();
  return EMAIL_LIKE.test(v) || PHONE_LIKE.test(v);
};
export const CONTACT_MESSAGE = 'Please provide a valid email address or phone number.';

// Returns an error string, or null when the account fields are valid
export function validateAccountFields({ username, password, confirmPassword }) {
  if (!USERNAME_REGEX.test(username)) return USERNAME_MESSAGE;
  if (!PASSWORD_REGEX.test(password)) return PASSWORD_MESSAGE;
  if (password !== confirmPassword) return 'Passwords do not match.';
  return null;
}
