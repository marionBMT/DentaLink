const { body } = require("express-validator");
const { mongoIdParam, isEmailOrPhone } = require("./common");

const serviceName = (required) => {
  const chain = body("name");
  if (!required) chain.optional();
  return chain
    .isString()
    .withMessage("Service name is required.")
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage("Service name must be 1-100 characters.");
};

const dentists = body("dentists")
  .optional()
  .isArray({ max: 50 })
  .withMessage("Dentists must be a list (max 50).");

const dentistName = body("dentists.*.name")
  .isString()
  .withMessage("Dentist name is required.")
  .trim()
  .isLength({ min: 1, max: 100 })
  .withMessage("Dentist name must be 1-100 characters.");

const dentistContact = body("dentists.*.contact")
  .isString()
  .withMessage("Dentist contact is required.")
  .trim()
  .custom(isEmailOrPhone)
  .withMessage("Dentist contact must be a valid email or phone number.");

exports.create = [serviceName(true), dentists, dentistName, dentistContact];

exports.update = [
  mongoIdParam(),
  serviceName(false),
  dentists,
  dentistName,
  dentistContact,
];

exports.idParam = [mongoIdParam()];
