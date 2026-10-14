const mongoose = require('mongoose');

// Logged-out JWTs. Each token carries a unique `jti`; once it is listed here
// verifyToken refuses it. MongoDB deletes the row automatically (TTL index)
// when the token would have expired anyway, so the collection stays small.
const revokedTokenSchema = new mongoose.Schema({
  jti: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

module.exports = mongoose.model('RevokedToken', revokedTokenSchema);
