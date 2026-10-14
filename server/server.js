require("dotenv").config();
const mongoose = require("mongoose");

// Fail fast with a clear message instead of crashing later inside a request.
const required = ["MONGO_URI", "JWT_SECRET"];
if (process.env.NODE_ENV === "production") {
  required.push(
    "CLIENT_URL",
    "EMAIL_USER",
    "EMAIL_PASS",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
  );
}
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(
    `Missing required environment variable(s): ${missing.join(", ")}`,
  );
  process.exit(1);
}
if (process.env.JWT_SECRET.length < 32) {
  const message = "JWT_SECRET must contain at least 32 characters.";
  if (process.env.NODE_ENV === "production") {
    console.error(message);
    process.exit(1);
  }
  console.warn(`WARNING: ${message}`);
}
if (
  process.env.NODE_ENV === "production" &&
  (process.env.CLIENT_URL || "").split(",").some((url) => !url.startsWith("https://"))
) {
  console.error("Every production CLIENT_URL must use HTTPS.");
  process.exit(1);
}

const app = require("./app");

const PORT = process.env.PORT || 5000;

// Last-resort logging so a stray rejected promise is never silent
process.on("unhandledRejection", (reason) =>
  console.error("Unhandled rejection:", reason),
);

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected to DentaLink DB");
    const server = app.listen(PORT, () =>
      console.log(`Server running on port ${PORT}`),
    );

    // Graceful shutdown: stop taking requests, finish in-flight ones, then
    // close the DB connection (hosting platforms send SIGTERM on redeploy).
    const shutdown = (signal) => {
      console.log(`${signal} received, shutting down...`);
      server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000).unref();
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  })
  .catch((err) => {
    console.error("Connection error", err.message);
    process.exit(1);
  });
