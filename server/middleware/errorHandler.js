const multer = require("multer");

function notFound(req, res) {
  res
    .status(404)
    .json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

// Central error handler: routes just call next(err) (Express 5 also forwards
// rejected async handlers automatically). Internal error details are logged
// server-side and never sent to the client in production.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "File is too large! Maximum allowed size is 5MB."
        : err.message;
    return res.status(400).json({ message });
  }

  if (err.code === "INVALID_FILE_TYPE") {
    return res.status(400).json({ message: err.message });
  }

  // Malformed JSON body
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Malformed JSON in request body." });
  }

  if (err.name === "ValidationError") {
    const first = Object.values(err.errors || {})[0];
    return res
      .status(400)
      .json({ message: first?.message || "Validation failed." });
  }

  if (err.name === "CastError") {
    return res.status(400).json({ message: "Invalid identifier." });
  }

  // Duplicate key (unique index): email, username, service name
  if (err.code === 11000) {
    const fields = Object.keys(err.keyPattern || {});
    // Same patient submitting an identical pending request twice (checked
    // first because that index also contains requestedTime)
    if (fields.includes("patient")) {
      return res
        .status(400)
        .json({ message: "You already have a pending request." });
    }
    // Two confirmed bookings racing for the same dentist slot: the database
    // (partial unique index) let only one through.
    if (fields.includes("requestedTime")) {
      return res.status(409).json({
        message:
          "That time slot was just booked for this dentist. Please choose another.",
      });
    }
    return res
      .status(400)
      .json({ message: `That ${fields[0] || "value"} is already in use.` });
  }

  console.error(JSON.stringify({
    level: "error",
    event: "request_failed",
    requestId: req.id,
    method: req.method,
    path: `${req.baseUrl}${req.path}`,
    message: err.message,
    stack: process.env.NODE_ENV === "production" ? undefined : err.stack,
  }));
  const body = { message: "Server error" };
  if (process.env.NODE_ENV !== "production") body.error = err.message;
  res.status(err.status || 500).json(body);
}

module.exports = { notFound, errorHandler };
