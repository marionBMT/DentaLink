const { body, param, query } = require("express-validator");
const {
  PASSWORD_REGEX,
  PASSWORD_MESSAGE,
  USERNAME_REGEX,
  USERNAME_MESSAGE,
  CONTACT_PHONE_REGEX,
  EMAIL_LIKE_REGEX,
} = require("../utils/constants");

// isString() on every field is what blocks NoSQL operator injection such as
// { "email": { "$gt": "" } } being passed straight into a Mongo query.

const isEmailOrPhone = (value) =>
  (EMAIL_LIKE_REGEX.test(value) && value.length <= 254) ||
  CONTACT_PHONE_REGEX.test(value);

const mongoIdParam = (name = "id") =>
  param(name).isMongoId().withMessage("Invalid identifier.");

const emailField = (field = "email") =>
  body(field)
    .isString()
    .withMessage("Email is required.")
    .trim()
    .toLowerCase()
    .isLength({ max: 254 })
    .withMessage("Email is too long.")
    .isEmail()
    .withMessage("Please provide a valid email address.");

const usernameField = (field = "username") =>
  body(field)
    .isString()
    .withMessage("Username is required.")
    .trim()
    .matches(USERNAME_REGEX)
    .withMessage(USERNAME_MESSAGE);

const nameField = (field = "name") =>
  body(field)
    .isString()
    .withMessage("Full name is required.")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Full name must be 1-100 characters.");

const passwordField = (field = "password") =>
  body(field)
    .isString()
    .withMessage("Password is required.")
    .matches(PASSWORD_REGEX)
    .withMessage(PASSWORD_MESSAGE);

const otpField = (field = "otp") =>
  body(field)
    .isString()
    .withMessage("OTP is required.")
    .trim()
    .matches(/^\d{6}$/)
    .withMessage("OTP must be a 6-digit code.");

// Archive / restore body shared by users and appointments.
// reason + contact are mandatory only when archiving (not when restoring).
// .if() must come first so the rules after it are skipped when restoring.
const whenArchiving = (_value, { req }) => req.body?.isArchived === true;

const archiveRules = [
  mongoIdParam(),
  body("isArchived")
    .isBoolean({ strict: true })
    .withMessage("isArchived must be true or false."),
  body("reason")
    .if(whenArchiving)
    .isString()
    .withMessage("Reason is required.")
    .trim()
    .isLength({ min: 1, max: 500 })
    .withMessage("Please provide a reason (max 500 characters)."),
  body("contact")
    .if(whenArchiving)
    .isString()
    .withMessage("Admin contact is required.")
    .trim()
    .custom(isEmailOrPhone)
    .withMessage("Please provide a valid email address or phone number."),
];

// Optional server-side pagination: ?page=2&limit=20. When `page` is absent the
// endpoints still return the full list, so existing clients keep working.
// Also guards against ?page=1&page=2 (array) style parameter pollution.
// express-validator checks array elements one by one, so arrays are refused
// explicitly before the integer check.
const notRepeated = (name) => (value) => {
  if (Array.isArray(value)) throw new Error(`${name} may only be given once.`);
  return true;
};

const pagingQuery = [
  query("page")
    .optional()
    .custom(notRepeated("page"))
    .bail()
    .isInt({ min: 1, max: 100000 })
    .withMessage("page must be a positive integer.")
    .toInt(),
  query("limit")
    .optional()
    .custom(notRepeated("limit"))
    .bail()
    .isInt({ min: 1, max: 100 })
    .withMessage("limit must be between 1 and 100.")
    .toInt(),
];

module.exports = {
  isEmailOrPhone,
  mongoIdParam,
  emailField,
  usernameField,
  nameField,
  passwordField,
  otpField,
  archiveRules,
  pagingQuery,
};
