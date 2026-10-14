const nodemailer = require("nodemailer");

// One shared transporter instead of one copy per route file.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Awaitable: use when the email is essential (e.g. OTP codes).
function sendMail({ to, subject, text, html }) {
  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to,
    subject,
    text,
    html,
  });
}

// Fire-and-forget: use for notifications that must never fail the request.
function sendMailSafe(options) {
  return sendMail(options).catch((err) =>
    console.error("Email send failed:", err.message),
  );
}

// User-supplied text (names, remarks, reasons) is interpolated into HTML
// emails, so it must be escaped to prevent HTML/phishing injection.
function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const formatTimeFriendly = (timeString) => {
  if (!timeString) return "";
  const [hour, minute] = timeString.split(":");
  let h = parseInt(hour, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  return `${timeString} (${h}:${minute} ${ampm})`;
};

// Builds the standard DentaLink HTML email.
//   name / title / details / footerAdmin values are escaped here.
//   intro / outro are trusted HTML: callers must escapeHtml() any dynamic
//   value they embed in them.
//   details: array of [label, value] rows shown in the highlighted box
//   footerAdmin: optional { name, email } shown as "Admin Contact"
function renderEmail({
  title,
  color,
  name,
  intro,
  details = [],
  outro,
  footerAdmin,
}) {
  const rows = details
    .map(([label, value], i) => {
      const bottom = i === details.length - 1 ? "0" : "10px";
      return `<p style="margin: 0 0 ${bottom} 0;"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`;
    })
    .join("");

  const detailBox = rows
    ? `<div style="background-color: #f8f9fa; border-left: 4px solid ${color}; padding: 15px; margin: 20px 0;">${rows}</div>`
    : "";

  const adminLine = footerAdmin
    ? `<p style="margin: 0;"><strong>Admin Contact:</strong> ${escapeHtml(footerAdmin.name)} (${escapeHtml(footerAdmin.email)})</p>`
    : "";

  return `
    <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
      <h2 style="color: ${color};">${escapeHtml(title)}</h2>
      <p>Hello <strong>${escapeHtml(name)}</strong>,</p>
      <p>${intro}</p>
      ${detailBox}
      ${outro ? `<p>${outro}</p>` : ""}
      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
        ${adminLine}
        <p style="margin: 5px 0 0 0; font-size: 0.9em; color: #777;">Regards,<br><strong>DentaLink Administration</strong></p>
      </div>
    </div>
  `;
}

module.exports = {
  sendMail,
  sendMailSafe,
  escapeHtml,
  formatTimeFriendly,
  renderEmail,
};
