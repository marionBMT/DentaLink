const cloudinary = require("cloudinary").v2;
const multer = require("multer");
const crypto = require("crypto");

// Configure Cloudinary with your .env credentials
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

const invalidFile = (message) => {
  const err = new Error(message);
  err.code = "INVALID_FILE_TYPE";
  return err;
};

// The browser-declared MIME type is attacker-controlled, so the real type is
// decided from the file's leading bytes ("magic numbers").
function sniffFileType(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return "pdf";
  return null;
}

// Migration-only detection for historical Office cancellation proofs. New
// uploads remain deliberately limited to JPG, PNG and PDF by Multer above.
function isDocx(buf) {
  if (!buf || buf.length < 8 || !buf.subarray(0, 2).equals(Buffer.from("PK"))) {
    return false;
  }
  // A DOCX is a ZIP package containing both of these well-known entries.
  return ["[Content_Types].xml", "_rels/.rels", "word/document.xml"].every(
    (entry) => buf.includes(Buffer.from(entry)),
  );
}

// Files are buffered in memory and only sent to Cloudinary (uploadProof) once
// the request has passed every other check. Nothing is uploaded for a request
// that is later refused, so no orphaned files are left behind.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 20 },
  fileFilter: (req, file, cb) => {
    if (["image/jpeg", "image/png", "application/pdf"].includes(file.mimetype))
      return cb(null, true);
    cb(invalidFile("Only JPG, PNG or PDF files are allowed."));
  },
});

const isTransient = (err) =>
  /timeout|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(
    `${err?.message} ${err?.code}`,
  ) || err?.http_code === 499;

// Uploads a validated in-memory file as an authenticated asset.
// One automatic retry on a transient network error (timeout / reset).
async function uploadProof(file) {
  const type = sniffFileType(file.buffer);
  if (!type)
    throw invalidFile("The file content is not a valid JPG, PNG or PDF.");

  try {
    return await uploadOnce(file);
  } catch (err) {
    if (!isTransient(err)) throw err;
    return uploadOnce(file);
  }
}

function uploadOnce(file) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "DentaLink_Cancellations",
          resource_type: "image", // 'image' lets PDFs be viewed in the browser
          type: "authenticated",
          allowed_formats: ["jpg", "jpeg", "png", "pdf"],
        },
        (err, result) =>
          err
            ? reject(err)
            : resolve({
                publicId: result.public_id,
                format: result.format,
                deliveryType: result.type,
                resourceType: result.resource_type,
              }),
      )
      .end(file.buffer);
  });
}

// Used only by the one-off legacy migration so an existing DOCX is preserved
// as an authenticated raw asset instead of being discarded. Raw public IDs
// must contain the extension in Cloudinary.
function uploadLegacyDocx(buffer) {
  if (!isDocx(buffer)) throw invalidFile("The legacy file is not a valid DOCX.");
  return new Promise((resolve, reject) => {
    cloudinary.uploader
      .upload_stream(
        {
          folder: "DentaLink_Cancellations",
          public_id: `${crypto.randomUUID()}.docx`,
          resource_type: "raw",
          type: "authenticated",
        },
        (err, result) =>
          err
            ? reject(err)
            : resolve({
                publicId: result.public_id,
                format: "docx",
                deliveryType: result.type,
                resourceType: result.resource_type,
              }),
      )
      .end(buffer);
  });
}

// Best-effort removal; never throws (a failed cleanup must not fail a request)
async function destroyFile(publicId, resourceType = "image") {
  if (!publicId) return;
  try {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: "authenticated",
      invalidate: true,
    });
    if (result?.result === "not found" && resourceType === "image") {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
        invalidate: true,
      });
    }
  } catch (err) {
    console.error("Cloudinary cleanup failed:", err.message);
  }
}

function signedProofUrl(
  publicId,
  format,
  resourceType = "image",
  expiresInSeconds = 60,
) {
  return cloudinary.utils.private_download_url(publicId, format, {
    resource_type: resourceType,
    type: "authenticated",
    expires_at: Math.floor(Date.now() / 1000) + expiresInSeconds,
    attachment: false,
  });
}

module.exports = {
  cloudinary,
  upload,
  uploadProof,
  uploadLegacyDocx,
  destroyFile,
  signedProofUrl,
  sniffFileType,
  isDocx,
};
