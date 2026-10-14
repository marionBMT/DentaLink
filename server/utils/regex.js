// Escapes user input so it can be placed inside a RegExp literally
// (prevents regex injection / catastrophic-backtracking searches).
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { escapeRegex };
