// Manual smoke test for the two external services the automated tests stub out.
//   npm run smoke:external
//
// - Gmail:      sends ONE email, to EMAIL_USER itself (nobody else is emailed).
// - Cloudinary: uploads a 1x1 PNG through the same code path the app uses,
//               confirms it is reachable, deletes it, and confirms it is gone.
require("dotenv").config();

const { sendMail } = require("../utils/mailer");
const {
  cloudinary,
  uploadProof,
  destroyFile,
  signedProofUrl,
} = require("../config/cloudinary");

// 1x1 transparent PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function step(name, fn) {
  try {
    const detail = await fn();
    console.log(`PASS  ${name}${detail ? `  ->  ${detail}` : ""}`);
    return true;
  } catch (err) {
    console.log(`FAIL  ${name}  ->  ${err.message}`);
    return false;
  }
}

async function main() {
  const results = [];

  results.push(
    await step("Gmail: send test email to EMAIL_USER", async () => {
      if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) throw new Error("EMAIL_USER / EMAIL_PASS not set");
      const info = await sendMail({
        to: process.env.EMAIL_USER,
        subject: "DentaLink smoke test",
        text: "If you can read this, DentaLink can send email.",
      });
      return `accepted by ${info.accepted.length} recipient(s)`;
    }),
  );

  let publicId;
  results.push(
    await step("Cloudinary: upload through uploadProof()", async () => {
      const { publicId: id, format, deliveryType, resourceType } =
        await uploadProof({ buffer: PNG });
      publicId = id;
      if (deliveryType !== "authenticated") {
        throw new Error(`unexpected delivery type: ${deliveryType}`);
      }
      if (resourceType !== "image") {
        throw new Error(`unexpected resource type: ${resourceType}`);
      }
      const url = signedProofUrl(id, format, resourceType);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`signed file not reachable (HTTP ${res.status})`);
      return `signed delivery reachable (HTTP ${res.status}), public_id ${id}`;
    }),
  );

  results.push(
    await step("Cloudinary: content sniffing rejects a fake image", async () => {
      try {
        await uploadProof({ buffer: Buffer.from("<script>alert(1)</script> not an image") });
      } catch (err) {
        if (err.code === "INVALID_FILE_TYPE") return "rejected before upload";
        throw err;
      }
      throw new Error("a non-image was accepted");
    }),
  );

  if (publicId) {
    results.push(
      await step("Cloudinary: destroyFile() removes it", async () => {
        await destroyFile(publicId);
        try {
          await cloudinary.api.resource(publicId, {
            resource_type: "image",
            type: "authenticated",
          });
        } catch (err) {
          if (err?.error?.http_code === 404 || err?.http_code === 404) return "gone (404)";
          throw new Error(err?.error?.message || err.message);
        }
        throw new Error("file still exists after destroy");
      }),
    );
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${failed === 0 ? "All external checks passed." : `${failed} external check(s) failed.`}`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
