const { validationResult } = require('express-validator');

// Runs after a chain of express-validator rules. Responds 400 with the first
// error as `message` (the React forms already display `err.response.data.message`)
// and the full list under `errors`.
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const errors = result.array({ onlyFirstError: true }).map((e) => ({
    field: e.path,
    message: e.msg,
  }));
  return res.status(400).json({ message: errors[0].message, errors });
}

module.exports = validate;
