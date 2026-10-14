const { body, query } = require("express-validator");
const {
  mongoIdParam,
  emailField,
  usernameField,
  nameField,
  passwordField,
  archiveRules,
  pagingQuery,
} = require("./common");
const { PHONE_REGEX, PHONE_MESSAGE } = require("../utils/constants");

exports.adminCreateUser = [
  usernameField(),
  nameField(),
  emailField(),
  passwordField("password"),
  body("role")
    .optional()
    .isIn(["admin", "patient"])
    .withMessage("Role must be admin or patient."),
];

exports.list = [
  ...pagingQuery,
  query("search")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage("search is too long."),
  query("archived")
    .optional()
    .isIn(["true", "false"])
    .withMessage("archived must be true or false."),
  query("role")
    .optional()
    .isIn(["admin", "patient"])
    .withMessage("role must be admin or patient."),
];

exports.updateProfile = [
  nameField(),
  body("contactNumber")
    .optional({ values: "falsy" })
    .isString()
    .withMessage(PHONE_MESSAGE)
    .trim()
    .matches(PHONE_REGEX)
    .withMessage(PHONE_MESSAGE),
  body("address")
    .optional({ values: "falsy" })
    .isString()
    .withMessage("Address must be text.")
    .trim()
    .isLength({ max: 300 })
    .withMessage("Address must be at most 300 characters."),
];

exports.changePassword = [
  body("currentPassword")
    .isString()
    .notEmpty()
    .withMessage("Current password is required."),
  passwordField("newPassword"),
];

// "Type your username to confirm" + password re-entry for self-deletion
exports.deleteOwnAccount = [
  body("password").isString().notEmpty().withMessage("Password is required."),
  body("confirmUsername")
    .isString()
    .notEmpty()
    .withMessage("Please type your username to confirm."),
];

exports.archive = archiveRules;

exports.idParam = [mongoIdParam()];
