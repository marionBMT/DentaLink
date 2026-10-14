require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");
const {
  PASSWORD_REGEX,
  PASSWORD_MESSAGE,
  BCRYPT_ROUNDS,
} = require("./utils/constants");

const adminEmail = process.env.SEED_ADMIN_EMAIL;
const adminUsername = process.env.SEED_ADMIN_USERNAME;
const adminName = process.env.SEED_ADMIN_NAME || "DentaLink Administrator";
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

const missing = [
  ["SEED_ADMIN_EMAIL", adminEmail],
  ["SEED_ADMIN_USERNAME", adminUsername],
  ["SEED_ADMIN_PASSWORD", adminPassword],
]
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
  console.error(`Missing seed environment variable(s): ${missing.join(", ")}`);
  process.exit(1);
}
if (!PASSWORD_REGEX.test(adminPassword)) {
  console.error(`SEED_ADMIN_PASSWORD is invalid. ${PASSWORD_MESSAGE}`);
  process.exit(1);
}

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("Connected to DB for seeding...");

    await User.deleteOne({ email: adminEmail.toLowerCase() });

    const hashedPassword = await bcrypt.hash(adminPassword, BCRYPT_ROUNDS);
    await User.create({
      username: adminUsername,
      name: adminName,
      email: adminEmail,
      password: hashedPassword,
      role: "admin",
    });

    console.log(`Admin account recreated successfully: ${adminUsername} / ${adminEmail}`);

    process.exit();
  })
  .catch((err) => {
    console.log("Error:", err.message);
    process.exit(1);
  });
