const { body } = require('express-validator');
const {
  emailField,
  usernameField,
  nameField,
  passwordField,
  otpField,
} = require('./common');

const identifierField = body('identifier')
  .isString().withMessage('Username or email is required.')
  .trim()
  .isLength({ min: 1, max: 254 }).withMessage('Username or email is required.');

// Login must not re-apply password complexity rules (old accounts / seed
// admin may predate them) - only check shape and length.
const loginPassword = body('password')
  .isString().withMessage('Password is required.')
  .isLength({ min: 1, max: 128 }).withMessage('Password is required.');

exports.register = [usernameField(), nameField(), emailField(), passwordField('password')];

exports.login = [identifierField, loginPassword];

exports.verifyOtp = [identifierField, otpField()];

exports.forgotPassword = [emailField()];

exports.verifyResetOtp = [emailField(), otpField()];

exports.resetPassword = [emailField(), otpField(), passwordField('newPassword')];
