const { body, query } = require("express-validator");
const { mongoIdParam, pagingQuery } = require("./common");
const { STATUS, TIME_SLOTS } = require("../utils/constants");
const { isValidCalendarDate, isTodayOrFuture } = require("../utils/dates");

const futureDate = (field, label) =>
  body(field)
    .isString()
    .withMessage(`${label} is required.`)
    .trim()
    .custom(isValidCalendarDate)
    .withMessage(`${label} must be a valid date (YYYY-MM-DD).`)
    .custom(isTodayOrFuture)
    .withMessage(`${label} cannot be in the past.`);

const timeSlot = (field, label) =>
  body(field)
    .isString()
    .withMessage(`${label} is required.`)
    .trim()
    .isIn(TIME_SLOTS)
    .withMessage(
      `${label} must be between 08:00 and 18:00 in 30-minute slots.`,
    );

exports.list = [
  ...pagingQuery,
  query("search")
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage("search is too long."),
  query("status")
    .optional()
    .isIn(Object.values(STATUS))
    .withMessage("Invalid status filter."),
  query("archived")
    .optional()
    .isIn(["true", "false"])
    .withMessage("archived must be true or false."),
];

exports.create = [
  body("serviceType")
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Service is required."),
  body("dentistName")
    .isString()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Dentist is required."),
  futureDate("requestedDate", "Preferred date"),
  timeSlot("requestedTime", "Preferred time"),
];

// Field-level checks for PUT /:id. Which transition is allowed for which role
// is enforced by the state machine in routes/appointments.js.
exports.update = [
  mongoIdParam(),
  body("status")
    .isString()
    .withMessage("Status is required.")
    .isIn(Object.values(STATUS))
    .withMessage("Invalid status."),
  body("adminSuggestedDate")
    .optional({ values: "falsy" })
    .custom((v) => isValidCalendarDate(v) && isTodayOrFuture(v))
    .withMessage(
      "Suggested date must be a valid date that is not in the past.",
    ),
  body("adminSuggestedTime")
    .optional({ values: "falsy" })
    .isIn(TIME_SLOTS)
    .withMessage(
      "Suggested time must be between 08:00 and 18:00 in 30-minute slots.",
    ),
  body("adminRemarks")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Remarks must be at most 500 characters."),
  body("patientRemarks")
    .optional({ values: "falsy" })
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Remarks must be at most 500 characters."),
];
