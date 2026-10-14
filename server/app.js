const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const compression = require("compression");
const crypto = require("crypto");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const appointmentRoutes = require("./routes/appointments");
const userRoutes = require("./routes/users");
const serviceRoutes = require("./routes/services");
const auditRoutes = require("./routes/audit");
const { apiLimiter, authLimiter } = require("./middleware/rateLimiters");
const { notFound, errorHandler } = require("./middleware/errorHandler");
const { requireCsrf } = require("./utils/sessionCookies");

const app = express();

// Do not advertise the framework (helmet also does this; belt and braces)
app.disable("x-powered-by");

// Behind a reverse proxy (Render, Heroku, Nginx...) set TRUST_PROXY=1 so the
// rate limiter sees the real client IP instead of the proxy's.
if (process.env.TRUST_PROXY)
  app.set("trust proxy", Number(process.env.TRUST_PROXY) || 1);

app.use(helmet());
app.use(compression());
app.use((req, res, next) => {
  req.id = req.get("x-request-id") || crypto.randomUUID();
  res.set("X-Request-Id", req.id);
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    console.log(
      JSON.stringify({
        level: res.statusCode >= 500 ? "error" : "info",
        event: "request_completed",
        requestId: req.id,
        method: req.method,
        path: `${req.baseUrl}${req.path}`,
        status: res.statusCode,
        durationMs: Number(process.hrtime.bigint() - startedAt) / 1e6,
      }),
    );
  });
  next();
});

// Only the React app's origin(s) may call the API from a browser.
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:5173")
  .split(",")
  .map((o) => o.trim());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
    // lets the React app read the pagination headers
    exposedHeaders: [
      "X-Total-Count",
      "X-Total-Pages",
      "X-Page",
      "X-Limit",
      "X-Has-Pending",
    ],
  }),
);

app.use(express.json({ limit: "100kb" }));
// Express 5 leaves req.body undefined when no body was sent
app.use((req, res, next) => {
  req.body ??= {};
  next();
});
app.use(requireCsrf);

app.use("/api", apiLimiter);

app.get("/", (req, res) => {
  res.send("DentaLink API is running...");
});

// Cheap liveness probe for hosting platforms / uptime monitors (no DB call)
app.get("/health", (req, res) =>
  res.json({ status: "ok", uptime: Math.round(process.uptime()) }),
);

// Readiness includes the database dependency. Hosting should remove an
// instance from rotation while this endpoint is non-200.
app.get("/ready", async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ status: "not_ready", database: "disconnected" });
  }
  try {
    await mongoose.connection.db.admin().ping();
    return res.json({ status: "ready", database: "connected" });
  } catch {
    return res.status(503).json({ status: "not_ready", database: "unavailable" });
  }
});

app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/appointments", appointmentRoutes);
app.use("/api/services", serviceRoutes);
app.use("/api/audit", auditRoutes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
